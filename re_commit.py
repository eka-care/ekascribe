#!/usr/bin/env python3
"""Re-run the commit pipeline for one session, from inside the api pod.
 
The session's own identity (b-id / uuid / oid) is read out of the transaction
row, so the request looks exactly like the one the app would have made.
 
    /app/.venv/bin/python /app/scripts/rerun_session.py <session_id>
    /app/.venv/bin/python /app/scripts/rerun_session.py <session_id> --reset
    /app/.venv/bin/python /app/scripts/rerun_session.py <session_id> --reset --direct
 
Modes
  (default)   POST /voice/v1/sessions/{id}/end on 127.0.0.1 — the real commit
              route: re-lists the audio in storage, re-commits the transaction,
              re-enqueues process_session. Returns immediately; the pipeline
              runs in the pod's background runner.
  --direct    Skip HTTP and run process_session synchronously in THIS process.
              Everything (STT per chunk, stitch, transcript write, PATCH) runs
              inline in the foreground, so you see every log line and get a
              non-zero exit code on failure. Best for debugging one session.
 
Flags
  --reset       Delete the session's audio_chunks rows (chunks + the __stitch__
                sentinel) first. Do this for any real re-run: a leftover
                sentinel in `done` makes process_session return immediately,
                and chunks stuck in `processing` are skipped until their 300s
                claim goes stale.
  --redo-stt    Also delete the per-chunk *.transcript.json artifacts, forcing
                real re-transcription. Without it, existing chunk transcripts
                are reused (they are the idempotent cache) and only the
                missing ones are transcribed.
  --base-url    Override http://127.0.0.1:8000.
  --dry-run     Print what would happen and exit.
 
NOTE on auth: in AUTH_MODE=jwt/sso/oidc the middleware STRIPS any caller-supplied
`jwt-payload` header (trusting it would be an auth bypass), so this script mints
a short-lived session JWT with AUTH_JWT_SECRET and sends it as a Bearer token —
the middleware then injects the jwt-payload itself. In AUTH_MODE=dev the header
is honoured directly, so it sends that instead.
"""
 
from __future__ import annotations
 
import argparse
import json
import sys
 
 
def _die(msg: str, code: int = 1):
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(code)
 
 
# --------------------------------------------------------------------------
# identity
# --------------------------------------------------------------------------
 
 
def load_session(session_id: str) -> dict:
    """Transaction row for a session id (b_id is part of the PK, so search)."""
    from scribe.repositories.transaction_orm import TransactionORM
 
    rows = TransactionORM().table.find([("txn_id", "eq", session_id)])
    if not rows:
        _die(f"no transaction row for session {session_id!r}")
    if len(rows) > 1:
        print(f"warning: {len(rows)} rows for {session_id}, using the first")
    return rows[0]
 
 
def principal_for(session: dict):
    from scribe_core.auth import Principal
    from scribe_core.settings import get_settings
 
    s = get_settings()
    return Principal(
        b_id=session.get("b_id") or s.dev_b_id,
        uuid=session.get("uuid") or s.dev_uuid,
        oid=session.get("oid") or s.dev_oid,
        client_id=s.dev_client_id,
        is_paid=True,  # cc.esc == 1 -> skip transaction limits
        issuer=s.auth_issuer,
    )
 
 
def auth_headers(principal) -> dict:
    """Bearer token in real auth modes; jwt-payload in dev mode."""
    from scribe_core.auth import mint_session_token
    from scribe_core.settings import get_settings
 
    s = get_settings()
    headers = {"content-type": "application/json", "client-id": "pipeline-rerun"}
 
    if s.auth_mode == "dev":
        headers["jwt-payload"] = json.dumps(principal.to_jwt_payload())
        if s.dev_auth_token:
            headers["authorization"] = f"Bearer {s.dev_auth_token}"
        return headers
 
    if not s.auth_jwt_secret:
        _die(f"AUTH_MODE={s.auth_mode} but AUTH_JWT_SECRET is not set in this pod")
    token = mint_session_token(
        principal,
        sub=principal.uuid or "pipeline-rerun",
        secret=s.auth_jwt_secret,
        ttl_seconds=600,
    )
    headers["authorization"] = f"Bearer {token}"
    return headers
 
 
# --------------------------------------------------------------------------
# cleanup
# --------------------------------------------------------------------------
 
 
def reset_chunk_state(session_id: str) -> int:
    """Drop the session's audio_chunks rows so the pipeline starts clean."""
    from scribe.pipeline import chunk_state
    from scribe_core.db import get_table
 
    table = get_table(chunk_state.TABLE)
    rows = table.find([("txn_id", "eq", session_id)])
    for row in rows:
        table.delete_item({"txn_id": session_id, "filename": row["filename"]})
    return len(rows)
 
 
def delete_transcript_artifacts(session: dict) -> int:
    """Remove per-chunk *.transcript.json so STT actually re-runs."""
    from scribe_core.storage import get_blob_store, parse_blob_url
 
    s3_url = session.get("s3_url") or ""
    if not s3_url:
        return 0
    bucket, prefix = parse_blob_url(s3_url)
    store = get_blob_store()
    removed = 0
    for key in store.list(bucket, prefix.rstrip("/") + "/"):
        if key.endswith(".transcript.json"):
            try:
                store.delete(bucket, key)
                removed += 1
            except Exception as e:  # noqa: BLE001
                print(f"  could not delete {key}: {e}")
    return removed
 
 
# --------------------------------------------------------------------------
# the two run modes
# --------------------------------------------------------------------------
 
 
def run_via_http(session_id: str, session: dict, base_url: str) -> int:
    import httpx
 
    headers = auth_headers(principal_for(session))
    url = f"{base_url.rstrip('/')}/voice/v1/sessions/{session_id}/end"
    files = session.get("client_uploaded_files") or []
    body = {"audio_files_sent": len(files)}
 
    print(f"POST {url}")
    resp = httpx.post(url, headers=headers, json=body, timeout=120.0)
    print(f"<- {resp.status_code}")
    print(resp.text[:4000])
    return 0 if resp.status_code < 400 else 1
 
 
def run_direct(session_id: str, session: dict) -> int:
    """process_session inline, in the foreground, nothing dispatched."""
    from scribe.pipeline.pipeline import MAX_CHUNK_WAIT_ATTEMPTS, process_session
 
    langs = session.get("input_language")
    if isinstance(langs, (list, tuple)):
        langs = langs[0] if langs else None
 
    message = {
        "txn_id": session_id,
        "b_id": session.get("b_id", ""),
        "s3_url": session.get("s3_url", ""),
        "uuid": session.get("uuid", ""),
        "language": langs,
        # skip the 36 x 5s wait-for-background-jobs loop: this process has no
        # background runner, so transcribe every chunk inline right here.
        "attempt": MAX_CHUNK_WAIT_ATTEMPTS,
    }
    print("running process_session inline with:")
    print(json.dumps(message, indent=2, default=str))
    process_session(message)
    print("process_session returned without raising")
    return 0
 
 
# --------------------------------------------------------------------------
 
 
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("session_id")
    ap.add_argument("--reset", action="store_true", help="clear audio_chunks rows first")
    ap.add_argument("--redo-stt", action="store_true", help="also delete chunk transcript artifacts")
    ap.add_argument("--direct", action="store_true", help="run process_session inline instead of POSTing")
    ap.add_argument("--base-url", default="http://127.0.0.1:8000")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
 
    from scribe_core.settings import get_settings
 
    s = get_settings()
    session = load_session(args.session_id)
 
    print(f"session        : {args.session_id}")
    print(f"b_id / uuid    : {session.get('b_id')} / {session.get('uuid')}")
    print(f"s3_url         : {session.get('s3_url')}")
    print(f"user_status    : {session.get('user_status')}")
    print(f"transcript/proc: {session.get('transcript_status')} / {session.get('processing_status')}")
    print(f"auth_mode      : {s.auth_mode}   execution_mode: {s.execution_mode}")
 
    try:
        from scribe.pipeline import chunk_state
 
        print(f"chunk states   : {chunk_state.session_chunk_stats(args.session_id)}")
    except Exception as e:  # noqa: BLE001
        print(f"chunk states   : (unavailable: {e})")
 
    if args.dry_run:
        print("\n--dry-run: stopping here")
        return 0
 
    if args.reset:
        print(f"cleared {reset_chunk_state(args.session_id)} audio_chunks rows")
    if args.redo_stt:
        print(f"deleted {delete_transcript_artifacts(session)} transcript artifacts")
 
    print()
    return run_direct(args.session_id, session) if args.direct else run_via_http(
        args.session_id, session, args.base_url
    )
 
 
if __name__ == "__main__":
    raise SystemExit(main())
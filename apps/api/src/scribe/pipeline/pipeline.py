"""The on-prem processing pipeline — queue-agnostic (single source of truth).

Runs either in-process (EXECUTION_MODE=inprocess) via background/runner.py, or
in apps/worker (EXECUTION_MODE=worker) via procrastinate task wrappers that call
these same functions. Follow-up jobs are scheduled through ``dispatch`` so they
route to whichever backend is active.

  transcribe_chunk  — per-chunk STT while the session is live (from audio upload)
  vad_session       — VAD-chunk a batch upload, then fan out per-chunk STT
  process_session   — commit-time: wait for chunk jobs (Postgres chunk state),
                      transcribe stragglers, stitch (single winner), write the
                      transcript artifact, PATCH transcript_status=success
  finalize_session  — poll session documents; when generation settles, PATCH
                      processing_status=success

Chunk coordination lives in the ``audio_chunks`` Postgres table (see
chunk_state.py): workers claim chunks via conditional updates, so any number
of uvicorn workers / worker containers can process one session together.

Status updates are applied IN-PROCESS through the service layer (same
semantics as PATCH /voice/api/v2/transaction/{txn_id}, no HTTP hop): the
pipeline always runs inside an app that imports the services and shares the
DB/storage, so SELF_URL/DNS/ingress never enter the picture.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any, Dict, List, Optional, Tuple

from scribe_core.logging import get_logger
from scribe_core.storage import get_blob_store, parse_blob_url

from scribe.pipeline import chunk_state
from scribe.pipeline.dispatch import dispatch

logger = get_logger(__name__)

AUDIO_EXTS = (".m4a", ".mp3", ".wav", ".webm", ".ogg", ".mp4", ".aac")

# process_session: how long to wait for in-flight chunk jobs before
# transcribing stragglers inline (attempts x 5s), and how long a losing
# process re-checks a stitch owned by another worker (attempts x 10s).
MAX_CHUNK_WAIT_ATTEMPTS = 36
MAX_STITCH_WAIT_ATTEMPTS = 60
_CHUNK_RE = re.compile(r"^(\d+)\.[A-Za-z0-9]+$")

_MIME = {
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "mp3": "audio/mp3",
    "wav": "audio/wav",
    "webm": "audio/webm",
    "ogg": "audio/ogg",
    "aac": "audio/aac",
}


def _patch_transaction(txn_id: str, payload: Dict[str, Any], b_id: str = "") -> None:
    """Apply a pipeline status update directly through the service layer —
    the same semantics as PATCH /voice/api/v2/transaction/{txn_id} (transcript
    document creation on transcript_status=success, processed_at stamping),
    minus the HTTP hop. Works identically in inprocess and worker modes: both
    import this app package and share the DB + blob storage."""
    from scribe.core.time_utils import get_current_utc_timestamp
    from scribe.services.document_service import DocumentService
    from scribe.services.transaction_service import TransactionService

    transaction_service = TransactionService()
    transaction_data = transaction_service.get_transaction(txn_id, b_id) or {}
    update_data = dict(payload)

    if update_data.get("transcript_status") == "success":
        DocumentService().create_transcript_document(
            session_id=txn_id,
            b_id=b_id,
            uuid_val=transaction_data.get("uuid", ""),
            s3_url=transaction_data.get("s3_url", ""),
        )

    if update_data.get("processing_status") == "success":
        if transaction_data.get("processed_at") is None:
            update_data["processed_at"] = update_data.get(
                "processed_at", get_current_utc_timestamp()
            )

    transaction_service.update_transaction(txn_id, b_id, update_data)
    logger.info("transaction updated in-process", txn_id=txn_id, payload=payload)


def _chunk_files(bucket: str, prefix: str) -> List[Tuple[int, str]]:
    """Numeric audio chunks under prefix -> sorted [(index, key)]."""
    store = get_blob_store()
    prefix = prefix.rstrip("/") + "/"
    chunks = []
    for key in store.list(bucket, prefix):
        name = key.split("/")[-1]
        m = _CHUNK_RE.match(name)
        if m and name.lower().endswith(AUDIO_EXTS):
            chunks.append((int(m.group(1)), key))
    return sorted(chunks)


def _transcript_key_for_chunk(chunk_key: str) -> str:
    stem = chunk_key.rsplit(".", 1)[0]
    return f"{stem}.transcript.json"


async def _transcribe_bytes(content: bytes, mime_type: str, language: Optional[str]) -> Dict[str, Any]:
    from echo.audio.transcription.config import TranscriberConfig
    from echo.audio.transcription.factory import get_transcriber

    config = TranscriberConfig(language=language) if language else TranscriberConfig()
    transcriber = get_transcriber(config)
    result = await transcriber.transcribe(content, mime_type=mime_type)
    if result.error:
        raise RuntimeError(f"transcription failed: {result.error}")
    return {
        "text": result.text,
        "language_detected": result.language_detected,
        "duration_s": result.duration_s,
    }


def _transcribe_chunk_sync(bucket: str, chunk_key: str, language: Optional[str]) -> Dict[str, Any]:
    import orjson

    store = get_blob_store()
    t_key = _transcript_key_for_chunk(chunk_key)
    if store.exists(bucket, t_key):
        return orjson.loads(store.get(bucket, t_key))
    ext = chunk_key.rsplit(".", 1)[-1].lower()
    content = store.get(bucket, chunk_key)
    result = asyncio.run(_transcribe_bytes(content, _MIME.get(ext, "audio/mp4"), language))
    store.put(bucket, t_key, orjson.dumps(result), content_type="application/json")
    return result


def _session_language(message: Dict[str, Any]) -> Optional[str]:
    """Resolve the session's STT language: explicit message value first, then
    the transaction's input_language. Returns None if neither is set (callers
    then fall back to the env defaults in _transcribe_bytes)."""
    lang = message.get("lang") or message.get("language")
    if lang:
        return str(lang)
    txn_id = message.get("txn_id")
    if not txn_id:
        return None
    try:
        from scribe.repositories.transaction_orm import TransactionORM

        txn = TransactionORM().get_transaction(txn_id, message.get("b_id", "")) or {}
        langs = txn.get("input_language")
        if isinstance(langs, str):
            return langs or None
        if isinstance(langs, (list, tuple)) and langs:
            return str(langs[0]) or None
    except Exception as e:  # noqa: BLE001 — language is best-effort
        logger.warning("could not resolve session language", txn_id=txn_id, error=str(e))
    return None


# --- pipeline jobs (queue-agnostic) ------------------------------------------
def transcribe_chunk(
    txn_id: str, b_id: str, s3_url: str, filename: str, language: Optional[str] = None
) -> None:
    """STT for one uploaded chunk. Claims the chunk in Postgres first so
    concurrent workers never transcribe the same chunk twice; the blob-level
    transcript artifact keeps the work idempotent on top."""
    bucket, prefix = parse_blob_url(s3_url)
    chunk_key = f"{prefix.rstrip('/')}/{filename}"
    chunk_state.register_chunk(txn_id, filename, b_id, chunk_key)
    if not chunk_state.claim_chunk(txn_id, filename):
        logger.info("chunk skipped (done or claimed elsewhere)", txn_id=txn_id, chunk=filename)
        return
    # language arrives with the dispatch (set at session create); the txn
    # lookup only covers payloads enqueued before this field existed.
    language = language or _session_language({"txn_id": txn_id, "b_id": b_id})
    try:
        _transcribe_chunk_sync(bucket, chunk_key, language=language)
    except Exception as e:  # noqa: BLE001 — record, then let retry policy run
        chunk_state.mark_failed(txn_id, filename, str(e))
        raise
    chunk_state.mark_done(txn_id, filename, _transcript_key_for_chunk(chunk_key))
    logger.info("chunk transcribed", txn_id=txn_id, chunk=filename)


def vad_session(message: Dict[str, Any]) -> None:
    """VAD-chunk batch upload(s) into the session's chunk folder (replaces the
    chunker lambda behind SNS)."""
    txn_id = message["txn_id"]
    b_id = message.get("b_id", "")
    s3_url = message["s3_url"]
    audio_files = message.get("audio_files", [])

    from scribe.services.adaptors.audio_adaptor import AudioAdaptor

    adaptor = AudioAdaptor()
    store = get_blob_store()
    session_data = {"txn_id": txn_id, "b_id": b_id, "s3_url": s3_url}
    for file_url in audio_files:
        bucket, key = parse_blob_url(file_url)
        content = store.get(bucket, key)
        asyncio.run(
            adaptor.vad_and_upload_chunks(
                session_data=session_data,
                audio_content=content,
                session_id=txn_id,
                b_id=b_id,
            )
        )

    # fan out per-chunk STT now instead of leaving it all to commit time
    language = _session_language(message)  # once per session, not per chunk
    s_bucket, s_prefix = parse_blob_url(s3_url)
    for _, chunk_key in _chunk_files(s_bucket, s_prefix):
        filename = chunk_key.split("/")[-1]
        chunk_state.register_chunk(txn_id, filename, b_id, chunk_key)
        dispatch(
            "transcribe_chunk",
            {
                "txn_id": txn_id,
                "b_id": b_id,
                "s3_url": s3_url,
                "filename": filename,
                "language": language,
            },
        )
    logger.info("vad_session complete", txn_id=txn_id, files=len(audio_files))


def process_session(message: Dict[str, Any]) -> None:
    """Commit-time pipeline: ensure every chunk is transcribed, stitch, write
    the transcript artifact, and drive the transcript_status=success callback."""
    txn_id = message["txn_id"]
    b_id = message.get("b_id", "")
    s3_url = message.get("s3_url", "")
    language = _session_language(message)
    bucket, prefix = parse_blob_url(s3_url)

    chunks = _chunk_files(bucket, prefix)
    if not chunks:
        logger.warning("process_session: no audio chunks found", txn_id=txn_id, s3_url=s3_url)

    filenames = [chunk_key.split("/")[-1] for _, chunk_key in chunks]
    for (_, chunk_key), filename in zip(chunks, filenames):
        chunk_state.register_chunk(txn_id, filename, b_id, chunk_key)

    # Wait for in-flight chunk jobs (bounded), re-dispatching any that are
    # claimable — claims make duplicate dispatches free.
    attempt = int(message.get("attempt", 0))
    remaining = chunk_state.not_done_chunks(txn_id, filenames)
    if remaining and attempt < MAX_CHUNK_WAIT_ATTEMPTS:
        for filename in remaining:
            dispatch(
                "transcribe_chunk",
                {
                    "txn_id": txn_id,
                    "b_id": b_id,
                    "s3_url": s3_url,
                    "filename": filename,
                    "language": language,
                },
            )
        follow_up = dict(message)
        follow_up["attempt"] = attempt + 1
        dispatch("process_session", {"message": follow_up}, delay_seconds=5)
        logger.info(
            "process_session waiting on chunks",
            txn_id=txn_id,
            remaining=len(remaining),
            attempt=attempt,
        )
        return

    # Single-winner stitch: exactly one process assembles + PATCHes.
    chunk_state.register_chunk(txn_id, chunk_state.STITCH_SENTINEL, b_id)
    if not chunk_state.claim_chunk(txn_id, chunk_state.STITCH_SENTINEL):
        from scribe_core.db import get_table

        sentinel = get_table(chunk_state.TABLE).get_item(
            {"txn_id": txn_id, "filename": chunk_state.STITCH_SENTINEL}
        ) or {}
        if sentinel.get("status") == chunk_state.STATUS_DONE:
            logger.info("stitch already completed by another worker", txn_id=txn_id)
            return
        # a live worker owns the stitch — re-check later in case it dies
        # (its stale claim then becomes stealable)
        stitch_attempt = int(message.get("stitch_attempt", 0))
        if stitch_attempt < MAX_STITCH_WAIT_ATTEMPTS:
            follow_up = dict(message)
            follow_up["stitch_attempt"] = stitch_attempt + 1
            dispatch("process_session", {"message": follow_up}, delay_seconds=10)
            logger.info("stitch owned by another worker; re-checking", txn_id=txn_id)
        return

    parts: List[str] = []
    detected_lang: Optional[str] = None
    try:
        for _, chunk_key in chunks:
            # idempotent: fast-path reads the existing transcript artifact; any
            # straggler chunk (attempts exhausted) is transcribed inline here.
            result = _transcribe_chunk_sync(bucket, chunk_key, language)
            chunk_state.mark_done(txn_id, chunk_key.split("/")[-1], _transcript_key_for_chunk(chunk_key))
            if result.get("text"):
                parts.append(result["text"].strip())
            detected_lang = detected_lang or result.get("language_detected")
    except Exception as e:  # noqa: BLE001 — release the stitch claim so the
        # retry does not wait out the 300s stale-claim TTL
        chunk_state.mark_failed(txn_id, chunk_state.STITCH_SENTINEL, str(e))
        raise

    transcript_text = "\n".join(p for p in parts if p)
    lang = language or detected_lang or ""

    import orjson
    transcript_key = f"{prefix.rstrip('/')}/template_results/transcripts/{txn_id}_transcript.json"
    get_blob_store().put(
        bucket,
        transcript_key,
        orjson.dumps({"text": transcript_text, "lang": lang}),
        content_type="application/json",
    )
    logger.info(
        "transcript stitched",
        txn_id=txn_id,
        chunks=len(chunks),
        chars=len(transcript_text),
        lang=lang,
    )

    # Same callback contract the ds-service used — the API fans out template
    # structuring in background from this PATCH.
    _patch_transaction(txn_id, {"transcript_status": "success"}, b_id=b_id)
    chunk_state.mark_done(txn_id, chunk_state.STITCH_SENTINEL)

    dispatch("finalize_session", {"txn_id": txn_id, "b_id": b_id, "attempt": 0})


def finalize_session(txn_id: str, b_id: str, attempt: int = 0) -> None:
    """Wait for background template generation to settle, then close the session."""
    from scribe.repositories.document_orm import EkascribeDocumentORM

    MAX_ATTEMPTS = 60  # x10s ~ 10 minutes
    docs = EkascribeDocumentORM().get_documents_by_session(txn_id)
    pending = [
        d
        for d in docs
        if d.get("type") not in ("transcript", "context")
        and d.get("status") in (None, "", "init", "in-progress", "generating")
        and not d.get("errors")
        and not (d.get("content") or d.get("markdown") or d.get("value"))
    ]
    if pending and attempt < MAX_ATTEMPTS:
        dispatch(
            "finalize_session",
            {"txn_id": txn_id, "b_id": b_id, "attempt": attempt + 1},
            delay_seconds=10,
        )
        logger.info(
            "finalize_session waiting on documents",
            txn_id=txn_id,
            pending=len(pending),
            attempt=attempt,
        )
        return

    _patch_transaction(txn_id, {"processing_status": "success"}, b_id=b_id)
    logger.info("session finalized", txn_id=txn_id, documents=len(docs))


# name -> (callable, max_retries). Mirrors the procrastinate retry= on the
# worker task wrappers so both modes behave the same on failure.
TASKS: Dict[str, Tuple[Any, int]] = {
    "transcribe_chunk": (transcribe_chunk, 3),
    "vad_session": (vad_session, 3),
    "process_session": (process_session, 5),
    "finalize_session": (finalize_session, 0),
}

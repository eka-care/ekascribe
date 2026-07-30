"""The on-prem processing pipeline (plan B3) — replaces ekascribe-ds + lambdas.

Tasks (procrastinate, queue "scribe"):

  transcribe_chunk  — per-chunk STT while the session is live (from audio upload)
  vad_session       — VAD-chunk a batch upload (replaces the SNS chunker lambda)
  process_session   — commit-time: transcribe missing chunks, stitch in numeric
                      order, write template_results/transcripts/{txn}_transcript.json,
                      then PATCH transcript_status=success (the same callback
                      contract the ds-service drove — the API fans out template
                      structuring from there)
  finalize_session  — poll session documents; when generation settles, PATCH
                      processing_status=success / request_failure

The PATCH goes over HTTP to the API (SELF_URL) exactly like ds did, so the
whole downstream flow (documents, webhooks, AG-UI, polling semantics) is
untouched.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

from scribe_core.logging import get_logger
from scribe_core.settings import get_settings
from scribe_core.storage import get_blob_store, parse_blob_url

from scribe_worker.main import queue_app

logger = get_logger(__name__)

AUDIO_EXTS = (".m4a", ".mp3", ".wav", ".webm", ".ogg", ".mp4", ".aac")
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


def _api_headers() -> Dict[str, str]:
    s = get_settings()
    headers = {"Content-Type": "application/json"}
    if s.dev_auth_token:
        headers["Authorization"] = f"Bearer {s.dev_auth_token}"
    return headers


def _patch_transaction(txn_id: str, payload: Dict[str, Any]) -> None:
    s = get_settings()
    url = f"{s.self_url.rstrip('/')}/voice/api/v2/transaction/{txn_id}"
    resp = httpx.patch(url, json=payload, headers=_api_headers(), timeout=60.0)
    resp.raise_for_status()
    logger.info("PATCH transaction ok", txn_id=txn_id, payload=payload)


def _chunk_files(bucket: str, prefix: str) -> List[Tuple[int, str]]:
    """Numeric audio chunks under prefix → sorted [(index, key)]."""
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


# --- tasks --------------------------------------------------------------------


@queue_app.task(name="transcribe_chunk", queue="scribe", retry=3)
def transcribe_chunk(txn_id: str, b_id: str, s3_url: str, filename: str) -> None:
    """Early STT for one uploaded chunk. Idempotent (skips if transcript exists)."""
    bucket, prefix = parse_blob_url(s3_url)
    chunk_key = f"{prefix.rstrip('/')}/{filename}"
    _transcribe_chunk_sync(bucket, chunk_key, language=None)
    logger.info("chunk transcribed", txn_id=txn_id, chunk=filename)


@queue_app.task(name="vad_session", queue="scribe", retry=3)
def vad_session(message: Dict[str, Any]) -> None:
    """VAD-chunk batch upload(s) into the session's chunk folder (replaces the
    chunker lambda behind SNS)."""
    txn_id = message["txn_id"]
    b_id = message.get("b_id", "")
    s3_url = message["s3_url"]
    audio_files = message.get("audio_files", [])

    from voice2rx.protocol.adaptors.audio_adaptor import AudioAdaptor

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
    logger.info("vad_session complete", txn_id=txn_id, files=len(audio_files))


@queue_app.task(name="process_session", queue="scribe", retry=5)
def process_session(message: Dict[str, Any]) -> None:
    """Commit-time pipeline: ensure every chunk is transcribed, stitch, write
    the transcript artifact, and drive the transcript_status=success callback."""
    txn_id = message["txn_id"]
    b_id = message.get("b_id", "")
    s3_url = message.get("s3_url", "")
    language = message.get("lang") or message.get("language")
    bucket, prefix = parse_blob_url(s3_url)

    chunks = _chunk_files(bucket, prefix)
    if not chunks:
        logger.warning("process_session: no audio chunks found", txn_id=txn_id, s3_url=s3_url)

    parts: List[str] = []
    detected_lang: Optional[str] = None
    for _, chunk_key in chunks:
        result = _transcribe_chunk_sync(bucket, chunk_key, language)
        if result.get("text"):
            parts.append(result["text"].strip())
        detected_lang = detected_lang or result.get("language_detected")

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
    _patch_transaction(txn_id, {"transcript_status": "success"})

    queue_app.configure_task(name="finalize_session", queue="scribe").defer(
        txn_id=txn_id, b_id=b_id, attempt=0
    )


@queue_app.task(name="finalize_session", queue="scribe")
def finalize_session(txn_id: str, b_id: str, attempt: int = 0) -> None:
    """Wait for background template generation to settle, then close the session."""
    from voice2rx.model_orms.document_orm import EkascribeDocumentORM

    MAX_ATTEMPTS = 60  # x10s ≈ 10 minutes
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
        queue_app.configure_task(
            name="finalize_session", queue="scribe", schedule_in={"seconds": 10}
        ).defer(txn_id=txn_id, b_id=b_id, attempt=attempt + 1)
        logger.info(
            "finalize_session waiting on documents",
            txn_id=txn_id,
            pending=len(pending),
            attempt=attempt,
        )
        return

    _patch_transaction(txn_id, {"processing_status": "success"})
    logger.info("session finalized", txn_id=txn_id, documents=len(docs))

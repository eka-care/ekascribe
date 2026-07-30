"""
Provider-independent audio stream WebSocket handler.

WS /voice/v1/stream/sessions/{stream_id}/audio

This endpoint accepts audio from ANY client:
  - Direct raw PCM binary frames (mobile apps, Zoom, 100ms, custom clients)
  - Vobiz JSON envelope format: {"event":"media","media":{"payload":"<b64>"}}
  - Any other client sending raw PCM bytes

The handler auto-detects the wire format based on the first message received:
  - If first message is bytes → raw PCM modex
  - If first message is text (JSON) → JSON envelope mode (Vobiz/Twilio compatible)

Audio flows through:
  SileroVADPipeline → VADChunkAccumulator → S3ChunkSink → S3 + Redis + DynamoDB

On stream end (graceful or disconnect):
  _finalize() → commit transaction + send to SQS for transcription

Sample rates:
  - Default: 16000 Hz (16-bit mono PCM)
  - Clients should declare their sample rate in the stream_id session metadata
    or send a "start" JSON event (Vobiz-compatible).

JSON envelope wire protocol (Vobiz / Twilio Media Streams compatible):
  {
    "event": "start",
    "start": {
      "streamId": "<str>",
      "mediaFormat": { "encoding": "audio/x-l16", "sampleRate": 16000 }
    }
  }
  {
    "event": "media",
    "media": { "payload": "<base64-encoded PCM>" }
  }
  {
    "event": "stop"
  }
"""

import base64
from typing import Optional

import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from logs.custom_logger import get_logger
from voice2rx.services.transactions.transaction_service import TransactionService
from voice2rx.streaming.pipeline.pipecat_pipeline import SileroVADPipeline
from voice2rx.streaming.session.stream_session_store import stream_session_store

logger = get_logger(__name__)

stream_ws_router = APIRouter()

_transaction_service = TransactionService()

DEFAULT_SAMPLE_RATE = 16000


@stream_ws_router.websocket("/sessions/{stream_id}/audio")
async def audio_stream(ws: WebSocket, stream_id: str):
    """
    Provider-agnostic WebSocket audio stream endpoint.

    Accepts raw PCM binary frames or JSON-envelope text frames (Vobiz/Twilio
    Media Streams format).  Drives SileroVADPipeline which accumulates
    speech-boundary-aware chunks (10-30s) and uploads them to S3.
    """
    await ws.accept()

    session_data = await stream_session_store.get_session(stream_id)
    if not session_data:
        logger.error(
            "No stream session found — rejecting WebSocket",
            stream_id=stream_id,
            severity="critical",
        )
        await ws.close(code=4000, reason="unknown stream_id")
        return

    session_id: str = session_data["session_id"]
    b_id: str = session_data["b_id"]
    provider: Optional[str] = session_data.get("provider")
   
    commit_on_close: bool = session_data.get("commit_on_close", True)

    pipeline = SileroVADPipeline(
        stream_id=stream_id,
        session_id=session_id,
        b_id=b_id,
        sample_rate=DEFAULT_SAMPLE_RATE,
    )

    await stream_session_store.update_session(stream_id, {"status": "streaming"})

    logger.info(
        "Audio stream WebSocket connected",
        stream_id=stream_id,
        session_id=session_id,
        provider=provider or "direct",
        severity="medium",
    )

    try:
        await _run_stream_loop(ws, pipeline, stream_id)
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected", stream_id=stream_id, severity="medium")
    except Exception:
        logger.exception("Unexpected error in stream handler", stream_id=stream_id, severity="critical")
    finally:
        await _finalize(stream_id, session_id, b_id, pipeline, commit_on_close)


async def _run_stream_loop(
    ws: WebSocket,
    pipeline: SileroVADPipeline,
    stream_id: str,
) -> None:
    """
    Main receive loop.  Auto-detects wire format on first message.
    """
    while True:
        message = await ws.receive()

        if "bytes" in message and message["bytes"] is not None:
            await _handle_binary_frame(message["bytes"], pipeline, stream_id)

        elif "text" in message and message["text"] is not None:
            should_stop = await _handle_text_frame(message["text"], pipeline, stream_id)
            if should_stop:
                break

        elif message.get("type") == "websocket.disconnect":
            break


async def _handle_binary_frame(
    data: bytes,
    pipeline: SileroVADPipeline,
    stream_id: str,
) -> None:
    """Handle raw PCM binary frame — pass directly to the pipeline."""
    await pipeline.process_audio(data)


async def _handle_text_frame(
    text: str,
    pipeline: SileroVADPipeline,
    stream_id: str,
) -> bool:
    """
    Handle JSON-envelope text frame (Vobiz / Twilio Media Streams format).

    Returns True if the stream should stop (received a "stop" event).
    """
    try:
        msg = orjson.loads(text)
    except Exception:
        logger.warning("Non-JSON text frame received", stream_id=stream_id, severity="medium")
        return False

    event = msg.get("event", "")

    if event == "start":
        stream_meta = msg.get("start", {})
        media_format = stream_meta.get("mediaFormat", {})
        sample_rate = media_format.get("sampleRate")
        if isinstance(sample_rate, int) and sample_rate > 0:
            try:
                pipeline.set_sample_rate(sample_rate)
            except Exception:
                logger.exception(
                    "Failed to apply declared sample rate",
                    stream_id=stream_id,
                    declared_sample_rate=sample_rate,
                    severity="medium",
                )
        logger.info(
            "Stream started (JSON envelope)",
            stream_id=stream_id,
            provider_stream_id=stream_meta.get("streamId", ""),
            media_format=media_format,
            severity="medium",
        )

    elif event == "media":
        payload_b64 = msg.get("media", {}).get("payload", "")
        if payload_b64:
            pcm_bytes = base64.b64decode(payload_b64)
            await pipeline.process_audio(pcm_bytes)

    elif event == "stop":
        logger.info(
            "Stream stop event received (JSON envelope)",
            stream_id=stream_id,
            reason=msg.get("reason", ""),
            severity="medium",
        )
        return True

    return False


async def _finalize(
    stream_id: str,
    session_id: str,
    b_id: str,
    pipeline: SileroVADPipeline,
    commit_on_close: bool = True,
) -> None:
    """
    Flush remaining audio, optionally commit the backend transaction, clean up Redis.

    This mirrors the behaviour of the old _finalize() in stream_ws.py but
    uses the new provider-agnostic infrastructure.

    When commit_on_close is False (protocol streaming sessions), the chunks are
    flushed to S3 but the transaction is NOT committed here — the client finalizes
    via an explicit POST /sessions/{id}/end, which is the single canonical trigger.
    """
    try:
        await pipeline.finalize()
    except Exception:
        logger.exception("Final pipeline flush failed", stream_id=stream_id, severity="critical")

    if not commit_on_close:
        logger.info(
            "Stream flushed; skipping auto-commit (finalize via POST /sessions/{id}/end)",
            stream_id=stream_id,
            session_id=session_id,
            severity="medium",
        )
        await stream_session_store.delete_session(stream_id)
        return

    all_chunks = await stream_session_store.get_chunks(stream_id)

    if all_chunks:
        try:
            _commit_session(session_id, b_id, all_chunks)
            logger.info(
                "Stream session committed",
                stream_id=stream_id,
                session_id=session_id,
                audio_files_count=len(all_chunks),
                severity="medium",
            )
        except Exception:
            logger.exception(
                "Failed to commit stream session",
                stream_id=stream_id,
                session_id=session_id,
                severity="critical",
            )
    else:
        logger.warning(
            "No audio chunks recorded — skipping commit",
            stream_id=stream_id,
            session_id=session_id,
            severity="medium",
        )

    await stream_session_store.delete_session(stream_id)


def _commit_session(session_id: str, b_id: str, audio_files: list[str]) -> None:
    """Commit the backend transaction and dispatch to SQS for transcription."""
    update_data = {
        "client_generated_files": audio_files,
        "client_uploaded_files": audio_files,
    }
    _transaction_service.update_transaction(session_id, b_id, update_data)

    transaction_data = _transaction_service.commit_transaction(
        session_id,
        b_id,
        audio_files,
        chunk_info=None,
    )

    _transaction_service.send_commit_to_sqs(
        session_id,
        b_id,
        transaction_data,
        audio_files,
    )

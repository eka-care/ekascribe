"""
S3 chunk sink for the Pipecat-based streaming pipeline.

Receives WAV-wrapped PCM audio chunks from VADChunkAccumulator, converts them
to M4A, and uploads them through the existing AudioAdaptor.upload_audio_file()
with UploadType.CHUNKED — the same path used by the REST /sessions/{id}/audio
endpoint.  This means:
  - S3 bucket/prefix, key naming (1.m4a, 2.m4a …) and metadata are identical
  - DynamoDB transaction tracking via AudioAdaptor.update_transaction() reused
  - No duplicate S3 or boto3 logic in this layer
"""

import asyncio
import io
from typing import Any, Dict, Optional

from pydub import AudioSegment

from logs.custom_logger import get_logger
from voice2rx.protocol.adaptors.audio_adaptor import AudioAdaptor
from voice2rx.protocol.models import UploadType
from voice2rx.services.transactions.transaction_service import TransactionService
from voice2rx.streaming.session.stream_session_store import stream_session_store

logger = get_logger(__name__)

_transaction_service = TransactionService()
_audio_adaptor = AudioAdaptor()


def _wav_to_m4a(wav_bytes: bytes) -> bytes:
    """Convert WAV bytes to M4A (mp4 container) using pydub."""
    audio = AudioSegment.from_file(io.BytesIO(wav_bytes), format="wav")
    buf = io.BytesIO()
    audio.export(buf, format="mp4")
    buf.seek(0)
    return buf.read()


class S3ChunkSink:
    """
    Receives ready audio chunks, encodes them as M4A, and uploads via
    AudioAdaptor.upload_audio_file(CHUNKED) — the same code path as the
    REST /sessions/{id}/audio/{file_name} endpoint.

    One instance lives for the duration of a single streaming session.
    """

    def __init__(
        self,
        stream_id: str,
        session_id: str,
        b_id: str,
    ) -> None:
        self._stream_id = stream_id
        self._session_id = session_id
        self._b_id = b_id
        self._session_data: Optional[Dict[str, Any]] = None
        self._upload_lock = asyncio.Lock()

    async def _get_session_data(self) -> Dict[str, Any]:
        """Lazy-load and cache the DynamoDB transaction data."""
        if self._session_data is None:
            loop = asyncio.get_event_loop()
            self._session_data = await loop.run_in_executor(
                None,
                _transaction_service.get_transaction,
                self._session_id,
                self._b_id,
            )
        return self._session_data

    async def upload_chunk(self, wav_bytes: bytes, duration_secs: float) -> None:
        """
        Convert WAV → M4A and upload via AudioAdaptor (CHUNKED path).

        Serialised with a lock so concurrent VAD flushes don't race on the
        chunk index counter.

        Args:
            wav_bytes: WAV-wrapped raw PCM bytes from VADChunkAccumulator.
            duration_secs: Duration of this chunk in seconds (for logging).
        """
        async with self._upload_lock:
            await self._do_upload(wav_bytes, duration_secs)

    async def _do_upload(self, wav_bytes: bytes, duration_secs: float) -> None:
        next_index = await stream_session_store.get_next_chunk_index(self._stream_id)

        loop = asyncio.get_event_loop()
        m4a_bytes = await loop.run_in_executor(None, _wav_to_m4a, wav_bytes)

        session_data = await self._get_session_data()

        # AudioAdaptor.upload_audio_file(CHUNKED) expects the filename in the
        # form  audio_<N>.m4a  and stores it as  <N>.m4a  under s3_url.
        filename = f"audio_{next_index}.m4a"

        result = await _audio_adaptor.upload_audio_file(
            session_data=session_data,
            filename=filename,
            content=m4a_bytes,
            content_type="audio/m4a",
            upload_type=UploadType.CHUNKED,
        )

        simple_name = result["filename"]  # e.g. "1.m4a"
        await stream_session_store.update_chunks(self._stream_id, [simple_name])

        all_chunks = await stream_session_store.get_chunks(self._stream_id)

        # removing this wring , if one stream session create 20 chunks. it will do 20 db writes.
        # instead keep the chunk/file name pushing it to redis list. and and the end session flush that list to dyno 

        # _audio_adaptor.update_transaction(
        #     self._session_id,
        #     self._b_id,
        #     {"client_uploaded_files": all_chunks},
        # )

        logger.info(
            "Chunk uploaded via AudioAdaptor",
            stream_id=self._stream_id,
            session_id=self._session_id,
            chunk_index=next_index,
            s3_key=result["s3_key"],
            size_bytes=result["size_bytes"],
            duration_secs=round(duration_secs, 2),
            total_chunks=len(all_chunks),
            severity="medium",
        )

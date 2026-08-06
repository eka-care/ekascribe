"""
Pipecat-based VAD pipeline for provider-independent audio streaming.

This module wires together:
  1. SileroVADAnalyzer — Pipecat's built-in Silero VAD ONNX model
  2. VADChunkAccumulator — accumulates PCM frames between speech boundaries (10-30s)
  3. S3ChunkSink — uploads flushed chunks to S3 and updates Redis + DynamoDB

The pipeline is designed to be driven by a FastAPI WebSocket handler rather
than Pipecat's own WebSocketServerTransport.  This lets us:
  - Plug into FastAPI's authentication and routing
  - Share the existing session management and S3 upload infrastructure
  - Support multiple client protocols (raw PCM, Vobiz JSON envelope, etc.)

Usage from a WebSocket handler:
    pipeline = SileroVADPipeline(
        stream_id=stream_id,
        session_id=session_id,
        b_id=b_id,
    )
    pipeline.set_sample_rate(16000)

    # Feed each PCM chunk:
    await pipeline.process_audio(pcm_bytes)

    # On stream end:
    await pipeline.finalize()
"""

from logs.custom_logger import get_logger
from voice2rx.streaming.pipeline.s3_chunk_sink import S3ChunkSink
from voice2rx.streaming.pipeline.vad_chunk_accumulator import VADChunkAccumulator

logger = get_logger(__name__)

SAMPLE_RATE = 16000


class SileroVADPipeline:
    """
    Thin orchestrator that connects Silero VAD → chunk accumulation → S3 upload.

    One instance is created per streaming WebSocket connection and lives for
    the duration of that connection.
    """

    def __init__(
        self,
        stream_id: str,
        session_id: str,
        b_id: str,
        sample_rate: int = SAMPLE_RATE,
    ) -> None:
        self._stream_id = stream_id
        self._session_id = session_id
        self._b_id = b_id

        self._sink = S3ChunkSink(
            stream_id=stream_id,
            session_id=session_id,
            b_id=b_id,
        )

        self._accumulator = VADChunkAccumulator(
            stream_id=stream_id,
            sample_rate=sample_rate,
            on_chunk_ready=self._sink.upload_chunk,
        )

        logger.info(
            "SileroVADPipeline initialized",
            stream_id=stream_id,
            session_id=session_id,
            sample_rate=sample_rate,
        )

    def set_sample_rate(self, sample_rate: int) -> None:
        """Set the expected incoming PCM sample rate (before audio starts)."""
        self._accumulator.set_sample_rate(sample_rate)

    async def process_audio(self, pcm_bytes: bytes) -> None:
        """
        Feed raw PCM audio bytes into the pipeline.

        The accumulator runs Silero VAD on each batch of frames and triggers
        chunk uploads when speech boundaries are detected (10–30s segments).

        Args:
            pcm_bytes: Raw 16-bit little-endian PCM audio bytes (mono, 16kHz).
        """
        await self._accumulator.push(pcm_bytes)

    async def finalize(self) -> None:
        """
        Flush any remaining buffered audio and upload the final chunk.

        Must be called when the WebSocket stream ends (either gracefully via
        a "stop" event or due to a disconnect).
        """
        logger.info("Finalizing pipeline", stream_id=self._stream_id, severity="medium")
        await self._accumulator.flush_remaining()

    @property
    def stream_id(self) -> str:
        return self._stream_id

    @property
    def session_id(self) -> str:
        return self._session_id

    @property
    def b_id(self) -> str:
        return self._b_id

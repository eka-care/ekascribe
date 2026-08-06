"""
VAD-driven audio chunk accumulator using Pipecat's SileroVADAnalyzer.

Accumulates raw PCM frames, runs Silero VAD on each incoming batch, and
flushes completed speech segments to S3 when appropriate boundaries are
detected.

Chunking strategy:
  - Silero VAD fires SPEAKING / QUIET state transitions on every frame batch
  - When transitioning from SPEAKING → QUIET (speech end), we check the
    accumulated duration:
      - If duration >= MIN_CHUNK_SECS (10s): flush immediately as one chunk
      - If duration < MIN_CHUNK_SECS: keep accumulating into the next segment
        (short silence treated as a natural pause within the same chunk)
  - Hard cap at MAX_CHUNK_SECS (30s): flush regardless of VAD state
  - On stream end, flush whatever remains (even if < 10s)

This produces chunks that are:
  - Always ≤ 30 seconds (safe for Whisper/ASR limits)
  - Usually ≥ 10 seconds (efficient for transcription batch processing)
  - Split at real speech boundaries wherever possible
"""

import io
import wave
from typing import Awaitable, Callable, Optional

# Import before SileroVADAnalyzer so the shared-InferenceSession patch is applied
# before any analyzer is instantiated.
from voice2rx.streaming.pipeline import _silero_shared_session  # noqa: F401

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams, VADState

from logs.custom_logger import get_logger

logger = get_logger(__name__)

MIN_CHUNK_SECS = 10.0
MAX_CHUNK_SECS = 25.0

# Type alias for the async callback called when a chunk is ready for upload
ChunkReadyCallback = Callable[[bytes, int], Awaitable[None]]


def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int) -> bytes:
    """Wrap raw PCM bytes in a WAV container (required for pydub / ffmpeg)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit = 2 bytes
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    buf.seek(0)
    return buf.read()


def _pcm_duration_secs(pcm_bytes: bytes, sample_rate: int) -> float:
    """Calculate duration of raw PCM bytes in seconds."""
    # 16-bit mono: 2 bytes per sample
    return len(pcm_bytes) / (sample_rate * 2)


class VADChunkAccumulator:
    """
    Accumulates PCM audio frames and flushes speech-boundary-aware chunks.

    Uses Pipecat's SileroVADAnalyzer for accurate speech detection.
    The on_chunk_ready callback receives (wav_bytes, chunk_duration_secs)
    and is responsible for M4A encoding and S3 upload.
    """

    def __init__(
        self,
        stream_id: str,
        sample_rate: int = 16000,
        on_chunk_ready: Optional[ChunkReadyCallback] = None,
        min_chunk_secs: float = MIN_CHUNK_SECS,
        max_chunk_secs: float = MAX_CHUNK_SECS,
    ) -> None:
        self._stream_id = stream_id
        self._sample_rate = sample_rate
        self._on_chunk_ready = on_chunk_ready
        self._min_chunk_secs = min_chunk_secs
        self._max_chunk_secs = max_chunk_secs

        self._vad = SileroVADAnalyzer(
            sample_rate=sample_rate,
            params=VADParams(
                confidence=0.6,
                start_secs=0.15,
                stop_secs=0.25,
                min_volume=0.3,
            ),
        )
        self._vad.set_sample_rate(sample_rate)

        self._buffer = bytearray()
        self._prev_vad_state: VADState = VADState.QUIET
        self._chunk_count = 0

        logger.info(
            "VADChunkAccumulator initialized",
            stream_id=stream_id,
            sample_rate=sample_rate,
            min_chunk_secs=min_chunk_secs,
            max_chunk_secs=max_chunk_secs,
        )

    def set_sample_rate(self, sample_rate: int) -> None:
        """
        Update the expected PCM sample rate.

        This should be called before any audio is pushed (e.g. on a JSON "start"
        event) so durations/VAD/WAV headers stay consistent with the incoming PCM.
        """
        if sample_rate <= 0:
            raise ValueError("sample_rate must be a positive integer")

        if self._buffer:
            logger.warning(
                "Ignoring sample rate update after audio started",
                stream_id=self._stream_id,
                current_sample_rate=self._sample_rate,
                requested_sample_rate=sample_rate,
                buffered_bytes=len(self._buffer),
                severity="medium",
            )
            return

        if sample_rate == self._sample_rate:
            return

        self._sample_rate = sample_rate
        self._vad.set_sample_rate(sample_rate)
        logger.info(
            "Sample rate updated",
            stream_id=self._stream_id,
            sample_rate=sample_rate,
        )

    @property
    def buffered_duration_secs(self) -> float:
        return _pcm_duration_secs(bytes(self._buffer), self._sample_rate)

    async def push(self, pcm_bytes: bytes) -> None:
        """
        Push a batch of raw PCM bytes through the VAD pipeline.

        Appends to the internal buffer, runs VAD analysis, and flushes
        when speech boundaries or the hard cap are reached.

        Args:
            pcm_bytes: Raw 16-bit little-endian PCM, mono, at self._sample_rate.
        """
        if not pcm_bytes:
            return

        self._buffer.extend(pcm_bytes)

        new_state = await self._vad.analyze_audio(pcm_bytes)

        duration = self.buffered_duration_secs

        #todo: re-check this logic again.
        #hard cap: flush immediately regardless of VAD state
        if duration >= self._max_chunk_secs:
            logger.info(
                "Hard cap reached — flushing",
                stream_id=self._stream_id,
                duration_secs=round(duration, 2),
            )
            await self._flush()
            self._prev_vad_state = new_state
            return

        # spech just ended (SPEAKING/STOPPING → QUIET) and we have enough audio
        speech_just_ended = (
            self._prev_vad_state in (VADState.SPEAKING, VADState.STOPPING)
            and new_state == VADState.QUIET
        )
        if speech_just_ended and duration >= self._min_chunk_secs:
            logger.info(
                "Speech boundary — flushing",
                stream_id=self._stream_id,
                duration_secs=round(duration, 2),
            )
            await self._flush()

        self._prev_vad_state = new_state

    async def flush_remaining(self) -> None:
        """
        Flush any remaining buffered audio (called at stream end).

        Uploads even if < min_chunk_secs to ensure no audio is lost.
        """
        if self._buffer:
            duration = self.buffered_duration_secs
            logger.info(
                "Flushing remaining buffer on stream end",
                stream_id=self._stream_id,
                duration_secs=round(duration, 2),
            )
            await self._flush()

    async def _flush(self) -> None:
        """Encode the current buffer to WAV and invoke the on_chunk_ready callback."""
        if not self._buffer:
            return

        pcm_snapshot = bytes(self._buffer)
        self._buffer.clear()

        self._chunk_count += 1
        duration = _pcm_duration_secs(pcm_snapshot, self._sample_rate)

        wav_bytes = _pcm_to_wav(pcm_snapshot, self._sample_rate)

        logger.info(
            "Chunk ready",
            stream_id=self._stream_id,
            chunk_number=self._chunk_count,
            duration_secs=round(duration, 2),
        )

        if self._on_chunk_ready is not None:
            await self._on_chunk_ready(wav_bytes, duration)

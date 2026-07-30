"""
VAD Chunking Service

Performs Voice Activity Detection (VAD) based audio chunking using pydub's
silence detection. Splits long audio files into smaller chunks at silence
boundaries, suitable for downstream ASR processing.

This replaces the external SNS-based chunking workflow for single audio uploads.
"""

import io
from typing import Dict, List, Tuple

from pydub import AudioSegment
from pydub.silence import detect_nonsilent

from logs.custom_logger import get_logger

logger = get_logger(__name__)


class VADChunkingService:
    """
    Service for chunking audio files using silence-based VAD.
    
    Uses pydub's silence detection to find optimal split points in audio,
    similar to Silero VAD but without the torch dependency.
    """

    def __init__(
        self,
        max_chunk_length_sec: float = 29.99,
        preferred_chunk_length_sec: float = 10.0,
        min_silence_len_ms: int = 300,
        silence_thresh_dbfs: int = -40,
        target_sample_rate: int = 16000,
    ):
        """
        Initialize VAD chunking service.

        Args:
            max_chunk_length_sec: Maximum length of any single chunk in seconds.
            preferred_chunk_length_sec: Preferred chunk length; will try to split
                                        near this length at silence boundaries.
            min_silence_len_ms: Minimum silence duration (ms) to consider as a split point.
            silence_thresh_dbfs: Silence threshold in dBFS.
            target_sample_rate: Target sample rate for resampling.
        """
        self.max_chunk_length_sec = max_chunk_length_sec
        self.preferred_chunk_length_sec = preferred_chunk_length_sec
        self.min_silence_len_ms = min_silence_len_ms
        self.silence_thresh_dbfs = silence_thresh_dbfs
        self.target_sample_rate = target_sample_rate

    def chunk_audio(
        self,
        audio_bytes: bytes,
        start_index: int = 1,
    ) -> Tuple[List[Tuple[int, bytes, Dict]], Dict[int, Dict]]:
        """
        Chunk audio bytes into smaller segments at silence boundaries.

        Args:
            audio_bytes: Raw audio file bytes (any format supported by pydub/ffmpeg).
            start_index: Starting chunk index number (for continuation across uploads).

        Returns:
            Tuple of:
                - List of (chunk_index, chunk_bytes_m4a, chunk_metadata) tuples
                - audio_index_obj: Dict mapping chunk_index -> {"st": start_time, "et": end_time}
        """
        # Load audio
        audio = AudioSegment.from_file(io.BytesIO(audio_bytes))

        # Resample to target sample rate and convert to mono
        audio = audio.set_frame_rate(self.target_sample_rate).set_channels(1)

        total_duration_sec = len(audio) / 1000.0
        logger.info(
            "VAD chunking started",
            total_duration_sec=round(total_duration_sec, 2),
            start_index=start_index,
        )

        max_chunk_ms = int(self.max_chunk_length_sec * 1000)

        # If audio is short enough, no chunking needed
        if len(audio) <= max_chunk_ms:
            chunk_bytes = self._export_as_m4a(audio)
            audio_index = {
                start_index: {
                    "st": 0.0,
                    "et": round(total_duration_sec, 4),
                }
            }
            return [(start_index, chunk_bytes, audio_index[start_index])], audio_index

        # Find silence-based chunk points
        chunk_points_ms = self._get_chunk_points(audio)

        # Process chunks
        chunks = []
        audio_index = {}
        chunk_index = start_index

        for i in range(len(chunk_points_ms) - 1):
            start_ms = chunk_points_ms[i]
            end_ms = chunk_points_ms[i + 1]
            segment = audio[start_ms:end_ms]

            chunk_bytes = self._export_as_m4a(segment)

            st_sec = round(start_ms / 1000.0, 4)
            et_sec = round(end_ms / 1000.0, 4)

            logger.info(
                "VAD chunk created",
                chunk_index=chunk_index,
                start_sec=st_sec,
                end_sec=et_sec,
                duration_sec=round(et_sec - st_sec, 4),
            )

            audio_index[chunk_index] = {"st": st_sec, "et": et_sec}
            chunks.append((chunk_index, chunk_bytes, audio_index[chunk_index]))
            chunk_index += 1

        logger.info(
            "VAD chunking completed",
            total_chunks=len(chunks),
            start_index=start_index,
            end_index=chunk_index - 1,
            severity="medium",
        )

        return chunks, audio_index

    def _get_chunk_points(self, audio: AudioSegment) -> List[int]:
        """
        Determine optimal chunk points using silence detection.

        Finds non-silent regions and places split points at silence boundaries,
        respecting preferred and maximum chunk length constraints.

        Args:
            audio: pydub AudioSegment

        Returns:
            List of chunk boundary positions in milliseconds (including 0 and end).
        """
        total_ms = len(audio)
        preferred_ms = int(self.preferred_chunk_length_sec * 1000)
        max_ms = int(self.max_chunk_length_sec * 1000)

        # Detect non-silent ranges: list of [start_ms, end_ms]
        nonsilent_ranges = detect_nonsilent(
            audio,
            min_silence_len=self.min_silence_len_ms,
            silence_thresh=self.silence_thresh_dbfs,
        )

        if not nonsilent_ranges:
            # Entirely silent audio — return as single chunk
            return [0, total_ms]

        # Build silence midpoints as candidate split points
        silence_midpoints = []
        for i in range(len(nonsilent_ranges) - 1):
            gap_start = nonsilent_ranges[i][1]
            gap_end = nonsilent_ranges[i + 1][0]
            midpoint = (gap_start + gap_end) // 2
            silence_midpoints.append(midpoint)

        # Greedy chunking: walk through and split at silence boundaries
        chunk_points = [0]
        current_start = 0

        for midpoint in silence_midpoints:
            current_length = midpoint - current_start

            # If this silence point is beyond max length, we must split
            if current_length >= max_ms:
                # Find the best split point before max
                chunk_points.append(midpoint)
                current_start = midpoint
            elif current_length >= preferred_ms:
                # We've reached preferred length — split here
                chunk_points.append(midpoint)
                current_start = midpoint

        # Add end of audio
        chunk_points.append(total_ms)

        # Safety check: enforce max_ms on any remaining oversized chunks
        chunk_points = self._enforce_max_length(chunk_points, max_ms)

        return chunk_points

    def _enforce_max_length(self, chunk_points: List[int], max_ms: int) -> List[int]:
        """
        Enforce maximum chunk length by hard-splitting any oversized segments.

        Args:
            chunk_points: List of chunk boundary positions in ms.
            max_ms: Maximum allowed chunk length in ms.

        Returns:
            Updated list of chunk points with no segment exceeding max_ms.
        """
        result = [chunk_points[0]]
        for i in range(1, len(chunk_points)):
            prev = result[-1]
            curr = chunk_points[i]
            while curr - prev > max_ms:
                # Hard split at max_ms intervals
                prev = prev + max_ms
                result.append(prev)
            result.append(curr)
        return result

    def _export_as_m4a(self, segment: AudioSegment) -> bytes:
        """
        Export an AudioSegment as M4A (mp4 container) bytes.

        Args:
            segment: pydub AudioSegment to export.

        Returns:
            M4A file bytes.
        """
        temp_m4a = io.BytesIO()
        segment.export(temp_m4a, format="mp4")
        temp_m4a.seek(0)
        return temp_m4a.read()

"""
Transcript File Service - reads transcript files produced by the pipeline.

The pipeline writes per-session transcripts to blob storage:
- template_results/transcripts/{txn_id}_transcript.json          (base)
- template_results/transcripts/{txn_id}_transcript_{lang}.json   (per language)

with a legacy fallback at logs/transcript.json for sessions processed by
older pipeline versions.
"""

import os
from typing import Dict, Optional, Any

from scribe.core.custom_logger import get_logger
from scribe.repositories.blob import blob_repo

logger = get_logger(__name__)


class TranscriptFileService:
    """Read-only access to pipeline-written transcript files."""

    def __init__(self, bucket_name: str = None):
        self.bucket_name = bucket_name or os.getenv("S3_VADED_BUCKET_NAME", "voice-records")

    def _get_base_folder(self, s3_url: str) -> str:
        folder_name = s3_url.removeprefix(f"s3://{self.bucket_name}/")
        if not folder_name.endswith("/"):
            folder_name += "/"
        return folder_name

    def get_transcript_file_path(
        self, s3_url: str, txn_id: str, language_suffix: Optional[str] = None
    ) -> str:
        base_folder = self._get_base_folder(s3_url)
        if language_suffix:
            return f"{base_folder}template_results/transcripts/{txn_id}_transcript_{language_suffix}.json"
        return f"{base_folder}template_results/transcripts/{txn_id}_transcript.json"

    def get_legacy_transcript_file_path(self, s3_url: str) -> str:
        base_folder = self._get_base_folder(s3_url)
        return f"{base_folder}logs/transcript.json"

    def read_transcript_file(
        self,
        s3_url: str,
        txn_id: str,
        fallback_to_legacy: bool = True,
        language_suffix: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Read transcript file from blob storage.

        Args:
            s3_url: Base S3 URL for the transaction
            txn_id: Transaction ID
            fallback_to_legacy: If True, will try legacy location if new location fails (only for base transcript)
            language_suffix: Optional language code for multi-language transcripts (e.g., 'eng', 'hi')

        Returns:
            Transcript data or None if not found
        """
        try:
            file_path = self.get_transcript_file_path(s3_url, txn_id, language_suffix)
            filename = f"{txn_id}_transcript_{language_suffix}.json" if language_suffix else f"{txn_id}_transcript.json"

            transcript_data = blob_repo.download_file(
                self.bucket_name,
                file_path,
                filename,
                txn_id
            )

            if transcript_data:
                logger.info(
                    "Transcript read from new location",
                    txn_id=txn_id,
                    language_suffix=language_suffix,
                    file_path=file_path
                )
                return transcript_data

            # only fallback to legacy for base transcript (not language-specific ones)
            if fallback_to_legacy and not language_suffix:
                logger.info(
                    "Transcript not found in new location, falling back to logs/transcript.json",
                    txn_id=txn_id
                )
                legacy_path = self.get_legacy_transcript_file_path(s3_url)
                legacy_data = blob_repo.download_file(
                    self.bucket_name,
                    legacy_path,
                    "transcript.json",
                    txn_id
                )
                if legacy_data:
                    logger.info(
                        "Transcript found in legacy location",
                        txn_id=txn_id,
                        file_path=legacy_path
                    )
                return legacy_data

            logger.debug(
                "Transcript not found",
                txn_id=txn_id,
                language_suffix=language_suffix
            )
            return None

        except Exception as e:
            logger.error(
                "Error reading transcript file",
                txn_id=txn_id,
                language_suffix=language_suffix,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            # Try legacy fallback on exception (only for base transcript)
            if fallback_to_legacy and not language_suffix:
                try:
                    legacy_path = self.get_legacy_transcript_file_path(s3_url)
                    return blob_repo.download_file(self.bucket_name, legacy_path, "transcript.json", txn_id)
                except:
                    pass
            return None

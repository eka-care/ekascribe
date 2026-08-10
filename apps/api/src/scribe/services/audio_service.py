"""
Audio processing service for audio-related business logic.
"""

from datetime import datetime, timezone
from typing import Dict, Optional, Any
from scribe.core.custom_logger import get_logger
from scribe.repositories.audio_details_orm import AudioDetailsORM

logger = get_logger(__name__)


class AudioProcessingService:
    """Service for audio operations."""

    def __init__(self, audio_repo: Optional[AudioDetailsORM] = None):
        """
        Initialize audio ORM.

        Args:
            audio_repo: Audio ORM instance
        """
        self.audio_repo = audio_repo or AudioDetailsORM()

    def create_audio_metadata(
        self, txn_id: str, b_id: str, amazon_trace_id: str
    ) -> bool:
        """
        Create audio metadata record.

        Args:
            txn_id: Transaction ID
            b_id: Business ID
            amazon_trace_id: Amazon trace ID from headers

        Returns:
            True if successful, False otherwise
        """
        try:
            metadata = {
                "amazon-trace-id": amazon_trace_id,
                "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }

            result = self.audio_repo.create_audio_metadata(txn_id, b_id, metadata)

            if result.get("success"):
                logger.info(
                    "AUDIO SERVICE: Audio metadata created successfully",
                    txn_id=txn_id,
                    b_id=b_id,
                    severity="medium",
                )
                return True
            else:
                logger.error(
                    "AUDIO SERVICE: Failed to create audio metadata",
                    txn_id=txn_id,
                    b_id=b_id,
                    error=result.get("error"),
                    severity="critical",
                )
                return False

        except Exception as e:
            logger.error(
                "AUDIO SERVICE: Error creating audio metadata",
                txn_id=txn_id,
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            return False

    def update_audio_details(
        self, txn_id: str, b_id: str, audio_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update audio details.

        Args:
            txn_id: Transaction ID
            b_id: Business ID
            audio_data: Audio data to update

        Returns:
            Updated audio data
        """
        from scribe.core.choices import AudioStatus

        try:
            # Add status and timestamp
            audio_data["status"] = AudioStatus.UPDATED.value
            audio_data["updated_at"] = datetime.now(timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )

            result = self.audio_repo.update_audio_details(txn_id, b_id, audio_data)

            if result.get("error"):
                raise Exception(result["error"])

            logger.info(
                "AUDIO SERVICE: Audio details updated successfully",
                txn_id=txn_id,
                b_id=b_id,
                severity="medium",
            )

            return result.get("data", {})

        except Exception as e:
            logger.error(
                "AUDIO SERVICE: Error updating audio details",
                txn_id=txn_id,
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise

    def get_audio_quality_details(self, txn_id: str, b_id: str) -> Dict[str, Any]:
        """
        Get audio quality details for chunk records.

        Args:
            txn_id: Transaction ID
            b_id: Business ID

        Returns:
            Audio quality data
        """
        try:
            result = self.audio_repo.get_audio_quality_details(txn_id, b_id)

            if result.get("error"):
                raise Exception(result["error"])

            logger.info(
                "AUDIO SERVICE: Successfully fetched audio quality details",
                txn_id=txn_id,
                b_id=b_id,
            )

            return result.get("data", [])

        except Exception as e:
            logger.error(
                "AUDIO SERVICE: Error fetching audio quality details",
                txn_id=txn_id,
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            raise

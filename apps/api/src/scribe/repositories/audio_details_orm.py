"""
Audio ORM for DynamoDB operations.
"""
import os
from typing import Dict, List, Optional, Any
from boto3.dynamodb.conditions import Key
from scribe.core.custom_logger import get_logger
from scribe.repositories.base_orm import BaseORM
logger = get_logger(__name__)

# todo: rename : aduio_chunk_orm

class AudioDetailsORM(BaseORM):
    """ORM for audio-related database operations."""

    def __init__(self):
        """Initialize audio ORM."""
        table_name = os.getenv("AUDIO_TABLE_NAME", "ekascribe-audio-details")
        super().__init__(table_name=table_name)

    def create_audio_metadata(
        self, txn_id: str, b_id: str, metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create audio metadata record.

        Args:
            txn_id: Transaction ID
            b_id: Business ID
            metadata: Additional metadata

        Returns:
            Result dict
        """
        try:
            composite_key = f"{b_id}#{txn_id}"
            audio_details = {
                "composite_key": composite_key,
                "record_type": "METADATA",
                "txn_id": txn_id,
                "b_id": b_id,
                **metadata,
            }

            result = self.insert_if_not_exists(
                item=audio_details,
                partition_key="composite_key",
                partition_value=composite_key,
                sort_key="record_type",
                sort_value="METADATA",
            )

            if result.get("success"):
                logger.info(
                    "Audio metadata created successfully",
                    txn_id=txn_id,
                    b_id=b_id,
                    composite_key=composite_key,
                    severity="medium",
                )
                return {"success": True}
            else:
                logger.error(
                    "Failed to create audio metadata",
                    txn_id=txn_id,
                    b_id=b_id,
                    error=result.get("error"),
                    severity="critical",
                )
                return {"error": result.get("error")}

        except Exception as e:
            logger.error(
                "Error creating audio metadata",
                txn_id=txn_id,
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            return {"error": str(e)}

    def update_audio_details(
        self, txn_id: str, b_id: str, update_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update audio details.

        Args:
            txn_id: Transaction ID
            b_id: Business ID
            update_data: Fields to update

        Returns:
            Updated audio data
        """
        try:
            key = {"txn_id": txn_id, "b_id": b_id}

            # Check if record exists
            existing = self.get(key)
            if not existing:
                return {"error": "Audio record not found"}

            updated_item = self.update(key=key, update_data=update_data)
            return {"success": True, "data": updated_item}

        except Exception as e:
            logger.error(
                "Failed to update audio details",
                txn_id=txn_id,
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            return {"error": str(e)}

    def get_chunk_audio_quality(
        self, txn_id: str, b_id: str, chunk_name: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get audio quality and length for a single chunk.

        The `record_type` in the table is stored with the file extension
        (e.g. "chunk#1.mp3"), while callers pass the base name without
        extension (e.g. "chunk#1"). We match using a begins_with on
        "{chunk_name}." so that "chunk#1" does not accidentally match
        "chunk#10.mp3".

        Args:
            txn_id: Transaction ID
            b_id: Business ID
            chunk_name: Chunk base name without extension (e.g. "chunk#1")

        Returns:
            Dict with audio_length and quality for the chunk, or None if
            not found.
        """
        try:
            composite_key = f"{b_id}#{txn_id}"
            prefix = f"{chunk_name}."

            response = self.table.query(
                KeyConditionExpression=Key("composite_key").eq(composite_key)
                & Key("record_type").begins_with(prefix),
                ProjectionExpression="record_type, audio_length, quality",
                Select="SPECIFIC_ATTRIBUTES",
                Limit=1,
            )

            items = response.get("Items", [])
            if not items:
                logger.warning(
                    "No audio quality found for chunk",
                    txn_id=txn_id,
                    b_id=b_id,
                    chunk_name=chunk_name,
                    severity="medium",
                )
                return None

            item = items[0]
            return {
                "audio_length": item.get("audio_length"),
                "quality": item.get("quality"),
            }

        except Exception as e:
            logger.error(
                "Error fetching chunk audio quality",
                txn_id=txn_id,
                b_id=b_id,
                chunk_name=chunk_name,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            return None

    def get_audio_quality_details(
        self, txn_id: str, b_id: str
    ) -> Dict[str, Any]:
        """
        Get audio quality details for chunk records.

        Args:
            txn_id: Transaction ID
            b_id: Business ID

        Returns:
            Audio quality data
        """
        try:
            composite_key = f"{b_id}#{txn_id}"

            # Query for records with sort key starting with "chunk"
            response = self.table.query(
                KeyConditionExpression=Key("composite_key").eq(composite_key)
                & Key("record_type").begins_with("chunk"),
                ProjectionExpression="composite_key, record_type, quality",
                Select="SPECIFIC_ATTRIBUTES",
            )

            items = response.get("Items", [])

            if not items:
                logger.warning(
                    "No audio quality details found",
                    txn_id=txn_id,
                    b_id=b_id,
                    severity="medium",
                )
                return {"error": "No audio quality details found"}

            logger.info(
                "Successfully fetched audio quality details",
                txn_id=txn_id,
                b_id=b_id,
                total_chunks=len(items),
            )

            return {"success": True, "data": items}

        except Exception as e:
            logger.error(
                "Error fetching audio quality details",
                txn_id=txn_id,
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            return {"error": str(e)}


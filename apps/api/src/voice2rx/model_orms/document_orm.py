"""
Ekascribe Document ORM - Data Access Layer

This ORM handles all database operations for the ekascribe_document table.
Table stores document metadata for both templates and transcripts.

Table Structure:
- document_id (partition key): UUID string
- session_id: Transaction/Session ID
- template_id: Template ID
- document_name: Human-readable document name
- document_path: S3 path relative to bucket
- type: one of "context", "transcript", "custom", "notes", "integration"
- status: in-progress, success, failure, partial_success
- uuid: User UUID
- wid: Workspace ID (= b_id)
- errors: List of error messages
- warnings: List of warning messages
- usage_information: Map of token counts and model info
- archived: Boolean soft-delete flag
- archived_at: ISO timestamp when archived
- created_at: ISO timestamp
- updated_at: ISO timestamp

GSI: session_id-template_id-index (PK: session_id, SK: template_id)
"""

import os
from typing import Dict, List, Optional, Any
from logs.custom_logger import get_logger
from voice2rx.choices import NON_TEMPLATE_DOCUMENT_ID
from voice2rx.core.exceptions import DuplicateEntryException
from voice2rx.model_orms.base_orm import BaseORM
from voice2rx.utils.time_utils import get_current_epoch_timestamp, get_current_utc_timestamp

logger = get_logger(__name__)

GSI_SESSION_TEMPLATE_INDEX = "session_id-template_id-index"


class EkascribeDocumentORM(BaseORM):
    """ORM for ekascribe_document table operations."""

    def __init__(self):
        table_name = os.getenv("EKASCRIBE_DOCUMENT_TABLE", "ekascribe_document")
        super().__init__(table_name=table_name)
        logger.info(f"EkascribeDocumentORM initialized with table: {table_name}")

    def create_document(self, document_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new document record.

        Args:
            document_data: Dictionary containing document fields including document_id.

        Returns:
            Created record dict.

        Raises:
            DuplicateEntryException: If document_id already exists.
        """

        if not document_data.get("template_id"):
            document_data["template_id"] = NON_TEMPLATE_DOCUMENT_ID

        document_id = document_data.get("document_id")
        try:
            current_time = get_current_epoch_timestamp()
            document_data.setdefault("created_at", current_time)
            document_data.setdefault("updated_at", current_time)
            document_data.setdefault("archived", False)
            document_data.setdefault("errors", [])
            document_data.setdefault("warnings", [])
            document_data.setdefault("usage_information", {})

            result = self.insert_if_not_exists(
                item=document_data,
                partition_key="document_id",
                partition_value=document_id,
            )

            if not result.get("success"):
                if result.get("code") == "duplicate_entry":
                    raise DuplicateEntryException(
                        f"Document already exists: {document_id}"
                    )
                raise Exception(result.get("error", "Failed to create document"))

            logger.info("Document created", document_id=document_id, severity="medium")
            return document_data

        except Exception as e:
            logger.error(
                "Error creating document",
                document_id=document_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise

    def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a document by document_id.

        Args:
            document_id: Document UUID.

        Returns:
            Document dict or None if not found.
        """
        try:
            result = self.get(key={"document_id": document_id})
            if result:
                logger.info("Document retrieved", document_id=document_id)
            else:
                logger.debug("Document not found", document_id=document_id)
            return result

        except Exception as e:
            logger.error(
                "Error getting document",
                document_id=document_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            raise

    def get_template_documents(self, session_id: str) -> List[Dict[str, Any]]:
        """
        Get all non-archived template documents for a session using GSI.

        Args:
            session_id: Session/Transaction ID.
        Returns:
            List of document dicts with template_id != NON_TEMPLATE_DOCUMENT_ID.
        """
        # todo: query insted of doing in-memory filter after fetching all documents for session
        all_documents = self.get_documents_by_session(session_id)
        template_documents = []
        for doc in all_documents:
            if (
                doc.get("type") in ["context", "notes"]
                or doc.get("template_id") == NON_TEMPLATE_DOCUMENT_ID
            ):
                continue
            template_documents.append(doc)

        return template_documents


    def get_documents_by_session(self, session_id: str) -> List[Dict[str, Any]]:
        """
        Get all non-archived documents for a session using GSI.

        Args:
            session_id: Session/Transaction ID.

        Returns:
            List of document dicts.
        """
        try:
            response = self.table.query(
                IndexName=GSI_SESSION_TEMPLATE_INDEX,
                KeyConditionExpression="session_id = :sid",
                FilterExpression="attribute_not_exists(archived) OR archived = :false_val",
                ExpressionAttributeValues={
                    ":sid": session_id,
                    ":false_val": False,
                },
            )
            items = response.get("Items", [])
            # GSI sorts by template_id; re-sort by created_at desc so callers
            # see most-recent documents first.
            items.sort(key=lambda d: int(d.get("created_at") or 0), reverse=True)
            logger.info(
                "Documents retrieved by session",
                session_id=session_id,
                count=len(items),
            )
            return items

        except Exception as e:
            logger.error(
                "Error getting documents by session",
                session_id=session_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            return []

    def get_documents_by_session_and_template(
        self, session_id: str, template_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all non-archived documents for a session and template using GSI.

        Uses the session_id-template_id-index GSI with both keys in the
        KeyConditionExpression (efficient query, no filter scan).

        Args:
            session_id: Session/Transaction ID.
            template_id: Template ID to filter by.

        Returns:
            List of document dicts matching the session_id and template_id.
        """
        try:
            response = self.table.query(
                IndexName=GSI_SESSION_TEMPLATE_INDEX,
                KeyConditionExpression="session_id = :sid AND template_id = :tid",
                FilterExpression="attribute_not_exists(archived) OR archived = :false_val",
                ExpressionAttributeValues={
                    ":sid": session_id,
                    ":tid": template_id,
                    ":false_val": False,
                },
            )
            items = response.get("Items", [])
            logger.info(
                "Documents retrieved by session and template",
                session_id=session_id,
                template_id=template_id,
                count=len(items),
            )
            return items

        except Exception as e:
            logger.error(
                "Error getting documents by session and template",
                session_id=session_id,
                template_id=template_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            return []

    def update_document(
        self, document_id: str, update_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update a document by document_id.

        Args:
            document_id: Document UUID.
            update_data: Dictionary of attributes to update.

        Returns:
            Updated document dict.
        """
        try:
            key = {"document_id": document_id}
            updated_item = self.update(key=key, update_data=update_data)
            logger.info("Document updated", document_id=document_id, severity="medium")
            return updated_item

        except Exception as e:
            logger.error(
                "Error updating document",
                document_id=document_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise

    def get_documents_by_ids(self, document_ids: List[str]) -> List[Dict[str, Any]]:
        if not document_ids:
            return []

        try:
            keys = [{"document_id": doc_id} for doc_id in document_ids]
            response = self.dynamodb_resource.batch_get_item(
                RequestItems={
                    self.table_name: {
                        "Keys": keys,
                    }
                }
            )
            items = response.get("Responses", {}).get(self.table_name, [])
            logger.info(
                "Documents batch retrieved",
                requested=len(document_ids),
                found=len(items),
            )
            return items

        except Exception as e:
            logger.error(
                "Error batch getting documents",
                document_ids=document_ids,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            raise

    def archive_document(self, document_id: str) -> Dict[str, Any]:
        """
        Soft-delete a document by setting archived=true and archived_at.

        Args:
            document_id: Document UUID.

        Returns:
            Updated document dict.
        """
        try:
            update_data = {
                "archived": True,
                "archived_at": get_current_utc_timestamp(),
            }
            return self.update_document(document_id, update_data)

        except Exception as e:
            logger.error(
                "Error archiving document",
                document_id=document_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise

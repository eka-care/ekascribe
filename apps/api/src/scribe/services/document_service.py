"""
Document Service - Business logic for ekascribe_document operations.

Handles creation, updates, content storage, and presigned URL generation
for documents (templates and transcripts).
"""

import os
import uuid
import base64
from typing import Dict, List, Optional, Any

from scribe.core.custom_logger import get_logger
from scribe.core.choices import DocumentType
from scribe.repositories.document_orm import EkascribeDocumentORM
from scribe.repositories.blob import StorageClient, storage_client_for_bucket
from scribe.services.transcript_file_service import TranscriptFileService
from scribe.core.time_utils import get_current_epoch_timestamp
from scribe.schemas.document_schema import CreateDocumentRequest

logger = get_logger(__name__)


class DocumentService:
    """Service for document CRUD and S3 content operations."""

    def __init__(
        self,
        document_repo: Optional[EkascribeDocumentORM] = None,
        bucket_name: Optional[str] = None,
        storage_client: Optional[StorageClient] = None,
    ):
        self.document_repo = document_repo or EkascribeDocumentORM()
        self.bucket_name = bucket_name or os.getenv(
            "S3_VADED_BUCKET_NAME", "voice-records"
        )
        self.storage_client = storage_client or storage_client_for_bucket(
            self.bucket_name
        )

    def create_document(
        self,
        session_id: str,
        template_id: str,
        uuid_val: str,
        wid: str,
        doc_type: str = DocumentType.CUSTOM,
        status: str = "in-progress",
        document_id: Optional[str] = None,
        document_name: Optional[str] = None,
        document_path: Optional[str] = None,
        errors: Optional[List] = None,
        warnings: Optional[List] = None,
        usage_info: Optional[Dict] = None,
        prompt_path: Optional[str] = None,
        created_at: Optional[int] = None,
        commit_at: Optional[int] = None,
        processed_at: Optional[int] = None,
        init_doc : Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Create a new document entry in ekascribe_document table.

        Validates input via CreateDocumentRequest pydantic model before
        writing to the database.

        Args:
            session_id: Transaction/Session ID.
            template_id: Template ID.
            uuid_val: User UUID.
            wid: Workspace ID (= b_id).
            doc_type: one of "context", "transcript", "custom", "notes", "integration".
            status: Initial status (default "in-progress").
            document_id: Optional UUID (auto-generated if omitted).
            document_name: Optional name (defaults to template_id).

        Returns:
            Created document dict with generated document_id.
        """
        if not document_id:
            document_id = str(uuid.uuid4())

        validated = CreateDocumentRequest(
            document_id=document_id,
            session_id=session_id,
            template_id=template_id,
            type=doc_type,
            status=status,
            document_name=document_name,
            errors=errors or [],
            warnings=warnings or [],
            usage_information=usage_info or {},
            prompt_path=prompt_path,
            created_at=created_at,
            commit_at=commit_at,
            processed_at=processed_at,
            init_doc=init_doc,
        )

        document_data = validated.model_dump(exclude_none=True)
        document_data["document_name"] = document_data.get("document_name") or template_id
        document_data["document_path"] = document_path or ""
        document_data["created_at"] = document_data.get("created_at") or get_current_epoch_timestamp()
        document_data["uuid"] = uuid_val
        document_data["wid"] = wid

        self.document_repo.create_document(document_data)
        logger.info(
            "Document created",
            document_id=document_id,
            session_id=session_id,
            template_id=template_id,
            type=doc_type,
            severity="medium",
        )
        return document_data
    
    def update_document(
        self,
        document_id: str,
        update_data: Dict[str, Any],

    ) -> Dict[str, Any]:
        """
        Update document metadata.
        Args:
            document_id: Document UUID.
            update_data: Dict of fields to update (e.g. status, errors).

        Returns:
            Updated document dict.
        """
        return self.document_repo.update_document(document_id, update_data)
    

    def update_document_status(
        self,
        document_id: str,
        status: str,
        errors: Optional[List] = None,
        warnings: Optional[List] = None,
        usage_info: Optional[Dict] = None,
        document_path: Optional[str] = None,
        prompt_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Update document status and optional metadata.

        Args:
            document_id: Document UUID.
            status: New status value.
            errors: Optional error list.
            warnings: Optional warning list.
            usage_info: Optional usage information map.
            document_path: Optional S3 path to set.
            prompt_path: Optional S3 path for the prompt file.

        Returns:
            Updated document dict.
        """
        update_data = {"status": status}
        if errors is not None:
            update_data["errors"] = errors
        if warnings is not None:
            update_data["warnings"] = warnings
        if usage_info is not None:
            update_data["usage_information"] = usage_info
        if document_path is not None:
            update_data["document_path"] = document_path
        if prompt_path is not None:
            update_data["prompt_path"] = prompt_path

        return self.document_repo.update_document(document_id, update_data)

    def write_document_content(
        self,
        s3_url: str,
        document_id: str,
        content: str,
        is_base64: bool = False,
        document_path: Optional[str] = None,
    ) -> str:
        """
        Write document content to S3 as raw text.

        If `document_path` is provided, the content is written to that exact
        S3 key. Otherwise it falls back to {s3_url}/documents/{document_id}.txt.

        Args:
            s3_url: Transaction's base S3 URL (s3://bucket/path). Used only
                when `document_path` is not supplied.
            document_id: Document UUID.
            content: Content string (raw or base64-encoded).
            is_base64: If True, decode base64 before writing.
            document_path: Optional existing S3 file key to overwrite.

        Returns:
            S3 file key (path relative to bucket).
        """
        if is_base64 and content:
            try:
                content = base64.b64decode(content).decode("utf-8")
            except Exception as e:
                logger.warning(
                    "Failed to decode base64 content, writing as-is",
                    document_id=document_id,
                    error=str(e),
                    severity="medium",
                )

        if document_path:
            file_key = document_path
        else:
            base_folder = s3_url.removeprefix(f"s3://{self.bucket_name}/")
            if not base_folder.endswith("/"):
                base_folder += "/"
            file_key = f"{base_folder}documents/{document_id}.txt"

        try:
            from scribe_core.storage import get_blob_store
            get_blob_store().put(
                self.bucket_name,
                file_key,
                content.encode("utf-8") if isinstance(content, str) else content,
                content_type="text/plain",
            )
            logger.info(
                "Document content written to S3",
                document_id=document_id,
                file_key=file_key,
                severity="medium",
            )
            return file_key

        except Exception as e:
            logger.error(
                "Error writing document content to S3",
                document_id=document_id,
                file_key=file_key,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise

    def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Get document metadata by document_id."""
        return self.document_repo.get_document(document_id)
    
    # NOTE: make sure this should only be called from the patch transaction API --> 
    # if it's beinge called from patch API at that time there will always be only one pair of(txn_id + template_id) document, later after conversion can be multiples
    # & result api once to get the (txn_id + transcript -> document id)
    def get_document_id_by_session_and_template(
        self, session_id: str, template_id: str
    ) -> Optional[str]:
        """Get document_id for a given session_id and template_id.

        Uses the session_id + template_id index for an efficient direct query.
        Returns the document_id of the first matching non-archived document.
        """
        documents = self.document_repo.get_documents_by_session_and_template(
            session_id=session_id, template_id=template_id
        )
        if not documents:
            logger.error(
                "DOCUMENT_NOT_FOUND for a session and template",
                session_id = session_id,
                template_id=template_id,
                severity="medium",
            )

        document_id = None
        for document in documents:
            if document.get("template_id") == template_id and document.get("init_doc"):
                document_id = document.get("document_id")
            #FIXME when taking changes live to prod ... please make sure to remove the below code
            if document.get("template_id") == template_id:
                document_id = document.get("document_id")

        return document_id

    def create_transcript_document(
        self,
        session_id: str,
        b_id: str,
        uuid_val: str,
        s3_url: str,
    ) -> Optional[str]:
        """Create (or update) the transcript document for a session once the
        pipeline reports the transcript ready. Reads the transcript file from
        blob storage, writes its text as document content, and marks the
        document success.

        Called from the transaction PATCH callback when transcript_status
        flips to success. Returns the document_id, or None when no transcript
        file exists.
        """
        try:
            transcript = TranscriptFileService().read_transcript_file(
                s3_url=s3_url,
                txn_id=session_id,
                fallback_to_legacy=True,
            )
            if not transcript:
                logger.info("No transcript file found", session_id=session_id)
                return None

            text = transcript.get("text", "")
            lang = transcript.get("lang", "")
            template_id = f"transcript_{lang}" if lang else "transcript"

            document_id = self.get_document_id_by_session_and_template(
                session_id, template_id
            )
            if not document_id and lang:
                document_id = self.get_document_id_by_session_and_template(
                    session_id, "transcript"
                )
            if not document_id:
                created = self.create_document(
                    session_id=session_id,
                    template_id=template_id,
                    uuid_val=uuid_val,
                    wid=b_id,
                    doc_type="transcript",
                )
                document_id = (created or {}).get("document_id")
                if not document_id:
                    raise Exception(
                        f"failed to create transcript document for session-id:{session_id}"
                    )
                logger.info(
                    "Created transcript document",
                    session_id=session_id,
                    document_id=document_id,
                )
            else:
                logger.info(
                    "Existing transcript document found, updating content",
                    session_id=session_id,
                    document_id=document_id,
                )

            file_key = self.write_document_content(
                s3_url=s3_url,
                document_id=document_id,
                content=text,
                is_base64=False,
            )
            self.update_document(
                document_id=document_id,
                update_data={
                    "status": "success",
                    "document_path": file_key,
                    "processed_at": get_current_epoch_timestamp(),
                },
            )
            return document_id
        except Exception as e:
            logger.error(
                "Error creating transcript document",
                session_id=session_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise

    def get_documents_by_ids(self, document_ids: List[str]) -> List[Dict[str, Any]]:
        """Fetch multiple documents by their document_ids."""
        return self.document_repo.get_documents_by_ids(document_ids)

    def get_documents_for_session(self, session_id: str) -> List[Dict[str, Any]]:
        """Get all non-archived documents for a session."""
        return self.document_repo.get_documents_by_session(session_id)

    def archive_document(self, document_id: str) -> Dict[str, Any]:
        """Soft-delete a document."""
        return self.document_repo.archive_document(document_id)

    def generate_presigned_download_url(
        self, document_path: str, expiration: int = 3600
    ) -> Optional[str]:
        """
        Generate a presigned download URL for a document.

        Args:
            document_path: S3 file key (relative to bucket).
            expiration: URL expiration in seconds.

        Returns:
            Presigned URL string or None.
        """
        if not document_path:
            return None
        return self.storage_client.generate_presigned_get_url(
            document_path, expires_in=expiration
        )

    def generate_presigned_upload_url(
        self, document_id: str, s3_url: str, expiration: int = 3600,
        document_path: Optional[str] = None,
    ) -> Optional[str]:
        """
        Generate a presigned upload URL for client-side PUT.

        Args:
            document_id: Document UUID.
            s3_url: Transaction's base S3 URL.
            expiration: URL expiration in seconds.
            document_path: Optional S3 file key. If provided, the presigned
                URL points to this path instead of the default location.

        Returns:
            Presigned URL string or None.
        """
        if document_path:
            file_key = document_path
        else:
            base_folder = s3_url.removeprefix(f"s3://{self.bucket_name}/")
            if not base_folder.endswith("/"):
                base_folder += "/"
            file_key = f"{base_folder}documents/{document_id}.txt"

        return self.storage_client.generate_presigned_put_url(
            file_key, expires_in=expiration, content_type="text/plain"
        )

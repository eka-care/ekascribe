"""
Context Resolution Service

Resolves context references (past sessions, documents, attachments) into
a structured `ResolvedContext` DTO consumed by the agent layer.

- Past sessions -> text transcripts (one per session, with session date)
- Documents     -> text content, or base64 PDF if the underlying file is a PDF
- Attachments   -> text / image (base64) / pdf (base64) based on type detection

Best-effort: individual failures are logged into `warnings` and skipped.
Never raises; callers treat an empty DTO as "no context".
"""

import base64
import json
import os
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import httpx

from scribe.core.custom_logger import get_logger
from scribe.core.choices import DocumentType
from scribe.repositories.document_orm import EkascribeDocumentORM
from scribe.repositories.transaction_orm import TransactionORM
from scribe.services.context.models import (
    ContextAttachmentItem,
    ContextDocumentItem,
    ContextItemKind,
    PastSessionItem,
    ResolvedContext,
)
from scribe.services.template_result_file_service import TemplateResultFileService
from scribe.repositories.s3_utils import get_s3_client

logger = get_logger(__name__)


IMAGE_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}

IMAGE_CONTENT_TYPES = set(IMAGE_MEDIA_TYPES.values())
VAULT_BASE_URL = os.getenv("VAULT_BASE_URL", "http://vault.orbi.orbi")

class ContextResolutionService:
    def __init__(self):
        self.template_result_file_service = TemplateResultFileService()
        self.document_orm = EkascribeDocumentORM()
        self.transaction_orm = TransactionORM()
        self.bucket_name = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")

    async def resolve(self, context: dict, b_id: str, transaction_data:dict) -> ResolvedContext:
        try:
            result = ResolvedContext()
            if not context:
                return result
            
            past_sessions = context.get("past_sessions") or []
            for past_session in past_sessions:
                if isinstance(past_session, dict):
                    session_id = past_session.get("session_id")
                    session_date = past_session.get("date_epoch")
                else:
                    # legacy entries stored as bare session_id strings
                    session_id = past_session
                    session_date = None
                if not session_id:
                    continue
                self._resolve_past_session(session_id, result, session_date, b_id)

            documents = context.get("documents") or []
            for document_id in documents:
                self._resolve_document(document_id, result)

            attachments = context.get("attachments") or []
            for attachment in attachments:
                self._resolve_attachment(attachment, result, transaction_data)

            return result
        except Exception as _:
            pass
    
    def _resolve_past_session(
        self, session_id: str, result: ResolvedContext,session_date: any,b_id:str
    ) -> None:
        try:
            #FIXME: this is temparory fix, figure out some solution . just to get the s3_url no need to fetch the entire transaction_data
            past_transaction = self.transaction_orm.get_transaction(txn_id=session_id, b_id=b_id)
            s3_url = past_transaction.get("s3_url")
            transcript = self.template_result_file_service.read_transcript_file(
                s3_url=s3_url, txn_id=session_id
            )

            try:
                transcript = transcript.get("text")
            except Exception as _:
                pass

            result.past_sessions.append(
                PastSessionItem(session_date=session_date, transcript=transcript)
            )
        except Exception as e:
            logger.warning(
                "Failed to resolve past session",
                session_id=session_id,
                error=str(e),
                severity="medium",
            )
            result.warnings.append(
                f"Failed to resolve past session {session_id}: {str(e)}"
            )

    def _resolve_document(self, document_id: str, result: ResolvedContext) -> None:
        try:
            doc = self.document_orm.get_document(document_id)
            if not doc:
                result.warnings.append(f"Document not found: {document_id}")
                return

            document_path = doc.get("document_path")
            if not document_path:
                result.warnings.append(f"Document has no path: {document_id}")
                return

            document_name = doc.get("document_name") or document_id
            document_data, content_type = self._download_s3_bytes(
                self.bucket_name, document_path
            )
            if document_data is None:
                result.warnings.append(f"Failed to download document: {document_id}")
                return
           
            try:
                text = document_data.decode("utf-8")
                try:
                    decoded = base64.b64decode(text, validate=True)
                    text = decoded.decode("utf-8")
                except (base64.binascii.Error, UnicodeDecodeError):
                    pass  
            except UnicodeDecodeError:
                result.warnings.append(f"Document is not valid text: {document_id}")
                return
            
            if not text:
                return 
            
            result.documents.append(
                ContextDocumentItem(
                    kind=ContextItemKind.TEXT,
                    document_name=document_name,
                    text=text,
                )
            )
        except Exception as e:
            logger.warning(
                "Failed to resolve document",
                document_id=document_id,
                error=str(e),
                severity="medium",
            )
            result.warnings.append(
                f"Failed to resolve document {document_id}: {str(e)}"
            )

    def _fetch_vault_document(
        self, attachment_id: str, patient_id: str, b_id: str, uuid_val: str,
    ) -> Optional[Dict[str, Any]]:
        """Call the vault internal API to get document metadata including asset URLs."""
        try:
            url = f"{VAULT_BASE_URL}/internal/api/v1/docs/{attachment_id}"
            params = {"oid": patient_id} if patient_id else {}
            from scribe_core.settings import get_settings

            jwt_payload = json.dumps(
                {"b-id": b_id, "uuid": uuid_val, "w-id": b_id, "iss": get_settings().auth_issuer}
            )
            headers = {
                "jwt-payload": jwt_payload,
                "service-id": "docon",
            }
            query_string = f"?oid={patient_id}" if patient_id else ""
            curl_cmd = (
                f"curl --location '{url}{query_string}' "
                f"--header 'jwt-payload: {jwt_payload}' "
                f"--header 'service-id: docon'"
            )
            logger.info("Vault API curl", curl=curl_cmd)

            response = httpx.get(url, params=params, headers=headers, timeout=3)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.warning(
                "Vault API call failed",
                attachment_id=attachment_id,
                error=str(e),
                severity="medium",
            )
            return None

    def _download_from_url(self, asset_url: str) -> Optional[bytes]:
        """Download file bytes from a presigned URL."""
        try:
            response = httpx.get(asset_url, timeout=30)
            response.raise_for_status()
            return response.content
        except Exception as e:
            logger.warning(
                "Failed to download from asset URL",
                asset_url=asset_url,
                error=str(e),
                severity="medium",
            )
            return None

    def _resolve_attachment(
        self, attachment: dict, result: ResolvedContext, transaction_data: Dict[str, Any]       
    ) -> None:
        b_id = transaction_data.get("b_id", "")
        uuid_val = transaction_data.get("uuid", "")

        attachment_id = attachment.get("id") if isinstance(attachment, dict) else attachment
        patient_id = attachment.get("patient_id", "") if isinstance(attachment, dict) else ""
        if not patient_id:
            return 

        # if patient is edited in the session, skip the documents of of the older patient to avoid any data leak,
        #  log a warning about the skipped attachment
        if patient_id not in [transaction_data.get("patient_id", ""), transaction_data.get("oid")]:
            logger.critical(
                "Attachment patient ID mismatch; skipping attachment",
                attachment_id=attachment_id,
                expected_patient_id=transaction_data.get("patient_id", ""),
                expected_oid=transaction_data.get("oid", ""),
                actual_patient_id=patient_id,
                severity="critical",
            )
            
            result.warnings.append(
                f"Attachment {attachment_id} skipped due to patient ID mismatch"
            )
            return
        
        try:
            vault_doc = self._fetch_vault_document(attachment_id, patient_id, b_id, uuid_val)
            if not vault_doc:
                result.warnings.append(f"Vault returned no data for attachment: {attachment_id}")
                return

            files = vault_doc.get("files") or []
            if not files:
                result.warnings.append(f"No files in vault response for attachment: {attachment_id}")
                return

            for file_entry in files:
                asset_url = file_entry.get("asset_url")
                file_type = (file_entry.get("file_type") or "").upper()
                if not asset_url:
                    continue

                parsed = urlparse(asset_url)
                filename = parsed.path.rsplit("/", 1)[-1].split("?")[0]
                display_name = self._strip_uuid_prefix(filename)
                lower_filename = filename.lower()

                if file_type == "PDF" or self._is_pdf(lower_filename, ""):
                    result.attachments.append(
                        ContextAttachmentItem(
                            kind=ContextItemKind.PDF,
                            filename=display_name,
                            media_type="application/pdf",
                            url=asset_url,
                        )
                    )
                    continue

                image_media_type = self._detect_image_media_type(lower_filename, "")
                if file_type == "IMG" or image_media_type:
                    result.attachments.append(
                        ContextAttachmentItem(
                            kind=ContextItemKind.IMAGE,
                            filename=display_name,
                            media_type=image_media_type or "image/jpeg",
                            url=asset_url,
                        )
                    )
                    continue

                body_bytes = self._download_from_url(asset_url)
                if body_bytes is None:
                    result.warnings.append(f"Failed to download attachment file: {attachment_id}")
                    continue
                try:
                    text = body_bytes.decode("utf-8")
                except UnicodeDecodeError:
                    result.warnings.append(
                        f"Unsupported binary attachment type; skipping: {display_name}"
                    )
                    continue
                result.attachments.append(
                    ContextAttachmentItem(
                        kind=ContextItemKind.TEXT,
                        filename=display_name,
                        text=text,
                    )
                )
        except Exception as e:
            logger.warning(
                "Failed to resolve attachment",
                attachment_id=attachment_id,
                error=str(e),
                severity="medium",
            )
            result.warnings.append(f"Failed to resolve attachment {attachment_id}: {str(e)}")

    def _download_s3_bytes(self, bucket: str, key: str):
        try:
            from scribe_core.storage import get_blob_store
            import mimetypes

            body = get_blob_store().get(bucket, key)
            content_type = mimetypes.guess_type(key)[0] or ""
            return body, content_type
        except Exception as e:
            logger.warning(
                "S3 download failed",
                bucket=bucket,
                key=key,
                error=str(e),
                severity="medium",
            )
            return None, ""

    def _download_s3_text(self, bucket: str, key: str) -> Optional[str]:
        body, _ = self._download_s3_bytes(bucket, key)
        if body is None:
            return None
        try:
            return body.decode("utf-8")
        except UnicodeDecodeError:
            return None

    @staticmethod
    def _is_pdf(key_or_path: str, content_type: str) -> bool:
        return (
            key_or_path.lower().endswith(".pdf")
            or (content_type or "").lower() == "application/pdf"
        )

    @staticmethod
    def _detect_image_media_type(
        lower_key: str, content_type: str
    ) -> Optional[str]:
        ct = (content_type or "").lower()
        if ct in IMAGE_CONTENT_TYPES:
            return ct
        for ext, mt in IMAGE_MEDIA_TYPES.items():
            if lower_key.endswith(ext):
                return mt
        return None

    @staticmethod
    def _strip_uuid_prefix(filename: str) -> str:
        # Attachments uploaded via our API are prefixed with "{uuid4}_".
        # UUID4 string form is 36 chars; strip only when that pattern matches.
        if "_" in filename:
            prefix, rest = filename.split("_", 1)
            if len(prefix) == 36 and prefix.count("-") == 4:
                return rest
        return filename

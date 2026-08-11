"""
Session Details Service.

Pure resource-reader for sessions. No polling, no lazy migration, no S3
content reads, no side-effects. Assembles the session view from the
transaction header and document rows (ekascribe_document). Presigned
download URLs are attached only when the caller opts in.

Contract: see GET /voice/api/v1/sessions/{session_id} in the session
details router.
"""
from http import HTTPStatus
from typing import Any, Dict, List, Optional, Tuple
import orjson

from scribe.core.custom_logger import get_logger
from scribe.core.choices import DocumentType, UserStatus, VOICE2RX_PROCESSING_STATUS
from scribe.core.exceptions import ResourceNotFoundException
from scribe.repositories.document_orm import EkascribeDocumentORM
from scribe.repositories.transaction_orm import TransactionORM, convert_decimals
from scribe.repositories.blob import StorageClient, get_storage_client
from scribe.services.session_utils import compute_upload_url
from scribe.core.time_utils import get_current_epoch_timestamp, iso_to_epoch

logger = get_logger(__name__)

SCHEMA_VERSION = "2026-04-30"
DEFAULT_PRESIGNED_EXPIRY_SECONDS = 3600

SESSION_STATUS_IN_PROGRESS = "in-progress"
SESSION_STATUS_PROCESSED = "processed"

_IN_PROGRESS_USER_STATUSES = {
    UserStatus.INIT.value,
    UserStatus.RECORDING_STARTED.value,
}
_PROCESSING_FAILURE_STATUSES = {
    VOICE2RX_PROCESSING_STATUS.SYSTEM_FAILURE.value,
    VOICE2RX_PROCESSING_STATUS.REQUEST_FAILURE.value,
    VOICE2RX_PROCESSING_STATUS.CANCELLED.value,
}
_EMPTY_TRANSCRIPT_ERROR_CODE = "empty_transcript_warning"
_TRANSCRIPT_GENERATION_FAILED_ERROR = {
    "code": "transcript_generation_failed",
    "msg": "could not generate the transcript... error while generating the transcript",
}


class SessionDetailsService:
    """Read-only assembler for the session details API."""

    def __init__(
        self,
        transaction_repo: Optional[TransactionORM] = None,
        document_repo: Optional[EkascribeDocumentORM] = None,
        storage_client: Optional[StorageClient] = None,
    ):
        self.max_session_duration = 3600
        self.transaction_repo = transaction_repo or TransactionORM()
        self.document_repo = document_repo or EkascribeDocumentORM()
        self.storage_client = storage_client or get_storage_client()

    async def get_session_details(
        self,
        session_id: str,
        jwt_uuid: str,
        jwt_b_id: str,
        presigned: bool = False,
        presigned_expires_in: int = DEFAULT_PRESIGNED_EXPIRY_SECONDS,
        flavour: str = "",
        version: str = "",
    ) -> Tuple[Dict[str, Any], int]:
        """Return (response_body, http_status_code) for the session.

        Strict scope: both jwt_uuid and jwt_b_id must match the transaction.
        Any mismatch raises ResourceNotFoundException so existence is not
        leaked across tenants.
        """
        txn = self.transaction_repo.get_transaction(session_id, jwt_b_id)
        if not txn:
            raise ResourceNotFoundException("Session Not found")

        if not txn or txn.get("uuid") != jwt_uuid:
            raise ResourceNotFoundException(
                f"Session not found: {session_id}",
                txn_id=session_id,
                b_id=jwt_b_id,
            )

        documents = self.document_repo.get_documents_by_session(session_id) or []

        document_entries: List[Dict[str, Any]] = []
        raw_paths: List[str] = []
        for doc in documents:
            entry = self._build_document_entry(doc)
            self._append_context_patient_mismatch_warning(txn, doc, entry)
            document_entries.append(entry)
            raw_paths.append(doc.get("document_path", "") or "")
        
        if presigned:
            self._attach_presigned_urls(
                document_entries, raw_paths, presigned_expires_in
            )

        self._apply_transcript_error_overlay(txn, document_entries)

        additional_data = self._get_additional_data(txn=txn)
        protocol_meta = additional_data.get("_protocol", {})
        created_at = self._normalize_timestamp(txn.get("created_at"))
        expires_at = (created_at + self.max_session_duration) if created_at else None
        upload_url = compute_upload_url(
            session_id,
            protocol_meta.get("upload_type", "chunked"),
            batch_s3_url=txn.get("batch_s3_url"),
            s3_url=txn.get("s3_url"),
            b_id=txn.get("b_id", ""),
            flavour=flavour,
            version=version,
        )

        data = {
            "schema_version": SCHEMA_VERSION,
            "session_id": session_id,
            "uuid": txn.get("uuid", ""),
            "wid": txn.get("b_id", "") or jwt_b_id,
            "created_at": created_at,
            "expires_at": expires_at,
            "upload_url": upload_url,
            "user_status": txn.get("user_status"),
            "status": self._compute_session_status(txn),
            "transfer": txn.get("transfer"),
            "flavour": txn.get("flavour"),
            "session_details": txn.get("session_details") or {},
            "audio_matrix": {},
            "additional_data": additional_data,
            "client_generated_files": txn.get("client_generated_files") or [],
            "encounter_id": txn.get("encounter_id", ""),
            "documents": document_entries,
            "context": txn.get("context") or {},

            "input_language" : txn.get("input_language"),
            "request_templates": txn.get("request_templates") or {},
            "consultation_mode" : txn.get("mode"),
            "model_type" : txn.get("model_type"),
        }
    
        body = {"data": convert_decimals(data)}
        status_code = self._derive_status_code(documents)
        return body, status_code


    def _build_document_entry(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        template_id = doc.get("template_id", "")
        entry = {
            "document_id": doc.get("document_id", ""),
            "session_id": doc.get("session_id", ""),
            "template_id": template_id,
            "document_name": doc.get("document_name", "") or template_id,
            "type": "markdown",
            "document_type": doc.get("type", ""),
            "status": doc.get("status", "in-progress"),
            "errors": doc.get("errors", []) or [],
            "warnings": doc.get("warnings", []) or [],
            "publish": doc.get("publish_status", {}) or {},
            "created_at": int(doc.get("created_at")),
            "presigned_url": None,
            "presigned_url_expires_at": None,
        }
        if doc.get("type") == DocumentType.TRANSCRIPT.value:
            lang = template_id.replace("transcript_", "") if template_id.startswith("transcript_") else "raw"
            entry["lang"] = lang
        return entry

    @staticmethod
    def _append_context_patient_mismatch_warning(
        txn: Dict[str, Any],
        doc: Dict[str, Any],
        entry: Dict[str, Any],
    ) -> None:
        """Append a single attachment_patient_mismatch warning to the
        document entry when any context attachment's patient_id does not
        match the transaction's patient_id/oid. No-op unless the document
        is a CONTEXT type and the transaction has a context block.
        """
        if doc.get("type") != DocumentType.CONTEXT.value:
            return
        context = txn.get("context")
        if not context:
            return

        txn_patient_id = txn.get("patient_id", "")
        txn_oid = txn.get("oid", "")
        attachments = context.get("attachments") or []

        has_mismatch = any(
            attachment.get("patient_id") != txn_patient_id
            and attachment.get("patient_id") != txn_oid
            for attachment in attachments
        )
        if not has_mismatch:
            return

        entry.setdefault("warnings", []).append(
            {
                "code": "attachment_patient_mismatch",
                "msg": (
                    "Due to patient change some context document might have been skipped from the session context."
                ),
            }
        )

    def _attach_presigned_urls(
        self,
        document_entries: List[Dict[str, Any]],
        raw_paths: List[str],
        expires_in: int,
    ) -> None:
        """Generate presigned GET URLs in-place. One failure does not
        cascade: any document whose URL generation raises is left with
        download_url=None and the rest still get URLs.
        """
        now = get_current_epoch_timestamp()
        for entry, raw_path in zip(document_entries, raw_paths):
            if not raw_path:
                continue
            try:
                url = self.storage_client.generate_presigned_get_url(
                    raw_path, expires_in=expires_in
                )
            except Exception as e:
                logger.error(
                    "SESSION DETAILS: presigned URL generation failed",
                    document_id=entry.get("document_id"),
                    error=str(e),
                    severity="medium",
                )
                url = None
            entry["presigned_url"] = url
            entry["presigned_url_expires_at"] = (now + expires_in) if url else None

    @staticmethod
    def _parse_document_path(path: str) -> Dict[str, str]:
        if not path:
            return {"bucket": "", "folder": "", "filename": ""}
        parts = path.rsplit("/", 1)
        folder = parts[0] if len(parts) > 1 else ""
        filename = parts[-1]
        return {"bucket": "", "folder": folder, "filename": filename}

    @staticmethod
    def _derive_status_code(documents: List[Dict[str, Any]]) -> int:
        for doc in documents:
            if doc.get("status", "in-progress") == "in-progress":
                return HTTPStatus.ACCEPTED
        return HTTPStatus.OK

    @staticmethod
    def _compute_session_status(txn: Dict[str, Any]) -> str:
        user_status = txn.get("user_status")
        if user_status in _IN_PROGRESS_USER_STATUSES:
            return SESSION_STATUS_IN_PROGRESS
        return SESSION_STATUS_PROCESSED

    @staticmethod
    def _apply_transcript_error_overlay(
        txn: Dict[str, Any],
        document_entries: List[Dict[str, Any]],
    ) -> None:
        """Append a synthesized error to the transcript document entry when
        the transaction's status combination indicates a transcript-side
        failure. Response-only — no DB writes.
        """
        if txn.get("user_status") != UserStatus.COMMIT.value:
            return

        transcript_status = txn.get("transcript_status")
        processing_status = txn.get("processing_status")

        synthesized_error: Optional[Dict[str, Any]] = None

        if not transcript_status and processing_status == "success":
            return
        # if not transcript_status or transcript_status == "failure":
        #     synthesized_error = dict(_TRANSCRIPT_GENERATION_FAILED_ERROR)
        if processing_status in _PROCESSING_FAILURE_STATUSES:
            err = (txn.get("processing_error") or {}).get("error") or {}
            if err.get("code") == _EMPTY_TRANSCRIPT_ERROR_CODE:
                 synthesized_error = {
                        "code": err.get("code"),
                        "msg": (
                            "No speech detected. Ensure you spoke during the "
                            "session and your microphone is correctly "
                            "configured, then try again."
                        ),
                    }
            else:
                synthesized_error = {
                    "code": err.get("code", _TRANSCRIPT_GENERATION_FAILED_ERROR["code"]),
                    "msg": err.get("msg", _TRANSCRIPT_GENERATION_FAILED_ERROR["msg"]),
                }
            
        if not synthesized_error:
            return

        for entry in document_entries:
            if (
                entry.get("document_type") == DocumentType.TRANSCRIPT.value
                and entry.get("template_id") == "transcript"
            ):
                errors = list(entry.get("errors") or [])
                errors.append(synthesized_error)
                entry["errors"] = errors
                return

    @staticmethod
    def _normalize_timestamp(value: Any) -> Optional[int]:
        if value is None or value == "":
            return None
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            if stripped.isdigit():
                return int(stripped)
            return iso_to_epoch(stripped)
        return None

    @staticmethod
    def _get_additional_data(txn : dict):
        additional_data = txn.get("additional_data", {})
        if isinstance(additional_data, dict):
            return additional_data

        if isinstance(additional_data, (str, bytes)):
            try:
                additional_data = orjson.loads(additional_data)
                return additional_data
            except Exception as e:
                logger.error(
                    "Error parsing additional_data",
                    txn_id=txn.get("txn_id"),
                    error=str(e),
                    severity="medium",
                )
        return {}

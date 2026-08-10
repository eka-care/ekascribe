"""
Result Service V2 - Polls the ekascribe_document table.

Provides the v2 result response structure (output section + template_results)
read from the ekascribe_document table.
"""

import asyncio
import base64
import copy
from dataclasses import dataclass, field
from decimal import Decimal
import os

import time
import datetime
from datetime import timezone, timedelta
from http import HTTPStatus
from typing import Dict, List, Optional, Tuple, Any


from scribe.core.custom_logger import get_logger
from scribe.repositories.document_orm import EkascribeDocumentORM
from scribe.repositories.transaction_orm import TransactionORM
from scribe.services.document_service import DocumentService
from scribe.services.template_service import TemplateService
from scribe.services.transaction_service import TransactionService
from scribe.core.choices import VOICE2RX_PROCESSING_STATUS, DocumentType, Transfer
from scribe.core.exceptions import (
    ActiveSessionException,
    RequestFailureException,
    ResourceNotFoundException,
    SystemFailureException,
    TransactionNotFoundException,
)
from scribe.core.time_utils import epoch_to_iso, get_current_epoch_timestamp, iso_to_epoch

logger = get_logger(__name__)

# Constants
MAX_POLL_DURATION_SECONDS = 14
POLL_INTERVAL_SECONDS = 0.5
PROCESSING_TIMEOUT_SECONDS = 120
PRESIGNED_URL_EXPIRY_SECONDS = 3600

INTEGRATION_TEMPLATE_IDS: list = []

# Built-in output document ids and their content type. These are the only
# non-user templates the pipeline writes; everything else is a user template.
# TODO(rename): ids carry legacy names until the B2/B3 vocabulary pass.
LEGACY_OUTPUT_TYPE = {
    "clinical_note_template": "markdown",
    "clinical_notes_template": "markdown",
    "transcript_template": "text",
}

LEGACY_TEMPLATE_IDS = ["clinical_note_template", "transcript_template"]


@dataclass
class ResultContext:
    # inputs
    session_id: str
    b_id: str

    # fetched state
    transaction: Dict[str, Any] = field(default_factory=dict)
    documents: List[Dict[str, Any]] = field(default_factory=list)
    documents_meta_info: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    # response being assembled
    response: Dict[str, Any] = field(default_factory=dict)

    # status aggregates collected while iterating documents
    has_failure: bool = False
    has_partial: bool = False
    has_in_progress: bool = False
    has_success_or_partial: bool = False
    all_failed: bool = True


class ResultServiceV2:
    """Result service polling ekascribe_document table."""

    def __init__(
        self,
        document_repo: Optional[EkascribeDocumentORM] = None,
        transaction_repo: Optional[TransactionORM] = None,
        document_service: Optional[DocumentService] = None,
    ):
        self.document_repo = document_repo or EkascribeDocumentORM()
        self.transaction_repo = transaction_repo or TransactionORM()
        self.transaction_service = TransactionService()
        self.document_service = document_service or DocumentService()
        self.template_service = TemplateService
        self.bucket_name = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")



    def update_document_content(
        self,
        txn_id: str,
        b_id: str,
        document_updates: List[Dict[str, Any]],
    ) -> List[str]:
        transaction = self.transaction_repo.get_transaction(txn_id, b_id)
        if not transaction:
            raise TransactionNotFoundException(txn_id, b_id)

        s3_url = transaction.get("s3_url")
        if not s3_url:
            raise RequestFailureException(
                "S3 URL not configured for this transaction",
                txn_id=txn_id,
                b_id=b_id,
            )

        updated_documents: List[str] = []
        for update in document_updates:
            document_id = update["document_id"]
            data_to_write = update["data"]

            document = self.document_service.get_document(document_id)
            if not document or document.get("archived"):
                raise ResourceNotFoundException(
                    "Document not available that you are trying to edit.",
                    txn_id=txn_id,
                    b_id=b_id,
                )

            if document.get("session_id") != txn_id:
                raise ResourceNotFoundException(
                    "Document does not belong to this session.",
                    txn_id=txn_id,
                    b_id=b_id,
                )

            # use the existing document_path if present; otherwise
            # write_document_content falls back to {s3_url}/documents/{document_id}.txt.
            existing_path = document.get("document_path")
            file_key = self.document_service.write_document_content(
                s3_url=s3_url,
                document_id=document_id,
                content=data_to_write,
                is_base64=False,
                document_path=existing_path,
            )

            if not existing_path:
                self.document_service.update_document(
                    document_id, {"document_path": file_key}
                )

            updated_documents.append(document_id)

            logger.info(
                "RESULT SERVICE V2: Document content updated",
                txn_id=txn_id,
                b_id=b_id,
                document_id=document_id,
                file_key=file_key,
                severity="medium",
            )

        return updated_documents

    def _is_transaction_too_old(self, transaction: Dict[str, Any]) -> bool:
        """Check if transaction is older than 2 hours."""
        try:
            created_at_str = transaction.get("created_at", "")
            created_at_dt = datetime.datetime.strptime(
                created_at_str, "%Y-%m-%dT%H:%M:%SZ"
            ).replace(tzinfo=timezone.utc)
            return created_at_dt < datetime.datetime.now(timezone.utc) - timedelta(hours=2)
        except Exception as e:
            logger.error(
                "RESULT SERVICE: Error parsing created_at",
                txn_id=transaction.get("txn_id"),
                error=str(e),
                severity="medium",
            )
            return True
    
    async def poll_for_document(
        self,
        document_id: str,
        session_id: str,
        b_id: str = "",
        timeout: int = MAX_POLL_DURATION_SECONDS,
    ) -> Tuple[Dict[str, Any], int]:
        transaction_data = self.transaction_service.get_transaction(txn_id=session_id,b_id=b_id)
        flavour = (transaction_data or {}).get("flavour", "default")
        start_time = time.time()
        while time.time() - start_time < timeout:
            doc = self.document_repo.get_document(document_id)
            if not doc or doc.get("session_id") != session_id:
                return (
                    self._build_error_response("Document not found"),
                    HTTPStatus.NOT_FOUND,
                )

            status = doc.get("status", "in-progress")

            if status in ["success", "failure", "partial_success"]:
                response = self._build_single_document_response(
                    doc, b_id, flavour=flavour
                )

                if transaction_data.get("patient_details"):
                    response["data"]["patient_details"] = transaction_data.get(
                        "patient_details"
                    )

                status_code = self._status_to_http_code(status)
                return response, status_code

            if status == "in-progress":
                elapsed = time.time() - start_time
                if elapsed > timeout:
                    break
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                continue

        # timeout reached while still in-progress
        doc = self.document_repo.get_document(document_id)
        response = self._build_single_document_response(doc or {}, b_id, flavour=flavour)

        if transaction_data.get("patient_details"):
            response["data"]["patient_details"] = transaction_data.get(
                "patient_details"
            )

        return response, HTTPStatus.ACCEPTED
    
    async def poll_for_session_documents(
        self,
        transaction: Dict[str, Any],
        b_id: str,
        _dlp : bool = False,
        timeout: int = MAX_POLL_DURATION_SECONDS,
    ) -> Tuple[Dict[str, Any], int]:
        session_id = transaction.get("txn_id")
        ctx = ResultContext(
            session_id=session_id,
            b_id=b_id,
            transaction=transaction or {},
        )

        # Uncommitted sessions older than the active window are stale — the
        # client never committed, so polling would spin forever.
        user_status = (transaction or {}).get("user_status", "")
        if user_status not in ("commit", "stopped", "cancelled") and self._is_transaction_too_old(
            transaction or {}
        ):
            raise ActiveSessionException(
                "session was never committed and is past the active window",
                txn_id=session_id,
                b_id=b_id,
            )

        processing_status = transaction.get("processing_status") if transaction else None
        if processing_status == VOICE2RX_PROCESSING_STATUS.CANCELLED.value:
                error = transaction.get("processing_error", {})
                raise SystemFailureException(error, txn_id=session_id, b_id=b_id)

        # do this at the time of patch API call instead. whenever ds service is giving processing status as system_failure,
        # commit the transaction again so that , it might work with the next poll.
        if processing_status == VOICE2RX_PROCESSING_STATUS.SYSTEM_FAILURE.value:
            self.transaction_service.commit_transaction(
                session_id, b_id, transaction.get("client_uploaded_files", []), []
            )

        # if long polling is disabled, fetch current documents and return immediately
        if _dlp:
            ctx.documents = self.document_repo.get_documents_by_session(session_id) or []
            return self._build_session_response(ctx, _dlp)
        
        start_time = time.time()
        while time.time() - start_time < timeout:
            ctx.documents = self.document_repo.get_documents_by_session(session_id) or []
            if not ctx.documents:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                continue

            # if any documents are still in-progress beyond PROCESSING_TIMEOUT_SECONDS
            # (measured from commit_at), treat them as stuck and return with current
            # results to avoid infinite polling. This is a safety mechanism; monitor
            # logs for underlying causes.
            if self.__get_document_processing_status(ctx):
                return self._build_session_response(ctx)

            await asyncio.sleep(POLL_INTERVAL_SECONDS)

        # timeout or stuck-document break - return what we have
        return self._build_session_response(ctx)

    def _document_processing_status(
        self,
        documents: List[Dict[str, Any]],
        session_id: str,
        transfer: Optional[str] = None,
    ) -> bool:
        """Check if all documents are processed (success/failure/partial) or if any are still in-progress."""
        if not documents:
            raise TransactionNotFoundException("No documents found for session")

        for doc in documents:
            status = doc.get("status", "in-progress")
            if status != "in-progress":
                continue

            commit_at = doc.get("commit_at")
            if not commit_at:
                # non-vaded: commit is called asynchronously by Lambda after VAD
                # chunking, so the first poll can land before commit_at is written.
                # assume within timeout so we keep polling (202) instead of flipping
                # to failure (500).
                if transfer == Transfer.NON_VADED.value:
                    commit_at = time.time() - 60
                else:
                    # this should never be the case,
                    # but if commit at is not available assume just past the timeout
                    # so older/stuck sessions don't poll forever.
                    commit_at = time.time() - (PROCESSING_TIMEOUT_SECONDS + 1)
            try:
                process_start_ts = (
                    float(commit_at)
                    if isinstance(commit_at, (float, int, Decimal))
                    else float(iso_to_epoch(commit_at))
                )
            except Exception as _:
                logger.error(
                    "RESULT SERVICE: Error parsing commit_at",
                    session_id=session_id,
                    commit_at=commit_at,
                    severity="medium",
                )
                process_start_ts = time.time() - (PROCESSING_TIMEOUT_SECONDS + 1)

            elapsed_time = time.time() - process_start_ts
            # still within timeout and in in-progress, keep polling
            if elapsed_time < PROCESSING_TIMEOUT_SECONDS:
                return False
            else:
                logger.warning(
                    "RESULT SERVICE: Document processing timed out, marking as failure",
                    session_id=session_id,
                    document_id=doc.get("document_id"),
                    elapsed_time=elapsed_time,
                    severity="medium",
                )
                doc["status"] = "failure"

        return True

    def __get_document_processing_status(self, ctx: "ResultContext") -> bool:
        if (
            (ctx.b_id != "EC_173373528300322" or ctx.transaction.get("fhir_ingested"))
            and self._document_processing_status(
                ctx.documents,
                ctx.session_id,
                ctx.transaction.get("transfer"),
            )
        ):
            return True
        return False

    def _build_document_entry(
        self,
        doc: Dict[str, Any],
        document_meta_info: Dict[str, Any],
        flavour: str = "default",
    ) -> Tuple[Dict[str, Any], str]:
        doc_type = doc.get("type", DocumentType.CUSTOM)
        template_id = doc.get("template_id", "")
        status = doc.get("status", "in-progress")

        is_ekascribe_web = flavour == "ekascribe-web"
        presigned_url: Optional[str] = None
        presigned_url_expires_at: Optional[int] = None
        content: Optional[str] = None
        if is_ekascribe_web:
            document_path = doc.get("document_path", "")
            presigned_url = self.document_service.generate_presigned_download_url(
                document_path, expiration=PRESIGNED_URL_EXPIRY_SECONDS
            ) if document_path else None
            presigned_url_expires_at = get_current_epoch_timestamp() + PRESIGNED_URL_EXPIRY_SECONDS
        
        # todo: once ALL UIs revamped.. remove the content and just send presigned urls for all flavours.
        content = self._read_document_content(doc)
        document_type = doc.get("type")
        if document_type == "transcript":
            response_type = "transcript"
        else:
            response_type = document_meta_info.get("response_type", "markdown")

        entry = {
            "template_id": template_id,
            "value": content,
            "type": response_type,
            "name": document_meta_info.get("document_name", template_id),
            "status": status,
            "errors": doc.get("errors", []),
            "warnings": doc.get("warnings", []),
            "document_id": doc.get("document_id", ""),
            "document_type" : doc.get("type", ""),
            "publish" : doc.get("publish_status", {}),
        }

        if is_ekascribe_web:
            entry["presigned_url"] = presigned_url
            entry["presigned_url_expires_at"] = presigned_url_expires_at

        if doc_type == DocumentType.TRANSCRIPT:
            if content:
                entry["value"] = base64.b64encode(content.encode("utf-8")).decode("utf-8")
            entry["lang"] = self._extract_lang(template_id)
            return entry, "transcript"

        template_type_val = document_meta_info.get("template_type", "custom")
        template_results_entry = copy.deepcopy(entry)
        template_results_entry["type"] = document_meta_info.get("response_type", "json")

        if template_type_val == "integration" or template_id in INTEGRATION_TEMPLATE_IDS:
            return template_results_entry, "integration"
        elif template_id not in LEGACY_TEMPLATE_IDS:
            return template_results_entry, "custom"

        return template_results_entry, "legacy"

    def _append_entry_to_response(
        self, response: Dict[str, Any], entry: Dict[str, Any], category: str
    ) -> None:
        """Append a document entry to the appropriate section of the response."""
        if category in ("transcript", "integration", "custom"):
            response["data"]["template_results"][category].append(entry)

    def _populate_output_section(self, ctx: "ResultContext") -> None:
        template_results = ctx.response.get("data", {}).get("template_results", {})
        combined_entries = (
            template_results.get("integration", [])
            + template_results.get("custom", [])
        )
        flavour = ctx.transaction.get("flavour", "default")

        for entry in combined_entries:
            template_id = entry.get("template_id", "")
            meta_info = ctx.documents_meta_info.get(template_id, {})

            output_type = self._resolve_content_type(template_id, meta_info, flavour)

            output_entry = {
                "template_id": template_id,
                "value": entry.get("value", ""),
                "type": output_type,
                "name": meta_info.get("template_name", "") or template_id,
                "status": entry.get("status", "in-progress"),
                "errors": entry.get("errors", []),
                "warnings": entry.get("warnings", []),
            }
            ctx.response["data"]["output"].append(output_entry)

        priority_map = {"eka_emr_template": 0, "eka_emr_w_codes_template": 1}
        ctx.response["data"]["output"].sort(
            key=lambda x: priority_map.get(x.get("template_id", ""), 2)
        )

    def _build_empty_response(
        self,
        created_at: str = "",
        additional_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Build the common empty response skeleton."""
        return {
            "data": {
                "created_at": created_at,
                "output": [],
                "additional_data": additional_data or {},
                "audio_matrix": {},
                "template_results": {
                    "integration": [],
                    "custom": [],
                    "transcript": [],
                },
            }
        }

    def _build_session_response(
        self, ctx: "ResultContext",_dlp: bool = False
    ) -> Tuple[Dict[str, Any], int]:
        """Build response matching the existing template_results format with output section."""
        ctx.response = self._build_empty_response(
            created_at=ctx.transaction.get("created_at", ""),
            additional_data=self._get_additional_data(ctx.transaction),
        )

        if not ctx.documents:
            return ctx.response, 200

        # get template type map for proper categorization
        non_transcript_documents = [
            doc for doc in ctx.documents if doc.get("type") != DocumentType.TRANSCRIPT
        ]

        ctx.documents_meta_info = self._get_document_meta_info(
            non_transcript_documents
        )

        for doc in ctx.documents:
            status = doc.get("status", "in-progress")

            if status == "failure":
                ctx.has_failure = True
            elif status == "partial_success":
                ctx.has_partial = True
                ctx.has_success_or_partial = True
                ctx.all_failed = False
            elif status == "in-progress":
                ctx.has_in_progress = True
                ctx.all_failed = False
            elif status == "success":
                ctx.has_success_or_partial = True
                ctx.all_failed = False

            document_meta_info = ctx.documents_meta_info.get(doc.get("document_id", ""), {})
            entry, category = self._build_document_entry(
                doc,
                document_meta_info,
                flavour=ctx.transaction.get("flavour", "default"),
            )
            self._append_entry_to_response(ctx.response, entry, category)

        # populate output section from integration + custom template_results
        # output section is deprecated is only used by few clients... we can remove based on some flavours
        if ctx.transaction.get("flavour") not in ["ekascribe-web", "extension", "android"]:
            self._populate_output_section(ctx)

        # add fhir data

        if ctx.transaction.get("patient_details"):
            ctx.response["data"]["patient_details"] = ctx.transaction.get(
                "patient_details"
            )

        # status code logic:
        if ctx.has_in_progress:
            status_code = HTTPStatus.ACCEPTED
        elif ctx.all_failed:
            status_code = HTTPStatus.INTERNAL_SERVER_ERROR
        elif ctx.has_partial or (ctx.has_failure and ctx.has_success_or_partial):
            status_code = HTTPStatus.PARTIAL_CONTENT
        else:
            status_code = HTTPStatus.OK

        if _dlp:
            status_code = HTTPStatus.OK

        return ctx.response, status_code

    def _build_single_document_response(
        self, doc: Dict[str, Any], b_id: str = "", flavour: str = "default"
    ) -> Dict[str, Any]:
        """Build response for a single document poll (by document_id)."""
        created_at = doc.get("created_at", "")
        if isinstance(created_at, (Decimal, int, float)):
            created_at = epoch_to_iso(int(created_at))
        response = self._build_empty_response(
            created_at=created_at,
        )

        # get meta info for this single document (reusing the same path as session response)
        non_transcript_docs = [doc] if doc.get("type") != DocumentType.TRANSCRIPT else []
        documents_meta_info = self._get_document_meta_info(non_transcript_docs) if non_transcript_docs else {}
        document_meta_info = documents_meta_info.get(doc.get("document_id", ""), {})

        entry, category = self._build_document_entry(doc, document_meta_info, flavour=flavour)
        self._append_entry_to_response(response, entry, category)

        return response

    def _build_error_response(self, message: str) -> Dict[str, Any]:
        """Build error response."""
        return {
            "data": {
                "created_at": "",
                "output": [],
                "additional_data": {},
                "audio_matrix": {},
                "template_results": {
                    "integration": [],
                    "custom": [],
                    "transcript": [],
                },
                "error": message,
            }
        }

    def _get_document_meta_info(
            self,
            documents: List[Dict[str, Any]],
        ) -> dict:
        """Query TemplateService to get template types, response types, and names."""

        template_ids = {doc.get("template_id", "") for doc in documents if doc.get("template_id")}
        template_details = self.template_service.get_templates_by_ids(list(template_ids))
        template_id_to_name_map = {template.get("id", ""): template.get("title", "") for template in template_details}

        document_meta_info = {}
        for doc in documents:
            template_id = doc.get("template_id", "")
            document_id = doc.get("document_id", "")
            if not template_id:
                continue

            if template_id in LEGACY_OUTPUT_TYPE:
                out_type = LEGACY_OUTPUT_TYPE[template_id]
                document_meta_info[document_id] = {
                    "template_type": out_type,
                    "response_type": out_type,
                    "document_name": doc.get("document_name", "") or template_id,
                    "template_name": template_id_to_name_map.get(template_id, "") or template_id,
                }
                continue

            if doc.get("type") == DocumentType.INTEGRATION:
                document_meta_info[document_id] = {
                    "template_type": "integration",
                    "response_type": "json",
                    "document_name": doc.get("document_name", "") or template_id,
                    "template_name": template_id_to_name_map.get(template_id, "") or template_id,
                }
                continue

            template_info = next((t for t in template_details if t.get("id") == template_id), {})
            response_type = "markdown"

            document_meta_info[document_id] = {
                "template_type": template_info.get("type", "") or "custom",
                "response_type": response_type,
                "document_name": doc.get("document_name", "") or template_id,
                "template_name": template_id_to_name_map.get(template_id, "") or template_id,
            }

        return document_meta_info

    def _resolve_content_type(
        self,
        template_id: str,
        template_map_info: Dict[str, str],
        flavour: str,
    ) -> str:
        """Resolve the content type for output section (same logic as V1)."""
        # Built-in output docs have a fixed content type
        output_type = LEGACY_OUTPUT_TYPE.get(template_id, "")

        template_type_val = template_map_info.get("template_type", "custom")

        if template_type_val == "custom":
            content_type = "custom"
            if flavour == "extension":
                response_type = template_map_info.get("response_type", "custom")
                if response_type == "json":
                    content_type = "custom"
                else:
                    content_type = response_type
            return content_type

        return output_type or template_map_info.get("response_type", "json") or "json"

    def _read_document_content(self, doc: Dict[str, Any]) -> str:
        """Read document content from S3."""
        document_path = doc.get("document_path", "")
        if not document_path:
            return ""

        try:
            from scribe_core.storage import get_blob_store

            content = get_blob_store().get(self.bucket_name, document_path).decode("utf-8")
            return content
        except Exception as e:
            logger.error(
                "Error reading document content from S3",
                document_id=doc.get("document_id"),
                document_path=document_path,
                error=str(e),
                severity="critical",
            )
            return ""

    def _extract_lang(self, template_id: str) -> str:
        """Extract language code from a transcript template_id."""
        if template_id == "transcript":
            return "raw"
        if template_id.startswith("transcript_"):
            suffix = template_id[len("transcript_"):]
            return "" if suffix == "template" else suffix
        return ""

    def _get_additional_data(self, transaction_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract and parse additional_data from transaction."""
        import orjson

        additional_data = transaction_data.get("additional_data", {})
        if isinstance(additional_data, dict):
            return additional_data
        if isinstance(additional_data, (str, bytes)):
            try:
                return orjson.loads(additional_data)
            except Exception:
                logger.error(
                    "Error parsing additional_data",
                    txn_id=transaction_data.get("txn_id"),
                    error="Invalid JSON format",
                    severity="medium",
                )
                return {}
        logger.warning(
            "Unexpected additional_data format",
            txn_id=transaction_data.get("txn_id"),
            data_type=type(additional_data).__name__,
            severity="medium",
        )
        return {}

    def _status_to_http_code(self, status: str) -> int:
        """Map document status to HTTP status code."""
        if status == "success":
            return HTTPStatus.OK
        elif status == "partial_success":
            return HTTPStatus.PARTIAL_CONTENT
        elif status == "failure":
            return HTTPStatus.INTERNAL_SERVER_ERROR
        return HTTPStatus.ACCEPTED

"""
Populate Documents Service - Reusable migration and population logic.

This module provides PopulateDocumentsService with:
- `populate_documents()`: Creates ekascribe_document entries from output.json or template files.
  - Called from Patch API (patch_api_call=True): reads only output.json
  - Called from Result Router (patch_api_call=False): reads template_results/templates/ first, fallback to output.json, also migrates transcripts

- `populate_transcript()`: Migrates transcripts to ekascribe_document.
  - Called from Patch API as separate background task when transcript_status=success
"""

from dataclasses import dataclass, field
import uuid
from typing import Dict, List, Optional, Any

from scribe.core.custom_logger import get_logger
from scribe.repositories.transaction_template_orm import TxnTemplateResultsORM
from scribe.services.document_service import DocumentService
from scribe.services.format_adapter import TemplateFormatConverter
from scribe.services.template_result_file_service import TemplateResultFileService
from scribe.services.template_service import TemplateService
from scribe.core.choices import DocumentType
from scribe.core.time_utils import get_current_epoch_timestamp

logger = get_logger(__name__)

_FAILED_STATUSES = {"cancelled", "system_failure", "request_failure"}


@dataclass
class PopulateContext:
    """
    Request-scoped context for populate_documents pipeline.

    Built once at the top of populate_documents and threaded through the
    private orchestration helpers (_read_output, _process_structured_outputs,
    _migrate_transcripts). Leaf helpers that operate on per-template values
    (_write_and_create_document, _update_existing_document, _upsert_document)
    still take primitives since their inputs are per-iteration, not
    request-scoped.
    """

    # request inputs
    session_id: str
    b_id: str
    uuid_val: str
    s3_url: str
    patch_api_call: bool = False
    prompt_s3_url: Optional[str] = None
    output_template_result: Dict[str, Any] = field(default_factory=dict)
    processing_status: Optional[str] = None

    # fetched state
    output_json: Dict[str, Any] = field(default_factory=dict)
    document_id_map: Dict[str, str] = field(default_factory=dict)  # template_id -> document_id

    # accumulated result
    created_documents: List[Dict[str, Any]] = field(default_factory=list)


class PopulateDocumentsService:
    """Service for populating and migrating documents from template outputs."""

    def __init__(
        self,
        document_service: Optional[DocumentService] = None,
        template_file_service: Optional[TemplateResultFileService] = None,
        template_service: Optional[TemplateService] = None,
        template_results_repo: Optional[TxnTemplateResultsORM] = None,
    ):
        self.document_service = document_service or DocumentService()
        self.template_file_service = template_file_service or TemplateResultFileService()
        self.template_service = template_service or TemplateService()
        self.template_results_repo = template_results_repo or TxnTemplateResultsORM()

    async def populate_transcript(
        self,
        session_id: str,
        b_id: str,
        uuid_val: str,
        s3_url: str,
    ) -> List[Dict[str, Any]]:
        """
        Migrate transcripts to ekascribe_document table.
        Reads from template_results/transcripts/ with fallback to logs/transcript.json.
        Called from Patch API when transcript_status=success.
        """
        try:
            transcript = self.template_file_service.read_transcript_file(
                s3_url=s3_url,
                txn_id=session_id,
                fallback_to_legacy=True,
            )

            if not transcript:
                logger.info("No transcript found to migrate", session_id=session_id)
                return []

            text = transcript.get("text", "")
            lang = transcript.get("lang", "")
            template_id = f"transcript_{lang}" if lang else "transcript"

            existing_doc_id = self.document_service.get_document_id_by_session_and_template(session_id, template_id)
            if not existing_doc_id and lang:
                existing_doc_id = self.document_service.get_document_id_by_session_and_template(
                    session_id, "transcript"
                )
            if not existing_doc_id:
                created = self.document_service.create_document(
                    session_id=session_id,
                    template_id=template_id,
                    uuid_val=uuid_val,
                    wid=b_id,
                    doc_type="transcript",
                )
                existing_doc_id = (created or {}).get("document_id")
                if not existing_doc_id:
                    raise Exception(
                        f"failed to create transcript document for session-id:{session_id}"
                    )
                logger.info(
                    "Created transcript document",
                    session_id=session_id,
                    document_id=existing_doc_id,
                )
            else:
                logger.info("Existing transcript document found, updating content", session_id=session_id, document_id=existing_doc_id)
            file_key = self.document_service.write_document_content(
                s3_url=s3_url,
                document_id=existing_doc_id,
                content=text,
                is_base64=False,
            )
            current_time = get_current_epoch_timestamp()
            self.document_service.update_document(
                document_id=existing_doc_id,
                update_data={
                    "status": "success",
                    "document_path": file_key,
                    "processed_at": current_time,
                },
            )
        except Exception as e:
            logger.error("Error in populate_transcript", session_id=session_id, error=str(e), exc_info=True, severity="critical")
            raise

    async def populate_documents(
        self,
        session_id: str,
        b_id: str,
        uuid_val: str,
        s3_url: str,
        output_template_result: Optional[Dict[str, Any]] = None,
        patch_api_call: bool = False,
        prompt_s3_url: Optional[str] = None,
        processing_status: Optional[str] = None,
        transaction_data: Optional[Dict[str, Any]] = None,
        processing_error: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        if processing_status and processing_status in _FAILED_STATUSES:
            self._mark_documents_failed(session_id, b_id, output_template_result, transaction_data)
            return []

        document_id_map: Dict[str, str] = {}
        if transaction_data:
            all_templates = TemplateFormatConverter.get_all_templates(transaction_data)
            document_ids = [t.get("document_id") for t in all_templates if t.get("document_id")]
            if document_ids:
                documents = self.document_service.get_documents_by_ids(document_ids)
                document_id_map = {
                    doc.get("template_id"): doc.get("document_id")
                    for doc in documents
                    if doc.get("template_id") and doc.get("document_id")
                }

        ctx = PopulateContext(
            session_id=session_id,
            b_id=b_id,
            uuid_val=uuid_val,
            s3_url=s3_url,
            patch_api_call=patch_api_call,
            prompt_s3_url=prompt_s3_url,
            output_template_result=output_template_result or {},
            processing_status=processing_status,
            document_id_map=document_id_map,
        )

        try:
            ctx.output_json = self._read_output(ctx) or {}
            if not ctx.output_json:
                return []
            
            await self._migrate_ds_templates(ctx)

            if not ctx.patch_api_call:
                await self._migrate_transcripts(ctx)

        except Exception as e:
            logger.error("Error processing templates for populate_documents", session_id=ctx.session_id, error=str(e), exc_info=True, severity="critical")
            raise

        logger.info(
            "populate_documents completed",
            session_id=ctx.session_id,
            patch_api_call=ctx.patch_api_call,
            documents_created=len(ctx.created_documents),
            severity="medium",
        )
        return ctx.created_documents

    # --- private helpers ---

    async def _resolve_document_name(self, template_id: str) -> Optional[str]:
        """Look up the human-readable title for a template, returning None if not found."""
        # fix : temporary fix
        if template_id == "eka_emr_template":
            return "Eka EMR Format"

        details = await self.template_service.get_template_by_id(template_id)
        return details.get("title", template_id) if details else None

    def _write_and_create_document(
        self,
        session_id: str,
        template_id: str,
        uuid_val: str,
        b_id: str,
        s3_url: str,
        content: str,
        doc_type: str = DocumentType.CUSTOM,
        status: str = "success",
        document_name: Optional[str] = None,
        errors: Optional[List] = None,
        warnings: Optional[List] = None,
        prompt_path: Optional[str] = None,
        created_at: Optional[str] = None,
        commit_at: Optional[str] = None,
        processed_at: Optional[str] = None
    ) -> Dict[str, Any]:
        """Write content to S3 and create the corresponding document entry."""
        document_id = str(uuid.uuid4())
        file_key = self.document_service.write_document_content(
            s3_url=s3_url,
            document_id=document_id,
            content=content,
            is_base64=False,
        )
        return self.document_service.create_document(
            session_id=session_id,
            template_id=template_id,
            document_id=document_id,
            document_name=document_name or template_id,
            uuid_val=uuid_val,
            wid=b_id,
            doc_type=doc_type,
            status=status,
            document_path=file_key,
            errors=errors,
            warnings=warnings,
            prompt_path=prompt_path,
            created_at=created_at,
            commit_at=commit_at,
            processed_at=processed_at
        )

    def _update_existing_document(
        self,
        document_id: str,
        s3_url: str,
        content: str,
        status: str,
        document_name: Optional[str],
        errors: Optional[List],
        warnings: Optional[List],
        prompt_path: Optional[str],
        processed_at: Optional[str],
    ) -> Dict[str, Any]:
        """Write content to S3 against an existing document_id and update the row."""
        file_key = self.document_service.write_document_content(
            s3_url=s3_url,
            document_id=document_id,
            content=content,
            is_base64=False,
        )
        update_data: Dict[str, Any] = {
            "status": status,
            "document_path": file_key,
            "processed_at": processed_at or get_current_epoch_timestamp(),
        }
        if document_name:
            update_data["document_name"] = document_name

        if errors is not None:
            update_data["errors"] = errors

        if warnings is not None:
            update_data["warnings"] = warnings

        if prompt_path is not None:
            update_data["prompt_path"] = prompt_path

        return self.document_service.update_document(
            document_id=document_id,
            update_data=update_data,
        )

    def _upsert_document(
        self,
        session_id: str,
        template_id: str,
        uuid_val: str,
        b_id: str,
        s3_url: str,
        content: str,
        patch_api_call: bool,
        doc_type: str = DocumentType.CUSTOM,
        status: str = "success",
        document_name: Optional[str] = None,
        errors: Optional[List] = None,
        warnings: Optional[List] = None,
        prompt_path: Optional[str] = None,
        created_at: Optional[str] = None,
        commit_at: Optional[str] = None,
        processed_at: Optional[str] = None,
        existing_document_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        if patch_api_call:
            existing_doc_id = existing_document_id
            if not existing_doc_id:
                logger.error(
                    "Patch API flow: expected pre-created document not found, skipping",
                    session_id=session_id,
                    template_id=template_id,
                    severity="critical",
                )
                return None
            return self._update_existing_document(
                document_id=existing_doc_id,
                document_name=document_name,
                s3_url=s3_url,
                content=content,
                status=status,
                errors=errors,
                warnings=warnings,
                prompt_path=prompt_path,
                processed_at=processed_at,
            )

        return self._write_and_create_document(
            session_id=session_id,
            template_id=template_id,
            uuid_val=uuid_val,
            b_id=b_id,
            s3_url=s3_url,
            content=content,
            doc_type=doc_type,
            status=status,
            document_name=document_name,
            errors=errors,
            warnings=warnings,
            prompt_path=prompt_path,
            created_at=created_at,
            commit_at=commit_at,
            processed_at=processed_at,
        )

    def _get_timestamps(self, session_id: str, template_id: str) -> None:
        """Enrich a document dict with timestamps from template_results table (in-place)."""
        result = self.template_results_repo.get_template_result(session_id, template_id)
        timestamps = {}
        if result:
            timestamps["created_at"] = result.get("created_at")
            timestamps["commit_at"] = result.get("commit_at")
            timestamps["processed_at"] = result.get("processed_at")

        return timestamps

    def _mark_documents_failed(
        self,
        session_id: str,
        b_id: str,
        output_template_result: Optional[Dict[str, Any]],
        transaction_data: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Mark all existing documents as failed for a cancelled/failed transaction."""
        logger.error("Transaction in failed/cancelled state, cannot populate documents", session_id=session_id, b_id=b_id, severity="medium")
        # get all documents and mark them failed if request_failure from the ds_service.
        try:
            request_templates = (transaction_data or {}).get("request_templates", {})
            doc_ids = [
                t.get("document_id")
                for section in ("visual", "integration")
                for t in request_templates.get(section, [])
                if t.get("document_id")
            ]
            for document_id in doc_ids:
                self.document_service.update_document(
                    document_id=document_id,
                    update_data={
                        "status": "failure",
                        "processed_at": get_current_epoch_timestamp(),
                    },
                )
        except Exception as e:
            logger.error(
                "Failed to mark documents as failed",
                session_id=session_id,
                error=str(e),
                severity="medium",
            )

    def _read_output(self, ctx: "PopulateContext") -> Optional[Dict[str, Any]]:
        """Read template output from the appropriate source based on call context."""
        if ctx.patch_api_call:
            logger.info("populate_documents called from Patch API, reading only output.json", session_id=ctx.session_id)
            output_json = self.template_file_service._read_legacy_output_json(ctx.s3_url, ctx.session_id)
        else:
            logger.info("populate_documents called from Result Router, reading template files with fallback to output.json", session_id=ctx.session_id)
            output_json = self.template_file_service.read_all_template_files(
                s3_url=ctx.s3_url,
                txn_id=ctx.session_id,
                fallback_to_output_json=True,
            )

        if not output_json:
            logger.info("No output.json or template files found for session", session_id=ctx.session_id, patch_api_call=ctx.patch_api_call)
        return output_json
    
    async def _migrate_ds_templates(self, ctx: "PopulateContext") -> None:
        structured_outputs = ctx.output_json.get("structured_outputs", {})
        if ctx.patch_api_call:
            templates_to_process = ctx.output_template_result or {}
        else:
            templates_to_process = {k: dict(v) for k, v in (ctx.output_template_result or {}).items()}
            repo_results = self.template_results_repo.get_all_template_results(ctx.session_id)
            for repo_item in repo_results:
                tid = repo_item.get("template_id")
                if not tid or tid == "transcript":
                    continue

                if tid not in templates_to_process:
                    templates_to_process[tid] = {}

                meta = templates_to_process[tid]
                for field in ("created_at", "commit_at", "processed_at", "errors", "warnings", "status"):
                    if meta.get(field) is None and repo_item.get(field) is not None:
                        meta[field] = repo_item[field]

        if not templates_to_process:
            return

        for template_id, template_meta in templates_to_process.items():
            try:
                template_value = structured_outputs.get(template_id)
                if template_value is not None:
                    if ctx.patch_api_call:
                        processed_at = get_current_epoch_timestamp()
                        created_at = None
                        commit_at = None
                    else:
                        created_at = template_meta.get("created_at")
                        commit_at = template_meta.get("commit_at")
                        processed_at = template_meta.get("processed_at")

                    doc = self._upsert_document(
                        session_id=ctx.session_id,
                        template_id=template_id,
                        uuid_val=ctx.uuid_val,
                        b_id=ctx.b_id,
                        s3_url=ctx.s3_url,
                        content=str(template_value),
                        patch_api_call=ctx.patch_api_call,
                        status=template_meta.get("status", "success"),
                        document_name=await self._resolve_document_name(template_id),
                        errors=template_meta.get("errors", []),
                        warnings=template_meta.get("warnings", []),
                        prompt_path=ctx.prompt_s3_url,
                        created_at=created_at,
                        commit_at=commit_at,
                        processed_at=processed_at,
                        existing_document_id=ctx.document_id_map.get(template_id),
                    )

                    if doc:
                        ctx.created_documents.append(doc)
                else:
                    existing_doc_id = ctx.document_id_map.get(template_id)
                    if not existing_doc_id:
                        if ctx.patch_api_call:
                            logger.warning(
                                "No existing document found to update status (no content)",
                                session_id=ctx.session_id,
                                template_id=template_id,
                                severity="medium",
                            )
                            continue
                        else:
                            existing_doc_id = str(uuid.uuid4())

                    update_data: Dict[str, Any] = {
                        "status": template_meta.get("status", "failure"),
                        "processed_at": get_current_epoch_timestamp(),
                    }
                    errors = template_meta.get("errors")
                    if errors is not None:
                        update_data["errors"] = errors
                    warnings_val = template_meta.get("warnings")
                    if warnings_val is not None:
                        update_data["warnings"] = warnings_val

                    doc = self.document_service.update_document(
                        document_id=existing_doc_id,
                        update_data=update_data,
                    )
                    if doc:
                        ctx.created_documents.append(doc)

                    logger.info(
                        "Updated document status from template result (no content)",
                        session_id=ctx.session_id,
                        template_id=template_id,
                        status=template_meta.get("status"),
                        severity="medium",
                    )

            except Exception as e:
                logger.error("Error processing template", session_id=ctx.session_id, template_id=template_id, error=str(e), exc_info=True, severity="critical")
                continue

    async def _migrate_transcripts(self, ctx: "PopulateContext") -> None:
        """
        Migrate transcripts from legacy S3 locations to documents.
        Appends created docs to ctx.created_documents.
        """
        try:
            transcripts = self.template_file_service.read_all_transcripts(
                s3_url=ctx.s3_url,
                txn_id=ctx.session_id,
                fallback_to_legacy=True,
            )

            for transcript_data in transcripts:
                text = transcript_data.get("text", "")
                lang = transcript_data.get("lang", "")
                template_id = f"transcript_{lang}" if lang else "transcript"
                try:

                    timestamps = self._get_timestamps(session_id=ctx.session_id, template_id=template_id)

                    doc = self._write_and_create_document(
                        session_id=ctx.session_id,
                        template_id=template_id,
                        uuid_val=ctx.uuid_val,
                        b_id=ctx.b_id,
                        s3_url=ctx.s3_url,
                        content=text,
                        doc_type=DocumentType.TRANSCRIPT,
                        document_name=await self._resolve_document_name(template_id),
                        created_at=timestamps.get("created_at"),
                        commit_at=timestamps.get("commit_at"),
                        processed_at=timestamps.get("processed_at"),
                    )
                    ctx.created_documents.append(doc)

                except Exception as e:
                    logger.error("Error migrating transcript to document", session_id=ctx.session_id, template_id=template_id, error=str(e), severity="critical")
                    continue

        except Exception as e:
            logger.error("Error in _migrate_transcripts", session_id=ctx.session_id, error=str(e), exc_info=True, severity="critical")

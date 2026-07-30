"""
Input Preparers - Flow-specific input preparation for the ConversionPipeline.

Each preparer implements:
    - prepare(ctx): Resolve transcript text, template prompt, and set flow flags
    - post_process(ctx): Optional post-pipeline actions (e.g., update transaction status)

Available preparers:
    - TemplateInputPreparer: Existing session -> template conversion
    - TranscriptInputPreparer: Direct transcript input -> template conversion
    - TranslationInputPreparer: Transcript translation to target language
    - EkaEmrInputPreparer: Special EKA EMR external service flow
"""

import json
import os
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import uuid

from logs.custom_logger import get_logger
from voice2rx.choices import DocumentType
from voice2rx.core.exceptions import (
    InvalidRequestException,
    ResourceNotFoundException,
    SystemFailureException,
)
from voice2rx.model_orms.template_result_orm import TemplateResultORM
from voice2rx.services.context.context_resolution_service import ContextResolutionService
from voice2rx.services.prompts import get_prompt_service
from voice2rx.services.storage.s3_service import upload_file_to_s3
from voice2rx.services.templates.conversion_pipeline import ConversionContext
from voice2rx.services.templates.template_result_file_service import (
    TemplateResultFileService,
)
from voice2rx.services.templates.template_service import TemplateService
from voice2rx.utils.time_utils import get_current_epoch_timestamp

logger = get_logger(__name__)


def prepare_template_prompt(
    template_id: str,
    txn_id: str,
    b_id: str,
    integration: bool = False,
) -> Tuple[str, str, str, str, Optional[str]]:
    """
    Prepare template prompt from template configuration.

    Returns:
        (template_name, final_prompt, response_type, date_str, schema_str)
    """
    template_service = TemplateService()
    template_data = template_service.get_template(template_id)
    if not template_data:
        raise ResourceNotFoundException(f"Template not found for id: {template_id}")

    template_name = template_data.get("title", "")
    template_desc = template_data.get("desc", "")
    section_ids = template_data.get("section_ids", [])
    date_str = datetime.now().strftime("%Y-%m-%d")
    prompt_svc = get_prompt_service()

    if template_desc and not section_ids:
        # template_desc is already the Langfuse source-of-truth value:
        # TemplateService.get_template() hydrates it for markdown-only templates.
        parsed = prompt_svc.get_parsed_agent_prompt(
            "template_markdown", date=date_str, markdown_prompt=template_desc
        )
        final_prompt = parsed.task_instructions or ""
        return template_name, final_prompt, "markdown", date_str, None

    if section_ids:
        template_result_repo = TemplateResultORM()
        sections = template_result_repo.get_sections_by_ids(section_ids)
        if sections:
            section_descriptions = _process_sections(sections, integration)
            schema_str = _format_sections_as_markdown(section_descriptions)
            agent_key = "template_integration" if integration else "template_generation"
            parsed = prompt_svc.get_parsed_agent_prompt(
                agent_key, date=date_str, schema=schema_str
            )
            final_prompt = parsed.task_instructions or ""

            logger.info(
                "Template prompt prepared",
                txn_id=txn_id,
                template_id=template_id,
                section_count=len(section_descriptions),
            )
            return template_name, final_prompt, "markdown", date_str, schema_str

    raise ResourceNotFoundException(
        f"No sections or template description found for template id: {template_id}"
    )


def _process_sections(
    sections: List[Dict[str, Any]], integration: bool
) -> List[Dict[str, Any]]:
    """Process sections for prompt generation."""
    section_descriptions = []
    for section in sections:
        section_info = {"title": section["title"], "value": section.get("desc", "")}
        if integration:
            if "example" in section and section["example"]:
                section_info["example"] = section["example"]
            section_info["format"] = section.get("format", "Paragraph")
        section_descriptions.append(section_info)
    return section_descriptions


def _format_sections_as_markdown(sections: List[Dict[str, Any]]) -> str:
    """Format section descriptions as markdown schema for the LLM prompt."""
    lines = []
    for section in sections:
        lines.append(f"## {section['title']}")
        if section.get("value"):
            lines.append(section["value"])
        if section.get("example"):
            lines.append(f"Example: {section['example']}")
        if section.get("format"):
            lines.append(f"Format: {section['format']}")
        lines.append("")
    return "\n".join(lines).strip()


class BaseInputPreparer(ABC):
    """Base class for all input preparers."""

    @abstractmethod
    async def prepare(self, ctx: ConversionContext) -> None:
        """Prepare input data in the conversion context."""
        ...

    async def post_process(self, ctx: ConversionContext) -> None:
        """Optional post-pipeline hook. Override if needed."""
        pass

class TemplateInputPreparer(BaseInputPreparer):
    """Prepares input for converting an existing session transcript to a template."""

    def __init__(self, integration: bool = False):
        self.integration = integration
        self.file_service = TemplateResultFileService()
        self.context_service = ContextResolutionService()

    async def prepare(self, ctx: ConversionContext) -> None:
        # fetch transcript from S3
        transcript_file = self.file_service.read_transcript_file(
            s3_url=ctx.s3_url, txn_id=ctx.txn_id, fallback_to_legacy=True
        )
        if not transcript_file or not transcript_file.get("text"):
            raise ResourceNotFoundException(
                f"Transcript not found in S3 for transaction {ctx.txn_id}. "
                f"Checked both new and legacy locations."
            )
        
        ctx.transcript_text = transcript_file["text"]
        # get context data and set it to the ctx
        context_data = ctx.transaction_data.get("context")
        resolved_data = await self.context_service.resolve(
            context=context_data, b_id=ctx.b_id, transaction_data=ctx.transaction_data
        )

        if resolved_data and not resolved_data.is_empty():
            ctx.resolved_context = resolved_data
        if resolved_data and resolved_data.warnings:
            logger.warning(
                "Context resolution warnings",
                txn_id=ctx.txn_id,
                warnings=resolved_data.warnings,
                severity="medium",
            )
        # resolve template prompt
        (
            ctx.template_name,
            ctx.final_prompt,
            ctx.response_type,
            ctx.date_str,
            ctx.schema_str,
        ) = prepare_template_prompt(
            template_id=ctx.template_id,
            txn_id=ctx.txn_id,
            b_id=ctx.b_id,
            integration=self.integration,
        )

        logger.info(
            "TemplateInputPreparer: input ready",
            txn_id=ctx.txn_id,
            template_id=ctx.template_id,
        )

class IntegrationTemplateInputPreparer(BaseInputPreparer):

    def __init__(self, template_name: str = ""):
        self.template_name = template_name
        self.file_service = TemplateResultFileService()
        self.context_service = ContextResolutionService()

    async def prepare(self, ctx: ConversionContext) -> None:
        transcript_file = self.file_service.read_transcript_file(
            s3_url=ctx.s3_url, txn_id=ctx.txn_id, fallback_to_legacy=True
        )
        if not transcript_file or not transcript_file.get("text"):
            raise ResourceNotFoundException(
                f"Transcript not found in S3 for transaction {ctx.txn_id}. "
                f"Checked both new and legacy locations."
            )

        ctx.transcript_text = transcript_file["text"]

        context_data = ctx.transaction_data.get("context")
        resolved_data = await self.context_service.resolve(
            context=context_data, b_id=ctx.b_id, transaction_data=ctx.transaction_data
        )
        if resolved_data and not resolved_data.is_empty():
            ctx.resolved_context = resolved_data
        if resolved_data and resolved_data.warnings:
            logger.warning(
                "Context resolution warnings",
                txn_id=ctx.txn_id,
                warnings=resolved_data.warnings,
                severity="medium",
            )

        date_str = datetime.now().strftime("%Y-%m-%d")
        prompt_name = f"{ctx.template_id}-voice2rx"
        final_prompt = get_prompt_service().get_compiled_prompt(
            prompt_name, date=date_str
        )
        if not final_prompt:
            raise ResourceNotFoundException(
                f"Integration template prompt not found in Langfuse: {prompt_name}"
            )

        ctx.template_name = self.template_name or ctx.template_id
        ctx.final_prompt = final_prompt
        ctx.response_type = "json"
        ctx.date_str = date_str
        ctx.schema_str = None
        ctx.is_integration_generation = True

        logger.info(
            "IntegrationTemplateInputPreparer: input ready",
            txn_id=ctx.txn_id,
            template_id=ctx.template_id,
            prompt_name=prompt_name,
        )

class TranscriptInputPreparer(BaseInputPreparer):
    """Prepares input for direct transcript-to-template conversion."""

    def __init__(self, transcript_text: str):
        from voice2rx.services.documents.document_service import DocumentService
        from voice2rx.services.transactions.transaction_service import TransactionService

        self.transcript_text = transcript_text
        self.file_service = TemplateResultFileService()
        self.s3_bucket_name = None
        self.transaction_service = TransactionService()
        self.context_service = ContextResolutionService()
        self.document_service = DocumentService()

    async def prepare(self, ctx: ConversionContext) -> None:
        self.s3_bucket_name = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")

        # validate init state
        if ctx.transaction_data.get("user_status", "") != "init":
            raise InvalidRequestException(
                f"Transaction not in init state for direct transcript. "
                f"Current status: {ctx.transaction_data.get('user_status')}"
            )

        ctx.transcript_text = self.transcript_text
        ctx.is_direct_transcript = True

        context_data = ctx.transaction_data.get("context")
        resolved_data = await self.context_service.resolve(
            context=context_data, b_id=ctx.b_id, transaction_data=ctx.transaction_data
        )

        if resolved_data and not resolved_data.is_empty():
            ctx.resolved_context = resolved_data
        if resolved_data and resolved_data.warnings:
            logger.warning(
                "Context resolution warnings",
                txn_id=ctx.txn_id,
                warnings=resolved_data.warnings,
                severity="medium",
            )

        # upload transcript to legacy location for backward compat reads
        self._upload_transcript_to_legacy(ctx)

        # also persist the raw transcript as its own ekascribe_document row
        # under /documents/ so it's discoverable alongside the template
        # output (which the pipeline handles on the main document_id).
        self._upload_transcript_as_document(ctx)

        # resolve template prompt
        (
            ctx.template_name,
            ctx.final_prompt,
            ctx.response_type,
            ctx.date_str,
            ctx.schema_str,
        ) = prepare_template_prompt(
            template_id=ctx.template_id,
            txn_id=ctx.txn_id,
            b_id=ctx.b_id,
        )

        logger.info(
            "TranscriptInputPreparer: input ready",
            txn_id=ctx.txn_id,
            template_id=ctx.template_id,
        )

    async def run_transcript_upload(self, ctx: ConversionContext) -> None:
        """Direct-transcript-only flow: persist the transcript to the legacy
        location and the /documents/ folder, then mark the transcript document
        and the transaction as success. No prompt/model/template execution.
        The client later calls convert-to-template, or runs the AG-UI stream
        """
        if ctx.transaction_data.get("user_status", "") != "init":
            raise InvalidRequestException(
                f"Transaction not in init state for direct transcript. "
                f"Current status: {ctx.transaction_data.get('user_status')}"
            )

        self.s3_bucket_name = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")
        ctx.s3_url = ctx.transaction_data.get("s3_url", "")
        ctx.transcript_text = self.transcript_text
        ctx.is_direct_transcript = True

        self._upload_transcript_to_legacy(ctx)
        self.transaction_service.ensure_session_documents(
            ctx.txn_id, ctx.b_id, ctx.transaction_data
        )
        self._upload_transcript_as_document(ctx)

        self.transaction_service.update_transaction(
            ctx.txn_id,
            ctx.b_id,
            {
                "user_status": "commit",
                "processing_status": "success",
            },
        )
        logger.info(
            "Direct transcript-only upload completed",
            txn_id=ctx.txn_id,
            b_id=ctx.b_id,
            severity="medium",
        )

    async def post_process(self, ctx: ConversionContext) -> None:
        """Update transaction status to committed after successful conversion."""
        # create a document with transcript and upload it to /documents/{document_id}.txt
        # also update the the document table with the data
      
        self.transaction_service.update_transaction(
            ctx.txn_id,
            ctx.b_id,
            {
                "user_status": "commit",
                "processing_status": "success",
                "output_template_result": {
                    ctx.template_id: {
                        "status": "success",
                        "errors": [],
                        "warnings": [],
                    }
                },
            },
        )
        logger.info(
            "Transaction status updated to commit",
            txn_id=ctx.txn_id,
            b_id=ctx.b_id,
        )

    def _upload_transcript_to_legacy(self, ctx: ConversionContext) -> None:
        """Upload transcript to legacy S3 location for backward compat."""
        folder_name = ctx.s3_url.removeprefix(f"s3://{self.s3_bucket_name}/")
        legacy_file_path = f"{folder_name}/logs/transcript.json"

        if not upload_file_to_s3(
            self.s3_bucket_name,
            legacy_file_path,
            {"text": self.transcript_text},
            ctx.txn_id,
        ):
            raise SystemFailureException(
                "Transcript upload to legacy location failed",
                txn_id=ctx.txn_id,
                b_id=ctx.b_id,
            )

        logger.info(
            "Transcript uploaded to legacy location",
            txn_id=ctx.txn_id,
        )

    def _upload_transcript_as_document(self, ctx: ConversionContext) -> None:
        """Create a transcript-type ekascribe_document, upload the raw
        transcript to /documents/{new_id}.txt, and mark it success.

        On any failure here, log and mark the transcript document as
        failure; do not raise, so the template conversion pipeline still
        runs on the main document_id.
        """
        # transcript_document_id = str(uuid.uuid4())
        transcript_document_id = self.document_service.get_document_id_by_session_and_template(ctx.txn_id, "transcript")
        try:
            file_key = self.document_service.write_document_content(
                s3_url=ctx.s3_url,
                document_id=transcript_document_id,
                content=self.transcript_text,
            )

            currnet_time = get_current_epoch_timestamp()
            update_data = {
                "status" : "success",
                "document_path" : file_key,
                "type" : DocumentType.TRANSCRIPT,
                "commit_at": currnet_time,
                "processed_at" : currnet_time,
            }
            doc = self.document_service.update_document(document_id=transcript_document_id, update_data=update_data)
            # doc = self.document_service.create_document(
            #     session_id=ctx.txn_id,
            #     template_id="transcript",
            #     document_id=transcript_document_id,
            #     uuid_val=ctx.transaction_data.get("uuid", ""),
            #     wid=ctx.b_id,
            #     doc_type="transcript",
            #     status="success",
            #     document_path=file_key
            # )
            
            logger.info(
                "Transcript uploaded to /documents/ and marked success",
                txn_id=ctx.txn_id,
                transcript_document_id=transcript_document_id,
                file_key=file_key,
                severity="medium",
            )
        except Exception as e:
            logger.error(
                "Failed to persist transcript as document",
                txn_id=ctx.txn_id,
                transcript_document_id=transcript_document_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            if transcript_document_id:
                try:
                    self.document_service.update_document_status(
                        document_id=transcript_document_id,
                        status="failure",
                        errors=[str(e)],
                    )
                except Exception as inner:
                    logger.error(
                        "Failed to mark transcript document as failure",
                        txn_id=ctx.txn_id,
                        transcript_document_id=transcript_document_id,
                        error=str(inner),
                        severity="medium",
                    )


class TranslationInputPreparer(BaseInputPreparer):
    """Prepares input for transcript translation to a target language."""

    def __init__(self, target_language: str):
        self.target_language = target_language
        self.file_service = TemplateResultFileService()

    async def prepare(self, ctx: ConversionContext) -> None:
        # fetch existing transcript from S3
        original_transcript_data = self.file_service.read_transcript_file(
            s3_url=ctx.s3_url, txn_id=ctx.txn_id, fallback_to_legacy=True
        )
        if not original_transcript_data or not original_transcript_data.get("text"):
            raise InvalidRequestException(
                f"No original transcript found for translation. txn_id: {ctx.txn_id}"
            )

        ctx.transcript_text = original_transcript_data["text"]
        ctx.is_translation = True
        ctx.target_language = self.target_language

        logger.info(
            "TranslationInputPreparer: input ready",
            txn_id=ctx.txn_id,
            target_language=self.target_language,
        )

class EkaEmrInputPreparer(BaseInputPreparer):
    """Prepares input and handles the EKA EMR external service flow.

    This is a special case where the external service handles both
    prompt and generation. The pipeline's agent/service step is skipped
    by setting output_data directly in prepare().
    """

    def __init__(self):
        self.file_service = TemplateResultFileService()

    async def prepare(self, ctx: ConversionContext) -> None:
        import httpx

        # fetch transcript
        transcript_file = self.file_service.read_transcript_file(
            s3_url=ctx.s3_url, txn_id=ctx.txn_id, fallback_to_legacy=True
        )
        if not transcript_file or not transcript_file.get("text"):
            raise ResourceNotFoundException(
                f"Transcript not found in S3 for transaction {ctx.txn_id}"
            )

        transcript_data = transcript_file["text"]
        # Call EKA EMR external service directly
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://ekascribe.orbi.orbi/generate_eka_emr_template",
                json={
                    "transcript": transcript_data,
                    "model_type": "pro",
                    "txn_id": ctx.txn_id,
                    "response_type": "json",
                    "codification_needed": True,
                },
            )
            response.raise_for_status()
            response_data = response.json()

        output = response_data.get("output", {})
        ctx.output_data = json.dumps(output) if isinstance(output, dict) else str(output)
        ctx.template_name = "EKA EMR Template"

        logger.info(
            "EkaEmrInputPreparer: external service call completed",
            txn_id=ctx.txn_id,
            severity="medium",
        )

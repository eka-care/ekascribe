"""
Conversion Pipeline - Central orchestrator for all template/transcript conversion flows.

Replaces the duplicated logic across TemplateConversionService, TranscriptConversionService,
and TranslationConversionService with a single pipeline that delegates flow-specific
input preparation to pluggable InputPreparer classes.

Document Lifecycle:
    API creates document (in-progress) -> returns document_id (202)
    Background pipeline:
        1. InputPreparer resolves transcript + prompt
        2. Save prompt to S3
        3. Call agent or external service
        4. Write output to documents/{document_id}.txt
        5. Update ekascribe_document (status, document_path, prompt_path)
"""

import os
import base64
import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Dict, Optional

from voice2rx.utils.time_utils import get_current_epoch_timestamp

if TYPE_CHECKING:
    from voice2rx.services.context import ResolvedContext

from logs.custom_logger import get_logger
from voice2rx.core.exceptions import (
    MODEL_ERROR_MESSAGE,
    SystemFailureException,
)
from voice2rx.model_orms.transaction_orm import TransactionORM
from voice2rx.services.documents.document_service import DocumentService
from voice2rx.services.storage.s3_service import download_s3_file, upload_file_to_s3
from voice2rx.services.templates.agent_orchestration_service import (
    AgentOrchestrationService,
)
from voice2rx.services.templates.template_result_file_service import (
    TemplateResultFileService,
)
from voice2rx.services.templates import template_result_common as common
from voice2rx.services.webhooks import ScribeEvent, build_document_data, emit

logger = get_logger(__name__)


@dataclass
class ConversionContext:
    """Holds all state for a single conversion run."""

    txn_id: str
    b_id: str
    template_id: str
    document_id: str

    # populated during pipeline execution
    transaction_data: Optional[Dict[str, Any]] = None
    s3_url: str = ""
    transcript_text: str = ""
    template_name: str = ""
    final_prompt: str = ""
    response_type: str = "json"
    date_str: str = ""
    schema_str: Optional[str] = None
    output_data: str = ""

    # resolved context (past sessions/documents/attachments) passed to agent
    resolved_context: "Optional[ResolvedContext]" = None

    # LLM usage information returned by the agent (tokens, model, etc.)
    usage_information: Optional[Dict[str, Any]] = None

    # flow flags
    is_translation: bool = False
    target_language: Optional[str] = None
    is_direct_transcript: bool = False
  
    # integration template generation flow.
    is_integration_generation: bool = False


class ConversionPipeline:
    """Central orchestrator for all conversion flows."""

    def __init__(self):
        self.transaction_repo = TransactionORM()
        self.document_service = DocumentService()
        self.file_service = TemplateResultFileService()
        self.s3_bucket_name = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")
        self.agent_service = AgentOrchestrationService(
            file_service=self.file_service,
            s3_bucket_name=self.s3_bucket_name,
        )

    async def execute(self, ctx: ConversionContext, input_preparer) -> None:
        """
        Execute the full conversion pipeline.

        Steps:
            1. Fetch transaction data
            2. Run input preparer (flow-specific)
            3. Save prompt to S3
            4. Call agent or external service
            5. Write output to documents/{document_id}.txt
            6. Update document status to success
        On error: update document status to failure.
        """
        try:
            ctx.s3_url = ctx.transaction_data.get("s3_url", "")

            logger.info(
                "Pipeline started",
                txn_id=ctx.txn_id,
                b_id=ctx.b_id,
                template_id=ctx.template_id,
                document_id=ctx.document_id,
                preparer=type(input_preparer).__name__,
            )

            # prepare context data(final prompt, template_name etc)
            await input_preparer.prepare(ctx)

            prompt_path = self._save_prompt(ctx)

            # get the output from the current service agents or calling the external API.
            if not ctx.output_data:
                await self._call_agent_or_service(ctx)
            
            # save documents to documents folder. 
            file_key = self._save_output(ctx)

            self._update_document_success(ctx, file_key, prompt_path)

            # imp: post-processing (flow-specific, e.g. update transaction status)
            # all the flow will not have post processing, when direct transcript is provided in that case
            # transaction needs to be commited for result to get polled.
            await input_preparer.post_process(ctx)

            logger.info(
                "Pipeline completed successfully",
                txn_id=ctx.txn_id,
                document_id=ctx.document_id,
                template_id=ctx.template_id,
                severity="medium",
            )

        except Exception as e:
            logger.critical(
                "Pipeline failed",
                txn_id=ctx.txn_id,
                b_id=ctx.b_id,
                template_id=ctx.template_id,
                document_id=ctx.document_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            self._update_document_failure(ctx, e)

    def _save_prompt(self, ctx: ConversionContext) -> Optional[str]:
        """Save prompt to S3 and return the prompt file path."""
        if not ctx.final_prompt:
            return None

        try:
            folder = ctx.s3_url.removeprefix(f"s3://{self.s3_bucket_name}/")
            upload_path = f"{folder}/prompts/prompt.json"

            prompt_file_path = ctx.transaction_data.get("prompt_s3_url")
            if prompt_file_path:
                prompt_data = download_s3_file(
                    self.s3_bucket_name,
                    prompt_file_path,
                    "prompt.json",
                    ctx.txn_id,
                )
                existing_index = None
                for i, item in enumerate(prompt_data.get("data", [])):
                    if item.get("template_id") == ctx.template_id:
                        existing_index = i
                        break

                new_entry = {
                    "template_id": ctx.template_id,
                    "prompt": ctx.final_prompt,
                    "response_type": ctx.response_type,
                }
                if existing_index is not None:
                    prompt_data["data"][existing_index] = new_entry
                else:
                    prompt_data["data"].append(new_entry)
                upload_path = prompt_file_path
            else:
                prompt_data = {
                    "data": [
                        {
                            "template_id": ctx.template_id,
                            "prompt": ctx.final_prompt,
                            "response_type": ctx.response_type,
                        }
                    ]
                }

            if not upload_file_to_s3(
                self.s3_bucket_name, upload_path, prompt_data, ctx.txn_id
            ):
                logger.warning(
                    "Failed to save prompt to S3",
                    txn_id=ctx.txn_id,
                    template_id=ctx.template_id,
                    severity="medium",
                )
                return None

            logger.info(
                "Prompt saved to S3",
                txn_id=ctx.txn_id,
                prompt_path=upload_path,
            )
            return upload_path

        except Exception as e:
            logger.warning(
                "Error saving prompt to S3, continuing pipeline",
                txn_id=ctx.txn_id,
                error=str(e),
                severity="medium",
            )
            return None

    async def _call_agent_or_service(self, ctx: ConversionContext) -> None:
        """Route to agent or external service based on context."""
        use_agent = self.agent_service.should_use_agent(ctx.b_id)
        if ctx.is_translation:
            if use_agent:
                ctx.output_data, ctx.usage_information = (
                    await self.agent_service.translate_transcript(ctx)
                )
            else:
                from voice2rx.utils.constants import LANGUAGE_MAP
                _target_language = LANGUAGE_MAP.get(ctx.target_language) or "English"
                translation_prompt = (
                    f"Translate the following medical transcript to {_target_language}. "
                    "Maintain medical accuracy and context. Output only the translated text.\n\n"
                    f"Transcript:\n{ctx.transcript_text}\n"
                    "do not add any extra things only translate the texts"
                )
                ctx.output_data = common.call_external_service(
                    transcript_text=ctx.transcript_text,
                    final_prompt=translation_prompt,
                    txn_id=ctx.txn_id,
                    response_type="markdown",
                )
                if not ctx.output_data:
                    raise SystemFailureException(
                        f"External translation service returned empty result for {ctx.target_language}",
                        txn_id=ctx.txn_id,
                        b_id=ctx.b_id,
                    )
        else:
            if use_agent:
                ctx.output_data, ctx.usage_information = (
                    await self.agent_service.process_with_agent(ctx)
                )
            else:
                logger.warning(
                    "Using deprecated external service for template conversion",
                    txn_id=ctx.txn_id,
                    b_id=ctx.b_id,
                    severity="medium",
                )
                ctx.output_data = common.call_external_service(
                    transcript_text=ctx.transcript_text,
                    final_prompt=ctx.final_prompt,
                    txn_id=ctx.txn_id,
                    response_type=ctx.response_type,
                )

        if not ctx.output_data:
            raise SystemFailureException(
                "Conversion produced empty output",
                txn_id=ctx.txn_id,
                b_id=ctx.b_id,
            )

        logger.info(
            "Agent/service call completed",
            txn_id=ctx.txn_id,
            output_length=len(ctx.output_data) if ctx.output_data else 0,
            severity="medium",
        )

    def _save_output(self, ctx: ConversionContext) -> str:
        """Write output directly to documents/{document_id}.txt in S3."""
        content = ctx.output_data
        if isinstance(content, dict):
            content = json.dumps(content)

        if not ctx.is_translation:
            content = base64.b64encode(str(content).encode("utf-8")).decode("utf-8")

        file_key = self.document_service.write_document_content(
            s3_url=ctx.s3_url,
            document_id=ctx.document_id,
            content=content,
        )

        logger.info(
            "Output written to documents/",
            txn_id=ctx.txn_id,
            document_id=ctx.document_id,
            file_key=file_key,
            severity="medium",
        )
        return file_key

    def _update_document_success(
        self,
        ctx: ConversionContext,
        document_path: str,
        prompt_path: Optional[str] = None,
    ) -> None:
        """Update document status to success with paths."""
        update_data = {
            "status": "success",
            "document_path": document_path,
            "processed_at":  get_current_epoch_timestamp()
        }
        if prompt_path:
            update_data["prompt_path"] = prompt_path
        if ctx.usage_information is not None:
            update_data["usage_information"] = ctx.usage_information

        self.document_service.update_document(
            document_id=ctx.document_id,
            update_data=update_data,
        )

        # translation / direct-transcript runs are not client-facing document
        # generations — only template flows emit the webhook
        if not ctx.is_translation and not ctx.is_direct_transcript:
            transaction_data = ctx.transaction_data or {}
            emit(
                ScribeEvent.DOCUMENT_GENERATE,
                b_id=ctx.b_id,
                c_id=transaction_data.get("c_id", ""),
                txn_id=ctx.txn_id,
                data=build_document_data(
                    session_id=ctx.txn_id,
                    document_id=ctx.document_id,
                    template_id=ctx.template_id,
                    source=(
                        "integration_agent"
                        if ctx.is_integration_generation
                        else "background_agent"
                    ),
                ),
            )

    def _update_document_failure(
        self, ctx: ConversionContext, error: Exception
    ) -> None:
        """Update document status to failure with error details."""
        if not ctx.document_id:
            return
        try:
            self.document_service.update_document_status(
                document_id=ctx.document_id,
                status="failure",
                errors=[
                    {
                        "type" : "error",
                        "code" : "llm_structring_failure",
                        "msg" : MODEL_ERROR_MESSAGE
                    }
                ],
            )
        except Exception as doc_err:
            logger.error(
                "Failed to update document failure status",
                document_id=ctx.document_id,
                error=str(doc_err),
                severity="critical",
            )

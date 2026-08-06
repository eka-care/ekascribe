import base64
import functools
import os
from datetime import datetime
from typing import Awaitable, Callable, Optional, Union
import uuid

from ag_ui.core import (
    EventType,
    RunAgentInput,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    StateSnapshotEvent,
)
from ag_ui.encoder import EventEncoder
from echo.ag_ui import AgUiResumeInput
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from logs.custom_logger import get_logger
from voice2rx.agents.agent_config import LLMAgentConfig
from voice2rx.api.endpoints.transactions.handlers import RequestHandler
from voice2rx.choices import DocumentType
from voice2rx.core.exceptions import MODEL_ERROR_MESSAGE
from voice2rx.model_orms.template_result_orm import TemplateResultORM
from voice2rx.model_orms.transaction_orm import TransactionORM
from voice2rx.services.context import ContextResolutionService
from voice2rx.services.documents import document_tiptap_service
from voice2rx.services.documents.document_service import DocumentService
from voice2rx.services.storage.s3_service import download_s3_file
from voice2rx.services.templates.ag_ui.resume_store import paused_run_store
from voice2rx.services.templates.ag_ui.run_service import (
    AgUiRunService,
    ResolvedRunInputs,
)
from voice2rx.services.templates.template_service import TemplateService
from voice2rx.utils.time_utils import get_current_epoch_timestamp


logger = get_logger(__name__)

scribe_agent_router = APIRouter()

_run_service: AgUiRunService = AgUiRunService(
    paused_run_store=paused_run_store
)

_DEFAULT_S3_BUCKET: str = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")

_document_service: DocumentService = DocumentService()
_transaction_repo: TransactionORM = TransactionORM()
_template_service: TemplateService = TemplateService()
_template_result_repo: TemplateResultORM = TemplateResultORM()
_context_service: ContextResolutionService = ContextResolutionService()

@functools.lru_cache(maxsize=1)
def _get_default_llm_config():
    return LLMAgentConfig.from_env().to_llm_config()

RunInputResolver = Callable[..., Awaitable[ResolvedRunInputs]]


def _maybe_b64_decode(content: Union[str, bytes]) -> str:
    if isinstance(content, bytes):
        try:
            content = content.decode("utf-8")
        except UnicodeDecodeError:
            return content.decode("utf-8", errors="replace")
    if not isinstance(content, str):
        return str(content)
    try:
        decoded = base64.b64decode(content, validate=True).decode("utf-8")
        return decoded
    except (ValueError, UnicodeDecodeError):
        return content


def _ensure_run_document(
    session_id: str,
    template_id: str,
    document_name:str,
    jwt_uuid: str,
    b_id: str,
    s3_url: str,
) -> str:
    document_id = str(uuid.uuid4())
    file_key = _document_service.write_document_content(
        s3_url=s3_url,
        document_id=document_id,
        content="",
    )

    now = get_current_epoch_timestamp()
    doc = _document_service.create_document(
        document_id=document_id,
        session_id=session_id,
        document_name=document_name,
        template_id=template_id,
        uuid_val=jwt_uuid,
        wid=b_id,
        doc_type=DocumentType.CUSTOM,
        status="in-progress",
        created_at=now,
        commit_at=now,
        processed_at=now,
        document_path=file_key,
    )

    return doc["document_id"]


def _validate_transcript_ownership(
    document: dict, jwt_uuid: str, b_id: str, session_id: str
) -> None:
    if document.get("uuid") != jwt_uuid:
        raise HTTPException(
            status_code=404, detail=f"session {session_id} not found"
        )
    doc_b_id = document.get("wid") or document.get("b_id")
    if doc_b_id != b_id:
        raise HTTPException(
            status_code=404, detail=f"session {session_id} not found"
        )


async def run_input_resolver(
    template_id: str,
    session_id: str,
    b_id: str,
    jwt_uuid: str,
    document_id: Optional[str] = None,
) -> ResolvedRunInputs:
    # sse endpoint do not work with authorizer so skipping the auth uuid etc check for now.
    # if not jwt_uuid:
    #     raise HTTPException(status_code=401, detail="JWT missing uuid claim")

    # transcript document — always written by the init API.
    transcript_doc_id = _document_service.get_document_id_by_session_and_template(
        session_id=session_id, template_id="transcript"
    )
    if not transcript_doc_id:
        raise HTTPException(
            status_code=404,
            detail=f"transcript document not found for session {session_id}",
        )
    transcript_doc = _document_service.get_document(transcript_doc_id)
    if transcript_doc is None or transcript_doc.get("archived"):
        raise HTTPException(
            status_code=404,
            detail=f"transcript document {transcript_doc_id} not found",
        )

    # Ownership: jwt uuid + b_id must match the transcript document's
    # owner. This replaces the source-doc ownership check from the
    # previous resolver.

    # _validate_transcript_ownership(transcript_doc, jwt_uuid, b_id, session_id)
    transcript_path = transcript_doc.get("document_path")
    if not transcript_path:
        raise HTTPException(
            status_code=404,
            detail=(
                f"transcript document {transcript_doc_id} not ready "
                f"for session {session_id}: missing document_path"
            ),
        )

    b_id = transcript_doc.get("wid")
    transaction = _transaction_repo.get_transaction(session_id, b_id)
    s3_url = transaction.get("s3_url", "")
    if not s3_url:
        raise HTTPException(
            status_code=500,
            detail=f"transaction {session_id} missing s3_url",
        )

    resolved_context = await _context_service.resolve(
        context=transaction.get("context"),
        b_id=b_id,
        transaction_data=transaction,
    )
    if resolved_context and resolved_context.warnings:
        logger.warning(
            "context resolution warnings",
            session_id=session_id,
            warnings=resolved_context.warnings,
            severity="medium",
        )

    raw_content = download_s3_file(
        bucket_name=_DEFAULT_S3_BUCKET,
        file_key=transcript_path,
        local_filename="transcript.txt",
        session_id=session_id,
    )

    if raw_content is None:
        raise HTTPException(
            status_code=404,
            detail=f"error while downloading transcript from S3 for session {session_id}",
        )

    transcript_text = _maybe_b64_decode(raw_content)
    template_data = _template_service.get_template(template_id)
    if not template_data:
        raise HTTPException(
            status_code=404, detail=f"template {template_id} not found"
        )

    final_prompt = template_data.get("desc", "")
    if template_data.get("section_ids"):
        sections = _template_result_repo.get_sections_by_ids(template_data["section_ids"])
        if sections:
            section_descriptions = [
                f"{s.get('title')}: {s.get('desc')}" for s in sections
            ]
            final_prompt += "\n\n" + "\n".join(section_descriptions)

    if document_id:
        # in case of lost connect client can fire this API with docment id.
        run_document_id = document_id
        _document_service.update_document_status(
            document_id=document_id,
            status="in-progress",
        )
    else:
        doc_uuid = transcript_doc.get("uuid") or jwt_uuid
        run_document_id = _ensure_run_document(
            session_id=session_id,
            template_id=template_id,
            document_name=template_data.get("title"),
            jwt_uuid=doc_uuid,
            b_id=b_id,
            s3_url=s3_url,
        )

    date_str = datetime.now().strftime("%Y-%m-%d")
    return ResolvedRunInputs(
        b_id=b_id,
        txn_id=session_id,
        document_id=run_document_id,
        template_id=template_id,
        s3_url=s3_url,
        s3_bucket=_DEFAULT_S3_BUCKET,
        transcript=transcript_text,
        template_prompt=final_prompt,
        date=date_str,
        llm_config=_get_default_llm_config(),
        resolved_context=resolved_context,
        available_tools=template_data.get("available_tools"),
        c_id=transaction.get("c_id", ""),
        doctor_uuid=transaction.get("uuid", ""),
    )

# active resolver. Production points at run_input_resolver;
_run_input_resolver: RunInputResolver = run_input_resolver
def set_run_input_resolver(resolver: RunInputResolver) -> None:
    """Override the run-input resolver (for tests / canary deployments)."""
    global _run_input_resolver
    _run_input_resolver = resolver


def set_run_service(svc: AgUiRunService) -> None:
    """Override the singleton run service (for tests)."""
    global _run_service
    _run_service = svc


def _replay_response(
    run_input: RunAgentInput, saved_state: dict, encoder: EventEncoder
) -> StreamingResponse:
    async def event_gen():
        yield encoder.encode(
            RunStartedEvent(
                type=EventType.RUN_STARTED,
                thread_id=run_input.thread_id,
                run_id=run_input.run_id,
            )
        )
        yield encoder.encode(
            StateSnapshotEvent(
                type=EventType.STATE_SNAPSHOT,
                snapshot=saved_state,
            )
        )
        yield encoder.encode(
            RunFinishedEvent(
                type=EventType.RUN_FINISHED,
                thread_id=run_input.thread_id,
                run_id=run_input.run_id,
            )
        )

    return StreamingResponse(
        event_gen(),
        media_type=encoder.get_content_type(),
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


def build_run_stream_response(
    run_input: RunAgentInput,
    inputs: ResolvedRunInputs,
    encoder: EventEncoder,
) -> StreamingResponse:
    async def event_gen():
        try:
            async for ev in _run_service.stream(run_input, inputs):
                yield encoder.encode(ev)
        except Exception as e:
            logger.exception(
                "agent stream raised mid-run",
                template_id=inputs.template_id,
                session_id=run_input.thread_id,
                run_id=run_input.run_id,
                error=str(e),
                severity="critical",
            )

            err = RunErrorEvent(
                type=EventType.RUN_ERROR,
                message=MODEL_ERROR_MESSAGE,
                code="endpoint_exception",
            )
            yield encoder.encode(err)

    return StreamingResponse(
        event_gen(),
        media_type=encoder.get_content_type(),
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


@scribe_agent_router.post("/runs/{template_id}")
async def start_run(
    template_id: str, request: Request, document_id: Optional[str] = None
):
    # skip the jwt validation etc check
    # try:
    #     b_id = RequestHandler.extract_business_id_from_request(request)
    # except Exception as e:
    #     raise HTTPException(status_code=401, detail=f"auth failed: {e}")

    # token_data = RequestHandler.extract_token_data_from_request(request)
    # jwt_uuid = token_data.get("uuid", "")

    try:
        body = await request.json()
        run_input = RunAgentInput.model_validate(body)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"invalid RunAgentInput body: {e}")

    session_id = run_input.thread_id
    if not session_id:
        raise HTTPException(
            status_code=400,
            detail="RunAgentInput.thread_id is required (used as session_id).",
        )

    accept = request.headers.get("accept", "text/event-stream")
    encoder = EventEncoder(accept=accept)

    if document_id:
        document = _document_service.get_document(document_id)
        if document is None or document.get("archived"):
            raise HTTPException(
                status_code=404, detail=f"document {document_id} not found"
            )
        if document.get("session_id") != session_id:
            raise HTTPException(
                status_code=404, detail=f"document {document_id} not found"
            )

        record = document_tiptap_service.get_document_record(document_id)
        if record and record.get("tiptap_json"):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"document {document_id} already has edited content; "
                    "fetch the tiptap document instead of streaming"
                ),
            )
        
        saved_state = record.get("agui_state") if record else None
        if saved_state:
            logger.info(
                "replaying persisted agui_state",
                template_id=template_id,
                session_id=session_id,
                document_id=document_id,
                run_id=run_input.run_id,
            )
            return _replay_response(run_input, saved_state, encoder)
        # No saved state — fall through: re-run the LLM on this document.

    inputs: Optional[ResolvedRunInputs]
    try:
        if document_id: 
            inputs = await _run_input_resolver(template_id, session_id, "", "", document_id)
        else:
            inputs = await _run_input_resolver(template_id, session_id, "", "")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "run-input resolution failed",
            template_id=template_id,
            session_id=session_id,
            severity="critical",
        )
        raise HTTPException(
            status_code=500, detail=f"failed to resolve run inputs: {e}"
        )

    return build_run_stream_response(run_input, inputs, encoder)

@scribe_agent_router.post("/runs/{template_id}/resume")
async def resume_run(template_id: str, request: Request):
    # try:
    #     b_id = RequestHandler.extract_business_id_from_request(request)
    # except Exception as e:
    #     raise HTTPException(status_code=401, detail=f"auth failed: {e}")

    # token_data = RequestHandler.extract_token_data_from_request(request)
    # jwt_uuid = token_data.get("uuid", "")

    try:
        body = await request.json()
        resume_input = AgUiResumeInput.model_validate(body)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"invalid AgUiResumeInput body: {e}"
        )

    session_id = resume_input.thread_id
    if not session_id:
        raise HTTPException(
            status_code=400,
            detail="AgUiResumeInput.thread_id is required (used as session_id).",
        )

    try:
        inputs = await _run_input_resolver(template_id, session_id, "", "")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "resume run-input resolution failed",
            template_id=template_id,
            session_id=session_id,
            severity="critical",
        )
        raise HTTPException(
            status_code=500, detail=f"failed to resolve run inputs: {e}"
        )

    accept = request.headers.get("accept", "text/event-stream")
    encoder = EventEncoder(accept=accept)

    async def event_gen():
        try:
            async for ev in _run_service.resume_stream(resume_input, inputs):
                yield encoder.encode(ev)
        except Exception as e:
            logger.exception(
                "resume stream raised mid-run",
                template_id=template_id,
                session_id=session_id,
                run_id=resume_input.run_id,
                tool_call_id=resume_input.tool_call_id,
                severity="critical",
            )
        
            err = RunErrorEvent(
                type=EventType.RUN_ERROR,
                message=MODEL_ERROR_MESSAGE,
                code="endpoint_exception",
            )
            yield encoder.encode(err)

    return StreamingResponse(
        event_gen(),
        media_type=encoder.get_content_type(),
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )
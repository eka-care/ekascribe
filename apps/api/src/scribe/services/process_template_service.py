import uuid
from enum import Enum
from typing import Optional

from fastapi import BackgroundTasks, HTTPException, Request

from scribe.core.custom_logger import get_logger
from scribe.routers import scribe_agent_runs as agent_runs
from scribe.core.http import (
    RequestHandler,
    ResponseFormatter,
)
from scribe.core.exceptions import (
    BadRequestException,
    ResourceNotFoundException,
)
from scribe.schemas import ProcessTemplateResponse
from scribe.services.document_service import DocumentService
from scribe.services.transaction_service import TransactionService

logger = get_logger(__name__)

transaction_service = TransactionService()
document_service = DocumentService()

class ProcessProtocol(str, Enum):
    STREAM = "stream"
    AG_UI = "ag-ui"  # legacy alias — same markdown streaming handler


# x-format values are validated but unused for now;
# they will drive the output representation (and available tools) in the future.
SUPPORTED_FORMATS = {"html", "markdown", "json"}
async def _handle_stream_process(
    request: Request,
    background_tasks: BackgroundTasks,
    session_id: str,
    template_id: str,
    document_id: Optional[str],
    b_id: str,
    transaction_data: dict,
):
    """Markdown streaming (post-AG-UI): replay a persisted note if the
    document already has content, else run the LLM and stream deltas."""
    run_id = str(uuid.uuid4())

    if document_id:
        document = document_service.get_document(document_id)
        existing = agent_runs._document_markdown(document) if document else None
        if existing:
            logger.info(
                "replaying persisted note",
                session_id=session_id,
                template_id=template_id,
                document_id=document_id,
                run_id=run_id,
            )
            return agent_runs._replay_response(run_id, document_id, existing)

    # module-attribute access so set_run_input_resolver overrides apply
    inputs = await agent_runs._run_input_resolver(
        template_id, session_id, b_id, "", document_id
    )
    return agent_runs.build_run_stream_response(run_id, inputs)


PROTOCOL_HANDLERS = {
    ProcessProtocol.STREAM: _handle_stream_process,
    ProcessProtocol.AG_UI: _handle_stream_process,  # legacy alias
}


async def process_session_template(
    request: Request,
    background_tasks: BackgroundTasks,
    session_id: str,
    template_id: Optional[str],
    document_id: Optional[str] = None,
):
    b_id = ""
    try:
        headers = RequestHandler.extract_headers(request, session_id)
        b_id = headers.get("token_data", {}).get("b-id", "")

        raw_protocol = (request.headers.get("x-protocol") or ProcessProtocol.STREAM.value).lower()
        try:
            protocol = ProcessProtocol(raw_protocol)
        except ValueError:
            raise BadRequestException(
                f"unsupported x-protocol '{raw_protocol}'; "
                f"supported: {[p.value for p in ProcessProtocol]}",
                txn_id=session_id,
                b_id=b_id,
            )
        handler = PROTOCOL_HANDLERS.get(protocol)
        if handler is None:
            raise BadRequestException(
                f"x-protocol '{raw_protocol}' is not available yet",
                txn_id=session_id,
                b_id=b_id,
            )

        output_format = (request.headers.get("x-format") or "").lower() or None
        if output_format and output_format not in SUPPORTED_FORMATS:
            raise BadRequestException(
                f"unsupported x-format '{output_format}'; "
                f"supported: {sorted(SUPPORTED_FORMATS)}",
                txn_id=session_id,
                b_id=b_id,
            )

        transaction_data = transaction_service.get_transaction(session_id, b_id)
        if document_id:
            document = document_service.get_document(document_id)
            if (document is None
                or document.get("archived")
                or document.get("session_id") != session_id
            ):
                raise ResourceNotFoundException(
                    f"document {document_id} not found",
                    txn_id=session_id,
                    b_id=b_id,
                )
            
            doc_template_id = document.get("template_id")
            if template_id and doc_template_id != template_id:
                raise BadRequestException(
                    f"document {document_id} does not belong to "
                    f"template {template_id}",
                    txn_id=session_id,
                    b_id=b_id,
                )
            template_id = doc_template_id
        elif not template_id:
            requested_templates = transaction_data.get("request_templates", {}).get("visual", [])
            if len(requested_templates) == 0:
                raise ResourceNotFoundException(
                    "No templates were requested for this session",
                    txn_id=session_id,
                    b_id=b_id,
                )

            first_template = requested_templates[0]
            template_id = first_template.get("template_id")
            if not template_id:
                raise ResourceNotFoundException(
                    "template_id is required",
                    txn_id=session_id,
                    b_id=b_id,
                )

        logger.info(
            "Protocol process-template requested",
            session_id=session_id,
            b_id=b_id,
            template_id=template_id,
            document_id=document_id,
            protocol=protocol.value,
            x_format=output_format,
        )

        return await handler(
            request,
            background_tasks,
            session_id,
            template_id,
            document_id,
            b_id,
            transaction_data,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error processing template: {e}",
            session_id=session_id,
            b_id=b_id,
            template_id=template_id,
            exc_info=True,
        )
        return ResponseFormatter.from_exception(e, session_id, b_id)

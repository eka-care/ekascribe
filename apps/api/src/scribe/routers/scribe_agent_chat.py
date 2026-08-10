"""
Document-chat SSE endpoint for the AG-UI scribe flow.

POST /voice/v1/scribe/agent/documents/{document_id}/chat

Drives one chat turn over a scribe note. The FE sends the live editor
markdown plus the doctor's message; the service streams AG-UI events —
TEXT_MESSAGE_* for answers, and STATE_DELTA / STATE_SNAPSHOT carrying the
updated ``document_markdown`` when the chat edits the note. Path C: the
note is markdown end-to-end; no structured ScribeState round-trip.
"""

from ag_ui.core import EventType, RunErrorEvent
from ag_ui.encoder import EventEncoder
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from scribe.core.custom_logger import get_logger
from scribe.core.exceptions import MODEL_ERROR_MESSAGE
from scribe.structuring.chat import (
    DocumentChatInput,
    DocumentChatService,
)

logger = get_logger(__name__)

scribe_agent_chat_router = APIRouter()

_chat_service = DocumentChatService()


def set_chat_service(svc: DocumentChatService) -> None:
    """Override the singleton chat service (for tests)."""
    global _chat_service
    _chat_service = svc


@scribe_agent_chat_router.post("/documents/{document_id}/chat")
async def document_chat(document_id: str, request: Request):
    # SSE endpoints don't run through the authorizer; auth parity with the
    # run endpoints (currently skipped) is tracked separately.
    try:
        body = await request.json()
        chat_input = DocumentChatInput.model_validate(body)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"invalid DocumentChatInput body: {e}"
        )

    if not chat_input.thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required.")
    if not chat_input.run_id:
        raise HTTPException(status_code=400, detail="run_id is required.")
    if not chat_input.message.strip():
        raise HTTPException(status_code=400, detail="message is required.")

    accept = request.headers.get("accept", "text/event-stream")
    encoder = EventEncoder(accept=accept)

    async def event_gen():
        try:
            async for ev in _chat_service.stream(chat_input, document_id):
                yield encoder.encode(ev)
        except Exception as e:
            logger.exception(
                "document chat stream raised mid-run",
                document_id=document_id,
                thread_id=chat_input.thread_id,
                run_id=chat_input.run_id,
                message=str(e),
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

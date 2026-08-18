"""
Document-chat SSE endpoint — markdown regenerate-and-replace.

POST /voice/v1/scribe/agent/documents/{document_id}/chat

One chat turn over a note. The FE sends the live editor markdown plus the
user's message; the service streams plain frames:

    data: {"type":"start","run_id":…,"document_id":…}
    data: {"type":"delta","text":…}
    data: {"type":"done","markdown":…,"document_id":…}
    data: {"type":"error","message":…}

On `done` the client replaces the editor content with the revised markdown.
"""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from scribe.core.custom_logger import get_logger
from scribe.core.exceptions import MODEL_ERROR_MESSAGE
from scribe.structuring.chat import (
    DocumentChatInput,
    DocumentChatService,
)
from scribe.structuring.markdown_notes import sse_frame

logger = get_logger(__name__)

scribe_agent_chat_router = APIRouter()

_chat_service = DocumentChatService()


def set_chat_service(svc: DocumentChatService) -> None:
    """Override the singleton chat service (for tests)."""
    global _chat_service
    _chat_service = svc


@scribe_agent_chat_router.post("/documents/{document_id}/chat")
async def document_chat(document_id: str, request: Request):
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

    async def event_gen():
        try:
            async for frame in _chat_service.stream(chat_input, document_id):
                yield sse_frame(frame)
        except Exception as e:
            logger.exception(
                "document chat stream raised mid-run",
                document_id=document_id,
                thread_id=chat_input.thread_id,
                run_id=chat_input.run_id,
                message=str(e),
                severity="critical",
            )
            yield sse_frame({"type": "error", "message": MODEL_ERROR_MESSAGE})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )

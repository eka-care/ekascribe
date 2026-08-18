"""
Per-turn orchestrator for document-chat runs — markdown regenerate-and-replace.

The FE sends the live editor markdown + the user's message each turn
(stateless w.r.t. storage: unsaved edits are never lost). The service makes
one streaming LLM call and relays plain frames; on `done` the FE replaces
the editor content with the revised markdown. No AG-UI, no edit tools.
"""

from typing import Any, AsyncGenerator, Dict, List, Literal, Optional

from echo.llm import LLMConfig
from echo.models.user_conversation import (
    ConversationContext,
    Message,
    MessageRole,
    TextMessage,
)
from pydantic import BaseModel, Field

from scribe.core.custom_logger import get_logger
from scribe.services.agent_config import LLMAgentConfig
from scribe.structuring.markdown_notes import stream_markdown

from .chat_prompt import CHAT_SYSTEM_PROMPT, build_chat_user_message

logger = get_logger(__name__)


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class DocumentChatInput(BaseModel):
    """Body of a /documents/{document_id}/chat call."""

    thread_id: str
    run_id: str
    message: str
    document_markdown: str = ""
    history: List[ChatHistoryMessage] = Field(default_factory=list)


_ROLE_MAP = {"user": MessageRole.USER, "assistant": MessageRole.ASSISTANT}

# keep the prompt bounded: only the most recent turns ride along
_MAX_HISTORY_TURNS = 8


class DocumentChatService:
    """Streams one chat revision of a markdown note."""

    def __init__(self, llm_config: Optional[LLMConfig] = None) -> None:
        self._llm_config = llm_config

    async def stream(
        self, chat_input: DocumentChatInput, document_id: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        ctx = ConversationContext()
        for turn in chat_input.history[-_MAX_HISTORY_TURNS:]:
            ctx.add_message(
                Message(
                    role=_ROLE_MAP[turn.role],
                    content=[TextMessage(text=turn.content)],
                )
            )
        ctx.add_message(
            Message(
                role=MessageRole.USER,
                content=[
                    TextMessage(
                        text=build_chat_user_message(
                            chat_input.document_markdown, chat_input.message
                        )
                    )
                ],
            )
        )

        llm_config = self._llm_config or LLMAgentConfig.from_env().to_llm_config()
        logger.info(
            "document chat turn started",
            document_id=document_id,
            thread_id=chat_input.thread_id,
            run_id=chat_input.run_id,
            history_turns=len(chat_input.history),
            model=getattr(llm_config, "model", ""),
        )
        yield {
            "type": "start",
            "run_id": chat_input.run_id,
            "document_id": document_id,
        }

        async for kind, text in stream_markdown(
            system_prompt=CHAT_SYSTEM_PROMPT, context=ctx, llm_config=llm_config
        ):
            if kind == "delta":
                yield {"type": "delta", "text": text}
            else:
                logger.info(
                    "document chat turn finished",
                    document_id=document_id,
                    run_id=chat_input.run_id,
                    chars=len(text),
                )
                yield {"type": "done", "markdown": text, "document_id": document_id}

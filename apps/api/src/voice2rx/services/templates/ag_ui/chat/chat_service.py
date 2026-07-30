"""
Per-turn orchestrator for document-chat runs.

Mirrors AgUiRunService but for the markdown document-chat flow: builds a
ChatState seeded from the FE-supplied live markdown, a chat agent with the
three edit tools, and a ConversationContext from the prior turns + the new
message, then streams AG-UI events for an SSE response.

Stateless w.r.t. storage: the FE sends the current document markdown in
every request (so direct, not-yet-saved editor edits are never lost) and
applies the streamed STATE_DELTA back into the editor. A final
STATE_SNAPSHOT is emitted on RUN_FINISHED as the authoritative result.
"""

from typing import AsyncGenerator, List, Literal, Optional

from ag_ui.core import (
    BaseEvent,
    EventType,
    RunAgentInput,
    StateSnapshotEvent,
)
from echo.ag_ui import AgUiAgent
from echo.llm import LLMConfig
from echo.models.user_conversation import (
    ConversationContext,
    Message,
    MessageRole,
    TextMessage,
)
from pydantic import BaseModel, Field

from logs.custom_logger import get_logger
from voice2rx.agents.agent_config import LLMAgentConfig

from .chat_prompt import build_chat_agent_config
from .chat_state import ChatState
from .edit_tools import ALL_EDIT_TOOLS
from .markdown_ops import MarkdownDocument

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


class DocumentChatService:
    """Streams AG-UI events for one document-chat turn."""

    def __init__(self, llm_config: Optional[LLMConfig] = None) -> None:
        self._llm_config = llm_config

    def _resolve_llm_config(self) -> LLMConfig:
        return self._llm_config or LLMAgentConfig.from_env().to_llm_config()

    async def stream(
        self,
        chat_input: DocumentChatInput,
        document_id: str,
    ) -> AsyncGenerator[BaseEvent, None]:
        state = ChatState(document_markdown=chat_input.document_markdown)
        headings = MarkdownDocument(chat_input.document_markdown).headings()

        agent = AgUiAgent(
            agent_prompt=build_chat_agent_config(
                chat_input.document_markdown, headings
            ),
            llm_config=self._resolve_llm_config(),
            tools=[tool_cls() for tool_cls in ALL_EDIT_TOOLS],
        )

        ctx = ConversationContext()
        for turn in chat_input.history:
            ctx.add_message(
                Message(
                    role=_ROLE_MAP[turn.role],
                    content=[TextMessage(text=turn.content)],
                )
            )
        ctx.add_message(
            Message(
                role=MessageRole.USER,
                content=[TextMessage(text=chat_input.message)],
            )
        )
        ctx.system_context["tool_context"] = {"chat_state": state}

        # No UI tools: the edit tools execute server-side. Empty tools list
        # means ag_ui_stream never pauses; it runs to RUN_FINISHED.
        run_input = RunAgentInput(
            thread_id=chat_input.thread_id,
            run_id=chat_input.run_id,
            state={},
            messages=[],
            tools=[],
            context=[],
            forwarded_props={},
        )

        logger.info(
            "document chat started",
            document_id=document_id,
            thread_id=chat_input.thread_id,
            run_id=chat_input.run_id,
            history_len=len(chat_input.history),
            section_count=len(headings),
            severity="medium",
        )

        async for ev in agent.ag_ui_stream(
            context=ctx,
            run_input=run_input,
            state=state,
            out_msg_id=chat_input.run_id,
            paused_run_store=None,
        ):
            # Authoritative final markdown, mirroring AgUiRunService — the FE
            # applies it via setMarkdown even if it dropped an interim delta.
            if ev.type == EventType.RUN_FINISHED:
                yield StateSnapshotEvent(
                    type=EventType.STATE_SNAPSHOT,
                    snapshot=state.snapshot(),
                )
            yield ev

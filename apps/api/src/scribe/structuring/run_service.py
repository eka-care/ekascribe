import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Callable, Optional, Tuple

from ag_ui.core import (
    BaseEvent,
    EventType,
    RunAgentInput,
    RunErrorEvent,
    StateSnapshotEvent,
)
from echo.ag_ui import (
    AgUiAgent,
    AgUiResumeInput,
    PausedRunStore,
    make_pause_key,
)
from echo.llm import LLMConfig
from echo.models.user_conversation import ConversationContext
from scribe.core.custom_logger import get_logger

from scribe.services.agent_config import LLMAgentConfig
from scribe.services.context import ResolvedContext, build_conversation_context
from scribe.services import document_tiptap_service
from scribe.services.document_service import DocumentService

from .prompt_assembly import build_scribe_agent_config_v2
from .state import ScribeState
from .tools.catalog import get_tool_catalog, load_tool_prompts

# fail fast: a missing/invalid tool_prompts.yaml should break at import
load_tool_prompts()

logger = get_logger(__name__)

_DEFAULT_S3_BUCKET = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")
_SUPPRESSED_EVENT_TYPES = frozenset({EventType.TOOL_CALL_ARGS})


# this is only for debug on local system , won't run on prod or stage. 
# // it dumps a complete prompt file 
_DEBUG_PROMPT_PATH = Path(os.getenv("LOG_DIR", str(Path(__file__).parent))) / "final_prompt_debug.txt"
def _dump_final_prompt_for_debug(echo_config, tools, inputs) -> None:
    try:
        prompt = f"You are a {echo_config.persona.role}\n\n{echo_config.task.description}"
        if echo_config.task.expected_output:
            prompt += f"\n\nExpected Output: {echo_config.task.expected_output}"
        header = (
            f"# generated_at={datetime.now().isoformat()}\n"
            f"# template_id={inputs.template_id}\n"
            f"# llm_model={os.getenv('ECHO_DEFAULT_LLM_MODEL') or os.getenv('ECHO_LLM_MODEL')}\n"
            f"# llm_provider={os.getenv('ECHO_DEFAULT_LLM_PROVIDER') or os.getenv('ECHO_DEFAULT_PROVIDER')}\n"
            f"# registered_tools={[t.name for t in tools]}\n\n"
        )
        body = (
            header
            + "===== SYSTEM PROMPT (role + task.description) =====\n"
            + prompt
            + "\n\n===== EXPECTED_OUTPUT =====\n"
            + (echo_config.task.expected_output or "")
            + "\n\n===== TRANSCRIPT (user message) =====\n"
            + (inputs.transcript or "")
            + "\n"
        )
        _DEBUG_PROMPT_PATH.write_text(body, encoding="utf-8")
        print("\n<<<<<<<<<< AG_UI FINAL PROMPT >>>>>>>>>>\n" + body +
              "\n<<<<<<<<<< END AG_UI FINAL PROMPT >>>>>>>>>>\n", flush=True)
        logger.info("final prompt dumped for debug", path=str(_DEBUG_PROMPT_PATH))
    except Exception as e:
        logger.warning("failed to write final prompt debug file", error=str(e), severity="low")


def build_persistable_agui_state(state: ScribeState) -> dict:
    snap = state.snapshot()
    for field in ("transcript", "pending_tool_call_id"):
        snap.pop(field, None)
    return snap

@dataclass
class ResolvedRunInputs:
    """Fully-resolved inputs for one AG-UI scribe run."""

    b_id: str
    txn_id: str
    document_id: str
    template_id: str
    s3_url: str
    transcript: str
    template_prompt: str
    s3_bucket: str = _DEFAULT_S3_BUCKET
    date: Optional[str] = None
    llm_config: Optional[LLMConfig] = None  # override for tests/canary
    resolved_context: Optional[ResolvedContext] = None


ComponentsFactory = Callable[
    [ResolvedRunInputs], Tuple[Any, ConversationContext, ScribeState]
]


def build_scribe_run_components(
    inputs: ResolvedRunInputs,
) -> Tuple[AgUiAgent, ConversationContext, ScribeState]:
    """Default components factory — builds the agent, context, and state
    for one run with the full emit toolset registered. Every run gets every
    tool; the template's instructions decide which sections (and therefore
    which tools) actually fire."""
    state = ScribeState(
        template_id=inputs.template_id,
        txn_id=inputs.txn_id,
        document_id=inputs.document_id,
        transcript=inputs.transcript,
    )

    catalog = get_tool_catalog()
    tool_specs = catalog.all_specs()
    echo_config = build_scribe_agent_config_v2(
        template_prompt=inputs.template_prompt,
        tool_specs=tool_specs,
        date=inputs.date,
    )
    tools = catalog.instantiate(tool_specs)
    logger.info(
        "scribe run tools resolved",
        template_id=inputs.template_id,
        tool_names=[t.name for t in tools],
    )

    llm_config = inputs.llm_config or LLMAgentConfig.from_env().to_llm_config()

    agent = AgUiAgent(
        agent_prompt=echo_config,
        llm_config=llm_config,
        tools=tools,
    )

    ctx = build_conversation_context(
        transcript=inputs.transcript,
        resolved_context=inputs.resolved_context,
    )
    ctx.system_context["tool_context"] = {
        "scribe_state": state,
        "s3_url": inputs.s3_url,
        "s3_bucket": inputs.s3_bucket,
        "document_id": inputs.document_id,
        "txn_id": inputs.txn_id,
        "b_id": inputs.b_id,
    }
    _dump_final_prompt_for_debug(echo_config, tools, inputs)

    return agent, ctx, state

class AgUiRunService:
    """Streams AG-UI events for one scribe agent run."""

    def __init__(
        self,
        components_factory: Optional[ComponentsFactory] = None,
        paused_run_store: Optional[PausedRunStore] = None,
        document_service: Optional[DocumentService] = None,
    ) -> None:
        self._build_components: ComponentsFactory = (
            components_factory or build_scribe_run_components
        )
        self.paused_run_store = paused_run_store
        self.document_service = document_service or DocumentService()

    async def stream(
        self,
        run_input: RunAgentInput,
        inputs: ResolvedRunInputs,
    ) -> AsyncGenerator[BaseEvent, None]:
        agent, ctx, state = self._build_components(inputs)

        logger.info(
            "ag_ui run started",
            b_id=inputs.b_id,
            txn_id=inputs.txn_id,
            document_id=inputs.document_id,
            template_id=inputs.template_id,
            thread_id=run_input.thread_id,
            run_id=run_input.run_id,
            ui_tool_count=len(run_input.tools),
        )

        async for ev in agent.ag_ui_stream(
            context=ctx,
            run_input=run_input,
            state=state,
            out_msg_id=inputs.document_id,
            paused_run_store=self.paused_run_store,
            pause_metadata={
                "b_id": inputs.b_id,
                "document_id": inputs.document_id,
                "txn_id": inputs.txn_id,
                "template_id": inputs.template_id,
            },
        ):
            if ev.type in _SUPPRESSED_EVENT_TYPES:
                continue
            if ev.type == EventType.RUN_FINISHED:
                document_id = inputs.document_id
                self.document_service.update_document_status(
                    document_id=document_id,
                    status="success",
                )
                self._persist_agui_state(state, document_id)
                yield StateSnapshotEvent(
                    type=EventType.STATE_SNAPSHOT,
                    snapshot=state.snapshot(),
                )
            yield ev


    def _persist_agui_state(self, state: ScribeState, document_id: str) -> None:
        try:
            document_tiptap_service.save_agui_state(
                document_id=document_id,
                agui_state=build_persistable_agui_state(state),
            )
        except Exception:
            logger.exception(
                "failed to persist agui_state", document_id=document_id,
                severity="critical",
            )

    async def resume_stream(
        self,
        resume_input: AgUiResumeInput,
        inputs: ResolvedRunInputs,
    ) -> AsyncGenerator[BaseEvent, None]:
        """Continue a previously-paused run with the FE-supplied tool result."""
        if self.paused_run_store is None:
            raise RuntimeError(
                "AgUiRunService.resume_stream requires paused_run_store."
            )

        key = make_pause_key(resume_input.thread_id, resume_input.run_id)
        paused = await self.paused_run_store.load(key)
        if paused is None:
            yield RunErrorEvent(
                type=EventType.RUN_ERROR,
                message=f"paused run not found or expired: {key}",
                code="paused_run_expired",
            )
            return
        if paused.tool_call_id != resume_input.tool_call_id:
            yield RunErrorEvent(
                type=EventType.RUN_ERROR,
                message=(
                    f"tool_call_id mismatch (paused on "
                    f"{paused.tool_call_id}, resume tried "
                    f"{resume_input.tool_call_id})"
                ),
                code="tool_call_id_mismatch",
            )
            return

        state = ScribeState.model_validate(paused.state_snapshot)
        ctx = ConversationContext.model_validate(paused.context_snapshot)
        # Live tool_context references can't survive serialization; rebind.
        ctx.system_context["tool_context"] = {
            "scribe_state": state,
            "s3_url": inputs.s3_url,
            "s3_bucket": inputs.s3_bucket,
            "document_id": inputs.document_id,
            "txn_id": inputs.txn_id,
            "b_id": inputs.b_id,
        }

        logger.info(
            "ag_ui resume",
            b_id=inputs.b_id,
            txn_id=inputs.txn_id,
            document_id=inputs.document_id,
            thread_id=resume_input.thread_id,
            run_id=resume_input.run_id,
            tool_call_id=resume_input.tool_call_id,
        )

        # Fresh agent from the factory; discard its ctx/state — we rehydrated.
        agent, _ctx_unused, _state_unused = self._build_components(inputs)

        async for ev in agent.ag_ui_resume_stream(
            paused_run_store=self.paused_run_store,
            thread_id=resume_input.thread_id,
            run_id=resume_input.run_id,
            tool_call_id=resume_input.tool_call_id,
            tool_result=resume_input.tool_result,
            state=state,
            context=ctx,
            out_msg_id=inputs.document_id,
            pause_metadata={
                "b_id": inputs.b_id,
                "document_id": inputs.document_id,
                "txn_id": inputs.txn_id,
                "template_id": inputs.template_id,
            },
        ):
            if ev.type in _SUPPRESSED_EVENT_TYPES:
                continue
            if ev.type == EventType.RUN_FINISHED:
                self.document_service.update_document_status(
                    document_id=inputs.document_id,
                    status="success",
                )
                self._persist_agui_state(state, inputs.document_id)
                yield StateSnapshotEvent(
                    type=EventType.STATE_SNAPSHOT,
                    snapshot=state.snapshot(),
                )
            yield ev


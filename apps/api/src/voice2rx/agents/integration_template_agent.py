import time

from echo.agents.generic_agent import GenericAgent
from echo import AgentConfig as EchoAgentConfig, PersonaConfig, TaskConfig
from typing import TYPE_CHECKING, Any, Dict, Optional, Tuple

from .agent_config import LLMAgentConfig
from logs.custom_logger import get_logger
from voice2rx.services.context import build_conversation_context
from voice2rx.utils.json_normalization import _normalize_json_output

if TYPE_CHECKING:
    from voice2rx.services.context import ResolvedContext

logger = get_logger(__name__)

_INTEGRATION_EXPECTED_OUTPUT = (
    "Return only a single valid JSON object exactly matching the schema described "
    "in the instructions."
)


class IntegrationTemplateAgent:

    @staticmethod
    def create_agent_config(final_prompt: str) -> EchoAgentConfig:
        return EchoAgentConfig(
            persona=PersonaConfig(role="", goal="", backstory=""),
            task=TaskConfig(
                description=final_prompt or "",
                expected_output=_INTEGRATION_EXPECTED_OUTPUT,
            ),
        )

    @staticmethod
    async def generate(
        transcript: str,
        final_prompt: str,
        agent_config: LLMAgentConfig,
        txn_id: str,
        resolved_context: "Optional[ResolvedContext]" = None,
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        
        echo_agent_config = IntegrationTemplateAgent.create_agent_config(final_prompt)
        llm_config = agent_config.to_llm_config()

        agent = GenericAgent(agent_prompt=echo_agent_config, llm_config=llm_config)
        context = build_conversation_context(transcript, resolved_context)
        agent_run_start = time.time()
        result = await agent.run(context, out_msg_id=txn_id)
        agent_run_elapsed = time.time() - agent_run_start
        logger.info(
            "integration agent.run completed",
            txn_id=txn_id,
            agent_response_time=f"{agent_run_elapsed:.2f}s",
            severity="medium",
        )

        if result.llm_response is None:
            raise Exception("Agent returned no response")
        if result.llm_response.error:
            raise Exception(result.llm_response.error)

        result_data = _normalize_json_output(result.llm_response.text)
        return result_data, result.llm_response.details

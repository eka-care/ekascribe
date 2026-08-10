"""
Template Generation Agent

This agent handles template ID-based medical template generation.
"""
import time

from echo.agents.generic_agent import GenericAgent
from echo import AgentConfig as EchoAgentConfig, PersonaConfig, TaskConfig
from typing import TYPE_CHECKING, Any, Dict, Optional, Tuple

from .agent_config import LLMAgentConfig
from logs.custom_logger import get_logger
from voice2rx.services.context import build_conversation_context
from voice2rx.services.prompts import get_prompt_service
from voice2rx.utils.json_normalization import _normalize_json_output, normalize_whitespace

if TYPE_CHECKING:
    from voice2rx.services.context import ResolvedContext

logger = get_logger(__name__)


class TemplateGenerationAgent:

    @staticmethod
    def create_agent_config(
        final_prompt: Optional[str] = None,
        response_type: str = "json",
        date: Optional[str] = None,
        schema: Optional[str] = None,
    ) -> EchoAgentConfig:

        prompt_svc = get_prompt_service()
        parsed = prompt_svc.get_parsed_agent_prompt(
            "template_generation",
            response_type=response_type,
            date=date or "",
            schema=schema or "",
        )
        role = parsed.role()
        goal = parsed.goal
        backstory = parsed.full_backstory()
        task_description = (
            (parsed.task_instructions if (date is not None and schema is not None and parsed.task_instructions) else None)
            or (final_prompt or "")
        )
        expected_output = parsed.expected_output_for(response_type)
        return EchoAgentConfig(
            persona=PersonaConfig(role=role, goal=goal, backstory=backstory),
            task=TaskConfig(description=task_description, expected_output=expected_output),
        )

    @staticmethod
    async def generate(
        transcript: str,
        final_prompt: str,
        agent_config: LLMAgentConfig,
        txn_id: str,
        response_type: str = "json",
        date: Optional[str] = None,
        schema: Optional[str] = None,
        resolved_context: "Optional[ResolvedContext]" = None,
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        echo_agent_config = TemplateGenerationAgent.create_agent_config(
            final_prompt=final_prompt,
            response_type=response_type,
            date=date,
            schema=schema,
        )

        llm_config = agent_config.to_llm_config()

        agent = GenericAgent(agent_prompt=echo_agent_config, llm_config=llm_config)
        context = build_conversation_context(transcript, resolved_context)
        agent_run_start = time.time()
        result = await agent.run(context, out_msg_id=txn_id)
        agent_run_elapsed = time.time() - agent_run_start
        logger.info(
            "agent.run completed",
            txn_id=txn_id,
            agent_response_time=f"{agent_run_elapsed:.2f}s",
            severity="medium",
        )

        if result.llm_response is None:
            raise Exception("Agent returned no response")
        if result.llm_response.error:
            raise Exception(result.llm_response.error)

        result_data = result.llm_response.text
        if response_type == "json":
            result_data = _normalize_json_output(result_data)
        else:
            result_data = normalize_whitespace(result_data)

        return result_data, result.llm_response.details

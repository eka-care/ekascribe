"""
Medication Extraction Agent

This agent extracts medications from template result data,
returning a structured JSON list of medication names, doses, etc.
"""

import orjson
from echo.agents.generic_agent import GenericAgent
from echo import AgentConfig as EchoAgentConfig, PersonaConfig, TaskConfig
from echo.models.user_conversation import (
    ConversationContext,
    Message,
    MessageRole,
    TextMessage,
)
from .agent_config import LLMAgentConfig
from voice2rx.services.prompts import get_prompt_service
from logs.custom_logger import get_logger

logger = get_logger(__name__)


class MedicationExtractionAgent:
    @staticmethod
    def create_agent_config() -> EchoAgentConfig:
        prompt_svc = get_prompt_service()
        parsed = prompt_svc.get_parsed_agent_prompt("medication")
        role = parsed.role()
        goal = parsed.goal
        backstory = parsed.full_backstory() 
        task_desc = parsed.task_instructions 
        expected_output = parsed.expected_output_for("json") 
        return EchoAgentConfig(
            persona=PersonaConfig(role=role, goal=goal, backstory=backstory),
            task=TaskConfig(description=task_desc, expected_output=expected_output),
        )

    @staticmethod
    async def extract(
        template_data_text: str,
        agent_config: LLMAgentConfig,
        request_id: str = "medication_extraction",
    ) -> list:
        """
        Extract medications from template result data.

        Args:
            template_data_text: Serialized template results text
            agent_config: LLM configuration
            request_id: Unique request ID for tracing

        Returns:
            List of medication dicts with name, dose, frequency, duration, route
        """
        prompt_svc = get_prompt_service()
        parsed = prompt_svc.get_parsed_agent_prompt(
            "medication", template_data_text=template_data_text
        )
        prompt = parsed.user_prompt
        echo_agent_config = MedicationExtractionAgent.create_agent_config()
        llm_config = agent_config.to_llm_config()

        agent = GenericAgent(agent_prompt=echo_agent_config, llm_config=llm_config)

        context = ConversationContext()
        context.add_message(
            Message(role=MessageRole.USER, content=[TextMessage(text=prompt)])
        )

        result = await agent.run(context, out_msg_id=request_id)
        raw_text = result.llm_response.text

        # Parse the LLM output into a list
        return _parse_medication_output(raw_text)


def _parse_medication_output(raw_text: str) -> list:
    """
    Parse LLM output into a list of medication dicts.
    Handles edge cases like markdown code fences, extra whitespace, etc.
    """
    # Strip markdown code fences if present
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        # Remove opening fence (possibly ```json)
        first_newline = cleaned.index("\n")
        cleaned = cleaned[first_newline + 1 :]
    if cleaned.endswith("```"):
        cleaned = cleaned[: -3]
    cleaned = cleaned.strip()

    try:
        parsed = orjson.loads(cleaned)
    except Exception:
        logger.warning(
            "Failed to parse medication extraction output as JSON",
            raw_text_preview=raw_text[:200],
            severity="critical",
        )
        return []

    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        # If LLM returned a single medication as dict, wrap in list
        return [parsed]

    logger.warning("Unexpected medication extraction output type", output_type=type(parsed).__name__, severity="critical")
    return []

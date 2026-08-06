"""
Transcript Translation Agent

This agent handles translating medical transcripts to different languages.
"""

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
from typing import Any, Dict, List, Optional, Tuple
from voice2rx.utils.constants import LANGUAGE_MAP

class TranscriptTranslationAgent:
    """Agent for translating transcripts to different languages. Config from Langfuse or voice2rx/agents/prompts fallback."""

    @staticmethod
    def create_agent_config(target_language: str) -> EchoAgentConfig:
        language_name = LANGUAGE_MAP.get(target_language, target_language.capitalize())
        prompt_svc = get_prompt_service()
        parsed = prompt_svc.get_parsed_agent_prompt("translation", language_name=language_name)
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
    async def translate(
        transcript: str, target_language: str, agent_config: LLMAgentConfig, txn_id: str
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """Translate transcript to target language using GenericAgent from Echo SDK.

        Returns (translated_text, details) where details carries the LLM usage
        information for persistence on the document.
        """
        
        echo_agent_config = TranscriptTranslationAgent.create_agent_config(
            target_language
        )
        llm_config = agent_config.to_llm_config()

        agent = GenericAgent(agent_prompt=echo_agent_config, llm_config=llm_config)

        context = ConversationContext()
        context.add_message(
            Message(role=MessageRole.USER, content=[TextMessage(text=transcript)])
        )

        result = await agent.run(
            context, out_msg_id=f"{txn_id}_translate_{target_language}"
        )

        if result.llm_response is None:
            raise Exception("Agent returned no response")
        if result.llm_response.error:
            raise Exception(result.llm_response.error)

        return result.llm_response.text, result.llm_response.details

    @staticmethod
    async def translate_multiple(
        transcript: str,
        target_languages: List[str],
        agent_config: LLMAgentConfig,
        txn_id: str,
    ) -> Dict[str, str]:
        """
        Translate transcript to multiple languages.
        Returns dict with language codes as keys and translations as values.
        """
        tasks = {
            lang: TranscriptTranslationAgent.translate(
                transcript=transcript,
                target_language=lang,
                agent_config=agent_config,
                txn_id=txn_id,
            )
            for lang in target_languages
        }
        results = {}
        for lang, task in tasks.items():
            try:
                translated_text, _details = await task
                results[lang] = translated_text
            except Exception as e:
                pass

        return results


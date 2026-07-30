"""
Langfuse prompt service: fetch prompts by name (production label) and compile variables at runtime.
Supports single-prompt-per-agent with section tags; parses into ParsedAgentPrompt for PersonaConfig/TaskConfig.
When Langfuse is unavailable or fetch fails, falls back to reading prompt from voice2rx/agents/prompts/{name}.md.
"""

import os
from typing import Any, Optional

from logs.custom_logger import get_logger

from .prompt_fallback import load_parsed_prompt_from_file
from .prompt_parser import ParsedAgentPrompt, parse_agent_prompt

logger = get_logger(__name__)

# single prompt per agent (one prompt with sections; backend parses and maps to persona + task)
# if pormt not found in langfuse fallback to the static prompt files.
AGENT_PROMPT_NAMES = {
    "template_generation": "template_generation_prompt-voice2rx",
    "template_integration": "integration_prompt-voice2rx",
    "template_markdown": "template_markdown_prompt-voice2rx",
    "transcript": "transcript_prompt-voice2rx",
    "translation": "translation_prompt-voice2rx",
    "medication": "medication_prompt-voice2rx",
    "summary": "summary_prompt-voice2rx",
    "agentic_ui": "agentic_ui_system_prompt",
    "agentic_ui_v2": "agentic_ui_system_prompt_v2",
    "template_authoring": "template_authoring_prompt-voice2rx",
    "meeting_notes": "meeting_notes_system_prompt",
}


def _is_langfuse_configured() -> bool:
    return bool(
        os.getenv("LANGFUSE_SECRET_KEY")
        and os.getenv("LANGFUSE_PUBLIC_KEY")
        and os.getenv("LANGFUSE_BASE_URL")
    )


def _use_langfuse_prompts() -> bool:
    if not _is_langfuse_configured():
        return False
    return os.getenv("USE_LANGFUSE_PROMPTS", "true").lower() in ("true", "1", "yes")


class LangfusePromptService:
    """
    Fetches prompts from Langfuse by name with label 'production' and compiles variables at runtime.
    Falls back to returning None so callers can use in-code prompts when Langfuse is disabled or fetch fails.
    """

    def __init__(
        self,
        label: Optional[str] = None,
        cache_ttl_seconds: int = 60,
    ):
        self._label = label or os.getenv("LANGFUSE_PROMPT_LABEL", "production")
        if os.getenv("ENV") != "prod":
            self._label = "stage"
        self._cache_ttl = cache_ttl_seconds
        self._client = None

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            from langfuse import Langfuse

            self._client = Langfuse(
                secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
                public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
                base_url=os.getenv("LANGFUSE_BASE_URL"),
            )
            return self._client
        except Exception as e:
            logger.warning(
                "Langfuse client init failed, prompts will use fallback",
                error=str(e),
                severity="medium",
            )
            return None

    def is_enabled(self) -> bool:
        return _use_langfuse_prompts()

    def _get_langfuse_prompt(self, prompt_name: str):
        """Fetch a prompt from Langfuse by full name. Returns prompt object or None."""
        client = self._get_client()
        if not client:
            return None
        try:
            return client.get_prompt(
                prompt_name,
                label=self._label,
                cache_ttl_seconds=self._cache_ttl,
            )
        except Exception as e:
            logger.warning(
                "Langfuse get_prompt failed, using file fallback",
                prompt_name=prompt_name,
                error=str(e),
                severity="medium",
            )
            return None

    def compile_prompt(self, prompt, **variables: Any) -> Optional[str]:
        """
        Compile a Langfuse prompt with the given variables (e.g. date=..., schema=..., language_name=...).
        Returns the compiled string, or None if prompt is None or compile fails.
        """
        if prompt is None:
            return None
        try:
            compiled = prompt.compile(**variables)
            if isinstance(compiled, str):
                return compiled
            if isinstance(compiled, list) and len(compiled) > 0:
                for msg in compiled:
                    if isinstance(msg, dict) and msg.get("content"):
                        return msg["content"]
                return None
            return str(compiled) if compiled is not None else None
        except Exception as e:
            logger.warning(
                "Langfuse prompt compile failed",
                error=str(e),
                severity="medium",
            )
            return None

    def get_compiled_prompt(
        self, prompt_name: str, **variables: Any
    ) -> Optional[str]:
        if not self.is_enabled():
            return None
        prompt_obj = self._get_langfuse_prompt(prompt_name)
        if prompt_obj is None:
            return None
        compiled = self.compile_prompt(prompt_obj, **variables)
        return compiled or None

    def get_parsed_agent_prompt(
        self, agent_key: str, response_type: str = "markdown", **variables: Any
    ) -> ParsedAgentPrompt:
        """
        Get the parsed agent prompt: try Langfuse first, then fall back to voice2rx/agents/prompts/{name}.md.
        Variables (e.g. date, schema, language_name) are substituted in the prompt text.
        Raises FileNotFoundError if neither Langfuse nor file fallback returns usable content.
        """
        prompt_name = AGENT_PROMPT_NAMES.get(agent_key, agent_key)
        parsed: Optional[ParsedAgentPrompt] = None

        if self.is_enabled():
            prompt_obj = self._get_langfuse_prompt(prompt_name)
            if prompt_obj is not None:
                compiled = self.compile_prompt(prompt_obj, **variables)
                if compiled:
                    parsed = parse_agent_prompt(compiled)
                    if parsed and any(
                        [
                            parsed.identity,
                            parsed.goal,
                            parsed.backstory,
                            parsed.task_instructions,
                            parsed.user_prompt,
                        ]
                    ):
                        return parsed

        parsed = load_parsed_prompt_from_file(prompt_name, **variables)
        if parsed is not None:
            return parsed

        raise FileNotFoundError(
            f"Prompt not found for agent '{agent_key}' (Langfuse failed and fallback file missing or invalid: "
            f"voice2rx/agents/prompts/{prompt_name.replace('/', '_')}.md)"
        )


_prompt_service: Optional[LangfusePromptService] = None

def get_prompt_service() -> LangfusePromptService:
    global _prompt_service
    if _prompt_service is None:
        _prompt_service = LangfusePromptService()
    return _prompt_service

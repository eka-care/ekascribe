"""
File-based fallback for agent prompts when Langfuse is unavailable or fetch fails.
Reads prompt content from voice2rx/agents/prompts/{prompt_name}.md (prompt name with / replaced by _).
Substitutes {{variable_name}} with provided kwargs and parses sections.
"""

from pathlib import Path
from typing import Any, Optional

from logs.custom_logger import get_logger

from .prompt_parser import ParsedAgentPrompt, parse_agent_prompt

logger = get_logger(__name__)

# Directory containing .md prompt files (voice2rx/agents/prompts)
_PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "agents" / "prompts"


def _prompt_name_to_filename(prompt_name: str) -> str:
    """Convert e.g. voice2rx/template_generation/agent -> voice2rx_template_generation_agent.md"""
    return prompt_name.replace("/", "_") + ".md"


def _substitute_variables(raw: str, **variables: Any) -> str:
    """Replace {{var_name}} with values. Uses double curly braces as in Langfuse."""
    result = raw
    for key, value in variables.items():
        placeholder = "{{" + key + "}}"
        result = result.replace(placeholder, str(value) if value is not None else "")
    return result


def load_parsed_prompt_from_file(
    prompt_name: str, **variables: Any
) -> Optional[ParsedAgentPrompt]:
    """
    Load prompt content from voice2rx/agents/prompts/{prompt_name}.md, substitute variables, parse sections.
    Returns ParsedAgentPrompt or None if file not found or parse yields no content.
    """
    filename = _prompt_name_to_filename(prompt_name)
    path = _PROMPTS_DIR / filename
    if not path.is_file():
        logger.warning("Prompt fallback file not found", path=str(path), prompt_name=prompt_name, severity="medium")
        return None
    try:
        raw = path.read_text(encoding="utf-8")
    except Exception as e:
        logger.warning(
            "Failed to read prompt fallback file",
            path=str(path),
            error=str(e),
            severity="medium",
        )
        return None
    compiled = _substitute_variables(raw, **variables)
    parsed = parse_agent_prompt(compiled)
    if not any(
        [
            parsed.identity,
            parsed.goal,
            parsed.backstory,
            parsed.task_instructions,
            parsed.user_prompt,
        ]
    ):
        logger.warning(
            "Parsed file prompt has no identity/goal/backstory/task_instructions/user_prompt",
            prompt_name=prompt_name,
            severity="medium",
        )
        return None
    return parsed

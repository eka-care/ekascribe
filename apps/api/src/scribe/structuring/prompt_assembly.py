from typing import List, Optional

from echo import AgentConfig as EchoAgentConfig, PersonaConfig, TaskConfig
from scribe.core.custom_logger import get_logger

from scribe.prompts import get_prompt_service

from .tools.catalog import ToolSpec, get_tool_catalog

logger = get_logger(__name__)

def build_scribe_agent_config_v2(
    template_prompt: str,
    *,
    tool_specs: List[ToolSpec],
    date: Optional[str] = None,
) -> EchoAgentConfig:
    tools_available = get_tool_catalog().render_tools_available(tool_specs)
    tool_names = " / ".join(spec.name for spec in tool_specs)
    parsed = get_prompt_service().get_parsed_agent_prompt(
        "agentic_ui_v2",
        user_prompt=template_prompt.strip(),
        tools_available=tools_available,
        tool_names=tool_names,
        date=date or "not specified",
    )

    description_parts: list[str] = []
    if parsed.goal:
        description_parts.append(parsed.goal.strip())
    if parsed.approach:
        description_parts.append(parsed.approach.strip())
    elif parsed.task_instructions:
        description_parts.append(parsed.task_instructions.strip())
    if parsed.guardrails:
        description_parts.append(
            "<guardrails>\n" + parsed.guardrails.strip() + "\n</guardrails>"
        )
    elif parsed.scope_boundary:
        description_parts.append(
            "<guardrails>\n" + parsed.scope_boundary.strip() + "\n</guardrails>"
        )
    
    if not parsed.guardrails or not parsed.approach:
        logger.warning(
            "agentic_ui_v2 prompt is missing v2 sections; check the prompt file",
            has_approach=bool(parsed.approach),
            has_guardrails=bool(parsed.guardrails),
        )
    description_parts.append(
        "<doctor_template>\n"
        + (parsed.user_prompt or template_prompt).strip()
        + "\n</doctor_template>"
    )
    description_parts.append(
        "<tools>\n"
        + (parsed.tools_available or tools_available).strip()
        + "\n</tools>"
    )
    expected_output = (parsed.expected_output_for("markdown") or "").strip()
    if not expected_output and len(tool_specs) > 1:
        # Default anchor when the prompt file carries no expected_output and
        # structured tools are in play: reinforce tools-only output.
        expected_output = (
            f"Your ENTIRE response is tool calls ({tool_names}). Zero free "
            "text, zero preambles, zero summaries, zero questions — NEVER ask "
            "for more information. One call per template section with "
            "supporting data; arguments in the order: key, display_name, "
            "order, payload."
        )
    return EchoAgentConfig(
        persona=PersonaConfig(role=parsed.role(), goal="", backstory=""),
        task=TaskConfig(
            description="\n\n".join(description_parts),
            expected_output=expected_output,
        ),
    )

#  this is getting used only for meeting notes now.
def build_ag_ui_agent_config(
    template_prompt: str,
    *,
    date: Optional[str] = None,
    additional_instructions: Optional[str] = None,
    prompt_key: str = "agentic_ui",
) -> EchoAgentConfig:
    parsed = get_prompt_service().get_parsed_agent_prompt(
      prompt_key
    )

    role = parsed.role()
    goal = (parsed.goal or "").strip()
    backstory = parsed.full_backstory()

    description_parts: list[str] = []
    if parsed.task_instructions:
        description_parts.append(parsed.task_instructions.strip())
    description_parts.append(
        "<doctor_template>\n" + template_prompt.strip() + "\n</doctor_template>"
    )

    epilogue: list[str] = []
    if date:
        epilogue.append(f"Today's date is {date}.")
    if additional_instructions:
        epilogue.append(additional_instructions.strip())
    if epilogue:
        description_parts.append("## Run context\n\n" + "\n\n".join(epilogue))

    description = "\n\n".join(description_parts)
    expected_output = (parsed.expected_output_for("markdown") or "").strip()

    return EchoAgentConfig(
        persona=PersonaConfig(role=role, goal=goal, backstory=backstory),
        task=TaskConfig(description=description, expected_output=expected_output),
    )

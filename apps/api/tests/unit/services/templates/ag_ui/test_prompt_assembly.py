"""Tests for the AG-UI scribe EchoAgentConfig assembler."""

from unittest.mock import MagicMock, patch

import pytest

from voice2rx.services.prompts.prompt_parser import ParsedAgentPrompt
from voice2rx.services.templates.ag_ui.prompt_assembly import (
    build_ag_ui_agent_config,
)


def _fake_parsed() -> ParsedAgentPrompt:
    return ParsedAgentPrompt(
        identity="You are a clinical scribe.",
        goal="Emit one tool call per template section with data.",
        backstory="Medical scribe with deep knowledge of structured notes.",
        scope_boundary="Hard invariants: do not fabricate.",
        task_instructions=(
            "Tool selection by shape: add_list, add_table, add_key_value, "
            "add_narrative. Stream key, display_name, order, payload in order."
        ),
        expected_output_markdown=(
            "Your ENTIRE response is tool calls. Zero free text."
        ),
        communication_style="Third person, concise.",
    )


def _patched_service(parsed: ParsedAgentPrompt):
    svc = MagicMock()
    svc.get_parsed_agent_prompt.return_value = parsed
    return patch(
        "voice2rx.services.templates.ag_ui.prompt_assembly.get_prompt_service",
        return_value=svc,
    )


def test_persona_fields_come_from_parsed_sections():
    with _patched_service(_fake_parsed()):
        cfg = build_ag_ui_agent_config("Emit Vitals then Diagnosis.")
    assert cfg.persona.role == "You are a clinical scribe."
    assert cfg.persona.goal == "Emit one tool call per template section with data."
    # full_backstory() concatenates backstory + scope_boundary + communication_style
    assert "Medical scribe with deep knowledge" in cfg.persona.backstory
    assert "Hard invariants" in cfg.persona.backstory
    assert "Third person" in cfg.persona.backstory


def test_task_description_includes_task_instructions_then_doctor_template():
    with _patched_service(_fake_parsed()):
        cfg = build_ag_ui_agent_config("Emit Vitals then Diagnosis.")
    desc = cfg.task.description
    instr_idx = desc.find("Tool selection by shape")
    tmpl_idx = desc.find("<doctor_template>")
    assert 0 <= instr_idx < tmpl_idx, (
        "task_instructions must precede the doctor template so the cacheable "
        "prefix stays stable across runs"
    )
    assert "Emit Vitals then Diagnosis." in desc
    assert "</doctor_template>" in desc


def test_expected_output_uses_markdown_section():
    with _patched_service(_fake_parsed()):
        cfg = build_ag_ui_agent_config("Foo.")
    assert cfg.task.expected_output == (
        "Your ENTIRE response is tool calls. Zero free text."
    )


def test_all_four_tool_names_land_in_task_description():
    with _patched_service(_fake_parsed()):
        cfg = build_ag_ui_agent_config("Foo.")
    for tool_name in ("add_list", "add_table", "add_key_value", "add_narrative"):
        assert tool_name in cfg.task.description, (
            f"missing {tool_name} in task description"
        )


def test_date_lands_in_run_context_after_doctor_template():
    with _patched_service(_fake_parsed()):
        cfg = build_ag_ui_agent_config("Foo.", date="2026-05-11")
    desc = cfg.task.description
    assert "Today's date is 2026-05-11." in desc
    assert "Run context" in desc
    tmpl_idx = desc.find("</doctor_template>")
    ctx_idx = desc.find("Run context")
    assert 0 <= tmpl_idx < ctx_idx, "run context must follow the doctor template"


def test_run_context_omitted_when_no_extras():
    with _patched_service(_fake_parsed()):
        cfg = build_ag_ui_agent_config("Foo.")
    assert "Run context" not in cfg.task.description


def test_additional_instructions_appended():
    with _patched_service(_fake_parsed()):
        cfg = build_ag_ui_agent_config(
            "Foo.", additional_instructions="Be terse."
        )
    assert "Be terse." in cfg.task.description
    assert "Run context" in cfg.task.description


def test_raises_when_langfuse_unavailable():
    """Langfuse miss + no fallback file → FileNotFoundError bubbles up
    from the shared get_parsed_agent_prompt path."""
    svc = MagicMock()
    svc.get_parsed_agent_prompt.side_effect = FileNotFoundError(
        "Prompt not found for agent 'agentic_ui'"
    )
    with patch(
        "voice2rx.services.templates.ag_ui.prompt_assembly.get_prompt_service",
        return_value=svc,
    ):
        with pytest.raises(FileNotFoundError, match="agentic_ui"):
            build_ag_ui_agent_config("Foo.")

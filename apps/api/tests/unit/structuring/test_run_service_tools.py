"""Tests for template-driven tool selection in build_scribe_run_components."""

from unittest.mock import MagicMock, patch

import pytest

from scribe.prompts.prompt_parser import ParsedAgentPrompt
from scribe.structuring.run_service import (
    ResolvedRunInputs,
    build_scribe_run_components,
)
from scribe.structuring.tools.generic import NAME_TO_TOOL


def _inputs(**overrides) -> ResolvedRunInputs:
    fields = dict(
        b_id="biz-1",
        txn_id="txn-1",
        document_id="doc-1",
        template_id="tmpl-1",
        s3_url="s3://bucket/key",
        transcript="Patient reports fever.",
        template_prompt="Emit Vitals then Diagnosis.",
    )
    fields.update(overrides)
    return ResolvedRunInputs(**fields)


def _fake_parsed() -> ParsedAgentPrompt:
    return ParsedAgentPrompt(
        identity="a clinical scribe agent.",
        goal="Emit one call per section.",
        approach="Read template, pick tool.",
        guardrails="Only template sections.",
        user_prompt="Emit Vitals then Diagnosis.",
        tools_available="rendered tools",
    )


def _patched_prompt_service():
    svc = MagicMock()
    svc.get_parsed_agent_prompt.return_value = _fake_parsed()
    return patch(
        "scribe.structuring.prompt_assembly.get_prompt_service",
        return_value=svc,
    ), svc


@pytest.mark.parametrize("available_tools", [None, "all"])
def test_all_tools_registered_for_none_or_all(available_tools):
    patcher, _ = _patched_prompt_service()
    with patcher:
        agent, _, _ = build_scribe_run_components(
            _inputs(available_tools=available_tools)
        )
    assert [t.name for t in agent.tools] == list(NAME_TO_TOOL)


def test_empty_string_registers_narrative_only():
    patcher, _ = _patched_prompt_service()
    with patcher:
        agent, _, _ = build_scribe_run_components(_inputs(available_tools=""))
    assert [t.name for t in agent.tools] == ["add_narrative"]


def test_subset_registers_named_tools_plus_narrative():
    patcher, _ = _patched_prompt_service()
    with patcher:
        agent, _, _ = build_scribe_run_components(
            _inputs(available_tools="add_list,add_table")
        )
    assert set(t.name for t in agent.tools) == {
        "add_list",
        "add_table",
        "add_narrative",
    }


def test_non_meeting_notes_uses_v2_prompt_key():
    patcher, svc = _patched_prompt_service()
    with patcher:
        build_scribe_run_components(_inputs(available_tools="add_list"))
    assert svc.get_parsed_agent_prompt.call_args.args == ("agentic_ui_v2",)


def test_meeting_notes_path_untouched():
    """*_meeting_notes templates keep the legacy prompt key and single tool,
    ignoring available_tools entirely."""
    patcher, svc = _patched_prompt_service()
    with patcher:
        agent, _, _ = build_scribe_run_components(
            _inputs(template_id="team_meeting_notes", available_tools="add_list")
        )
    assert [t.name for t in agent.tools] == ["add_meeting_note"]
    assert svc.get_parsed_agent_prompt.call_args.args == ("meeting_notes",)


def test_state_and_context_carry_run_identifiers():
    patcher, _ = _patched_prompt_service()
    with patcher:
        agent, ctx, state = build_scribe_run_components(_inputs())
    assert state.template_id == "tmpl-1"
    assert ctx.system_context["tool_context"]["scribe_state"] is state
    assert ctx.system_context["tool_context"]["document_id"] == "doc-1"

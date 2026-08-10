"""Tests for build_scribe_run_components: every run gets the full toolset."""

from unittest.mock import MagicMock, patch

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
        identity="a session scribe agent.",
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


def test_every_run_registers_the_full_toolset():
    patcher, _ = _patched_prompt_service()
    with patcher:
        agent, _, _ = build_scribe_run_components(_inputs())
    assert [t.name for t in agent.tools] == list(NAME_TO_TOOL)


def test_uses_v2_prompt_key():
    patcher, svc = _patched_prompt_service()
    with patcher:
        build_scribe_run_components(_inputs())
    assert svc.get_parsed_agent_prompt.call_args.args == ("agentic_ui_v2",)


def test_meeting_notes_template_gets_same_generic_flow():
    """No special-casing by template id — a meeting-notes template runs the
    same generic prompt + full toolset as any other template."""
    patcher, svc = _patched_prompt_service()
    with patcher:
        agent, _, _ = build_scribe_run_components(
            _inputs(template_id="team_meeting_notes")
        )
    assert [t.name for t in agent.tools] == list(NAME_TO_TOOL)
    assert svc.get_parsed_agent_prompt.call_args.args == ("agentic_ui_v2",)


def test_state_and_context_carry_run_identifiers():
    patcher, _ = _patched_prompt_service()
    with patcher:
        agent, ctx, state = build_scribe_run_components(_inputs())
    assert state.template_id == "tmpl-1"
    assert ctx.system_context["tool_context"]["scribe_state"] is state
    assert ctx.system_context["tool_context"]["document_id"] == "doc-1"

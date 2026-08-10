"""Tests for the v2 EchoAgentConfig assembler (full toolset era)."""

from unittest.mock import MagicMock, patch

import pytest

from scribe.prompts.prompt_files import load_parsed_prompt_from_file
from scribe.prompts.prompt_parser import ParsedAgentPrompt
from scribe.structuring.prompt_assembly import (
    build_scribe_agent_config_v2,
)
from scribe.structuring.tools.catalog import ToolCatalog


_CATALOG = ToolCatalog()


def _specs(*names):
    """Subset of the full catalog by tool name (assembler accepts any list)."""
    return [s for s in _CATALOG.all_specs() if s.name in names]


def _narrative_only():
    return _specs("add_narrative")


def _fake_parsed(**overrides) -> ParsedAgentPrompt:
    fields = dict(
        identity="a session scribe agent.",
        goal="Emit one tool call per template section with data.",
        approach="1. Read the template. 2. Pick a tool. Today's date is 2026-07-11.",
        guardrails="Emit ONLY sections mentioned in the user's template.",
        user_prompt="Emit Vitals then Diagnosis.",
        tools_available="### add_narrative\nEmit prose.",
    )
    fields.update(overrides)
    return ParsedAgentPrompt(**fields)


def _patched_service(parsed: ParsedAgentPrompt):
    svc = MagicMock()
    svc.get_parsed_agent_prompt.return_value = parsed
    return patch(
        "scribe.structuring.prompt_assembly.get_prompt_service",
        return_value=svc,
    ), svc


def _build(specs=None, **kwargs):
    specs = specs if specs is not None else _narrative_only()
    patcher, svc = _patched_service(kwargs.pop("parsed", _fake_parsed()))
    with patcher:
        cfg = build_scribe_agent_config_v2(
            "Emit Vitals then Diagnosis.", tool_specs=specs, **kwargs
        )
    return cfg, svc


def test_variables_threaded_into_prompt_fetch():
    specs = _CATALOG.all_specs()
    cfg, svc = _build(specs=specs, date="2026-07-11")
    args, kwargs = svc.get_parsed_agent_prompt.call_args
    assert args == ("agentic_ui_v2",)
    assert kwargs["user_prompt"] == "Emit Vitals then Diagnosis."
    assert kwargs["date"] == "2026-07-11"
    assert kwargs["tools_available"] == _CATALOG.render_tools_available(specs)


def test_missing_date_becomes_not_specified():
    _, svc = _build()
    assert svc.get_parsed_agent_prompt.call_args.kwargs["date"] == "not specified"


def test_role_comes_from_identity():
    cfg, _ = _build()
    assert cfg.persona.role == "a session scribe agent."
    assert cfg.persona.goal == ""
    assert cfg.persona.backstory == ""


def test_description_orders_goal_approach_guardrails_template_tools():
    cfg, _ = _build()
    desc = cfg.task.description
    indices = [
        desc.find("Emit one tool call per template section"),
        desc.find("1. Read the template."),
        desc.find("<guardrails>"),
        desc.find("<user_template>"),
        desc.find("<tools>"),
    ]
    assert all(i >= 0 for i in indices), f"missing part: {indices}"
    assert indices == sorted(indices), (
        "description must order goal → approach → guardrails → user "
        "template → tools so the cacheable prefix stays stable"
    )


def test_user_template_and_tools_wrapped_in_tags():
    cfg, _ = _build()
    desc = cfg.task.description
    assert "<user_template>\nEmit Vitals then Diagnosis.\n</user_template>" in desc
    assert "### add_narrative" in desc
    assert "</tools>" in desc


def test_expected_output_empty_for_single_tool_so_echo_skips_it():
    cfg, _ = _build()
    assert cfg.task.expected_output == ""


def test_expected_output_default_anchor_for_full_toolset():
    parsed = _fake_parsed()
    cfg, _ = _build(specs=_CATALOG.all_specs(), parsed=parsed)
    assert "ENTIRE response is tool calls" in cfg.task.expected_output


def test_falls_back_to_inputs_when_parser_drops_variables():
    """If the prompt file forgot the <user_prompt>/<tools_available> tags,
    the compiled variables are still injected from the local inputs."""
    specs = _narrative_only()
    parsed = _fake_parsed(user_prompt=None, tools_available=None)
    cfg, _ = _build(specs=specs, parsed=parsed)
    desc = cfg.task.description
    assert "Emit Vitals then Diagnosis." in desc
    assert _CATALOG.render_tools_available(specs) in desc


def test_prompt_fetch_error_propagates():
    svc = MagicMock()
    svc.get_parsed_agent_prompt.side_effect = FileNotFoundError("agentic_ui_v2")
    with patch(
        "scribe.structuring.prompt_assembly.get_prompt_service",
        return_value=svc,
    ):
        with pytest.raises(FileNotFoundError, match="agentic_ui_v2"):
            build_scribe_agent_config_v2("Foo.", tool_specs=_narrative_only())


def test_fallback_file_parses_with_all_v2_sections():
    """The repo-bundled prompt .md must carry every v2 tag, with the
    runtime variables substituted."""
    parsed = load_parsed_prompt_from_file(
        "agentic_ui_system_prompt_v2",
        user_prompt="TEMPLATE-BODY",
        tools_available="TOOLS-BODY",
        date="2026-07-11",
    )
    assert parsed is not None
    assert parsed.identity and parsed.goal and parsed.approach
    assert parsed.guardrails and "ONLY sections" in parsed.guardrails
    assert parsed.user_prompt == "TEMPLATE-BODY"
    assert parsed.tools_available == "TOOLS-BODY"
    assert "2026-07-11" in parsed.approach
    assert "{{" not in (parsed.approach + parsed.user_prompt + parsed.tools_available)

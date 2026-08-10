"""Tests for the tool catalog (full default toolset on every run)."""

import pytest

from scribe.structuring.tools.catalog import (
    ToolCatalog,
    get_tool_catalog,
    load_tool_prompts,
)
from scribe.structuring.tools.generic import NAME_TO_TOOL


ALL_NAMES = list(NAME_TO_TOOL)


@pytest.fixture(scope="module")
def catalog() -> ToolCatalog:
    return ToolCatalog()


# ---------------------------------------------------------------- YAML sanity

def test_yaml_parses_and_matches_registry():
    config = load_tool_prompts()
    assert set(config.tools) == set(NAME_TO_TOOL)
    assert config.preamble.strip()
    assert config.fallback_rule.strip()
    assert config.mandatory_selection_header.strip()


def test_yaml_routes_away_targets_are_known_tools():
    config = load_tool_prompts()
    for name, entry in config.tools.items():
        for route in entry.routes_away:
            assert route.tool in NAME_TO_TOOL, (
                f"{name} routes_away to unknown tool {route.tool!r}"
            )
            assert route.tool != name


def test_no_tool_declares_mandatory_content():
    # The generic tool set has no content-mandated tools; the mandatory
    # section must therefore never render.
    config = load_tool_prompts()
    assert not any(entry.mandatory_content for entry in config.tools.values())


# ------------------------------------------------------------------ all_specs

def test_all_specs_returns_every_tool_in_registry_order(catalog):
    assert [s.name for s in catalog.all_specs()] == ALL_NAMES


def test_all_specs_carry_prompt_entries(catalog):
    for spec in catalog.all_specs():
        assert spec.prompt.summary.strip()
        assert spec.prompt.when_to_use.strip()


# ---------------------------------------------------------------- rendering

def test_render_includes_preamble_fallback_and_every_tool(catalog):
    text = catalog.render_tools_available(catalog.all_specs())
    config = load_tool_prompts()
    assert config.preamble.strip() in text
    assert config.fallback_rule.strip() in text
    for name in ALL_NAMES:
        assert f"### {name}" in text


def test_render_never_includes_mandatory_section(catalog):
    # No generic tool declares mandatory_content, so the mandatory section
    # must not render.
    text = catalog.render_tools_available(catalog.all_specs())
    assert "Mandatory tool selection" not in text


def test_render_keeps_cross_references(catalog):
    # With the full set enabled, routes_away redirects stay in the text.
    text = catalog.render_tools_available(catalog.all_specs())
    assert "use add_table" in text


def test_render_is_deterministic(catalog):
    a = catalog.render_tools_available(catalog.all_specs())
    b = catalog.render_tools_available(catalog.all_specs())
    assert a == b


# -------------------------------------------------------------- instantiate

def test_instantiate_returns_tool_instances_in_order(catalog):
    specs = catalog.all_specs()
    tools = catalog.instantiate(specs)
    assert [t.name for t in tools] == [s.name for s in specs]


def test_instantiate_full_set_keeps_cross_references(catalog):
    tools = catalog.instantiate(catalog.all_specs())
    lst = next(t for t in tools if t.name == "add_list")
    assert "add_table" in lst.description


def test_get_tool_catalog_is_singleton():
    assert get_tool_catalog() is get_tool_catalog()

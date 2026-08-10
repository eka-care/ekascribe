"""Tests for the template-driven tool catalog (available_tools semantics)."""

import pytest

from scribe.structuring.tools.catalog import (
    NARRATIVE_TOOL_NAME,
    ToolCatalog,
    get_tool_catalog,
    load_tool_prompts,
    validate_available_tools,
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


# ------------------------------------------------------------------- resolve

def test_resolve_none_returns_all_tools(catalog):
    assert [s.name for s in catalog.resolve(None)] == ALL_NAMES


@pytest.mark.parametrize("value", ["all", "ALL", " All "])
def test_resolve_all_variants_return_all_tools(catalog, value):
    assert [s.name for s in catalog.resolve(value)] == ALL_NAMES


def test_resolve_empty_string_returns_narrative_only(catalog):
    assert [s.name for s in catalog.resolve("")] == [NARRATIVE_TOOL_NAME]


def test_resolve_subset_returns_named_plus_narrative(catalog):
    specs = catalog.resolve("add_list,add_table")
    assert set(s.name for s in specs) == {
        "add_list",
        "add_table",
        NARRATIVE_TOOL_NAME,
    }


def test_resolve_orders_by_canonical_registry_order(catalog):
    specs = catalog.resolve("add_key_value, add_list, add_table")
    names = [s.name for s in specs]
    assert names == [n for n in ALL_NAMES if n in set(names)]


def test_resolve_ignores_unknown_names(catalog):
    specs = catalog.resolve("add_list,add_bogus_tool")
    assert set(s.name for s in specs) == {"add_list", NARRATIVE_TOOL_NAME}


def test_resolve_dedupes_and_normalizes_case(catalog):
    specs = catalog.resolve("ADD_LIST, add_list ,Add_List")
    assert [s.name for s in specs if s.name == "add_list"] == ["add_list"]


# ---------------------------------------------------- validate_available_tools

def test_validate_none_passthrough():
    assert validate_available_tools(None) is None


def test_validate_all_normalizes():
    assert validate_available_tools(" ALL ") == "all"


def test_validate_empty_passthrough():
    assert validate_available_tools("") == ""
    assert validate_available_tools("   ") == ""


def test_validate_subset_normalizes_to_canonical_order():
    result = validate_available_tools("add_narrative, ADD_LIST,add_list")
    assert result == "add_list,add_narrative"


def test_validate_rejects_unknown_names():
    with pytest.raises(ValueError, match="add_bogus"):
        validate_available_tools("add_list,add_bogus")


# ---------------------------------------------------------------- rendering

def test_render_includes_preamble_fallback_and_enabled_tools(catalog):
    specs = catalog.resolve("add_list")
    text = catalog.render_tools_available(specs)
    config = load_tool_prompts()
    assert config.preamble.strip() in text
    assert config.fallback_rule.strip() in text
    assert "### add_list" in text
    assert "### add_narrative" in text
    assert "### add_table" not in text


def test_render_never_includes_mandatory_section(catalog):
    # No generic tool declares mandatory_content, so the mandatory section
    # must not render for any tool set.
    all_text = catalog.render_tools_available(catalog.resolve(None))
    assert "Mandatory tool selection" not in all_text

    subset_text = catalog.render_tools_available(catalog.resolve("add_list"))
    assert "Mandatory tool selection" not in subset_text


def test_render_filters_routes_away_to_enabled_targets(catalog):
    specs = catalog.resolve("add_list,add_table")
    text = catalog.render_tools_available(specs)
    # add_list routes records-shaped content to add_table (enabled)...
    assert "use add_table" in text
    # ...but never mentions tools disabled for the run.
    assert "add_key_value" not in text


def test_render_full_set_lists_every_tool(catalog):
    text = catalog.render_tools_available(catalog.resolve("all"))
    for name in ("add_list", "add_table", "add_key_value", "add_narrative"):
        assert f"### {name}" in text


def test_render_is_deterministic_for_same_set(catalog):
    a = catalog.render_tools_available(catalog.resolve("add_table,add_list"))
    b = catalog.render_tools_available(catalog.resolve("add_list , add_table"))
    assert a == b


# -------------------------------------------------------------- instantiate

def test_instantiate_returns_tool_instances_in_order(catalog):
    specs = catalog.resolve("add_list,add_table")
    tools = catalog.instantiate(specs)
    assert [t.name for t in tools] == [s.name for s in specs]


def test_instantiate_descriptions_never_mention_disabled_tools(catalog):
    specs = catalog.resolve("add_list")
    for tool in catalog.instantiate(specs):
        for disabled in set(NAME_TO_TOOL) - {"add_list", NARRATIVE_TOOL_NAME}:
            assert disabled not in tool.description


def test_instantiate_full_set_keeps_cross_references(catalog):
    tools = catalog.instantiate(catalog.resolve(None))
    lst = next(t for t in tools if t.name == "add_list")
    assert "add_table" in lst.description


def test_get_tool_catalog_is_singleton():
    assert get_tool_catalog() is get_tool_catalog()

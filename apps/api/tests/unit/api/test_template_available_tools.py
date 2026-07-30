"""Tests for the available_tools field on template CRUD schemas."""

import pytest
from pydantic import ValidationError

from voice2rx.api.schemas.template_schema import (
    TemplateCreate,
    TemplateResponse,
    TemplateUpdate,
    TemplateUpdateModel,
)


def _create(**kwargs):
    return TemplateCreate(title="T", section_ids=[], **kwargs)


def test_create_defaults_to_none():
    assert _create().available_tools is None


def test_create_accepts_all_and_normalizes():
    assert _create(available_tools=" ALL ").available_tools == "all"


def test_create_accepts_empty_string():
    assert _create(available_tools="").available_tools == ""


def test_create_normalizes_subset_to_canonical_order():
    t = _create(available_tools="add_narrative, ADD_LIST")
    assert t.available_tools == "add_list,add_narrative"


def test_create_rejects_unknown_tool_names():
    with pytest.raises(ValidationError, match="add_bogus"):
        _create(available_tools="add_list,add_bogus")


def test_update_validates_and_none_means_unchanged():
    assert TemplateUpdate().available_tools is None
    assert TemplateUpdate(available_tools="add_table").available_tools == "add_table"
    with pytest.raises(ValidationError, match="Unknown tools"):
        TemplateUpdate(available_tools="nope")


def test_update_model_keeps_empty_string_but_drops_none():
    """'' (narrative only) must survive the exclude_none dump used to build
    the Dynamo SET expression, while None means 'do not touch'."""
    dumped = TemplateUpdateModel(available_tools="").model_dump(exclude_none=True)
    assert dumped["available_tools"] == ""

    dumped = TemplateUpdateModel().model_dump(exclude_none=True)
    assert "available_tools" not in dumped


def test_response_carries_available_tools():
    resp = TemplateResponse(
        id="t1",
        title="T",
        desc="",
        section_ids=[],
        default=False,
        is_favorite=False,
        available_tools="add_list,add_narrative",
    )
    assert resp.available_tools == "add_list,add_narrative"

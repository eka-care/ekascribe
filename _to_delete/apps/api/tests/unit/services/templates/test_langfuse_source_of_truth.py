"""
Tests for Langfuse-as-source-of-truth for markdown-only template content.

Covers:
    - hydrate_desc: Langfuse wins for markdown-only, DB cache is the fallback.
    - Reads (single + list) return the Langfuse value.
    - Update fails hard (5xx) when the Langfuse write fails.
    - Update creates a pointer when one is missing (backfill on edit).
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from voice2rx.services.templates.langfuse_template_sync import (
    LangfuseTemplateSync,
    PROMPT_DELETED,
)
from voice2rx.services.templates.template_service import TemplateService
from voice2rx.api.schemas.template_schema import TemplateUpdate


# --------------------------------------------------------------------------- #
# hydrate_desc                                                                 #
# --------------------------------------------------------------------------- #

def _sync(active: bool, fetched=None, raises: Exception = None):
    """Build a sync whose underlying compiled-fetch returns `fetched` or raises."""
    sync = LangfuseTemplateSync()
    sync.is_active = MagicMock(return_value=active)
    if raises is not None:
        sync._fetch_compiled = MagicMock(side_effect=raises)
    else:
        sync._fetch_compiled = MagicMock(return_value=fetched)
    return sync


def test_hydrate_returns_langfuse_value_for_markdown_only():
    sync = _sync(active=True, fetched="LANGFUSE CONTENT")
    template = {"desc": "db cache", "section_ids": [], "langfuse_prompt_name": "slug-id"}
    assert sync.hydrate_desc(template) == "LANGFUSE CONTENT"


def test_hydrate_falls_back_to_db_on_transient_error():
    # a non-not-found error (e.g. network/timeout) -> serve the DB cache
    sync = _sync(active=True, raises=ConnectionError("langfuse timeout"))
    template = {"desc": "db cache", "section_ids": [], "langfuse_prompt_name": "slug-id"}
    assert sync.hydrate_desc(template) == "db cache"


def test_hydrate_returns_deleted_sentinel_when_prompt_not_found():
    # a not-found error -> PROMPT_DELETED, NOT the DB cache
    sync = _sync(active=True, raises=ValueError("prompt not found: slug-id"))
    template = {"desc": "db cache", "section_ids": [], "langfuse_prompt_name": "slug-id"}
    assert sync.hydrate_desc(template) is PROMPT_DELETED


def test_hydrate_skips_section_based_templates():
    sync = _sync(active=True, fetched="should not be used")
    template = {"desc": "db cache", "section_ids": ["s1"], "langfuse_prompt_name": "slug-id"}
    assert sync.hydrate_desc(template) == "db cache"
    sync._fetch_compiled.assert_not_called()


def test_hydrate_skips_when_no_pointer():
    sync = _sync(active=True, fetched="x")
    template = {"desc": "db cache", "section_ids": []}
    assert sync.hydrate_desc(template) == "db cache"
    sync._fetch_compiled.assert_not_called()


def test_hydrate_inactive_returns_db_desc():
    sync = _sync(active=False, fetched="x")
    template = {"desc": "db cache", "section_ids": [], "langfuse_prompt_name": "slug-id"}
    assert sync.hydrate_desc(template) == "db cache"
    sync._fetch_compiled.assert_not_called()


# --------------------------------------------------------------------------- #
# read paths                                                                   #
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_get_template_by_id_hydrates_desc():
    row = {"id": "t1", "title": "T", "desc": "db cache", "section_ids": [],
           "langfuse_prompt_name": "slug-id"}
    dynamo = MagicMock()
    dynamo.get_item = AsyncMock(return_value=row)

    sync = _sync(active=True, fetched="LANGFUSE CONTENT")
    sync.build_prompt_name = MagicMock()  # unused here

    with patch(
        "voice2rx.services.templates.template_service.get_dynamo_client",
        return_value=dynamo,
    ), patch(
        "voice2rx.services.templates.template_service.get_langfuse_template_sync",
        return_value=sync,
    ):
        result = await TemplateService.get_template_by_id("t1")

    assert result["desc"] == "LANGFUSE CONTENT"


@pytest.mark.asyncio
async def test_get_template_by_id_returns_none_when_deleted_from_langfuse():
    row = {"id": "t1", "title": "T", "desc": "db cache", "section_ids": [],
           "langfuse_prompt_name": "slug-id"}
    dynamo = MagicMock()
    dynamo.get_item = AsyncMock(return_value=row)

    sync = LangfuseTemplateSync()
    sync.hydrate_desc = MagicMock(return_value=PROMPT_DELETED)

    with patch(
        "voice2rx.services.templates.template_service.get_dynamo_client",
        return_value=dynamo,
    ), patch(
        "voice2rx.services.templates.template_service.get_langfuse_template_sync",
        return_value=sync,
    ):
        result = await TemplateService.get_template_by_id("t1")

    # deleted in Langfuse (source of truth) -> no DB-cache fallback
    assert result is None


def test_get_template_sync_returns_none_when_deleted_from_langfuse():
    row = {"id": "t1", "title": "T", "desc": "db cache", "section_ids": [],
           "langfuse_prompt_name": "slug-id"}
    dynamo = MagicMock()
    dynamo.get_item = MagicMock(return_value=row)

    sync = LangfuseTemplateSync()
    sync.hydrate_desc = MagicMock(return_value=PROMPT_DELETED)

    with patch(
        "voice2rx.services.templates.template_service.DynamoHelper",
        return_value=dynamo,
    ), patch(
        "voice2rx.services.templates.template_service.get_langfuse_template_sync",
        return_value=sync,
    ):
        result = TemplateService.get_template("t1")

    assert result is None


# --------------------------------------------------------------------------- #
# update: fail-hard + backfill pointer                                         #
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_update_fails_hard_when_langfuse_write_fails():
    existing = {
        "id": "t1", "wid": "w1", "title": "T", "desc": "old",
        "section_ids": [], "langfuse_prompt_name": "slug-id",
    }
    dynamo = MagicMock()
    dynamo.get_item = AsyncMock(return_value=existing)
    dynamo.update_item = AsyncMock(return_value=True)

    sync = LangfuseTemplateSync()
    sync.is_active = MagicMock(return_value=True)
    sync.update = MagicMock(side_effect=RuntimeError("langfuse down"))

    with patch(
        "voice2rx.services.templates.template_service.get_dynamo_client",
        return_value=dynamo,
    ), patch(
        "voice2rx.services.templates.template_service.get_langfuse_template_sync",
        return_value=sync,
    ):
        with pytest.raises(RuntimeError, match="langfuse down"):
            await TemplateService.update_template(
                "t1", TemplateUpdate(desc="new content"), "w1"
            )

    # strict: Dynamo write never happened because Langfuse failed first
    dynamo.update_item.assert_not_called()


@pytest.mark.asyncio
async def test_update_backfills_pointer_when_missing():
    existing = {
        "id": "t1", "wid": "w1", "title": "T", "desc": "old",
        "section_ids": [],  # markdown-only, no langfuse_prompt_name yet
    }
    dynamo = MagicMock()
    dynamo.get_item = AsyncMock(return_value=existing)
    dynamo.update_item = AsyncMock(return_value=True)

    sync = LangfuseTemplateSync()
    sync.is_active = MagicMock(return_value=True)
    sync.create = MagicMock(return_value="t-slug-id")
    sync.update = MagicMock()

    with patch(
        "voice2rx.services.templates.template_service.get_dynamo_client",
        return_value=dynamo,
    ), patch(
        "voice2rx.services.templates.template_service.get_langfuse_template_sync",
        return_value=sync,
    ):
        await TemplateService.update_template(
            "t1", TemplateUpdate(desc="new content"), "w1"
        )

    sync.create.assert_called_once()
    sync.update.assert_not_called()
    # the new pointer is persisted to Dynamo
    _, kwargs = dynamo.update_item.call_args, dynamo.update_item.call_args.kwargs
    args = dynamo.update_item.call_args.args
    expr_values = args[3] if len(args) > 3 else kwargs.get("expression_attribute_values", {})
    assert any(v == "t-slug-id" for v in expr_values.values())

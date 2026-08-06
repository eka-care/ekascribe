"""Happy-path and error-path tests for the generic emit tools."""

import pytest

from voice2rx.services.templates.ag_ui.payloads import SectionKind
from voice2rx.services.templates.ag_ui.state import ScribeState
from voice2rx.services.templates.ag_ui.tools.generic_tools.generic import (
    KeyValueTool,
    ListTool,
    MeetingNoteTool,
    NarrativeTool,
    TableTool,
)


def _ctx(state: ScribeState) -> dict:
    return {"scribe_state": state}


@pytest.mark.asyncio
async def test_add_list_appends_section():
    state = ScribeState()
    tool = ListTool()

    result = await tool.run(
        key="action_items",
        display_name="Action Items",
        payload={"items": ["Send the revised budget.", "Book the follow-up call."]},
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert len(state.sections) == 1
    section = state.sections[0]
    assert section.key == "action_items"
    assert section.display_name == "Action Items"
    assert section.kind == SectionKind.LIST
    assert section.payload == {
        "items": ["Send the revised budget.", "Book the follow-up call."]
    }
    assert section.status.state == "ready"


@pytest.mark.asyncio
async def test_add_table_with_typed_headers():
    state = ScribeState()
    tool = TableTool()

    payload = {
        "headers": [
            {"key": "task", "label": "Task", "type": "text"},
            {"key": "owner", "label": "Owner", "type": "text"},
            {"key": "due", "label": "Due", "type": "date"},
        ],
        "rows": [
            {"task": "Draft proposal", "owner": "Asha", "due": "2026-08-20"},
            {"task": "Review contract", "owner": "Ravi", "due": "2026-08-22"},
        ],
    }

    result = await tool.run(
        key="task_assignments",
        display_name="Task Assignments",
        payload=payload,
        order=2,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.TABLE
    assert state.sections[0].payload["rows"][0]["task"] == "Draft proposal"


@pytest.mark.asyncio
async def test_add_table_rejects_unknown_header_fields():
    state = ScribeState()
    tool = TableTool()

    payload = {
        "headers": [
            {"key": "task", "label": "Task", "type": "text", "width": 12},
        ],
        "rows": [],
    }

    result = await tool.run(
        key="tasks",
        display_name="Tasks",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("Error:")
    assert state.sections == []


@pytest.mark.asyncio
async def test_add_key_value():
    state = ScribeState()
    tool = KeyValueTool()

    result = await tool.run(
        key="meeting_details",
        display_name="Meeting Details",
        payload={
            "items": [
                {"key": "Date", "value": "12 Aug 2026"},
                {"key": "Facilitator", "value": "Priya"},
            ]
        },
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.KEY_VALUE
    assert state.sections[0].payload["items"][0]["key"] == "Date"


@pytest.mark.asyncio
async def test_add_narrative():
    state = ScribeState()
    tool = NarrativeTool()

    md = (
        "The group agreed the launch slips one sprint. "
        "Main risk raised: vendor onboarding is still unsigned."
    )
    result = await tool.run(
        key="discussion_summary",
        display_name="Discussion Summary",
        payload={"markdown": md},
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.NARRATIVE
    assert state.sections[0].payload["markdown"] == md


@pytest.mark.asyncio
async def test_meeting_note_tool_is_narrative_kind():
    state = ScribeState()
    tool = MeetingNoteTool()

    result = await tool.run(
        key="context",
        display_name="Context",
        payload={"markdown": "Quarterly planning session, all leads present."},
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.NARRATIVE


@pytest.mark.asyncio
async def test_invalid_payload_returns_error_string():
    state = ScribeState()
    tool = ListTool()

    # `items` should be a list of strings, not a dict.
    result = await tool.run(
        key="action_items",
        display_name="Action Items",
        payload={"items": {"wrong": "shape"}},
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("Error:")
    assert state.sections == []


@pytest.mark.asyncio
async def test_re_emit_replaces_in_place():
    state = ScribeState()
    tool = ListTool()

    await tool.run(
        key="decisions",
        display_name="Decisions",
        payload={"items": ["First version"]},
        order=0,
        tool_context=_ctx(state),
    )
    await tool.run(
        key="decisions",
        display_name="Decisions",
        payload={"items": ["Revised"]},
        order=0,
        tool_context=_ctx(state),
    )

    assert len(state.sections) == 1
    assert state.sections[0].payload["items"] == ["Revised"]


@pytest.mark.asyncio
async def test_invalid_section_key_returns_error():
    state = ScribeState()
    tool = NarrativeTool()

    result = await tool.run(
        key="Bad Key!",
        display_name="Notes",
        payload={"markdown": "x"},
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("Error:")
    assert state.sections == []


@pytest.mark.asyncio
async def test_missing_scribe_state_returns_error():
    tool = NarrativeTool()
    result = await tool.run(
        key="notes",
        display_name="Notes",
        payload={"markdown": "x"},
        order=0,
        tool_context=None,
    )
    assert result.startswith("Error:")

"""Unit tests for the document-chat markdown section editing (Path C)."""

import asyncio

import pytest

from voice2rx.services.templates.ag_ui.chat.chat_state import ChatState
from voice2rx.services.templates.ag_ui.chat.edit_tools import (
    AddSectionTool,
    RemoveSectionTool,
    ReplaceSectionTool,
)
from voice2rx.services.templates.ag_ui.chat.markdown_ops import MarkdownDocument

SAMPLE = """\
### Chief Complaint
Headache for 3 days.

### Plan
- Rest
- Hydration

### Medications
| Drug | Dose |
| --- | --- |
| Paracetamol | 500mg |"""


# ── MarkdownDocument ────────────────────────────────────────────────────


def test_headings_parsed_in_order():
    doc = MarkdownDocument(SAMPLE)
    assert doc.headings() == ["Chief Complaint", "Plan", "Medications"]


def test_roundtrip_is_stable():
    # Parsing then rendering an already-normalized doc is idempotent.
    once = MarkdownDocument(SAMPLE).to_markdown()
    twice = MarkdownDocument(once).to_markdown()
    assert once == twice
    assert "### Plan" in once


def test_replace_existing_section_swaps_body_keeps_heading():
    doc = MarkdownDocument(SAMPLE)
    assert doc.replace_section("Plan", "- Follow up in 1 week") is True
    out = doc.to_markdown()
    assert "### Plan\n- Follow up in 1 week" in out
    assert "- Rest" not in out
    # other sections untouched
    assert "Headache for 3 days." in out
    assert "| Paracetamol | 500mg |" in out


def test_replace_is_case_insensitive_and_level_agnostic():
    doc = MarkdownDocument("## plan\nold")
    assert doc.replace_section("PLAN", "new") is True
    assert doc.to_markdown() == "## plan\nnew"


def test_replace_missing_returns_false():
    doc = MarkdownDocument(SAMPLE)
    assert doc.replace_section("Nonexistent", "x") is False


def test_add_section_appends_by_default():
    doc = MarkdownDocument(SAMPLE)
    doc.add_section("Follow Up", "See in 2 weeks.")
    assert doc.headings()[-1] == "Follow Up"
    assert doc.to_markdown().rstrip().endswith("See in 2 weeks.")


def test_add_section_after_heading():
    doc = MarkdownDocument(SAMPLE)
    doc.add_section("Allergies", "NKDA", after_title="Chief Complaint")
    assert doc.headings() == [
        "Chief Complaint",
        "Allergies",
        "Plan",
        "Medications",
    ]


def test_add_section_after_missing_falls_back_to_append():
    doc = MarkdownDocument(SAMPLE)
    doc.add_section("Allergies", "NKDA", after_title="ghost")
    assert doc.headings()[-1] == "Allergies"


def test_remove_section():
    doc = MarkdownDocument(SAMPLE)
    assert doc.remove_section("Plan") is True
    assert doc.headings() == ["Chief Complaint", "Medications"]
    assert doc.remove_section("Plan") is False


def test_preamble_before_first_heading_preserved():
    doc = MarkdownDocument("Intro line\n\n### A\nbody")
    assert doc.to_markdown() == "Intro line\n\n### A\nbody"


# ── edit tools (mutate ChatState.document_markdown) ─────────────────────


def _run(coro):
    return asyncio.run(coro)


def test_replace_tool_updates_state():
    state = ChatState(document_markdown=SAMPLE)
    ctx = {"chat_state": state}
    res = _run(ReplaceSectionTool().run(heading="Plan", markdown="- New plan", tool_context=ctx))
    assert res.startswith("ok")
    assert "- New plan" in state.document_markdown
    assert "- Rest" not in state.document_markdown


def test_replace_tool_missing_section_reports_error_with_headings():
    state = ChatState(document_markdown=SAMPLE)
    res = _run(
        ReplaceSectionTool().run(
            heading="ghost", markdown="x", tool_context={"chat_state": state}
        )
    )
    assert res.startswith("Error")
    assert "Medications" in res  # lists available headings
    assert state.document_markdown == SAMPLE  # unchanged


def test_add_tool_updates_state():
    state = ChatState(document_markdown=SAMPLE)
    res = _run(
        AddSectionTool().run(
            heading="Follow Up",
            markdown="2 weeks",
            after_heading="Plan",
            tool_context={"chat_state": state},
        )
    )
    assert res.startswith("ok")
    headings = MarkdownDocument(state.document_markdown).headings()
    assert headings == ["Chief Complaint", "Plan", "Follow Up", "Medications"]


def test_remove_tool_updates_state():
    state = ChatState(document_markdown=SAMPLE)
    res = _run(
        RemoveSectionTool().run(heading="Medications", tool_context={"chat_state": state})
    )
    assert res.startswith("ok")
    assert "Medications" not in state.document_markdown


def test_tool_missing_context_returns_error():
    res = _run(ReplaceSectionTool().run(heading="Plan", markdown="x", tool_context=None))
    assert res.startswith("Error")

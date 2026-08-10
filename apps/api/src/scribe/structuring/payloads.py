"""
Section-level data models for the AG-UI scribe state.

Four generic render kinds — LIST, TABLE, KEY_VALUE, NARRATIVE — keep the
payload surface minimal while staying expressive enough for any note
section, whatever the domain (meetings, interviews, clinical, finance).
The LLM picks the kind that best fits the template heading and fills the
payload with markdown content.

Extending this module with a new kind requires three local edits:
    1. Add the SectionKind enum value.
    2. Add the corresponding payload model (subclass of StrictModel).
    3. Add the (kind, model) entry to KIND_TO_PAYLOAD.

`tools/generic_tools/generic.py` then adds the matching tool class; the system prompt
does not change.
"""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "ColumnType",
    "KIND_TO_PAYLOAD",
    "KeyValueItem",
    "KeyValuePayload",
    "ListPayload",
    "NarrativePayload",
    "Section",
    "SectionKind",
    "SectionStatus",
    "StrictModel",
    "TableColumn",
    "TablePayload",
    "validate_section_payload",
]


class StrictModel(BaseModel):
    """Pydantic base that rejects unknown fields so LLM-emitted shape
    drift fails validation loudly rather than silently dropping data."""

    model_config = ConfigDict(extra="forbid")


# "pills" is server-populated only (medication suggestions column); the
# llm never emits it.
ColumnType = Literal["text", "markdown", "number", "date", "pills"]


ColumnType = Literal["text", "markdown", "number", "date"]


class TableColumn(StrictModel):
    """One column header in a TABLE section.

    `key` is the stable identifier referenced by row dicts. `label` is
    the human-readable header rendered in the UI. `type` hints the cell
    editor (text input, number input, date picker, or markdown editor);
    defaults to "markdown" so cells can carry rich content.
    """

    key: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(min_length=1)
    type: ColumnType = "markdown"


# drug_name carries the COMPLETE dictated product name including strength
# ("Dolo 650mg") — the catalog stores names the same way, so the whole
# string is the search query and the whole string gets replaced. dosage is
# the amount per intake ("1 tablet").
MEDICATION_REQUIRED_COLUMNS = [
    "drug_name",
    "dosage",
    "frequency",
    "duration",
    "notes",
]


def _require_medication_columns(headers: List[TableColumn], model_name: str) -> None:
    present = {h.key for h in headers}
    missing = [k for k in MEDICATION_REQUIRED_COLUMNS if k not in present]
    if missing:
        raise ValueError(
            f"{model_name}.headers is missing required medication "
            f"column key(s): {missing}. Required keys (in this order): "
            f"{MEDICATION_REQUIRED_COLUMNS}. Extra columns are "
            "allowed when the transcript supplies that data."
        )


class SectionKind(str, Enum):
    LIST = "LIST"
    TABLE = "TABLE"
    KEY_VALUE = "KEY_VALUE"
    NARRATIVE = "NARRATIVE"


class ListPayload(StrictModel):
    """Bulleted/numbered list. Each item is a markdown string — the LLM
    decides what structure (bold, links, inline code) to use per item."""

    items: List[str] = []


class TablePayload(StrictModel):
    """Tabular section. Each row is a dict keyed by `headers[*].key`."""

    headers: List[TableColumn] = []
    rows: List[Dict[str, str]] = []


class KeyValueItem(StrictModel):
    key: str = Field(min_length=1)
    value: str = ""


class KeyValuePayload(StrictModel):
    """Definition-list / detail-card section. `value` is markdown."""

    items: List[KeyValueItem] = []


class NarrativePayload(StrictModel):
    """Free-form markdown section — summary, discussion, plan, notes, etc."""

    markdown: str = ""


class SectionStatus(BaseModel):
    state: Literal[
        "pending", "extracting", "awaiting_input", "ready", "saved", "error"
    ] = "pending"
    error: Optional[str] = None


class Section(BaseModel):
    """One render unit in the note.

    `key` is the JSON Pointer anchor used in STATE_DELTA ops and must be
    a slug (lowercase + underscores). `display_name` is the heading the
    FE renders verbatim. `kind` drives both server-side payload
    validation and FE component selection. `payload` is a free-form
    dict — validate via validate_section_payload(kind, payload).
    """

    key: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    display_name: str = Field(min_length=1)
    kind: SectionKind
    payload: Dict[str, Any] = {}
    order: int = Field(ge=0)
    status: SectionStatus = SectionStatus()
    edited_by_user: bool = False


KIND_TO_PAYLOAD: Dict[SectionKind, type[BaseModel]] = {
    SectionKind.LIST: ListPayload,
    SectionKind.TABLE: TablePayload,
    SectionKind.KEY_VALUE: KeyValuePayload,
    SectionKind.NARRATIVE: NarrativePayload,
}


def validate_section_payload(kind: SectionKind, payload: Dict[str, Any]) -> BaseModel:
    """Validate `payload` against the Pydantic model for `kind`.

    Raises pydantic.ValidationError if the payload doesn't match the
    kind's schema. Tool implementations catch the error and return a
    structured string the LLM can act on.
    """
    model_cls = KIND_TO_PAYLOAD.get(kind)
    if model_cls is None:
        raise ValueError(f"No payload model registered for kind: {kind!r}")
    return model_cls.model_validate(payload)

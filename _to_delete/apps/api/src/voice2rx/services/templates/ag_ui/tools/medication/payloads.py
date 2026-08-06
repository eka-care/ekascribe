"""
Medication section payload models + the shared payload primitives.

The primitives (StrictModel / ColumnType / TableColumn) are DEFINED here
and re-exported by ag_ui/payloads.py. Reason: payloads.py (the
aggregator) imports this module for KIND_TO_PAYLOAD and its re-exports,
so this module cannot import payloads.py back — keeping the primitives
here makes this module a leaf (pydantic-only) that is safe to import in
any order, with no cycle.

Two medication models on purpose:

    MedicationTableEmitPayload  — the LLM-facing contract. Drives the
        Anthropic input_schema and validates the raw tool call. Cells are
        plain strings; the canonical five columns are required.

    MedicationTablePayload      — the state/FE-facing shape stored in the
        Section after server-side enrichment (see tool.py). Rows may
        carry non-string values (the `suggestions` pill list) plus
        enrichment keys:

            raw_name       (visible column) dictated drug name when the
                           server replaced drug_name with a catalog match,
                           '' otherwise.
            suggestions    (visible column, type "pills") up to 5
                           SuggestedPill dicts from the partner catalog.
            medication_id  (hidden — no header entry) partner code of the
                           matched catalog row, '' when unmatched.
            match_type     (hidden) "exact" | "closest" | "none".

Splitting the models keeps `suggestions`/`raw_name` out of the tool's
JSON schema so the LLM never tries to fill them.
"""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    """Pydantic base that rejects unknown fields so LLM-emitted shape
    drift fails validation loudly rather than silently dropping data."""

    model_config = ConfigDict(extra="forbid")


# "pills" is server-populated only (medication suggestions column); the
# llm never emits it.
ColumnType = Literal["text", "markdown", "number", "date", "pills"]


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


class MedicationTableEmitPayload(StrictModel):
    """LLM-emitted medication table — headers + string-celled rows.

    Same shape as TablePayload, but `headers` MUST include the five
    canonical medication columns (drug_name, dosage, frequency,
    duration, notes). The LLM is free to ADD extra columns when the
    transcript carries that data (e.g. route, brand, timing, indication);
    extras come after the canonical five in whatever order the LLM emits.
    """

    headers: List[TableColumn] = []
    rows: List[Dict[str, str]] = []

    @model_validator(mode="after")
    def _ensure_required_columns(self) -> "MedicationTableEmitPayload":
        _require_medication_columns(self.headers, "MedicationTableEmitPayload")
        return self


class SuggestedPill(StrictModel):
    """One catalog suggestion rendered as a clickable pill in the FE.

    The FE SHOWS `display_name`; every other field is hidden metadata
    (catalog identity + coding) applied to the row when the doctor picks
    the pill."""

    medication_id: str
    display_name: str
    name: str
    strength: Optional[str] = None
    generic_name: Optional[str] = None
    generic_id: Optional[str] = None
    form_name: Optional[str] = None
    form_id: Optional[str] = None
    manufacturer: Optional[str] = None
    rank: int
    score: float


class MedicationTablePayload(StrictModel):
    """Enriched medication table stored in ScribeState (see module doc).

    Rows are Dict[str, Any] because the server-added `suggestions` cell
    holds a list of SuggestedPill dicts, not a string.
    """

    headers: List[TableColumn] = []
    rows: List[Dict[str, Any]] = []

    @model_validator(mode="after")
    def _ensure_required_columns(self) -> "MedicationTablePayload":
        _require_medication_columns(self.headers, "MedicationTablePayload")
        return self

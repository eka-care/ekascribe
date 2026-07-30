"""
Lab-investigations section payload models.

Two models on purpose (same split as the medication component — see
medication/payloads.py):

    LabInvestigationsEmitPayload — the LLM-facing contract. Drives the
        Anthropic input_schema and validates the raw tool call. Cells are
        plain strings; the canonical four columns are required.

    LabInvestigationsPayload     — the state/FE-facing shape stored in the
        Section after server-side enrichment (see tool.py). Rows may
        carry non-string values (the `suggestions` pill list, catalog
        array fields) plus enrichment keys:

            raw_name     (visible column) dictated investigation text when
                         the server replaced `investigation` with a catalog
                         match, '' otherwise.
            suggestions  (visible column, type "pills") up to 5
                         SuggestedTestPill dicts from the partner catalog.
            lab_test_id / ekaid / loinc / kind / result_type / discipline /
            specimen / unit / unit_id / method / body_part / laterality /
            view / panel_members / panel_member_ids
                         (hidden — no header entry) catalog identity +
                         coding of the matched row, for downstream FHIR /
                         order creation.
            match_type   (hidden) "exact" | "closest" | "none".

Splitting the models keeps `suggestions`/`raw_name` out of the tool's
JSON schema so the LLM never tries to fill them.
"""

from typing import Any, Dict, List, Optional

from pydantic import model_validator

from ..medication.payloads import StrictModel, TableColumn
LAB_INVESTIGATIONS_REQUIRED_COLUMNS = [
    "investigation",
    "test_on",
    "repeat_on",
    "remarks",
]


def _require_lab_columns(headers: List[TableColumn], model_name: str) -> None:
    present = {h.key for h in headers}
    missing = [k for k in LAB_INVESTIGATIONS_REQUIRED_COLUMNS if k not in present]
    if missing:
        raise ValueError(
            f"{model_name}.headers is missing required column "
            f"key(s): {missing}. Required keys (in this order): "
            f"{LAB_INVESTIGATIONS_REQUIRED_COLUMNS}. Extra columns are "
            "allowed when the transcript supplies that data."
        )


class LabInvestigationsEmitPayload(StrictModel):
    """LLM-emitted lab-investigations (orders) table — headers + string
    cells. Each row is a lab test or radiology investigation ORDERED /
    advised at this visit (no result yet) — DISTINCT from LabResultsPayload,
    which carries test results WITH values. The LLM is free to ADD extra
    columns when the transcript carries that data; extras come after the
    canonical four.
    """

    headers: List[TableColumn] = []
    rows: List[Dict[str, str]] = []

    @model_validator(mode="after")
    def _ensure_required_columns(self) -> "LabInvestigationsEmitPayload":
        _require_lab_columns(self.headers, "LabInvestigationsEmitPayload")
        return self


class SuggestedTestPill(StrictModel):
    """One catalog suggestion rendered as a clickable pill in the FE.

    The FE SHOWS `display_name`; every other field is hidden metadata
    (catalog identity + coding) applied to the row when the doctor picks
    the pill."""

    lab_test_id: str
    display_name: str
    name: str
    ekaid: Optional[str] = None
    loinc: Optional[str] = None
    kind: Optional[str] = None
    result_type: Optional[str] = None
    discipline: List[str] = []
    specimen: Optional[str] = None
    unit: Optional[str] = None
    unit_id: Optional[str] = None
    method: Optional[str] = None
    body_part: Optional[str] = None
    laterality: Optional[str] = None
    view: Optional[str] = None
    panel_members: List[str] = []
    panel_member_ids: List[str] = []
    rank: int
    score: float


class LabInvestigationsPayload(StrictModel):
    """Enriched lab-investigations table stored in ScribeState (see module
    doc). Rows are Dict[str, Any] because the server-added `suggestions`
    cell holds a list of SuggestedTestPill dicts and the hidden catalog
    fields include arrays (discipline, panel_member_ids).
    """

    headers: List[TableColumn] = []
    rows: List[Dict[str, Any]] = []

    @model_validator(mode="after")
    def _ensure_required_columns(self) -> "LabInvestigationsPayload":
        _require_lab_columns(self.headers, "LabInvestigationsPayload")
        return self

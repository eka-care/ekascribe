"""
Section-level data models for the AG-UI scribe state.

Four generic render kinds — LIST, TABLE, KEY_VALUE, NARRATIVE — keep the
payload surface minimal while staying expressive enough for any clinical
note section. The LLM picks the kind that best fits the doctor-template
heading and fills the payload with markdown content.

Extending this module with a new kind requires three local edits:
    1. Add the SectionKind enum value.
    2. Add the corresponding payload model (subclass of StrictModel).
    3. Add the (kind, model) entry to KIND_TO_PAYLOAD.

`tools/generic_tools/generic.py` then adds the matching tool class; the system prompt
does not change.
"""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from .tools.medication.payloads import (
    ColumnType,
    MedicationTableEmitPayload,
    MedicationTablePayload,
    StrictModel,
    SuggestedPill,
    TableColumn,
)

from .tools.lab.payloads import (
    LabInvestigationsEmitPayload,
    LabInvestigationsPayload,
    SuggestedTestPill,
)

__all__ = [
    "ColumnType",
    "DiagnosisPayload",
    "ExaminationFindingsPayload",
    "KIND_TO_PAYLOAD",
    "KeyValueItem",
    "KeyValuePayload",
    "LabInvestigationsEmitPayload",
    "LabInvestigationsPayload",
    "LabResultsPayload",
    "ListPayload",
    "MedicationTableEmitPayload",
    "MedicationTablePayload",
    "NarrativePayload",
    "PatientMedicalHistoryPayload",
    "ProceduresPayload",
    "Section",
    "SectionKind",
    "SectionStatus",
    "StrictModel",
    "SuggestedPill",
    "SuggestedTestPill",
    "TableColumn",
    "TablePayload",
    "VitalTablePayload",
    "validate_section_payload",
]


class SectionKind(str, Enum):
    LIST = "LIST"
    TABLE = "TABLE"
    KEY_VALUE = "KEY_VALUE"
    NARRATIVE = "NARRATIVE"
    MEDICATION_TABLE = "MEDICATION_TABLE"
    PROCEDURES = "PROCEDURES"
    LAB_RESULTS = "LAB_RESULTS"
    VITAL_TABLE = "VITAL_TABLE"
    PATIENT_MEDICAL_HISTORY = "PATIENT_MEDICAL_HISTORY"
    DIAGNOSIS = "DIAGNOSIS"
    EXAMINATION_FINDINGS = "EXAMINATION_FINDINGS"
    LAB_INVESTIGATIONS = "LAB_INVESTIGATIONS"

class ListPayload(StrictModel):
    """Bulleted/numbered list. Each item is a markdown string — the LLM
    decides what structure (bold, links, inline code) to use per item."""

    items: List[str] = []


class TablePayload(StrictModel):
    """Tabular section. Each row is a dict keyed by `headers[*].key`."""

    headers: List[TableColumn] = []
    rows: List[Dict[str, str]] = []


class VitalTablePayload(StrictModel):
    """Vital-signs-specific tabular section.

    Same shape as TablePayload (headers + rows), but `headers` MUST include
    the five canonical vital columns (vital_name, value, unit, normal_range,
    notes). The LLM is free to ADD extra columns when the transcript carries
    that data (e.g. time_of_recording, method); extras come after the
    canonical five in whatever order the LLM emits.
    """

    headers: List[TableColumn] = []
    rows: List[Dict[str, str]] = []

    @model_validator(mode="after")
    def _ensure_required_columns(self) -> "VitalTablePayload":
        present = {h.key for h in self.headers}
        required = ["vital_name", "value", "unit", "normal_range", "notes"]
        missing = [k for k in required if k not in present]
        if missing:
            raise ValueError(
                "VitalTablePayload.headers is missing required vital "
                f"column key(s): {missing}. Required keys (in this order): "
                f"{required}. Extra columns are allowed when the transcript "
                "supplies that data."
            )
        return self


class ProceduresPayload(StrictModel):
    """Procedures-specific tabular section.

    Same shape as TablePayload (headers + rows), but `headers` MUST include
    the three canonical procedure columns (procedure_name, timing, note).
    Only `procedure_name` carries required data per row; `timing` (e.g.
    "After 3 Days") and `note` are left blank ('') when the transcript
    does not specify them. The LLM is free to ADD extra columns when the
    transcript carries that data; extras come after the canonical three.
    Emit a row ONLY for procedures actually mentioned in the transcript.
    """

    headers: List[TableColumn] = []
    rows: List[Dict[str, str]] = []

    @model_validator(mode="after")
    def _ensure_required_columns(self) -> "ProceduresPayload":
        present = {h.key for h in self.headers}
        missing = [k for k in ["procedure_name", "timing", "note"] if k not in present]
        if missing:
            raise ValueError(
                "ProceduresPayload.headers is missing required procedure "
                f"column key(s): {missing}. Required keys (in this order): "
                f"{list(['procedure_name', 'timing', 'note'])}. Extra columns are "
                "allowed when the transcript supplies that data."
            )
        return self

class LabResultsPayload(StrictModel):
    """Lab-results-specific tabular section.

    Same shape as TablePayload (headers + rows), but `headers` MUST include
    the five canonical lab columns (test_name, value, unit, reference_range,
    out_of_range). Only `test_name` and `value` carry required data per row;
    `unit`, `reference_range`, and `out_of_range` are left blank ('') when the
    transcript does not specify them. The LLM is free to ADD extra columns when
    the transcript carries that data; extras come after the canonical five.
    Emit a row ONLY for lab tests actually mentioned in the transcript.
    """

    headers: List[TableColumn] = []
    rows: List[Dict[str, str]] = []

    @model_validator(mode="after")
    def _ensure_required_columns(self) -> "LabResultsPayload":
        present = {h.key for h in self.headers}
        missing = [
            k
            for k in ["test_name", "value", "unit", "reference_range", "out_of_range"]
            if k not in present
        ]
        if missing:
            raise ValueError(
                "LabResultsPayload.headers is missing required lab "
                f"column key(s): {missing}. Required keys (in this order): "
                f"{list(['test_name', 'value', 'unit', 'reference_range', 'out_of_range'])}. "
                "Extra columns are allowed when the transcript supplies that data."
            )
        return self

class PatientMedicalHistoryPayload(StrictModel):
    """Patient-medical-history tabular section.

    Backs the dr.eka.care "Patient Medical History" component: each row is a
    chronic condition, allergy, or lifestyle habit the patient does or does not
    have. `headers` MUST include the five canonical columns (condition,
    category, status, since, note). Only `condition` carries required data per
    row; the rest are left blank ('') when the transcript does not specify them.

    - `category` is one of: condition, drug_allergy, other_allergy,
      lifestyle_habit (blank when unclear).
    - `status` records whether the patient has it: 'yes', 'no' (explicit denial,
      e.g. "no h/o diabetes"), or '' when unstated.
    - `since` is onset/duration as stated (e.g. "5 years", "since 2019").
    - `note` carries extra detail (reaction for allergies, quantity/frequency
      for habits, current control, etc.).

    The LLM is free to ADD extra columns when the transcript carries that data;
    extras come after the canonical five. Emit a row ONLY for conditions,
    habits, or allergies actually mentioned in the transcript.
    """

    headers: List[TableColumn] = []
    rows: List[Dict[str, str]] = []

    @model_validator(mode="after")
    def _ensure_required_columns(self) -> "PatientMedicalHistoryPayload":
        present = {h.key for h in self.headers}
        required = ["condition", "category", "status", "since", "note"]
        missing = [k for k in required if k not in present]
        if missing:
            raise ValueError(
                "PatientMedicalHistoryPayload.headers is missing required "
                f"column key(s): {missing}. Required keys (in this order): "
                f"{required}. Extra columns are allowed when the transcript "
                "supplies that data."
            )
        return self

class DiagnosisPayload(StrictModel):
    """Diagnosis tabular section.

    Backs the dr.eka.care "Diagnosis" (ICD-10) component: each row is a
    diagnosis / clinical impression made at this visit. `headers` MUST include
    the four canonical columns (diagnosis, since, status, note). Only `diagnosis`
    carries required data per row; the rest are left blank ('') when the
    transcript does not specify them.

    - `since` is onset/duration as stated (e.g. "2 weeks", "since childhood").
    - `status` is the clinical status of the diagnosis: 'active', 'provisional',
      'resolved', 'ruled_out', 'chronic', or '' when unstated.
    - `note` carries clinical reasoning, differential, or extra detail.

    Do NOT invent ICD-10 codes — the frontend resolves the code from the
    diagnosis text. The LLM is free to ADD extra columns when the transcript
    carries that data; extras come after the canonical four. Emit a row ONLY for
    diagnoses/impressions actually stated or clearly implied in the transcript.
    """

    headers: List[TableColumn] = []
    rows: List[Dict[str, str]] = []

    @model_validator(mode="after")
    def _ensure_required_columns(self) -> "DiagnosisPayload":
        present = {h.key for h in self.headers}
        required = ["diagnosis", "since", "status", "note"]
        missing = [k for k in required if k not in present]
        if missing:
            raise ValueError(
                "DiagnosisPayload.headers is missing required column key(s): "
                f"{missing}. Required keys (in this order): {required}. Extra "
                "columns are allowed when the transcript supplies that data."
            )
        return self

class ExaminationFindingsPayload(StrictModel):
    """Examination-findings (O/E) tabular section.

    Backs the dr.eka.care "Examination Findings" component: each row is one
    on-examination clinical finding (inspection / palpation / percussion /
    auscultation), e.g. "Chest pain", "Systolic murmur", "Right hypochondrium
    tenderness", "Chest clear". `headers` MUST include the three canonical
    columns (finding, status, detail). Only `finding` carries required data per
    row; the rest are left blank ('') when the transcript does not specify them.

    - `status` is 'present', 'absent' (pertinent negative, e.g. "no murmur"),
      'normal', 'abnormal', or '' when unstated.
    - `detail` carries the finding's qualifiers/characterization as stated
      (site, character/type, radiation, severity, associated features).

    Finding-specific structured qualifiers (e.g. type of pain, radiation) are
    resolved frontend-side from the finding — put them in `detail` as text. The
    LLM is free to ADD extra columns when the transcript carries that data;
    extras come after the canonical three. Emit a row ONLY for examination
    findings actually stated — including pertinent negatives.
    """

    headers: List[TableColumn] = []
    rows: List[Dict[str, str]] = []

    @model_validator(mode="after")
    def _ensure_required_columns(self) -> "ExaminationFindingsPayload":
        present = {h.key for h in self.headers}
        required = ["finding", "status", "detail"]
        missing = [k for k in required if k not in present]
        if missing:
            raise ValueError(
                "ExaminationFindingsPayload.headers is missing required column "
                f"key(s): {missing}. Required keys (in this order): {required}. "
                "Extra columns are allowed when the transcript supplies that data."
            )
        return self

class KeyValueItem(StrictModel):
    key: str = Field(min_length=1)
    value: str = ""


class KeyValuePayload(StrictModel):
    """Definition-list / detail-card section. `value` is markdown."""

    items: List[KeyValueItem] = []


class NarrativePayload(StrictModel):
    """Free-form markdown section — HPI, Subjective, Plan, Notes, etc."""

    markdown: str = ""

class SectionStatus(BaseModel):
    state: Literal[
        "pending", "extracting", "awaiting_input", "ready", "saved", "error"
    ] = "pending"
    error: Optional[str] = None


class Section(BaseModel):
    """One render unit in the scribe note.

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
    SectionKind.MEDICATION_TABLE: MedicationTablePayload,
    SectionKind.PROCEDURES: ProceduresPayload,
    SectionKind.LAB_RESULTS: LabResultsPayload,
    SectionKind.VITAL_TABLE: VitalTablePayload,
    SectionKind.PATIENT_MEDICAL_HISTORY: PatientMedicalHistoryPayload,
    SectionKind.DIAGNOSIS: DiagnosisPayload,
    SectionKind.EXAMINATION_FINDINGS: ExaminationFindingsPayload,
    SectionKind.LAB_INVESTIGATIONS: LabInvestigationsPayload,
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
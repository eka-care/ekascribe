"""
Backend tools for the AG-UI scribe flow.

LLM-callable BaseTools — one per SectionKind — plus save_scribe_state,
an internal helper the run service calls on RUN_FINISHED (not exposed to
the LLM).
"""

from .generic import (
    ALL_GENERIC_TOOLS,
    NAME_TO_TOOL,
    DiagnosisTool,
    ExaminationFindingsTool,
    KeyValueTool,
    LabInvestigationsTool,
    ListTool,
    MedicationTableTool,
    MeetingNoteTool,
    NarrativeTool,
    PatientMedicalHistoryTool,
    ProceduresTool,
    LabResultsTool,
    TableTool,
    VitalTableTool,
)
from .save_scribe_state import save_scribe_state

__all__ = [
    "ListTool",
    "TableTool",
    "MedicationTableTool",
    "ProceduresTool",
    "KeyValueTool",
    "NarrativeTool",
    "MeetingNoteTool",
    "LabResultsTool",
    "PatientMedicalHistoryTool",
    "DiagnosisTool",
    "ExaminationFindingsTool",
    "LabInvestigationsTool",
    "ALL_GENERIC_TOOLS",
    "NAME_TO_TOOL",
    "save_scribe_state",
    "VitalTableTool",
]
"""Happy-path tests for the generic emit tools."""

import pytest

from voice2rx.services.templates.ag_ui.payloads import SectionKind
from voice2rx.services.templates.ag_ui.state import ScribeState
from voice2rx.services.templates.ag_ui.tools.generic_tools.generic import (
    DiagnosisTool,
    ExaminationFindingsTool,
    KeyValueTool,
    LabInvestigationsTool,
    ListTool,
    NarrativeTool,
    PatientMedicalHistoryTool,
    ProceduresTool,
    TableTool,
    LabResultsTool,
    TableTool,
    VitalTableTool,
)


def _ctx(state: ScribeState) -> dict:
    return {"scribe_state": state}


@pytest.mark.asyncio
async def test_add_list_appends_section():
    state = ScribeState()
    tool = ListTool()

    result = await tool.run(
        key="advice",
        display_name="Advice",
        payload={"items": ["Hydrate well.", "Avoid spicy food for 3 days."]},
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert len(state.sections) == 1
    section = state.sections[0]
    assert section.key == "advice"
    assert section.display_name == "Advice"
    assert section.kind == SectionKind.LIST
    assert section.payload == {
        "items": ["Hydrate well.", "Avoid spicy food for 3 days."]
    }
    assert section.status.state == "ready"


@pytest.mark.asyncio
async def test_add_table_with_typed_headers():
    state = ScribeState()
    tool = TableTool()

    payload = {
        "headers": [
            {"key": "name", "label": "Drug", "type": "text"},
            {"key": "dose", "label": "Dose", "type": "text"},
            {"key": "frequency", "label": "Frequency", "type": "text"},
        ],
        "rows": [
            {"name": "Paracetamol", "dose": "500mg", "frequency": "TDS"},
            {"name": "Amoxicillin", "dose": "250mg", "frequency": "BD"},
        ],
    }

    result = await tool.run(
        key="prescribed_medications",
        display_name="Prescribed Medications",
        payload=payload,
        order=2,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.TABLE
    assert state.sections[0].payload["rows"][0]["name"] == "Paracetamol"


@pytest.mark.asyncio
async def test_add_key_value():
    state = ScribeState()
    tool = KeyValueTool()

    result = await tool.run(
        key="patient_demographics",
        display_name="Patient Demographics",
        payload={
            "items": [
                {"key": "Age", "value": "42"},
                {"key": "Sex", "value": "Female"},
            ]
        },
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.KEY_VALUE
    assert state.sections[0].payload["items"][0]["key"] == "Age"


@pytest.mark.asyncio
async def test_add_narrative():
    state = ScribeState()
    tool = NarrativeTool()

    md = (
        "Complains of fever for 3 days, associated with body ache. "
        "No cough, no shortness of breath."
    )
    result = await tool.run(
        key="history_of_present_illness",
        display_name="History of Present Illness",
        payload={"markdown": md},
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.NARRATIVE
    assert state.sections[0].payload["markdown"] == md


@pytest.mark.asyncio
async def test_add_procedures_happy_path():
    state = ScribeState()
    tool = ProceduresTool()

    payload = {
        "headers": [
            {"key": "procedure_name", "label": "Procedure", "type": "text"},
            {"key": "timing", "label": "Timing", "type": "text"},
            {"key": "note", "label": "Note", "type": "markdown"},
        ],
        "rows": [
            {"procedure_name": "RIA", "timing": "After 3 Days", "note": ""},
            {"procedure_name": "Acne surgery", "timing": "After 3 Days", "note": ""},
        ],
    }

    result = await tool.run(
        key="procedures",
        display_name="Procedures",
        payload=payload,
        order=5,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.PROCEDURES
    assert state.sections[0].payload["rows"][0]["procedure_name"] == "RIA"


@pytest.mark.asyncio
async def test_add_procedures_missing_required_column_returns_error():
    state = ScribeState()
    tool = ProceduresTool()

    # Missing the required `note` column key.
    payload = {
        "headers": [
            {"key": "procedure_name", "label": "Procedure", "type": "text"},
            {"key": "timing", "label": "Timing", "type": "text"},
        ],
        "rows": [
            {"procedure_name": "RIA", "timing": "After 3 Days"},
        ],
    }

    result = await tool.run(
        key="procedures",
        display_name="Procedures",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("Error:")
    assert state.sections == []


@pytest.mark.asyncio
async def test_add_procedures_allows_extra_columns():
    state = ScribeState()
    tool = ProceduresTool()

    # The three canonical columns plus an extra `anaesthesia` column.
    payload = {
        "headers": [
            {"key": "procedure_name", "label": "Procedure", "type": "text"},
            {"key": "timing", "label": "Timing", "type": "text"},
            {"key": "note", "label": "Note", "type": "markdown"},
            {"key": "anaesthesia", "label": "Anaesthesia", "type": "text"},
        ],
        "rows": [
            {
                "procedure_name": "Acne surgery",
                "timing": "After 3 Days",
                "note": "Day-care procedure",
                "anaesthesia": "Local",
            },
        ],
    }

    result = await tool.run(
        key="procedures",
        display_name="Procedures",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.PROCEDURES
    assert state.sections[0].payload["headers"][3]["key"] == "anaesthesia"

@pytest.mark.asyncio
async def test_add_lab_results_happy_path():
    state = ScribeState()
    tool = LabResultsTool()

    payload = {
        "headers": [
            {"key": "test_name", "label": "Test", "type": "text"},
            {"key": "value", "label": "Value", "type": "text"},
            {"key": "unit", "label": "Unit", "type": "text"},
            {"key": "reference_range", "label": "Reference Range", "type": "text"},
            {"key": "out_of_range", "label": "Out of Range", "type": "text"},
        ],
        "rows": [
            {
                "test_name": "Hemoglobin",
                "value": "9.2",
                "unit": "g/dL",
                "reference_range": "13-17",
                "out_of_range": "low",
            },
            {
                "test_name": "Fasting Glucose",
                "value": "98",
                "unit": "mg/dL",
                "reference_range": "70-100",
                "out_of_range": "",
            },
        ],
    }

    result = await tool.run(
        key="lab_results",
        display_name="Lab Results",
        payload=payload,
        order=4,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.LAB_RESULTS
    assert state.sections[0].payload["rows"][0]["test_name"] == "Hemoglobin"


@pytest.mark.asyncio
async def test_add_lab_results_missing_required_column_returns_error():
    state = ScribeState()
    tool = LabResultsTool()

    # Missing the required `out_of_range` column key.
    payload = {
        "headers": [
            {"key": "test_name", "label": "Test", "type": "text"},
            {"key": "value", "label": "Value", "type": "text"},
            {"key": "unit", "label": "Unit", "type": "text"},
            {"key": "reference_range", "label": "Reference Range", "type": "text"},
        ],
        "rows": [
            {"test_name": "Hemoglobin", "value": "9.2", "unit": "g/dL", "reference_range": "13-17"},
        ],
    }

    result = await tool.run(
        key="lab_results",
        display_name="Lab Results",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("Error:")
    assert state.sections == []


@pytest.mark.asyncio
async def test_add_lab_results_allows_extra_columns():
    state = ScribeState()
    tool = LabResultsTool()

    # The five canonical columns plus an extra `method` column.
    payload = {
        "headers": [
            {"key": "test_name", "label": "Test", "type": "text"},
            {"key": "value", "label": "Value", "type": "text"},
            {"key": "unit", "label": "Unit", "type": "text"},
            {"key": "reference_range", "label": "Reference Range", "type": "text"},
            {"key": "out_of_range", "label": "Out of Range", "type": "text"},
            {"key": "method", "label": "Method", "type": "text"},
        ],
        "rows": [
            {
                "test_name": "TSH",
                "value": "6.1",
                "unit": "mIU/L",
                "reference_range": "0.4-4.0",
                "out_of_range": "high",
                "method": "CLIA",
            },
        ],
    }

    result = await tool.run(
        key="lab_results",
        display_name="Lab Results",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.LAB_RESULTS
    assert state.sections[0].payload["headers"][5]["key"] == "method"

@pytest.mark.asyncio
async def test_invalid_payload_returns_error_string():
    state = ScribeState()
    tool = ListTool()

    # `items` should be a list of strings, not a dict.
    result = await tool.run(
        key="advice",
        display_name="Advice",
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
        key="advice",
        display_name="Advice",
        payload={"items": ["First version"]},
        order=0,
        tool_context=_ctx(state),
    )
    await tool.run(
        key="advice",
        display_name="Advice",
        payload={"items": ["Revised"]},
        order=0,
        tool_context=_ctx(state),
    )

    assert len(state.sections) == 1
    assert state.sections[0].payload["items"] == ["Revised"]


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
    assert result.startswith("Error:")


@pytest.mark.asyncio
async def test_add_vital_table_happy_path():
    state = ScribeState()
    tool = VitalTableTool()

    payload = {
        "headers": [
            {"key": "vital_name", "label": "Vital", "type": "text"},
            {"key": "value", "label": "Value", "type": "text"},
            {"key": "unit", "label": "Unit", "type": "text"},
            {"key": "normal_range", "label": "Normal Range", "type": "text"},
            {"key": "notes", "label": "Notes", "type": "markdown"},
        ],
        "rows": [
            {
                "vital_name": "Blood Pressure",
                "value": "120/80",
                "unit": "mmHg",
                "normal_range": "90/60–120/80",
                "notes": "",
            },
            {
                "vital_name": "Heart Rate",
                "value": "78",
                "unit": "bpm",
                "normal_range": "60–100",
                "notes": "",
            },
        ],
    }

    result = await tool.run(
        key="vitals",
        display_name="Vitals",
        payload=payload,
        order=1,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert len(state.sections) == 1
    section = state.sections[0]
    assert section.key == "vitals"
    assert section.kind == SectionKind.VITAL_TABLE
    assert section.payload["rows"][0]["vital_name"] == "Blood Pressure"
    assert section.status.state == "ready"


@pytest.mark.asyncio
async def test_add_vital_table_missing_required_column_returns_error():
    state = ScribeState()
    tool = VitalTableTool()

    # `unit` column is missing — should fail validation
    payload = {
        "headers": [
            {"key": "vital_name", "label": "Vital", "type": "text"},
            {"key": "value", "label": "Value", "type": "text"},
            {"key": "normal_range", "label": "Normal Range", "type": "text"},
            {"key": "notes", "label": "Notes", "type": "markdown"},
        ],
        "rows": [],
    }

    result = await tool.run(
        key="vitals",
        display_name="Vitals",
        payload=payload,
        order=1,
        tool_context=_ctx(state),
    )

    assert result.startswith("Error:")
    assert state.sections == []


@pytest.mark.asyncio
async def test_add_vital_table_extra_columns_allowed():
    state = ScribeState()
    tool = VitalTableTool()

    # All 5 required columns present + one extra (time_of_recording)
    payload = {
        "headers": [
            {"key": "vital_name", "label": "Vital", "type": "text"},
            {"key": "value", "label": "Value", "type": "text"},
            {"key": "unit", "label": "Unit", "type": "text"},
            {"key": "normal_range", "label": "Normal Range", "type": "text"},
            {"key": "notes", "label": "Notes", "type": "markdown"},
            {"key": "time_of_recording", "label": "Time", "type": "text"},
        ],
        "rows": [
            {
                "vital_name": "SpO2",
                "value": "98",
                "unit": "%",
                "normal_range": "95–100",
                "notes": "",
                "time_of_recording": "08:30 AM",
            }
        ],
    }

    result = await tool.run(
        key="vitals",
        display_name="Vitals",
        payload=payload,
        order=1,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.VITAL_TABLE


# --------------------------------------------------- patient medical history

@pytest.mark.asyncio
async def test_add_patient_medical_history_happy_path():
    state = ScribeState()
    tool = PatientMedicalHistoryTool()

    payload = {
        "headers": [
            {"key": "condition", "label": "Condition", "type": "text"},
            {"key": "category", "label": "Category", "type": "text"},
            {"key": "status", "label": "Status", "type": "text"},
            {"key": "since", "label": "Since", "type": "text"},
            {"key": "note", "label": "Note", "type": "markdown"},
        ],
        "rows": [
            {
                "condition": "Diabetes Mellitus",
                "category": "condition",
                "status": "yes",
                "since": "5 years",
                "note": "On metformin",
            },
            {
                "condition": "Penicillin allergy",
                "category": "drug_allergy",
                "status": "yes",
                "since": "",
                "note": "Rash",
            },
        ],
    }

    result = await tool.run(
        key="patient_medical_history",
        display_name="Patient Medical History",
        payload=payload,
        order=1,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.PATIENT_MEDICAL_HISTORY
    assert state.sections[0].payload["rows"][0]["condition"] == "Diabetes Mellitus"


@pytest.mark.asyncio
async def test_add_patient_medical_history_missing_required_column_returns_error():
    state = ScribeState()
    tool = PatientMedicalHistoryTool()

    # Missing the required `note` column key.
    payload = {
        "headers": [
            {"key": "condition", "label": "Condition", "type": "text"},
            {"key": "category", "label": "Category", "type": "text"},
            {"key": "status", "label": "Status", "type": "text"},
            {"key": "since", "label": "Since", "type": "text"},
        ],
        "rows": [],
    }

    result = await tool.run(
        key="patient_medical_history",
        display_name="Patient Medical History",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("Error:")
    assert state.sections == []


@pytest.mark.asyncio
async def test_add_patient_medical_history_allows_extra_columns():
    state = ScribeState()
    tool = PatientMedicalHistoryTool()

    payload = {
        "headers": [
            {"key": "condition", "label": "Condition", "type": "text"},
            {"key": "category", "label": "Category", "type": "text"},
            {"key": "status", "label": "Status", "type": "text"},
            {"key": "since", "label": "Since", "type": "text"},
            {"key": "note", "label": "Note", "type": "markdown"},
            {"key": "severity", "label": "Severity", "type": "text"},
        ],
        "rows": [
            {
                "condition": "Asthma",
                "category": "condition",
                "status": "yes",
                "since": "childhood",
                "note": "",
                "severity": "Mild",
            },
        ],
    }

    result = await tool.run(
        key="patient_medical_history",
        display_name="Patient Medical History",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.PATIENT_MEDICAL_HISTORY
    assert state.sections[0].payload["headers"][5]["key"] == "severity"


# ----------------------------------------------------------------- diagnosis

@pytest.mark.asyncio
async def test_add_diagnosis_happy_path():
    state = ScribeState()
    tool = DiagnosisTool()

    payload = {
        "headers": [
            {"key": "diagnosis", "label": "Diagnosis", "type": "text"},
            {"key": "since", "label": "Since", "type": "text"},
            {"key": "status", "label": "Status", "type": "text"},
            {"key": "note", "label": "Note", "type": "markdown"},
        ],
        "rows": [
            {
                "diagnosis": "Acute bronchitis",
                "since": "1 week",
                "status": "active",
                "note": "Likely viral",
            },
        ],
    }

    result = await tool.run(
        key="diagnosis",
        display_name="Diagnosis",
        payload=payload,
        order=3,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.DIAGNOSIS
    assert state.sections[0].payload["rows"][0]["diagnosis"] == "Acute bronchitis"


@pytest.mark.asyncio
async def test_add_diagnosis_missing_required_column_returns_error():
    state = ScribeState()
    tool = DiagnosisTool()

    # Missing the required `status` column key.
    payload = {
        "headers": [
            {"key": "diagnosis", "label": "Diagnosis", "type": "text"},
            {"key": "since", "label": "Since", "type": "text"},
            {"key": "note", "label": "Note", "type": "markdown"},
        ],
        "rows": [],
    }

    result = await tool.run(
        key="diagnosis",
        display_name="Diagnosis",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("Error:")
    assert state.sections == []


@pytest.mark.asyncio
async def test_add_diagnosis_allows_extra_columns():
    state = ScribeState()
    tool = DiagnosisTool()

    payload = {
        "headers": [
            {"key": "diagnosis", "label": "Diagnosis", "type": "text"},
            {"key": "since", "label": "Since", "type": "text"},
            {"key": "status", "label": "Status", "type": "text"},
            {"key": "note", "label": "Note", "type": "markdown"},
            {"key": "laterality", "label": "Laterality", "type": "text"},
        ],
        "rows": [
            {
                "diagnosis": "Otitis media",
                "since": "3 days",
                "status": "active",
                "note": "",
                "laterality": "Right",
            },
        ],
    }

    result = await tool.run(
        key="diagnosis",
        display_name="Diagnosis",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.DIAGNOSIS
    assert state.sections[0].payload["headers"][4]["key"] == "laterality"


# ------------------------------------------------------- examination findings

@pytest.mark.asyncio
async def test_add_examination_findings_happy_path():
    state = ScribeState()
    tool = ExaminationFindingsTool()

    payload = {
        "headers": [
            {"key": "finding", "label": "Finding", "type": "text"},
            {"key": "status", "label": "Status", "type": "text"},
            {"key": "detail", "label": "Detail", "type": "markdown"},
        ],
        "rows": [
            {"finding": "Systolic murmur", "status": "present", "detail": "Grade 2/6, apex"},
            {"finding": "Organomegaly", "status": "absent", "detail": ""},
        ],
    }

    result = await tool.run(
        key="examination_findings",
        display_name="Examination Findings",
        payload=payload,
        order=2,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.EXAMINATION_FINDINGS
    assert state.sections[0].payload["rows"][0]["finding"] == "Systolic murmur"


@pytest.mark.asyncio
async def test_add_examination_findings_missing_required_column_returns_error():
    state = ScribeState()
    tool = ExaminationFindingsTool()

    # Missing the required `detail` column key.
    payload = {
        "headers": [
            {"key": "finding", "label": "Finding", "type": "text"},
            {"key": "status", "label": "Status", "type": "text"},
        ],
        "rows": [],
    }

    result = await tool.run(
        key="examination_findings",
        display_name="Examination Findings",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("Error:")
    assert state.sections == []


@pytest.mark.asyncio
async def test_add_examination_findings_allows_extra_columns():
    state = ScribeState()
    tool = ExaminationFindingsTool()

    payload = {
        "headers": [
            {"key": "finding", "label": "Finding", "type": "text"},
            {"key": "status", "label": "Status", "type": "text"},
            {"key": "detail", "label": "Detail", "type": "markdown"},
            {"key": "site", "label": "Site", "type": "text"},
        ],
        "rows": [
            {
                "finding": "Tenderness",
                "status": "present",
                "detail": "On deep palpation",
                "site": "Right hypochondrium",
            },
        ],
    }

    result = await tool.run(
        key="examination_findings",
        display_name="Examination Findings",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.EXAMINATION_FINDINGS
    assert state.sections[0].payload["headers"][3]["key"] == "site"


# -------------------------------------------------------- lab investigations

@pytest.mark.asyncio
async def test_add_lab_investigations_happy_path():
    state = ScribeState()
    tool = LabInvestigationsTool()

    payload = {
        "headers": [
            {"key": "investigation", "label": "Investigation", "type": "text"},
            {"key": "test_on", "label": "Test On", "type": "text"},
            {"key": "repeat_on", "label": "Repeat On", "type": "text"},
            {"key": "remarks", "label": "Remarks", "type": "markdown"},
        ],
        "rows": [
            {
                "investigation": "CBC",
                "test_on": "Today",
                "repeat_on": "",
                "remarks": "",
            },
            {
                "investigation": "Fasting Blood Sugar",
                "test_on": "Tomorrow",
                "repeat_on": "After 3 months",
                "remarks": "Fasting",
            },
        ],
    }

    result = await tool.run(
        key="lab_investigations",
        display_name="Lab Investigations",
        payload=payload,
        order=6,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.LAB_INVESTIGATIONS
    assert state.sections[0].payload["rows"][0]["investigation"] == "CBC"


@pytest.mark.asyncio
async def test_add_lab_investigations_missing_required_column_returns_error():
    state = ScribeState()
    tool = LabInvestigationsTool()

    # Missing the required `remarks` column key.
    payload = {
        "headers": [
            {"key": "investigation", "label": "Investigation", "type": "text"},
            {"key": "test_on", "label": "Test On", "type": "text"},
            {"key": "repeat_on", "label": "Repeat On", "type": "text"},
        ],
        "rows": [],
    }

    result = await tool.run(
        key="lab_investigations",
        display_name="Lab Investigations",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("Error:")
    assert state.sections == []


@pytest.mark.asyncio
async def test_add_lab_investigations_allows_extra_columns():
    state = ScribeState()
    tool = LabInvestigationsTool()

    payload = {
        "headers": [
            {"key": "investigation", "label": "Investigation", "type": "text"},
            {"key": "test_on", "label": "Test On", "type": "text"},
            {"key": "repeat_on", "label": "Repeat On", "type": "text"},
            {"key": "remarks", "label": "Remarks", "type": "markdown"},
            {"key": "modality", "label": "Modality", "type": "text"},
        ],
        "rows": [
            {
                "investigation": "Chest X-ray",
                "test_on": "Today",
                "repeat_on": "",
                "remarks": "PA view",
                "modality": "Radiology",
            },
        ],
    }

    result = await tool.run(
        key="lab_investigations",
        display_name="Lab Investigations",
        payload=payload,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("ok")
    assert state.sections[0].kind == SectionKind.LAB_INVESTIGATIONS
    assert state.sections[0].payload["headers"][4]["key"] == "modality"

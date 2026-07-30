"""Lab-investigations component — CSV backend, match rules, tool wiring."""

import pytest

from voice2rx.services.templates.ag_ui.tools.lab import tool as tool_module
from voice2rx.services.templates.ag_ui.tools.lab.search import (
    CsvLabTestSearch,
    LabTestHit,
    parse_array,
)
from voice2rx.services.templates.ag_ui.tools.lab.tool import (
    LabInvestigationsTool,
    SearchTerms,
    decide_match,
    enrich_lab_investigations_payload,
)
from voice2rx.services.templates.ag_ui.payloads import SectionKind
from voice2rx.services.templates.ag_ui.state import ScribeState

# ---------------------------------------------------------------- fixtures

CSV_HEADER = (
    "partner_id,name,display_name,aliases,loinc,kind,result_type,discipline,"
    "specimen,unit,unit_id,panel_members,panel_member_ids,method,body_part,"
    "laterality,view,workspace_id,is_active\n"
)

CSV_ROWS = [
    'LAB001,Hemoglobin,Hemoglobin (Hb),"{Hb,Haemoglobin,HGB}",718-7,laboratory,'
    "numerical,{hematology},Blood,g/dL,U001,{},{},,,,,ws1,true\n",
    'LAB002,Thyroid Stimulating Hormone,TSH,"{TSH,Thyrotropin}",3016-3,'
    'laboratory,numerical,"{biochemistry,endocrinology}",Serum,mIU/L,U014,{},'
    "{},CLIA,,,,ws1,true\n",
    'PNL001,Complete Blood Count,CBC,"{CBC,Hemogram,Blood Count}",58410-2,'
    'panel,na,{hematology},Blood,,,"{Hemoglobin,Total WBC Count}",'
    '"{LAB001,LAB010}",,,,,ws1,true\n',
    'IMG001,X-Ray Chest PA View,Chest X-Ray (PA),"{CXR,Chest Radiograph}",,'
    "imaging,na,{radiology},,,,{},{},,Chest,,PA,ws1,true\n",
    "IMG004,X-Ray Chest AP View,Chest X-Ray (AP),{},,"
    "imaging,na,{radiology},,,,{},{},,Chest,,AP,ws1,true\n",
    'IMG002,MRI Knee,MRI Left Knee,"{Knee MRI}",,imaging,na,{radiology},,,,'
    "{},{},,Knee,Left,,ws1,true\n",
    'IMG003,MRI Knee,MRI Right Knee,"{Knee MRI}",,imaging,na,{radiology},,,,'
    "{},{},,Knee,Right,,ws1,true\n",
    'PKG001,Full Body Health Checkup,Full Body Checkup,"{Master Health Checkup}"'
    ',,package,na,{},,,,"{Complete Blood Count,Lipid Profile}",'
    '"{PNL001,PNL002}",,,,,ws1,true\n',
    "LAB008,Hemoglobin,Hemoglobin OTHER-WS,{Hb},718-7,laboratory,numerical,"
    "{hematology},Blood,g/dL,U001,{},{},,,,,ws2,true\n",
    "LAB009,Hemoglobin,Hemoglobin INACTIVE,{Hb},718-7,laboratory,numerical,"
    "{hematology},Blood,g/dL,U001,{},{},,,,,ws1,false\n",
]


@pytest.fixture
def csv_backend(tmp_path):
    path = tmp_path / "labs.csv"
    path.write_text(CSV_HEADER + "".join(CSV_ROWS), encoding="utf-8")
    return CsvLabTestSearch(str(path))


def _hit(
    test_id="LAB001",
    name="Hemoglobin",
    display_name="Hemoglobin (Hb)",
    rank=1,
    score=1.0,
    **kw,
):
    return LabTestHit(
        lab_test_id=test_id,
        name=name,
        display_name=display_name,
        rank=rank,
        score=score,
        **kw,
    )


def _terms(name="", body_part="", laterality="", view="", dictated=""):
    return SearchTerms(dictated or name, name, body_part, laterality, view)


class StubBackend:
    """Canned hits (flat list); records calls; can raise."""

    def __init__(self, hits=None, error=None):
        self.hits = hits or []
        self.error = error
        self.calls = []

    async def search(
        self, *, b_id, name, body_part="", laterality="", view="", limit=5
    ):
        self.calls.append((b_id, name, body_part, laterality, view, limit))
        if self.error:
            raise self.error
        return self.hits


# ------------------------------------------------------------ parse_array


def test_parse_array_formats():
    assert parse_array('{Hb,Haemoglobin,"HGB"}') == ["Hb", "Haemoglobin", "HGB"]
    assert parse_array("Hb|Haemoglobin;HGB") == ["Hb", "Haemoglobin", "HGB"]
    assert parse_array(["Hb", " HGB "]) == ["Hb", "HGB"]
    assert parse_array("{}") == []
    assert parse_array("") == []
    assert parse_array(None) == []


# ------------------------------------------------------------ CSV backend


@pytest.mark.asyncio
async def test_csv_alias_prefix_is_rank1(csv_backend):
    hits = await csv_backend.search(b_id="ws1", name="Hb")
    assert hits and hits[0].lab_test_id == "LAB001" and hits[0].rank == 1

    hits = await csv_backend.search(b_id="ws1", name="CBC")
    assert hits and hits[0].lab_test_id == "PNL001" and hits[0].rank == 1
    assert hits[0].panel_member_ids == ["LAB001", "LAB010"]


@pytest.mark.asyncio
async def test_csv_workspace_and_active_filters(csv_backend):
    hits = await csv_backend.search(b_id="ws1", name="hemoglobin")
    ids = {h.lab_test_id for h in hits}
    assert "LAB008" not in ids  # other workspace
    assert "LAB009" not in ids  # inactive


@pytest.mark.asyncio
async def test_csv_view_bonus_sorts_matching_variant_first(csv_backend):
    hits = await csv_backend.search(b_id="ws1", name="chest x-ray", view="pa")
    assert hits[0].lab_test_id == "IMG001"  # PA variant boosted above AP


@pytest.mark.asyncio
async def test_csv_fuzzy_matches_misspelling(csv_backend):
    hits = await csv_backend.search(b_id="ws1", name="hemoglobn")
    assert hits and hits[0].lab_test_id == "LAB001" and hits[0].rank == 3


# ------------------------------------------------------------ SearchTerms


def test_search_terms_prefers_llm_hidden_keys():
    terms = SearchTerms.from_row(
        {
            "investigation": "chest x-ray PA view",
            "name": "chest x-ray",
            "body_part": "chest",
            "laterality": "",
            "view": "PA",
        }
    )
    assert terms.dictated == "chest x-ray PA view"
    assert terms.name == "chest x-ray"
    assert terms.body_part == "chest"
    assert terms.view == "PA"


def test_search_terms_fallback_parses_qualifiers():
    terms = SearchTerms.from_row({"investigation": "left knee MRI"})
    assert terms.name == "knee MRI"
    assert terms.laterality == "left"

    terms = SearchTerms.from_row({"investigation": "chest x-ray PA view"})
    assert terms.name == "chest x-ray"
    assert terms.view == "pa"

    terms = SearchTerms.from_row({"investigation": "CBC"})
    assert terms.name == "CBC"
    assert terms.laterality == "" and terms.view == ""


# ------------------------------------------------------------ decide_match


@pytest.mark.asyncio
async def test_decide_match_alias_equality_is_exact(csv_backend):
    hits = await csv_backend.search(b_id="ws1", name="CBC")
    match, match_type = decide_match(_terms("CBC"), hits)
    assert match_type == "exact" and match.lab_test_id == "PNL001"


@pytest.mark.asyncio
async def test_decide_match_laterality_ambiguity_never_guesses(csv_backend):
    hits = await csv_backend.search(b_id="ws1", name="knee MRI")
    match, match_type = decide_match(_terms("knee MRI"), hits)
    assert match is None and match_type == "none"
    assert len(hits) >= 2  # both variants offered as pills


@pytest.mark.asyncio
async def test_decide_match_dictated_laterality_selects_variant(csv_backend):
    terms = SearchTerms.from_row({"investigation": "left knee MRI"})
    hits = await csv_backend.search(
        b_id="ws1", name=terms.name, laterality=terms.laterality
    )
    match, match_type = decide_match(terms, hits)
    assert match_type == "exact" and match.lab_test_id == "IMG002"


@pytest.mark.asyncio
async def test_decide_match_view_tie_never_guesses(csv_backend):
    # "chest x-ray" without a view: PA and AP variants tie -> pills only.
    hits = await csv_backend.search(b_id="ws1", name="chest x-ray")
    match, match_type = decide_match(_terms("chest x-ray"), hits)
    assert match is None and match_type == "none"


@pytest.mark.asyncio
async def test_decide_match_dictated_view_selects_variant(csv_backend):
    terms = SearchTerms.from_row({"investigation": "chest x-ray PA view"})
    hits = await csv_backend.search(b_id="ws1", name=terms.name, view=terms.view)
    match, match_type = decide_match(terms, hits)
    assert match is not None and match.lab_test_id == "IMG001"


@pytest.mark.asyncio
async def test_decide_match_package_is_suggestion_only(csv_backend):
    hits = await csv_backend.search(b_id="ws1", name="full body checkup")
    assert hits and hits[0].lab_test_id == "PKG001"
    match, match_type = decide_match(_terms("full body checkup"), hits)
    assert match is None and match_type == "none"


@pytest.mark.asyncio
async def test_decide_match_fuzzy_misspelling_replaces(csv_backend):
    hits = await csv_backend.search(b_id="ws1", name="hemoglobn")
    match, match_type = decide_match(_terms("hemoglobn"), hits)
    assert match_type == "closest" and match.lab_test_id == "LAB001"


def test_decide_match_rank2_fallback_marked_block():
    # loosely-worded order that only full-text-matches: no token-set
    # equality, similarity below threshold -> the marked rank-2 fallback.
    hits = [
        _hit(
            test_id="LAB007",
            name="Glucose Fasting",
            display_name="Fasting Blood Sugar (FBS)",
            rank=2,
            score=0.3,
        )
    ]
    match, match_type = decide_match(_terms("sugar test"), hits)
    assert match_type == "closest" and match.lab_test_id == "LAB007"


def test_decide_match_no_hits():
    assert decide_match(_terms("anything"), []) == (None, "none")


def test_decide_match_single_variant_undictated_qualifier_is_closest():
    # only one knee-MRI variant in the catalog: still replaces, but the
    # match adds a laterality the doctor never said -> closest, not exact.
    hits = [
        _hit(
            test_id="IMG002",
            name="MRI Knee",
            display_name="MRI Left Knee",
            aliases=["Knee MRI"],
            kind="imaging",
            body_part="Knee",
            laterality="Left",
        )
    ]
    match, match_type = decide_match(_terms("knee MRI"), hits)
    assert match_type == "closest" and match.lab_test_id == "IMG002"


# ------------------------------------------------------------- enrichment


@pytest.mark.asyncio
async def test_enrichment_replaces_and_attaches_hidden_fields(csv_backend):
    payload = {
        "headers": [
            {"key": "investigation", "label": "Investigation", "type": "text"},
            {"key": "test_on", "label": "Test On", "type": "text"},
            {"key": "repeat_on", "label": "Repeat On", "type": "text"},
            {"key": "remarks", "label": "Remarks", "type": "markdown"},
        ],
        "rows": [
            {"investigation": "CBC", "test_on": "Today", "repeat_on": "", "remarks": ""},
            {
                "investigation": "some unknown test",
                "test_on": "",
                "repeat_on": "",
                "remarks": "",
            },
        ],
    }

    enriched = await enrich_lab_investigations_payload(
        payload, b_id="ws1", backend=csv_backend
    )

    header_keys = [h["key"] for h in enriched["headers"]]
    assert header_keys.index("raw_name") == header_keys.index("investigation") + 1
    assert header_keys[-1] == "suggestions"
    assert enriched["headers"][-1]["type"] == "pills"

    matched = enriched["rows"][0]
    assert matched["investigation"] == "CBC"  # catalog display_name
    assert matched["raw_name"] == "CBC"
    assert matched["lab_test_id"] == "PNL001"
    assert matched["loinc"] == "58410-2"
    assert matched["kind"] == "panel"
    assert matched["panel_member_ids"] == ["LAB001", "LAB010"]
    assert matched["match_type"] == "exact"
    pills = matched["suggestions"]
    assert pills and pills[0]["display_name"] == "CBC"
    assert {"lab_test_id", "rank", "score"} <= set(pills[0])

    unmatched = enriched["rows"][1]
    assert unmatched["investigation"] == "some unknown test"
    assert unmatched["raw_name"] == ""
    assert unmatched["lab_test_id"] == ""
    assert unmatched["match_type"] == "none"


@pytest.mark.asyncio
async def test_enrichment_search_error_is_fail_open():
    backend = StubBackend(error=RuntimeError("catalog down"))
    payload = {
        "headers": [{"key": "investigation", "label": "Investigation", "type": "text"}],
        "rows": [{"investigation": "CBC"}],
    }
    enriched = await enrich_lab_investigations_payload(
        payload, b_id="ws1", backend=backend
    )
    row = enriched["rows"][0]
    assert row["investigation"] == "CBC"
    assert row["match_type"] == "none" and row["suggestions"] == []


# ------------------------------------------------------------ tool wiring


def _ctx(state, b_id=None):
    ctx = {"scribe_state": state}
    if b_id:
        ctx["b_id"] = b_id
    return ctx


def test_tool_registered_in_generic_registries():
    from voice2rx.services.templates.ag_ui.tools.generic_tools.generic import (
        ALL_GENERIC_TOOLS,
        NAME_TO_TOOL,
    )

    assert NAME_TO_TOOL["add_lab_investigations"] is LabInvestigationsTool
    assert ALL_GENERIC_TOOLS[SectionKind.LAB_INVESTIGATIONS] is LabInvestigationsTool


def test_input_schema_uses_emit_model():
    schema = LabInvestigationsTool().input_schema
    payload_schema = schema["properties"]["payload"]
    assert payload_schema["title"] == "LabInvestigationsEmitPayload"
    # enrichment-only fields never reach the LLM schema
    assert "suggestions" not in str(payload_schema)


@pytest.mark.asyncio
async def test_run_enriches_with_backend(csv_backend, monkeypatch):
    monkeypatch.setattr(
        tool_module, "get_lab_test_search_backend", lambda: csv_backend
    )
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
            {"investigation": "TSH", "test_on": "Today", "repeat_on": "", "remarks": ""}
        ],
    }

    result = await tool.run(
        key="lab_investigations",
        display_name="Lab Investigations",
        payload=payload,
        order=0,
        tool_context=_ctx(state, b_id="ws1"),
    )

    assert result.startswith("ok")
    row = state.sections[0].payload["rows"][0]
    assert row["investigation"] == "TSH"  # catalog display_name
    assert row["lab_test_id"] == "LAB002"
    assert row["raw_name"] == "TSH"
    assert row["unit"] == "mIU/L" and row["unit_id"] == "U014"


@pytest.mark.asyncio
async def test_run_without_b_id_skips_enrichment():
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
            {"investigation": "CBC", "test_on": "", "repeat_on": "", "remarks": ""}
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
    row = state.sections[0].payload["rows"][0]
    assert row["investigation"] == "CBC"
    assert "suggestions" not in row  # enrichment skipped, payload as emitted


@pytest.mark.asyncio
async def test_run_rejects_payload_missing_canonical_columns():
    state = ScribeState()
    tool = LabInvestigationsTool()
    payload = {
        "headers": [
            {"key": "investigation", "label": "Investigation", "type": "text"}
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


# ------------------------------------------------------- backend selection


def test_backend_selection_by_env(monkeypatch):
    from voice2rx.services.templates.ag_ui.tools.lab import search as search_module
    from voice2rx.services.templates.ag_ui.tools.lab.search import (
        PostgresLabTestSearch,
        get_lab_test_search_backend,
        reset_lab_test_search_backend,
    )

    monkeypatch.setenv("ENV", "stage")
    reset_lab_test_search_backend()
    assert isinstance(get_lab_test_search_backend(), CsvLabTestSearch)

    monkeypatch.setenv("ENV", "production")
    reset_lab_test_search_backend()
    assert isinstance(get_lab_test_search_backend(), PostgresLabTestSearch)

    reset_lab_test_search_backend()
    assert search_module._backend is None


# --------------------------------------------------------- back-compat


def test_payload_models_still_importable_from_aggregator():
    from voice2rx.services.templates.ag_ui.payloads import (  # noqa: F401
        KIND_TO_PAYLOAD,
        LabInvestigationsEmitPayload,
        LabInvestigationsPayload,
        SuggestedTestPill,
    )

    assert (
        KIND_TO_PAYLOAD[SectionKind.LAB_INVESTIGATIONS] is LabInvestigationsPayload
    )

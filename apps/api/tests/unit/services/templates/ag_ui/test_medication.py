"""Medication component (catalog v2) — CSV backend, match rules, tool wiring."""

import pytest

from voice2rx.services.templates.ag_ui.tools.medication import tool as tool_module
from voice2rx.services.templates.ag_ui.tools.medication.search import (
    CsvMedicationSearch,
    MedicationHit,
    _escape_like_prefix,
    canon_strength,
)
from voice2rx.services.templates.ag_ui.tools.medication.tool import (
    MedicationTableTool,
    SearchTerms,
    decide_match,
    enrich_medication_payload,
    normalize_drug_query,
)
from voice2rx.services.templates.ag_ui.payloads import SectionKind
from voice2rx.services.templates.ag_ui.state import ScribeState

# ---------------------------------------------------------------- fixtures

CSV_HEADER = (
    "medication_id,name,display_name,generic_name,strength,form_name,"
    "form_id,manufacturer,otc,is_active,workspace_id\n"
)

CSV_ROWS = [
    "M1,DOLO,DOLO 650MG TAB (PARACETAMOL) (MICRO),PARACETAMOL,650MG,tablet,df-1,MICRO,false,true,ws1\n",
    "M2,DOLO,DOLO 1000MG TAB (PARACETAMOL) (MICRO),PARACETAMOL,1000MG,tablet,df-1,MICRO,false,true,ws1\n",
    "M3,DOLONEX,DOLONEX (PIROXICAM) 2ML INJ (PFIZER),PIROXICAM,,injection,df-2,PFIZER,false,true,ws1\n",
    "M4,GLYCOMET,GLYCOMET 500MG TAB (METFORMIN) (USV),METFORMIN HCL,500MG,tablet,df-1,USV,false,true,ws1\n",
    "M5,AUGMENTIN DUO,AUGMENTIN 625 DUO TAB (GSK),AMOXYCILLIN+CLAVULANIC ACID,625MG,tablet,df-1,GSK,false,true,ws1\n",
    "M6,DOLO,DOLO 650MG OTHER-WS,PARACETAMOL,650MG,tablet,df-1,MICRO,false,true,ws2\n",
    "M7,DOLO,DOLO INACTIVE,PARACETAMOL,650MG,tablet,df-1,MICRO,false,false,ws1\n",
]


@pytest.fixture
def csv_backend(tmp_path):
    path = tmp_path / "meds.csv"
    path.write_text(CSV_HEADER + "".join(CSV_ROWS), encoding="utf-8")
    return CsvMedicationSearch(str(path))


def _hit(
    med_id="M1",
    name="DOLO",
    display_name="DOLO 650MG TAB (PARACETAMOL) (MICRO)",
    strength="650MG",
    rank=1,
    score=1.0,
    **kw,
):
    return MedicationHit(
        medication_id=med_id,
        name=name,
        display_name=display_name,
        strength=strength,
        rank=rank,
        score=score,
        **kw,
    )


def _terms(name="", strength="", generic="", form="", dictated=""):
    return SearchTerms(dictated or name, name, strength, generic, form)


class StubBackend:
    """Canned hits (flat list); records calls; can raise."""

    def __init__(self, hits=None, error=None):
        self.hits = hits or []
        self.error = error
        self.calls = []

    async def search(self, *, b_id, name, strength="", generic="", form="", limit=5):
        self.calls.append((b_id, name, strength, generic, form, limit))
        if self.error is not None:
            raise self.error
        return self.hits


CANONICAL_HEADERS = [
    {"key": "drug_name", "label": "Drug", "type": "text"},
    {"key": "dosage", "label": "Dosage", "type": "text"},
    {"key": "frequency", "label": "Frequency", "type": "text"},
    {"key": "duration", "label": "Duration", "type": "text"},
    {"key": "notes", "label": "Notes", "type": "markdown"},
]


def _payload(*rows):
    """rows: dicts with at least drug_name; canonical cells defaulted."""
    return {
        "headers": [dict(h) for h in CANONICAL_HEADERS],
        "rows": [
            {
                "dosage": "1 tablet",
                "frequency": "1-0-1",
                "duration": "5 days",
                "notes": "",
                **r,
            }
            for r in rows
        ],
    }


def _ctx(state, b_id="ws1"):
    return {"scribe_state": state, "b_id": b_id}


async def _run_tool(tool, state, b_id="ws1", payload=None):
    return await tool.run(
        key="medications",
        display_name="Medications",
        payload=payload
        or _payload({"drug_name": "Dolo 650mg", "name": "Dolo", "strength": "650mg"}),
        order=0,
        tool_context=_ctx(state, b_id=b_id),
    )


# ------------------------------------------------- CSV search backend (v2)


@pytest.mark.asyncio
async def test_prefix_rank1_with_strength_bonus_orders_right_variant_first(csv_backend):
    hits = await csv_backend.search(b_id="ws1", name="Dolo", strength="650 mg", limit=5)
    assert hits
    assert hits[0].medication_id == "M1"  # 650 variant boosted above 1000
    assert hits[0].rank == 1 and hits[0].score > 1.0
    ids = {h.medication_id for h in hits}
    assert "M6" not in ids and "M7" not in ids  # other-ws + inactive excluded


@pytest.mark.asyncio
async def test_fulltext_matches_generic_name(csv_backend):
    # dictated generic "Metformin" -> brand GLYCOMET via generic_name
    hits = await csv_backend.search(b_id="ws1", name="Metformin", strength="500", limit=5)
    assert any(h.medication_id == "M4" and h.rank == 2 for h in hits)


@pytest.mark.asyncio
async def test_fuzzy_matches_misspelled_name(csv_backend):
    hits = await csv_backend.search(b_id="ws1", name="dolonx", limit=5)
    assert any(h.medication_id == "M3" and h.rank == 3 for h in hits)


@pytest.mark.asyncio
async def test_hits_carry_display_name_and_catalog_fields(csv_backend):
    hits = await csv_backend.search(b_id="ws1", name="Augmentin Duo", limit=5)
    h = next(h for h in hits if h.medication_id == "M5")
    assert h.display_name == "AUGMENTIN 625 DUO TAB (GSK)"
    assert h.strength == "625MG" and h.form_name == "tablet" and h.form_id == "df-1"


@pytest.mark.asyncio
async def test_blank_terms_return_empty(csv_backend):
    assert await csv_backend.search(b_id="ws1", name="  ", limit=5) == []


def test_escape_like_prefix():
    assert _escape_like_prefix("50% dext_rose") == "50\\% dext\\_rose%"


def test_canon_strength():
    assert canon_strength("650MG") == canon_strength("650 mg") == "650"
    assert canon_strength("2.5/500MG") == "2.5/500"
    assert canon_strength("") == ""


def test_backend_selection_by_environment(monkeypatch):
    from voice2rx.services.templates.ag_ui.tools.medication import search as search_module
    from voice2rx.services.templates.ag_ui.tools.medication.search import (
        BUNDLED_CATALOG_CSV,
        PostgresMedicationSearch,
        get_medication_search_backend,
        reset_medication_search_backend,
    )

    # stage -> bundled CSV
    monkeypatch.setenv("ENV", "stage")
    reset_medication_search_backend()
    backend = get_medication_search_backend()
    assert isinstance(backend, CsvMedicationSearch)
    assert backend._path == BUNDLED_CATALOG_CSV

    # prod -> Postgres
    monkeypatch.setenv("ENV", "prod")
    reset_medication_search_backend()
    assert isinstance(get_medication_search_backend(), PostgresMedicationSearch)

    # leave a clean singleton for other tests
    reset_medication_search_backend()
    assert search_module._backend is None


# --------------------------------------------------------- SearchTerms


def test_normalize_drops_form_words():
    assert normalize_drug_query("Dolo 650 tablet") == "Dolo 650"
    assert normalize_drug_query("tablet") == "tablet"  # never empty


def test_search_terms_pass_through_llm_keys():
    t = SearchTerms.from_row(
        {
            "drug_name": "Dolo 650mg",
            "name": "Dolo",
            "strength": "650mg",
            "generic_name": "Paracetamol",
            "form": "tablet",
        }
    )
    assert (t.name, t.strength, t.generic, t.form) == (
        "Dolo", "650mg", "Paracetamol", "tablet",
    )
    assert t.dictated == "Dolo 650mg"


def test_search_terms_fallback_parse_splits_strength_out_of_name():
    t = SearchTerms.from_row({"drug_name": "Dolo 650mg tablet"})
    assert t.name == "Dolo" and t.strength == "650mg"
    t = SearchTerms.from_row({"drug_name": "Ondero Met 2.5/500MG"})
    assert t.name == "Ondero Met" and t.strength == "2.5/500MG"


def test_search_terms_strength_fallback_from_dosage():
    t = SearchTerms.from_row({"drug_name": "Dolo", "dosage": "650mg"})
    assert t.name == "Dolo" and t.strength == "650"
    # a bare count is NOT a strength
    t = SearchTerms.from_row({"drug_name": "Dolo", "dosage": "1 tablet"})
    assert t.strength == ""


# --------------------------------------------------------- decide_match


def test_decide_match_exact_name_and_strength():
    hits = [
        _hit("M1", strength="650MG", score=1.5),
        _hit("M2", display_name="DOLO 1000MG", strength="1000MG", score=1.0),
    ]
    match, match_type = decide_match(_terms(name="dolo", strength="650 mg"), hits)
    assert match.medication_id == "M1" and match_type == "exact"


def test_decide_match_strength_conflict_never_replaces():
    hits = [_hit("M2", display_name="DOLO 1000MG", strength="1000MG")]
    match, match_type = decide_match(_terms(name="Dolo", strength="650"), hits)
    assert match is None and match_type == "none"


def test_decide_match_strengthless_query_with_multiple_strengths_never_guesses():
    hits = [
        _hit("M1", strength="650MG"),
        _hit("M2", display_name="DOLO 1000MG", strength="1000MG", score=0.9),
    ]
    match, match_type = decide_match(_terms(name="dolo"), hits)
    assert match is None and match_type == "none"


def test_decide_match_multi_variant_empty_strength_columns_never_guesses():
    # SOLU MEDROL 500MG / 1GM where the strength lives only inside
    # display_name and the strength COLUMN is empty — still ambiguous
    hits = [
        _hit("S1", name="SOLU MEDROL", display_name="SOLU MEDROL 500MG INJ", strength=None),
        _hit("S2", name="SOLU MEDROL", display_name="SOLU MEDROL 1GM INJ", strength=None, score=0.9),
    ]
    match, match_type = decide_match(_terms(name="solu medrol"), hits)
    assert match is None and match_type == "none"


def test_decide_match_single_strength_prefix_hit_is_closest():
    hits = [_hit("M3", name="DOLONEX", display_name="DOLONEX 2ML INJ", strength=None)]
    match, match_type = decide_match(_terms(name="Dolonex"), hits)
    # canonical name equality + no strengths on either side -> exact
    assert match.medication_id == "M3" and match_type in ("exact", "closest")


def test_decide_match_similarity_on_misspelling():
    hits = [_hit("M3", name="DOLONEX", display_name="DOLONEX 2ML INJ", strength=None, rank=3, score=0.9)]
    match, match_type = decide_match(_terms(name="dolonx"), hits)
    assert match.medication_id == "M3" and match_type == "closest"


def test_decide_match_rank2_top_hit_replaces_as_aggressive_fallback():
    # dictated generic -> top full-text brand replaces (marked block in
    # decide_match; if that block is commented out this becomes "none")
    hits = [_hit("M4", name="GLYCOMET", display_name="GLYCOMET 500MG TAB", strength="500MG", rank=2, score=0.6)]
    match, match_type = decide_match(_terms(name="Metformin", strength="500"), hits)
    assert match.medication_id == "M4" and match_type == "closest"


# ------------------------------------------------------- payload enrichment


@pytest.mark.asyncio
async def test_enrich_replaces_with_display_name_and_writes_hidden_fields():
    hit = _hit(
        "M1",
        generic_name="PARACETAMOL",
        generic_id="G1",
        form_name="tablet",
        form_id="df-1",
    )
    backend = StubBackend(hits=[hit])
    enriched = await enrich_medication_payload(
        _payload({"drug_name": "Dolo 650mg", "name": "Dolo", "strength": "650mg"}),
        b_id="ws1",
        backend=backend,
    )

    row = enriched["rows"][0]
    assert row["drug_name"] == "DOLO 650MG TAB (PARACETAMOL) (MICRO)"  # display_name
    assert row["raw_name"] == "Dolo 650mg"
    assert row["medication_id"] == "M1"
    assert row["name"] == "DOLO" and row["strength"] == "650MG"
    assert row["generic_name"] == "PARACETAMOL" and row["generic_id"] == "G1"
    assert row["form_name"] == "tablet" and row["form_id"] == "df-1"
    assert row["match_type"] == "exact"
    pill = row["suggestions"][0]
    assert pill["display_name"] == hit.display_name
    assert pill["medication_id"] == "M1" and pill["form_id"] == "df-1"
    # search called with the structured terms
    assert backend.calls == [("ws1", "Dolo", "650mg", "", "", 5)]
    # headers: raw_name after drug_name, suggestions (pills) last
    keys = [h["key"] for h in enriched["headers"]]
    assert keys.index("raw_name") == keys.index("drug_name") + 1
    assert keys[-1] == "suggestions"
    assert enriched["headers"][-1]["type"] == "pills"


@pytest.mark.asyncio
async def test_enrich_unmatched_row_keeps_dictated_name():
    enriched = await enrich_medication_payload(
        _payload({"drug_name": "Obscuromycin 10"}), b_id="ws1", backend=StubBackend()
    )
    row = enriched["rows"][0]
    assert row["drug_name"] == "Obscuromycin 10"
    assert row["raw_name"] == "" and row["medication_id"] == ""
    assert row["match_type"] == "none" and row["suggestions"] == []


@pytest.mark.asyncio
async def test_enrich_is_fail_open_per_row():
    backend = StubBackend(error=RuntimeError("pg down"))
    enriched = await enrich_medication_payload(
        _payload({"drug_name": "Dolo 650mg"}), b_id="ws1", backend=backend
    )
    row = enriched["rows"][0]
    assert row["drug_name"] == "Dolo 650mg"
    assert row["match_type"] == "none" and row["suggestions"] == []
    assert [h["key"] for h in enriched["headers"]][-1] == "suggestions"


@pytest.mark.asyncio
async def test_enrich_does_not_duplicate_headers_or_mutate_input():
    payload = _payload({"drug_name": "Dolo 650mg"})
    payload["headers"].append({"key": "suggestions", "label": "S", "type": "pills"})
    enriched = await enrich_medication_payload(payload, b_id="ws1", backend=StubBackend())
    assert [h["key"] for h in enriched["headers"]].count("suggestions") == 1
    assert "match_type" not in payload["rows"][0]  # input untouched


# ------------------------------------------------------------ tool wiring


@pytest.mark.asyncio
async def test_run_enriches_section(monkeypatch):
    monkeypatch.setattr(
        tool_module, "get_medication_search_backend", lambda: StubBackend(hits=[_hit()])
    )
    state = ScribeState()

    result = await _run_tool(MedicationTableTool(), state)

    assert result.startswith("ok")
    section = state.sections[0]
    assert section.kind == SectionKind.MEDICATION_TABLE
    row = section.payload["rows"][0]
    assert row["drug_name"] == "DOLO 650MG TAB (PARACETAMOL) (MICRO)"
    assert row["raw_name"] == "Dolo 650mg"
    assert row["medication_id"] == "M1"
    assert row["suggestions"][0]["display_name"].startswith("DOLO 650MG")


@pytest.mark.asyncio
async def test_run_fail_open_on_backend_error(monkeypatch):
    monkeypatch.setattr(
        tool_module,
        "get_medication_search_backend",
        lambda: StubBackend(error=RuntimeError("pg down")),
    )
    state = ScribeState()

    result = await _run_tool(MedicationTableTool(), state)

    assert result.startswith("ok")
    row = state.sections[0].payload["rows"][0]
    assert row["drug_name"] == "Dolo 650mg"  # unreplaced
    assert row["match_type"] == "none"


@pytest.mark.asyncio
async def test_run_fail_open_when_backend_factory_raises(monkeypatch):
    def _boom():
        raise ValueError("no creds")

    monkeypatch.setattr(tool_module, "get_medication_search_backend", _boom)
    state = ScribeState()

    result = await _run_tool(MedicationTableTool(), state)

    assert result.startswith("ok")
    assert "raw_name" not in state.sections[0].payload["rows"][0]


@pytest.mark.asyncio
async def test_run_skips_enrichment_without_b_id(monkeypatch):
    monkeypatch.setattr(
        tool_module, "get_medication_search_backend", lambda: StubBackend()
    )
    state = ScribeState()

    result = await _run_tool(MedicationTableTool(), state, b_id=None)

    assert result.startswith("ok")
    assert "raw_name" not in state.sections[0].payload["rows"][0]


@pytest.mark.asyncio
async def test_run_rejects_payload_missing_canonical_columns():
    state = ScribeState()
    bad = {"headers": [{"key": "drug_name", "label": "Drug"}], "rows": []}

    result = await MedicationTableTool().run(
        key="medications",
        display_name="Medications",
        payload=bad,
        order=0,
        tool_context=_ctx(state),
    )

    assert result.startswith("Error")
    assert state.sections == []


def test_llm_input_schema_has_no_enrichment_fields():
    schema = MedicationTableTool().input_schema
    payload_schema = schema["properties"]["payload"]
    assert "suggestions" not in str(payload_schema)
    assert "raw_name" not in str(payload_schema)


def test_backward_compatible_import_paths():
    from voice2rx.services.templates.ag_ui.payloads import (  # noqa: F401
        MedicationTablePayload,
        SuggestedPill,
        TableColumn,
    )
    from voice2rx.services.templates.ag_ui.tools.generic_tools.generic import (
        NAME_TO_TOOL,
        MedicationTableTool as FromGeneric,
    )

    assert FromGeneric is MedicationTableTool
    assert NAME_TO_TOOL["add_medication_table"] is MedicationTableTool

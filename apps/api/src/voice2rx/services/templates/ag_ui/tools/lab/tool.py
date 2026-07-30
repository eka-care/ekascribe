"""
LabInvestigationsTool (add_lab_investigations) + catalog enrichment.

The LLM-facing contract (input_schema + validation) is
LabInvestigationsEmitPayload: the same headers+rows shape as before,
investigation names verbatim from the transcript. After validation the
tool runs the post-processing enrichment below against the partner
lab-test catalog, then stores the ENRICHED payload in the Section — so
the STATE_DELTA the FE receives already carries the replaced
`investigation`, the raw_name column, the suggestions pills, and the
hidden lab_test_id/loinc/... coding keys.

Enrichment per row:
    1. Build SearchTerms: `investigation` stays the COMPLETE dictated
       text; the LLM additionally emits hidden row keys `name` (test name
       without imaging qualifiers), `body_part`, `laterality`, `view`
       when dictated. Fallback parse pulls laterality words and
       "<x> view" phrases out of the dictated text when those keys are
       missing ("chest x-ray PA view" -> name "chest x-ray" / view "pa").
    2. Search the catalog on name (+ qualifiers as score bonuses):
       rank1 prefix on name-or-alias / rank2 full-text / rank3 fuzzy —
       aliases are what doctors actually dictate ("CBC", "CXR", "Hb").
    3. When a hit is confident enough (decide_match — never across a
       laterality/view/body-part conflict, never a `package` row),
       REPLACE `investigation` with the catalog **display_name** and keep
       the dictated text in the visible raw_name column; write the
       catalog's lab_test_id / ekaid / loinc / kind / result_type /
       discipline / specimen / unit / unit_id / method / body_part /
       laterality / view / panel_members / panel_member_ids as hidden row
       keys for downstream FHIR / order coding.
    4. Always attach up to N candidate pills in the visible
       `suggestions` column — pills SHOW display_name and carry the same
       hidden fields — so the doctor can switch with one tap.

Codes come exclusively from the catalog rows matched here — the LLM
never sees or emits lab_test_id/loinc, so codes cannot be hallucinated.

Enrichment is strictly fail-open: any error or timeout logs a warning
and the section streams out exactly as emitted. A catalog outage must
never break note generation.

Env knobs:
    LAB_TEST_SEARCH_TIMEOUT    seconds for the WHOLE table (default 3).
    LAB_TEST_FUZZY_THRESHOLD   trigram floor for rank-3 hits (default 0.5).

NOTE: this module must not import generic_tools/generic.py at module level —
generic.py imports this module for its NAME_TO_TOOL registry, and a
top-level reverse import would cycle through tools/__init__.py. The two
shared helpers (_build_input_schema, _resolve_scribe_state) are imported
lazily at call time instead (same pattern as medication/tool.py).
"""

import asyncio
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from echo.tools import BaseTool
from logs.custom_logger import get_logger
from pydantic import ValidationError

from ...matching import canon, name_similarity, token_set
from ...payloads import Section, SectionKind, SectionStatus
from ...state_ops import apply_section_to_state
from .payloads import LabInvestigationsEmitPayload, SuggestedTestPill
from .search import (
    DEFAULT_SUGGESTION_LIMIT,
    LabTestHit,
    LabTestSearchBackend,
    get_lab_test_search_backend,
)

logger = get_logger(__name__)

DEFAULT_MATCH_THRESHOLD = 0.6

RAW_NAME_HEADER = {"key": "raw_name", "label": "Raw Name", "type": "text"}
SUGGESTIONS_HEADER = {"key": "suggestions", "label": "Suggestions", "type": "pills"}

_LATERALITY_WORDS = ("left", "right", "bilateral")
_VIEW_WORDS = ("pa", "ap", "lateral", "oblique", "axial", "supine", "erect")


class SearchTerms:
    """Structured search input for one row: the parsed components the
    LLM emits as hidden row keys (name / body_part / laterality / view),
    with a deterministic fallback parse from the dictated investigation
    text when the LLM omits them."""

    __slots__ = ("dictated", "name", "body_part", "laterality", "view")

    def __init__(
        self, dictated: str, name: str, body_part: str, laterality: str, view: str
    ):
        self.dictated = dictated
        self.name = name
        self.body_part = body_part
        self.laterality = laterality
        self.view = view

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> "SearchTerms":
        dictated = str(row.get("investigation", "")).strip()
        name = str(row.get("name") or "").strip()
        body_part = str(row.get("body_part") or "").strip()
        laterality = str(row.get("laterality") or "").strip()
        view = str(row.get("view") or "").strip()

        if not name:
            # fallback parse: pull "<x> view" phrases and laterality words
            # out of the dictated text; the remainder is the name —
            # "left knee MRI" -> name "knee MRI" / laterality "left".
            text = dictated
            m = re.search(
                r"\b(pa|ap|lateral|oblique|axial)\s+view\b", text, re.IGNORECASE
            )
            if m:
                if not view:
                    view = m.group(1).lower()
                text = (text[: m.start()] + text[m.end() :]).strip()
            tokens = []
            for t in text.split():
                w = t.strip(".,()").lower()
                if w in _LATERALITY_WORDS and not laterality:
                    laterality = w
                    continue
                tokens.append(t)
            name = " ".join(tokens).strip(" ,") or dictated
        return cls(dictated, name, body_part, laterality, view)


def _hit_qualifier(hit: LabTestHit, value: Optional[str], words: Tuple[str, ...]) -> str:
    """The hit's qualifier, falling back to a UNIQUE vocabulary word found
    in name/display_name when the column is empty — the qualifier often
    lives only inside the label ('MRI Left Knee' with a blank laterality
    column). Two or more vocabulary words -> unknown, return ''."""
    v = (value or "").strip().lower()
    if v:
        return v
    tokens = token_set(f"{hit.name} {hit.display_name}")
    found = [w for w in words if w in tokens]
    return found[0] if len(found) == 1 else ""


def decide_match(
    terms: SearchTerms,
    hits: List[LabTestHit],
    threshold: float = DEFAULT_MATCH_THRESHOLD,
) -> Tuple[Optional[LabTestHit], str]:
    """Pick the hit (if any) whose catalog display_name REPLACES the
    `investigation` cell.

    Aggressive by design (raw_name preserves the dictated text and the
    pills let the doctor switch): most dictations should come back as
    formulary items. But a hit whose imaging qualifiers CONFLICT with the
    dictated ones (left vs right, PA vs AP) is never a replacement
    candidate, and `package` rows are suggestions-only — a dictated
    "full body checkup" is too vague to auto-substitute a partner package.

    exact    dictated name token-equals the hit's name / display_name /
             an alias, with an unambiguous variant.
    closest  sole rank-1 hit; or the best hit clearing the name-similarity
             `threshold` (names AND aliases compared); or the top
             full-text hit as a final fallback (marked below).
    none     variant-ambiguous (laterality/view), qualifier-conflicting,
             or no confident match.
    """
    if not hits:
        return None, "none"

    def compatible(h: LabTestHit) -> bool:
        for dictated, value, words in (
            (terms.laterality, h.laterality, _LATERALITY_WORDS),
            (terms.view, h.view, _VIEW_WORDS),
        ):
            d = canon(dictated)
            if not d:
                continue
            hq = _hit_qualifier(h, value, words)
            if hq and canon(hq) != d:
                return False
        if terms.body_part and (h.body_part or "").strip():
            if canon(terms.body_part) != canon(h.body_part or ""):
                return False
        return True

    candidates = [
        h for h in hits if compatible(h) and (h.kind or "").lower() != "package"
    ]
    if not candidates:
        return None, "none"

    qn = token_set(terms.name)

    def name_equal(h: LabTestHit) -> bool:
        return bool(qn) and (
            token_set(h.name) == qn
            or token_set(h.display_name) == qn
            or any(token_set(a) == qn for a in h.aliases)
        )

    equal = [h for h in candidates if name_equal(h)]
    if equal:
        if len(equal) == 1:
            h = equal[0]
            undictated = any(
                _hit_qualifier(h, getattr(h, attr), words)
                and not canon(getattr(terms, attr))
                for attr, words in (
                    ("laterality", _LATERALITY_WORDS),
                    ("view", _VIEW_WORDS),
                )
            )
            return h, ("closest" if undictated else "exact")
        # multiple same-name variants (X-Ray Chest PA vs AP): the dictated
        # qualifiers must single one out, else pills only — never guess.
        dictated_quals = [
            (canon(d), attr, words)
            for d, attr, words in (
                (terms.laterality, "laterality", _LATERALITY_WORDS),
                (terms.view, "view", _VIEW_WORDS),
            )
            if canon(d)
        ]
        if dictated_quals:
            full = [
                h
                for h in equal
                if all(
                    canon(_hit_qualifier(h, getattr(h, attr), words)) == d
                    for d, attr, words in dictated_quals
                )
            ]
            if len(full) == 1:
                return full[0], "exact"
        return None, "none"

    top = candidates[0]
    if top.rank == 1:
        # multiple distinct prefix/alias hits ("hemo" -> Hemoglobin,
        # Hemogram) must never be guessed between — pills only.
        rank1 = [h for h in candidates if h.rank == 1]
        if len(rank1) == 1:
            return top, "closest"
        return None, "none"

    def sim(h: LabTestHit) -> float:
        return max(
            name_similarity(terms.name, c)
            for c in [h.name, h.display_name, *h.aliases]
        )

    best = max(candidates, key=sim)
    best_sim = sim(best)
    if best_sim >= threshold:
        # variant-tie guard: when several candidates tie at the top
        # similarity (Chest X-Ray PA vs AP without a dictated view),
        # never guess between them — pills only.
        tied = [h for h in candidates if sim(h) >= best_sim - 1e-9]
        if len(tied) == 1:
            return best, "closest"
        return None, "none"

    #!!hack!!hack
    # aggressive fallback — review later.
    # a loosely-worded order ("chest radiograph") full-text-matches the
    # catalog row via display_name/aliases tokens; take the top full-text
    # hit so the note carries a formulary item (raw_name keeps what was
    # dictated, pills offer the alternatives). comment out this block to
    # revert loose dictations to pills-only (no auto substitution).
    if top.rank == 2:
        return top, "closest"
    # ------------------------------------------------------------------
    return None, "none"


def _hit_to_pill(hit: LabTestHit) -> Dict[str, Any]:
    # display_name is what the FE SHOWS on the pill; every other field is
    # hidden metadata carried for selection/coding.
    return SuggestedTestPill(
        lab_test_id=hit.lab_test_id,
        display_name=hit.display_name,
        name=hit.name,
        ekaid=hit.ekaid,
        loinc=hit.loinc,
        kind=hit.kind,
        result_type=hit.result_type,
        discipline=hit.discipline,
        specimen=hit.specimen,
        unit=hit.unit,
        unit_id=hit.unit_id,
        method=hit.method,
        body_part=hit.body_part,
        laterality=hit.laterality,
        view=hit.view,
        panel_members=hit.panel_members,
        panel_member_ids=hit.panel_member_ids,
        rank=hit.rank,
        score=round(hit.score, 4),
    ).model_dump()


def _with_enrichment_headers(headers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """raw_name goes right after investigation; suggestions goes last."""
    out = [dict(h) for h in headers]
    keys = [h.get("key") for h in out]
    if "raw_name" not in keys:
        try:
            at = keys.index("investigation") + 1
        except ValueError:
            at = len(out)
        out.insert(at, dict(RAW_NAME_HEADER))
    if "suggestions" not in keys:
        out.append(dict(SUGGESTIONS_HEADER))
    return out


async def enrich_lab_investigations_payload(
    payload: Dict[str, Any],
    *,
    b_id: str,
    backend: LabTestSearchBackend,
    suggestion_limit: int = DEFAULT_SUGGESTION_LIMIT,
    match_threshold: float = DEFAULT_MATCH_THRESHOLD,
) -> Dict[str, Any]:
    rows = [dict(r) for r in payload.get("rows", [])]
    all_terms = [SearchTerms.from_row(r) for r in rows]

    async def _search(terms: SearchTerms) -> List[LabTestHit]:
        if not terms.name:
            return []
        try:
            return await backend.search(
                b_id=b_id,
                name=terms.name,
                body_part=terms.body_part,
                laterality=terms.laterality,
                view=terms.view,
                limit=suggestion_limit,
            )
        except Exception as e:
            logger.warning(
                "lab-test catalog search failed; row left unmatched",
                test=terms.name,
                b_id=b_id,
                error=str(e),
            )
            return []

    all_hits = await asyncio.gather(*(_search(t) for t in all_terms))
    for row, terms, hits in zip(rows, all_terms, all_hits):
        match, match_type = decide_match(terms, hits, match_threshold)
        if match is not None:
            row["investigation"] = match.display_name or match.name
            row["raw_name"] = terms.dictated
            row["lab_test_id"] = match.lab_test_id
            row["ekaid"] = match.ekaid or ""
            row["name"] = match.name
            row["loinc"] = match.loinc or ""
            row["kind"] = match.kind or ""
            row["result_type"] = match.result_type or ""
            row["discipline"] = list(match.discipline)
            row["specimen"] = match.specimen or ""
            row["unit"] = match.unit or ""
            row["unit_id"] = match.unit_id or ""
            row["method"] = match.method or ""
            row["body_part"] = match.body_part or ""
            row["laterality"] = match.laterality or ""
            row["view"] = match.view or ""
            row["panel_members"] = list(match.panel_members)
            row["panel_member_ids"] = list(match.panel_member_ids)
        else:
            row["raw_name"] = ""
            row["lab_test_id"] = ""
        row["match_type"] = match_type
        row["suggestions"] = [_hit_to_pill(h) for h in hits[:suggestion_limit]]

    return {
        **payload,
        "headers": _with_enrichment_headers(payload.get("headers", [])),
        "rows": rows,
    }


def _search_enabled() -> bool:
    return True


class LabInvestigationsTool(BaseTool):
    name = "add_lab_investigations"
    description = ""
    KIND = SectionKind.LAB_INVESTIGATIONS
    PAYLOAD_MODEL = LabInvestigationsEmitPayload

    @property
    def input_schema(self) -> Dict[str, Any]:
        from ..generic_tools.generic import _build_input_schema
        return _build_input_schema(self.PAYLOAD_MODEL)

    async def _enrich(
        self, payload: Dict[str, Any], tool_context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        if not _search_enabled():
            return payload
        b_id = (tool_context or {}).get("b_id")
        if not b_id:
            logger.warning(
                f"{self.name}: no b_id in tool_context; skipping catalog enrichment"
            )
            return payload

        try:
            timeout = float(os.getenv("LAB_TEST_SEARCH_TIMEOUT", "3"))
            return await asyncio.wait_for(
                enrich_lab_investigations_payload(
                    payload,
                    b_id=str(b_id),
                    backend=get_lab_test_search_backend(),
                    suggestion_limit=DEFAULT_SUGGESTION_LIMIT,
                    match_threshold=DEFAULT_MATCH_THRESHOLD,
                ),
                timeout=timeout,
            )
        except Exception as e:
            logger.warning(
                f"{self.name}: catalog enrichment failed; emitting section unenriched",
                b_id=str(b_id),
                error=str(e),
            )
            return payload

    async def run(
        self,
        key: str,
        display_name: str,
        payload: Dict[str, Any],
        order: int,
        tool_context: Optional[Dict[str, Any]] = None,
        **_unused: Any,
    ) -> str:
        from ..generic_tools.generic import _resolve_scribe_state

        state = _resolve_scribe_state(tool_context)
        if isinstance(state, str):
            return state

        try:
            self.PAYLOAD_MODEL.model_validate(payload)
        except ValidationError as e:
            return (
                f"Error: payload does not match {self.KIND.value} schema. "
                f"Validation errors: {e.errors()}. Re-emit with the correct shape."
            )

        enriched = await self._enrich(payload, tool_context)
        try:
            section = Section(
                key=key,
                display_name=display_name,
                kind=self.KIND,
                payload=enriched,
                order=order,
                status=SectionStatus(state="ready"),
            )
        except ValidationError as e:
            return f"Error: invalid Section shell. Validation errors: {e.errors()}."

        apply_section_to_state(state, section)
        logger.info(
            f"{self.name}: section emitted",
            key=key,
            kind=self.KIND.value,
            order=order,
            sections_count=len(state.sections),
        )
        return f"ok — section {key!r} emitted via {self.name}"

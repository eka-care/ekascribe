"""
MedicationTableTool (add_medication_table) + catalog enrichment.

The LLM-facing contract (input_schema + validation) is
MedicationTableEmitPayload: the same headers+rows shape as before, drug
names verbatim from the transcript. After validation the tool runs the
post-processing enrichment below against the partner medication catalog,
then stores the ENRICHED payload in the Section — so the STATE_DELTA the
FE receives already carries the replaced drug_name, the raw_name column,
the suggestions pills, and the hidden medication_id/match_type keys.

Enrichment per row (catalog v2 — structured search):
    1. Build SearchTerms: drug_name stays the COMPLETE dictated text; the
       LLM additionally emits hidden row keys `name` (base/brand name),
       `strength`, `generic_name`, `form` when dictated. Fallback parse
       splits digit-carrying tokens out of drug_name when those keys are
       missing ("Dolo 650mg" -> name "Dolo", strength "650mg").
    2. Search the catalog on name/strength/generic/form (rank1 prefix on
       name / rank2 full-text / rank3 fuzzy; strength+form matches boost
       the score within each rank — see search.py).
    3. When a hit is confident enough (decide_match — never across a
       strength conflict), REPLACE drug_name with the catalog
       **display_name** and keep the dictated text in the visible
       raw_name column; write the catalog's medication_id / name /
       strength / generic_name / generic_id / form_name / form_id as
       hidden row keys.
    4. Always attach up to N candidate pills in the visible
       `suggestions` column — pills SHOW display_name and carry the same
       hidden fields — so the doctor can switch with one tap.

Codes come exclusively from the catalog rows matched here — the LLM
never sees or emits medication_id, so codes cannot be hallucinated.

Enrichment is strictly fail-open: any error or timeout logs a warning
and the section streams out exactly as emitted. A catalog outage must
never break note generation.

Env knobs:
    MEDICATION_SEARCH_TIMEOUT    seconds for the WHOLE table (default 3).
    MEDICATION_MATCH_THRESHOLD   prefix-aware name-similarity bar for
                                 auto-replace (default 0.6).
    MEDICATION_SUGGESTION_LIMIT  pills per row (default 5).

NOTE: this module must not import generic_tools/generic.py at module level —
generic.py imports this module for its NAME_TO_TOOL registry, and a
top-level reverse import would cycle through tools/__init__.py. The two
shared helpers (_build_input_schema, _resolve_scribe_state) are imported
lazily at call time instead.
"""

import asyncio
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from echo.tools import BaseTool
from logs.custom_logger import get_logger
from pydantic import ValidationError

from ...matching import canon as _canon
from ...matching import name_similarity as _name_similarity
from ...payloads import Section, SectionKind, SectionStatus
from ...state_ops import apply_section_to_state
from .payloads import MedicationTableEmitPayload, SuggestedPill
from .search import (
    DEFAULT_SUGGESTION_LIMIT,
    MedicationHit,
    MedicationSearchBackend,
    canon_strength,
    get_medication_search_backend,
)

logger = get_logger(__name__)

DEFAULT_MATCH_THRESHOLD = 0.6

RAW_NAME_HEADER = {"key": "raw_name", "label": "Raw Name", "type": "text"}
SUGGESTIONS_HEADER = {"key": "suggestions", "label": "Suggestions", "type": "pills"}
_FORM_WORDS = frozenset(
    {
        "tab", "tabs", "tablet", "tablets",
        "cap", "caps", "capsule", "capsules",
        "syp", "syrup", "susp", "suspension",
        "inj", "injection",
        "cream", "gel", "ointment", "lotion", "spray",
        "drop", "drops", "sachet", "powder",
    }
)


def normalize_drug_query(dictated_name: str) -> str:
    """Trim + drop dosage-form words; fall back to the trimmed original
    when stripping would leave nothing."""
    trimmed = (dictated_name or "").strip()
    kept = [
        t
        for t in re.split(r"\s+", trimmed)
        if t.strip(".,()").lower() not in _FORM_WORDS
    ]
    return " ".join(kept) or trimmed


class SearchTerms:
    """Structured search input for one row: the parsed components the
    LLM emits as hidden row keys (name / strength / generic_name / form),
    with a deterministic fallback parse from the dictated drug_name when
    the LLM omits them."""

    __slots__ = ("dictated", "name", "strength", "generic", "form")

    def __init__(self, dictated: str, name: str, strength: str, generic: str, form: str):
        self.dictated = dictated
        self.name = name
        self.strength = strength
        self.generic = generic
        self.form = form

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> "SearchTerms":
        dictated = str(row.get("drug_name", "")).strip()
        name = str(row.get("name") or "").strip()
        strength = str(row.get("strength") or "").strip()
        generic = str(row.get("generic_name") or "").strip()
        form = str(row.get("form") or "").strip()

        if not name:
            # fallback parse: form words dropped; digit-carrying tokens
            # ("650", "650mg", "2.5/500MG") become the strength, the rest
            # is the base name — "Dolo 650mg tab" -> name "Dolo" / "650mg"
            base = normalize_drug_query(dictated)
            tokens = base.split()
            name = " ".join(t for t in tokens if not any(c.isdigit() for c in t))
            if not strength:
                strength = " ".join(t for t in tokens if any(c.isdigit() for c in t))
            name = name or base
        if not strength:
            # last resort: strength-looking token (digits + unit) misfiled
            # into dosage; a bare count ('1 tablet') is NOT a strength
            m = re.search(
                r"(\d+(?:\.\d+)?(?:/\d+(?:\.\d+)?)?)\s*(?:mg|mcg|g|ml|iu|%)\b",
                str(row.get("dosage") or ""),
                re.IGNORECASE,
            )
            if m:
                strength = m.group(1)
        return cls(dictated, name, strength, generic, form)


def decide_match(
    terms: SearchTerms,
    hits: List[MedicationHit],
    threshold: float = DEFAULT_MATCH_THRESHOLD,
) -> Tuple[Optional[MedicationHit], str]:
    """Pick the hit (if any) whose catalog display_name REPLACES drug_name.

    Aggressive by design (raw_name preserves the dictated text and the
    pills let the doctor switch): most dictations should come back as
    formulary items. But a hit whose strength CONFLICTS with the dictated
    strength is never a replacement candidate — strengths are compared as
    number sequences ("650MG" == "650 mg" == "650").

    exact    canonical name equality + strength agreement.
    closest  top strength-compatible prefix hit; or the top-ranked hit
             clearing the prefix-aware name-similarity `threshold`; or
             the top full-text hit as a final fallback (marked below).
    none     strength-ambiguous or strength-conflicting, or no match.
    """
    if not hits:
        return None, "none"
    sc = canon_strength(terms.strength)
    def compatible(h: MedicationHit) -> bool:
        if not sc:
            return True
        hs = canon_strength(h.strength or "")
        if hs:
            return hs == sc
        # strength column empty — the strength often lives only inside
        # display_name ("SOLU MEDROL ... 1GM INJ"); require the dictated
        # numbers to appear there. No numbers anywhere -> unknown, allow.
        nums = re.findall(r"\d+(?:\.\d+)?", h.display_name or "")
        if not nums:
            return True
        return all(part in nums for part in sc.split("/"))

    candidates = [h for h in hits if compatible(h)]
    if not candidates:
        return None, "none"

    qn = _canon(terms.name)
    name_equal = [h for h in candidates if _canon(h.name) == qn]

    if sc:
        for hit in name_equal:
            if canon_strength(hit.strength or "") == sc:
                return hit, "exact"
    elif len(name_equal) == 1 and not canon_strength(name_equal[0].strength or ""):
        # both sides strength-less and the product is unambiguous
        return name_equal[0], "exact"

    top = candidates[0]
    if top.rank == 1:
        if sc:
            # conflicting strengths were already filtered out above
            return top, "closest"
        # strength/variant-ambiguity guard: without a dictated strength,
        # MULTIPLE same-name variants (Dolo 650/1000, Solu Medrol 500MG/1GM
        # — even when the strength lives only inside display_name and the
        # strength column is empty) must never be guessed between — pills
        # only. (Name similarity scores every prefix hit ~1.0, so bail out
        # entirely instead of falling through.)
        if len(name_equal) == 1:
            return name_equal[0], "closest"
        if len(name_equal) > 1:
            return None, "none"
        rank1 = [h for h in candidates if h.rank == 1]
        if len(rank1) == 1:
            return top, "closest"
        return None, "none"

    best = max(candidates, key=lambda h: _name_similarity(terms.name, h.name))
    if _name_similarity(terms.name, best.name) >= threshold:
        return best, "closest"

    #!!hack!!hack
    # aggressive fallback  — review later.
    # a dictated generic ("metformin 500") full-text-matches brands via
    # generic_name/generic_list; take the top full-text hit so the note
    # carries a formulary item (raw_name keeps what was dictated, pills
    # offer the alternatives). comment out this block to revert generic
    # dictations to pills-only (no auto brand substitution).
    if top.rank == 2:
        return top, "closest"
    # ------------------------------------------------------------------
    return None, "none"


def _hit_to_pill(hit: MedicationHit) -> Dict[str, Any]:
    # display_name is what the FE SHOWS on the pill; every other field is
    # hidden metadata carried for selection/coding.
    return SuggestedPill(
        medication_id=hit.medication_id,
        display_name=hit.display_name,
        name=hit.name,
        strength=hit.strength,
        generic_name=hit.generic_name,
        generic_id=hit.generic_id,
        form_name=hit.form_name,
        form_id=hit.form_id,
        manufacturer=hit.manufacturer,
        rank=hit.rank,
        score=round(hit.score, 4),
    ).model_dump()


def _with_enrichment_headers(headers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """raw_name goes right after drug_name; suggestions goes last."""
    out = [dict(h) for h in headers]
    keys = [h.get("key") for h in out]
    if "raw_name" not in keys:
        try:
            at = keys.index("drug_name") + 1
        except ValueError:
            at = len(out)
        out.insert(at, dict(RAW_NAME_HEADER))
    if "suggestions" not in keys:
        out.append(dict(SUGGESTIONS_HEADER))
    return out


async def enrich_medication_payload(
    payload: Dict[str, Any],
    *,
    b_id: str,
    backend: MedicationSearchBackend,
    suggestion_limit: int = DEFAULT_SUGGESTION_LIMIT,
    match_threshold: float = DEFAULT_MATCH_THRESHOLD,
) -> Dict[str, Any]:
    rows = [dict(r) for r in payload.get("rows", [])]
    all_terms = [SearchTerms.from_row(r) for r in rows]

    async def _search(terms: SearchTerms) -> List[MedicationHit]:
        if not terms.name and not terms.generic:
            return []
        try:
            return await backend.search(
                b_id=b_id,
                name=terms.name,
                strength=terms.strength,
                generic=terms.generic,
                form=terms.form,
                limit=suggestion_limit,
            )
        except Exception as e:
            logger.warning(
                "medication catalog search failed; row left unmatched",
                drug=terms.name,
                b_id=b_id,
                error=str(e),
            )
            return []

    all_hits = await asyncio.gather(*(_search(t) for t in all_terms))
    for row, terms, hits in zip(rows, all_terms, all_hits):
        match, match_type = decide_match(terms, hits, match_threshold)
        if match is not None:
            row["drug_name"] = match.display_name or match.name
            row["raw_name"] = terms.dictated
            row["medication_id"] = match.medication_id
            row["name"] = match.name
            row["strength"] = match.strength or ""
            row["generic_name"] = match.generic_name or ""
            row["generic_id"] = match.generic_id or ""
            row["form_name"] = match.form_name or ""
            row["form_id"] = match.form_id or ""
        else:
            row["raw_name"] = ""
            row["medication_id"] = ""
        row["match_type"] = match_type
        row["suggestions"] = [_hit_to_pill(h) for h in hits[:suggestion_limit]]

    return {
        **payload,
        "headers": _with_enrichment_headers(payload.get("headers", [])),
        "rows": rows,
    }


def _search_enabled() -> bool:
    return True

class MedicationTableTool(BaseTool):
    name = "add_medication_table"
    # description will be overrided from the tool_prompts.yaml
    description = ""

    KIND = SectionKind.MEDICATION_TABLE
    # llm facing schema + validation
    PAYLOAD_MODEL = MedicationTableEmitPayload

    @property
    def input_schema(self) -> Dict[str, Any]:
        from ..generic_tools.generic import _build_input_schema

        return _build_input_schema(self.PAYLOAD_MODEL)

    async def _enrich(
        self, payload: Dict[str, Any], tool_context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Run catalog enrichment; on ANY failure return the payload as emitted (fail-open)."""
        if not _search_enabled():
            return payload
        b_id = (tool_context or {}).get("b_id")
        if not b_id:
            logger.warning(f"{self.name}: no b_id in tool_context; skipping catalog enrichment")
            return payload
        
        try:
            timeout = float(os.getenv("MEDICATION_SEARCH_TIMEOUT", "3"))
            return await asyncio.wait_for(
                enrich_medication_payload(
                    payload,
                    b_id=str(b_id),
                    backend=get_medication_search_backend(),
                    suggestion_limit=DEFAULT_SUGGESTION_LIMIT,
                    match_threshold=DEFAULT_MATCH_THRESHOLD
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

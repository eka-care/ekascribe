"""
Medication catalog search — SQL + backends (catalog schema v2).

v2 catalog shape: `name` is the bare search/matching field ("DOLO"),
`strength` is its own column ("650MG", "2.5/500MG"), `display_name` is
the user-facing label ("DOLO 650MG TAB (PARACETAMOL) (MICRO)") — what we
show in pills and substitute into drug_name. There is no name_search
column; prefix/trigram indexes live directly on `name`.

Search takes STRUCTURED terms (name / strength / generic / form) and
runs three ranked strategies, each capped at %(limit)s, unioned then
deduped by medication_id keeping each row's BEST (lowest) rank:

    rank 1  prefix     lower(name) LIKE lower(<name>%%)          (strongest)
    rank 2  full-text  search_vector @@ plainto_tsquery(<name generic>)
                       (name + generic_name + generic_list + manufacturer)
    rank 3  fuzzy      word_similarity(<name>, name)             (trigram)

Within every rank the score gets bonuses so the right variant sorts
first: +0.5 when the catalog strength's number sequence equals the
dictated one ("650MG" == "650 mg" == "650"), +0.1 when form_name matches.
final = unique(rank1 + rank2 + rank3), ordered rank ASC then score DESC.

Notes:
  * rank-2 hits can match on generic or manufacturer alone; replacement
    policy for them lives in tool.decide_match.
  * scores are not comparable across ranks (1.x vs ts_rank vs similarity);
    ordering is rank-major precisely for that reason.

Backends:

    PostgresMedicationSearch — production: the SQL above via echo's
        asyncpg-backed PostgresClient (connection from ECHO_PG_* env
        vars, pool created lazily on first query).

    CsvMedicationSearch — stage/local mock: same interface and the same
        strategies re-implemented in pure Python over a CSV export in
        the v2 format. Also the fixture backend for unit tests.
"""

import csv
import os
import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Protocol

from logs.custom_logger import get_logger
from pydantic import BaseModel

logger = get_logger(__name__)

DEFAULT_SUGGESTION_LIMIT = 5

MEDICATION_COLUMNS = (
    "medication_id, name, display_name, strength, "
    "generic_name, generic_id, generic_list, generic_list_ids, "
    "form_name, form_id, sku, schedule_code, custom_type, "
    "therapy_class, therapy_class_id, action_class, action_class_id, "
    "manufacturer, otc"
)

#score bonuses applied inside every CTE so the matching variant sorts
# first WITHIN its rank (e.g. DOLO-650 above DOLO-1000 among prefix hits;
# a pure-clopidogrel brand above a clopidogrel+aspirin combo when the
# doctor dictated the bare generic).
_BONUS_SQL = """
       + CASE WHEN %(strength_nums)s <> ''
                   AND regexp_replace(lower(coalesce(strength, '')),
                                      '[^0-9./]', '', 'g') = %(strength_nums)s
              THEN 0.5 ELSE 0.0 END
       + CASE WHEN %(generic)s <> ''
                   AND lower(coalesce(generic_name, '')) LIKE %(generic)s || '%%'
                   AND (strpos(coalesce(generic_name, ''), '+') = 0)
                       = (strpos(%(generic)s, '+') = 0)
              THEN 0.25 ELSE 0.0 END
       + CASE WHEN %(form)s <> ''
                   AND lower(coalesce(form_name, '')) = %(form)s
              THEN 0.1 ELSE 0.0 END
"""

SEARCH_MEDICATIONS_SQL = f"""
WITH prefix AS (
    SELECT {MEDICATION_COLUMNS}, 1 AS rank,
           (1.0 {_BONUS_SQL})::float AS score
    FROM datasets_medication
    WHERE workspace_id = %(b_id)s AND is_active = TRUE
      AND %(name)s <> ''
      AND lower(name) LIKE lower(%(prefix)s)
    ORDER BY score DESC, name ASC
    LIMIT %(limit)s
),
fts AS (
    SELECT {MEDICATION_COLUMNS}, 2 AS rank,
           (ts_rank(search_vector, plainto_tsquery('simple', %(q_text)s))
            {_BONUS_SQL})::float AS score
    FROM datasets_medication
    WHERE workspace_id = %(b_id)s AND is_active = TRUE
      AND %(q_text)s <> ''
      AND search_vector @@ plainto_tsquery('simple', %(q_text)s)
    ORDER BY score DESC
    LIMIT %(limit)s
),
fuzzy AS (
    SELECT {MEDICATION_COLUMNS}, 3 AS rank,
           (word_similarity(%(name)s, name) {_BONUS_SQL})::float AS score
    FROM datasets_medication
    WHERE workspace_id = %(b_id)s AND is_active = TRUE
      AND %(name)s <> ''
      AND word_similarity(%(name)s, name) >= %(fuzzy_threshold)s
    ORDER BY score DESC
    LIMIT %(limit)s
)
SELECT {MEDICATION_COLUMNS}, rank, score
FROM (
    SELECT DISTINCT ON (medication_id) *
    FROM (
        SELECT * FROM prefix
        UNION ALL SELECT * FROM fts
        UNION ALL SELECT * FROM fuzzy
    ) unioned
    ORDER BY medication_id, rank ASC, score DESC
) deduped
ORDER BY rank ASC, score DESC, name ASC
LIMIT %(limit)s
"""

HAS_WORKSPACE_SQL = """
SELECT 1
FROM datasets_medication
WHERE workspace_id = %(b_id)s AND is_active = TRUE
LIMIT 1
"""


def canon_strength(strength: str) -> str:
    """Number-sequence canonical form for strength comparison:
    '650MG' == '650 mg' == '650' -> '650'; '2.5/500MG' -> '2.5/500'."""
    return re.sub(r"[^0-9./]", "", (strength or "").lower())


class MedicationHit(BaseModel):
    """One catalog candidate for a dictated drug."""

    medication_id: str
    name: str  # search/matching field ("DOLO")
    display_name: str  # user-facing label — what replaces drug_name
    strength: Optional[str] = None
    generic_name: Optional[str] = None
    generic_id: Optional[str] = None
    form_name: Optional[str] = None
    form_id: Optional[str] = None
    manufacturer: Optional[str] = None
    rank: int  # 1=prefix, 2=full-text, 3=fuzzy
    score: float
    record: Dict[str, Any] = {}  # full catalog row for downstream consumers


class MedicationSearchBackend(Protocol):
    async def search(
        self,
        *,
        b_id: str,
        name: str,
        strength: str = "",
        generic: str = "",
        form: str = "",
        limit: int = DEFAULT_SUGGESTION_LIMIT,
    ) -> List[MedicationHit]: ...

    async def has_workspace(self, b_id: str) -> bool: ...


def _row_to_hit(row: Dict[str, Any], rank: int, score: float) -> MedicationHit:
    name = str(row.get("name") or "")
    return MedicationHit(
        medication_id=str(row.get("medication_id") or ""),
        name=name,
        display_name=str(row.get("display_name") or "") or name,
        strength=row.get("strength") or None,
        generic_name=row.get("generic_name") or None,
        generic_id=row.get("generic_id") or None,
        form_name=row.get("form_name") or None,
        form_id=row.get("form_id") or None,
        manufacturer=row.get("manufacturer") or None,
        rank=rank,
        score=float(score),
        record={k: v for k, v in row.items() if k not in ("rank", "score")},
    )


def _escape_like_prefix(text: str) -> str:
    """Escape LIKE wildcards in the user text; backslash is Postgres's
    default LIKE escape character."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"{escaped}%"


class PostgresMedicationSearch:
    """Searches datasets_medication (v2) through echo's PostgresClient."""

    def __init__(self, client: Any = None) -> None:
        self._client = client  # injectable for tests; lazy otherwise

    def _get_client(self) -> Any:
        if self._client is None:
            from echo.databases.postgres import PostgresClient

            self._client = PostgresClient()
        return self._client

    async def search(
        self,
        *,
        b_id: str,
        name: str,
        strength: str = "",
        generic: str = "",
        form: str = "",
        limit: int = DEFAULT_SUGGESTION_LIMIT,
    ) -> List[MedicationHit]:
        name = (name or "").strip()
        q_text = " ".join(t for t in (name, (generic or "").strip()) if t)
        if not name and not q_text:
            return []
        rows = await self._get_client().fetch_all(
            SEARCH_MEDICATIONS_SQL,
            params={
                "b_id": b_id,
                "name": name,
                "prefix": _escape_like_prefix(name),
                "q_text": q_text,
                "strength_nums": canon_strength(strength),
                "generic": (generic or "").strip().lower(),
                "form": (form or "").strip().lower(),
                "limit": limit,
                "fuzzy_threshold": float(
                    os.getenv("MEDICATION_FUZZY_THRESHOLD", "0.5")
                ),
            },
        )
        return [_row_to_hit(r, int(r["rank"]), float(r["score"])) for r in rows]

    async def has_workspace(self, b_id: str) -> bool:
        rows = await self._get_client().fetch_all(
            HAS_WORKSPACE_SQL, params={"b_id": b_id}
        )
        return bool(rows)


def _word_similarity(query: str, text: str) -> float:
    """Approximate Postgres word_similarity: best SequenceMatcher ratio of
    the query against same-length token windows of the text."""
    q = query.lower().strip()
    tokens = text.lower().split()
    if not q or not tokens:
        return 0.0
    window = max(len(q.split()), 1)
    best = SequenceMatcher(None, q, text.lower()).ratio()
    for i in range(len(tokens)):
        candidate = " ".join(tokens[i : i + window])
        best = max(best, SequenceMatcher(None, q, candidate).ratio())
    return best


class CsvMedicationSearch:
    """Stage/local mock over a v2-format CSV export of datasets_medication.

    Expected header (extra columns are carried through into `record`):
        medication_id, name, display_name, generic_name, strength,
        form_name, form_id, manufacturer, otc, is_active
    Optional columns handled the same way as Postgres: aliases /
    generic_list ('|' or ';' separated), workspace_id (when present and
    non-empty, matched against b_id; rows without it match every
    workspace — the bundled stage catalog has no workspace_id column).
    """

    def __init__(self, csv_path: str) -> None:
        self._path = csv_path
        self._rows: Optional[List[Dict[str, Any]]] = None

    @staticmethod
    def _split_list(value: str) -> List[str]:
        return [p.strip() for p in value.replace(";", "|").split("|") if p.strip()]

    def _load(self) -> List[Dict[str, Any]]:
        if self._rows is None:
            with open(self._path, newline="", encoding="utf-8-sig") as f:
                self._rows = [
                    {k.strip(): (v or "").strip() for k, v in row.items() if k}
                    for row in csv.DictReader(f)
                ]
            logger.info(
                "medication CSV catalog loaded",
                path=self._path,
                rows=len(self._rows),
            )
        return self._rows

    async def search(
        self,
        *,
        b_id: str,
        name: str,
        strength: str = "",
        generic: str = "",
        form: str = "",
        limit: int = DEFAULT_SUGGESTION_LIMIT,
    ) -> List[MedicationHit]:
        q_name = (name or "").strip().lower()
        q_text = " ".join(
            t for t in (q_name, (generic or "").strip().lower()) if t
        )
        if not q_name and not q_text:
            return []
        strength_nums = canon_strength(strength)
        q_generic = (generic or "").strip().lower()
        q_form = (form or "").strip().lower()
        fuzzy_threshold = float(os.getenv("MEDICATION_FUZZY_THRESHOLD", "0.5"))
        q_tokens = set(q_text.split())

        best: Dict[str, MedicationHit] = {}

        def bonus(row: Dict[str, Any]) -> float:
            b = 0.0
            if strength_nums and canon_strength(row.get("strength", "")) == strength_nums:
                b += 0.5
            row_generic = row.get("generic_name", "").lower()
            if (
                q_generic
                and row_generic.startswith(q_generic)
                and (("+" in row_generic) == ("+" in q_generic))
            ):
                b += 0.25
            if q_form and row.get("form_name", "").lower() == q_form:
                b += 0.1
            return b

        def consider(row: Dict[str, Any], rank: int, score: float) -> None:
            hit = _row_to_hit(row, rank, score + bonus(row))
            prev = best.get(hit.medication_id)
            if prev is None or (hit.rank, -hit.score) < (prev.rank, -prev.score):
                best[hit.medication_id] = hit

        for row in self._load():
            ws = row.get("workspace_id", "")
            if ws and ws != b_id:
                continue
            if row.get("is_active", "").lower() in ("false", "0"):
                continue
            row_name = row.get("name", "")

            # rank 1 — prefix on name
            if q_name and row_name.lower().startswith(q_name):
                consider(row, 1, 1.0)
                continue

            # rank 2 — token overlap over name + generic_name + generic_list
            # + manufacturer (approximates plainto_tsquery AND-semantics)
            fts_text = " ".join(
                [row_name, row.get("generic_name", ""), row.get("manufacturer", "")]
                + self._split_list(row.get("generic_list", ""))
            ).lower()
            fts_tokens = set(fts_text.split())
            if q_tokens and q_tokens <= fts_tokens:
                consider(row, 2, len(q_tokens) / max(len(fts_tokens), 1))
                continue

            # rank 3 — fuzzy on name (+ aliases when present)
            candidates = [row_name, *self._split_list(row.get("aliases", ""))]
            sim = max(
                (_word_similarity(q_name, c) for c in candidates if c),
                default=0.0,
            ) if q_name else 0.0
            if sim >= fuzzy_threshold:
                consider(row, 3, sim)

        ordered = sorted(best.values(), key=lambda h: (h.rank, -h.score, h.name))
        return ordered[:limit]

    async def has_workspace(self, b_id: str) -> bool:
        return any(
            row.get("workspace_id", "") == b_id
            and row.get("is_active", "").lower() not in ("false", "0")
            for row in self._load()
        )


BUNDLED_CATALOG_CSV = os.path.join(os.path.dirname(__file__), "drug_catalog.csv")


def _is_stage_env() -> bool:
    env = (os.getenv("ENV") or os.getenv("CURR_ENV") or "").lower()
    return env in ("dev", "stage")


_backend: Optional[MedicationSearchBackend] = None


def get_medication_search_backend() -> MedicationSearchBackend:
    global _backend
    if _backend is None:
        if _is_stage_env():
            logger.info(
                "stage environment: medication search uses bundled CSV catalog",
                path=BUNDLED_CATALOG_CSV,
            )
            _backend = CsvMedicationSearch(BUNDLED_CATALOG_CSV)
        else:
            _backend = PostgresMedicationSearch()
    return _backend


def reset_medication_search_backend() -> None:
    """Testing hook — force re-selection from env on next use."""
    global _backend
    _backend = None

"""
Lab-test catalog search — SQL + backends (datasets_lab_test).

Catalog shape: `name` is the search/matching field ("X-Ray Chest PA
View", "Hemoglobin"), `aliases` carry the abbreviations doctors actually
dictate ("CXR", "Hb", "CBC"), `display_name` is the user-facing label —
what we show in pills and substitute into the `investigation` cell.
Imaging rows additionally carry `body_part` / `laterality` / `view`.

Search takes STRUCTURED terms (name / body_part / laterality / view) and
runs three ranked strategies, each capped at %(limit)s, unioned then
deduped by lab_test_id keeping each row's BEST (lowest) rank:

    rank 1  prefix     lower(name) LIKE lower(<name>%%) OR any alias
                       prefix-matches                          (strongest)
    rank 2  full-text  search_vector @@ plainto_tsquery(<name>)
                       (name + display_name + aliases + body_part)
    rank 3  fuzzy      word_similarity(<name>, name + aliases) (trigram)

Within every rank the score gets bonuses so the right variant sorts
first: +0.5 body_part match, +0.25 laterality match, +0.25 view match
(the imaging analog of the medication strength bonus — X-Ray Chest PA
above AP when the doctor said "PA"). final = unique(rank1+rank2+rank3),
ordered rank ASC then score DESC.

Scores are not comparable across ranks (1.x vs ts_rank vs similarity);
ordering is rank-major precisely for that reason. Replacement policy
lives in tool.decide_match.

Backends:

    PostgresLabTestSearch — production: the SQL above via echo's
        asyncpg-backed PostgresClient (connection from ECHO_PG_* env
        vars, pool created lazily on first query).

    CsvLabTestSearch — stage/local mock: same interface and the same
        strategies re-implemented in pure Python over a CSV export.
        Array cells accept Postgres literal format ("{Hb,HGB}") or
        '|'/';' separated. Also the fixture backend for unit tests.
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

LAB_TEST_COLUMNS = (
    "lab_test_id, ekaid, name, display_name, aliases, loinc, kind, "
    "result_type, discipline, specimen, unit, unit_id, "
    "panel_members, panel_member_ids, method, body_part, laterality, view"
)

# score bonuses applied inside every CTE so the matching variant sorts
# first WITHIN its rank (X-Ray Chest PA above AP among prefix hits when
# the doctor dictated "PA"; MRI Left Knee above Right when "left").
_BONUS_SQL = """
       + CASE WHEN %(body_part)s <> ''
                   AND lower(coalesce(body_part, '')) = %(body_part)s
              THEN 0.5 ELSE 0.0 END
       + CASE WHEN %(laterality)s <> ''
                   AND lower(coalesce(laterality, '')) = %(laterality)s
              THEN 0.25 ELSE 0.0 END
       + CASE WHEN %(view)s <> ''
                   AND lower(coalesce(view, '')) = %(view)s
              THEN 0.25 ELSE 0.0 END
"""

SEARCH_LAB_TESTS_SQL = f"""
WITH prefix AS (
    SELECT {LAB_TEST_COLUMNS}, 1 AS rank,
           (1.0 {_BONUS_SQL})::float AS score
    FROM datasets_lab_test
    WHERE workspace_id = %(b_id)s AND is_active = TRUE
      AND %(name)s <> ''
      AND (lower(name) LIKE lower(%(prefix)s)
           OR EXISTS (SELECT 1 FROM unnest(aliases) alias
                      WHERE lower(alias) LIKE lower(%(prefix)s)))
    ORDER BY score DESC, name ASC
    LIMIT %(limit)s
),
fts AS (
    SELECT {LAB_TEST_COLUMNS}, 2 AS rank,
           (ts_rank(search_vector, plainto_tsquery('simple', %(name)s))
            {_BONUS_SQL})::float AS score
    FROM datasets_lab_test
    WHERE workspace_id = %(b_id)s AND is_active = TRUE
      AND %(name)s <> ''
      AND search_vector @@ plainto_tsquery('simple', %(name)s)
    ORDER BY score DESC
    LIMIT %(limit)s
),
fuzzy AS (
    SELECT {LAB_TEST_COLUMNS}, 3 AS rank,
           (word_similarity(%(name)s,
                            name || ' ' || array_to_string(aliases, ' '))
            {_BONUS_SQL})::float AS score
    FROM datasets_lab_test
    WHERE workspace_id = %(b_id)s AND is_active = TRUE
      AND %(name)s <> ''
      AND word_similarity(%(name)s,
                          name || ' ' || array_to_string(aliases, ' '))
          >= %(fuzzy_threshold)s
    ORDER BY score DESC
    LIMIT %(limit)s
)
SELECT {LAB_TEST_COLUMNS}, rank, score
FROM (
    SELECT DISTINCT ON (lab_test_id) *
    FROM (
        SELECT * FROM prefix
        UNION ALL SELECT * FROM fts
        UNION ALL SELECT * FROM fuzzy
    ) unioned
    ORDER BY lab_test_id, rank ASC, score DESC
) deduped
ORDER BY rank ASC, score DESC, name ASC
LIMIT %(limit)s
"""


def parse_array(value: Any) -> List[str]:
    """Normalize an array cell: asyncpg already returns lists; CSV cells
    may be Postgres literals ("{Hb,Haemoglobin}") or '|'/';' separated."""
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if str(v).strip()]
    v = str(value).strip()
    if not v or v == "{}":
        return []
    if v.startswith("{") and v.endswith("}"):
        v = v[1:-1]
    parts = re.split(r"[|;,]", v)
    return [p.strip().strip('"') for p in parts if p.strip().strip('"')]


class LabTestHit(BaseModel):
    """One catalog candidate for a dictated investigation."""

    lab_test_id: str
    name: str  # search/matching field
    display_name: str  # user-facing label — what replaces `investigation`
    ekaid: Optional[str] = None
    loinc: Optional[str] = None
    kind: Optional[str] = None  # laboratory|imaging|functional|special_test|panel|package
    result_type: Optional[str] = None
    aliases: List[str] = []
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
    rank: int  # 1=prefix/alias, 2=full-text, 3=fuzzy
    score: float
    record: Dict[str, Any] = {}  # full catalog row for downstream consumers


class LabTestSearchBackend(Protocol):
    async def search(
        self,
        *,
        b_id: str,
        name: str,
        body_part: str = "",
        laterality: str = "",
        view: str = "",
        limit: int = DEFAULT_SUGGESTION_LIMIT,
    ) -> List[LabTestHit]: ...


def _row_to_hit(row: Dict[str, Any], rank: int, score: float) -> LabTestHit:
    name = str(row.get("name") or "")
    return LabTestHit(
        lab_test_id=str(row.get("lab_test_id") or ""),
        name=name,
        display_name=str(row.get("display_name") or "") or name,
        ekaid=row.get("ekaid") or None,
        loinc=row.get("loinc") or None,
        kind=row.get("kind") or None,
        result_type=row.get("result_type") or None,
        aliases=parse_array(row.get("aliases")),
        discipline=parse_array(row.get("discipline")),
        specimen=row.get("specimen") or None,
        unit=row.get("unit") or None,
        unit_id=row.get("unit_id") or None,
        method=row.get("method") or None,
        body_part=row.get("body_part") or None,
        laterality=row.get("laterality") or None,
        view=row.get("view") or None,
        panel_members=parse_array(row.get("panel_members")),
        panel_member_ids=parse_array(row.get("panel_member_ids")),
        rank=rank,
        score=float(score),
        record={k: v for k, v in row.items() if k not in ("rank", "score")},
    )


def _escape_like_prefix(text: str) -> str:
    """Escape LIKE wildcards in the user text; backslash is Postgres's
    default LIKE escape character."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"{escaped}%"


class PostgresLabTestSearch:
    """Searches datasets_lab_test through echo's PostgresClient."""

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
        body_part: str = "",
        laterality: str = "",
        view: str = "",
        limit: int = DEFAULT_SUGGESTION_LIMIT,
    ) -> List[LabTestHit]:
        name = (name or "").strip()
        if not name:
            return []
        rows = await self._get_client().fetch_all(
            SEARCH_LAB_TESTS_SQL,
            params={
                "b_id": b_id,
                "name": name,
                "prefix": _escape_like_prefix(name),
                "body_part": (body_part or "").strip().lower(),
                "laterality": (laterality or "").strip().lower(),
                "view": (view or "").strip().lower(),
                "limit": limit,
                "fuzzy_threshold": float(
                    os.getenv("LAB_TEST_FUZZY_THRESHOLD", "0.5")
                ),
            },
        )
        return [_row_to_hit(r, int(r["rank"]), float(r["score"])) for r in rows]


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


class CsvLabTestSearch:
    """Stage/local mock over a CSV export of datasets_lab_test.

    Expected header (extra columns are carried through into `record`;
    `partner_id` is accepted as an alias for `lab_test_id` — the sample
    export uses it):
        partner_id, name, display_name, aliases, loinc, kind, result_type,
        discipline, specimen, unit, unit_id, panel_members,
        panel_member_ids, method, body_part, laterality, view
    Optional columns handled the same way as Postgres: workspace_id (when
    present and non-empty, matched against b_id; rows without it match
    every workspace), is_active.
    """

    def __init__(self, csv_path: str) -> None:
        self._path = csv_path
        self._rows: Optional[List[Dict[str, Any]]] = None

    def _load(self) -> List[Dict[str, Any]]:
        if self._rows is None:
            with open(self._path, newline="", encoding="utf-8-sig") as f:
                rows = []
                for row in csv.DictReader(f):
                    r = {k.strip(): (v or "").strip() for k, v in row.items() if k}
                    if "lab_test_id" not in r and r.get("partner_id"):
                        r["lab_test_id"] = r["partner_id"]
                    rows.append(r)
                self._rows = rows
            logger.info(
                "lab-test CSV catalog loaded",
                path=self._path,
                rows=len(self._rows),
            )
        return self._rows

    async def search(
        self,
        *,
        b_id: str,
        name: str,
        body_part: str = "",
        laterality: str = "",
        view: str = "",
        limit: int = DEFAULT_SUGGESTION_LIMIT,
    ) -> List[LabTestHit]:
        q_name = (name or "").strip().lower()
        if not q_name:
            return []
        q_body_part = (body_part or "").strip().lower()
        q_laterality = (laterality or "").strip().lower()
        q_view = (view or "").strip().lower()
        fuzzy_threshold = float(os.getenv("LAB_TEST_FUZZY_THRESHOLD", "0.5"))
        q_tokens = set(q_name.split())

        best: Dict[str, LabTestHit] = {}

        def bonus(row: Dict[str, Any]) -> float:
            b = 0.0
            if q_body_part and row.get("body_part", "").lower() == q_body_part:
                b += 0.5
            if q_laterality and row.get("laterality", "").lower() == q_laterality:
                b += 0.25
            if q_view and row.get("view", "").lower() == q_view:
                b += 0.25
            return b

        def consider(row: Dict[str, Any], rank: int, score: float) -> None:
            hit = _row_to_hit(row, rank, score + bonus(row))
            prev = best.get(hit.lab_test_id)
            if prev is None or (hit.rank, -hit.score) < (prev.rank, -prev.score):
                best[hit.lab_test_id] = hit

        for row in self._load():
            ws = row.get("workspace_id", "")
            if ws and ws != b_id:
                continue
            if row.get("is_active", "").lower() in ("false", "0"):
                continue
            row_name = row.get("name", "")
            aliases = parse_array(row.get("aliases"))

            # rank 1 — prefix on name OR any alias
            if row_name.lower().startswith(q_name) or any(
                a.lower().startswith(q_name) for a in aliases
            ):
                consider(row, 1, 1.0)
                continue

            # rank 2 — token overlap over name + display_name + aliases +
            # body_part (approximates plainto_tsquery AND-semantics over
            # the search_vector)
            fts_text = " ".join(
                [row_name, row.get("display_name", ""), row.get("body_part", "")]
                + aliases
            ).lower()
            fts_tokens = set(fts_text.split())
            if q_tokens and q_tokens <= fts_tokens:
                consider(row, 2, len(q_tokens) / max(len(fts_tokens), 1))
                continue

            # rank 3 — fuzzy on name + aliases
            sim = _word_similarity(q_name, " ".join([row_name, *aliases]))
            if sim >= fuzzy_threshold:
                consider(row, 3, sim)

        ordered = sorted(best.values(), key=lambda h: (h.rank, -h.score, h.name))
        return ordered[:limit]


BUNDLED_CATALOG_CSV = os.path.join(os.path.dirname(__file__), "lab_catalog.csv")


def _is_stage_env() -> bool:
    env = (os.getenv("ENV") or os.getenv("CURR_ENV") or "").lower()
    return env in ("dev", "stage")


_backend: Optional[LabTestSearchBackend] = None


def get_lab_test_search_backend() -> LabTestSearchBackend:
    global _backend
    if _backend is None:
        if _is_stage_env():
            logger.info(
                "stage environment: lab-test search uses bundled CSV catalog",
                path=BUNDLED_CATALOG_CSV,
            )
            _backend = CsvLabTestSearch(BUNDLED_CATALOG_CSV)
        else:
            _backend = PostgresLabTestSearch()
    return _backend


def reset_lab_test_search_backend() -> None:
    """Testing hook — force re-selection from env on next use."""
    global _backend
    _backend = None

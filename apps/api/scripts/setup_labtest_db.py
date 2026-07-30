"""
Idempotent setup + CSV loader for the local datasets_lab_test table
(lab-test catalog searched by the AG-UI scribe enrichment — see
voice2rx/services/templates/ag_ui/tools/lab/search.py).

Mirrors the datasets (matrix) service's Django LabTest model:
DatasetEntry base columns (workspace_id / kb_id / ekaid / name / aliases /
is_active / timestamps) + lab-test fields. `name` is the search/matching
field (prefix/full-text/trigram indexes live on it directly); `aliases`
carry the dictated abbreviations ("CBC", "CXR", "Hb"); `display_name` is
the user-facing label (defaults to `name` when the CSV doesn't supply
one). `lab_test_id` is the partner's own test ID — the CSV export names
this column `partner_id`, both spellings are accepted.

    search_vector  tsvector over name + display_name + aliases +
                   body_part (rank-2 full-text)

Array cells (aliases / discipline / panel_members / panel_member_ids)
accept Postgres literal format ("{Hb,HGB}") or '|'/';' separated.

Deliberately dependency-free besides asyncpg (no voice2rx imports — those
pull AWS Secrets Manager at import time).

Connection comes from the same env the runtime uses:
    ECHO_PG_HOST (localhost) / ECHO_PG_PORT (5433) / ECHO_PG_DATABASE (matrix)
    ECHO_PG_USER (matrix)   / ECHO_PG_PASSWORD (matrix)
(defaults in parentheses match docker-compose-dev.yml's postgres service)

Usage:
    python scripts/setup_labtest_db.py                       # DDL only
    python scripts/setup_labtest_db.py --csv labs.csv        # DDL + load
    python scripts/setup_labtest_db.py --recreate --csv labs.csv \
        --workspace-id <b_id> [--kb-id <kb>] [--truncate]

--recreate DROPS the table first (schema migrations on local dev).
Upserts on (workspace_id, kb_id, lab_test_id) — safe to re-run.
"""

import argparse
import asyncio
import csv
import os
import re
import sys

import asyncpg

DDL = """
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- array_to_string is only STABLE in Postgres; generated columns need
-- IMMUTABLE expressions. Same wrapper pattern as the matrix service.
CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT array_to_string($1, $2) $$;

CREATE TABLE IF NOT EXISTS datasets_lab_test (
    id               bigserial PRIMARY KEY,
    -- DatasetEntry base
    workspace_id     varchar(64)  NOT NULL,
    kb_id            varchar(64)  NOT NULL DEFAULT '',
    ekaid            varchar(64),
    name             varchar(300) NOT NULL,
    aliases          text[]       NOT NULL DEFAULT '{}',
    is_active        boolean      NOT NULL DEFAULT TRUE,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),
    -- LabTest
    lab_test_id      varchar(200) NOT NULL,
    display_name     varchar(200) NOT NULL,
    loinc            varchar(32),
    kind             varchar(16)  NOT NULL,
    result_type      varchar(16)  NOT NULL,
    discipline       text[]       NOT NULL DEFAULT '{}',
    specimen         varchar(100),
    unit             varchar(32),
    unit_id          varchar(64),
    panel_members    text[]       NOT NULL DEFAULT '{}',
    panel_member_ids text[]       NOT NULL DEFAULT '{}',
    method           varchar(100),
    body_part        varchar(100),
    laterality       varchar(32),
    view             varchar(64),
    -- generated full-text column (rank 2); prefix/trigram search (ranks
    -- 1 and 3) runs directly on `name` (+ aliases via unnest in the query)
    search_vector    tsvector GENERATED ALWAYS AS (
        to_tsvector('simple',
            coalesce(name, '') || ' ' ||
            coalesce(display_name, '') || ' ' ||
            immutable_array_to_string(aliases, ' ') || ' ' ||
            coalesce(body_part, ''))
    ) STORED,
    CONSTRAINT datasets_labtest_ws_kb_ltid_uniq
        UNIQUE (workspace_id, kb_id, lab_test_id)
);

CREATE INDEX IF NOT EXISTS dslt_ws_kb_act_upd_idx
    ON datasets_lab_test (workspace_id, kb_id, is_active, updated_at DESC);
CREATE INDEX IF NOT EXISTS dslt_ekaid_idx
    ON datasets_lab_test (ekaid);
CREATE INDEX IF NOT EXISTS dslt_ws_ltid_idx
    ON datasets_lab_test (workspace_id, lab_test_id);
CREATE INDEX IF NOT EXISTS dslt_search_vector_gin
    ON datasets_lab_test USING gin (search_vector);
CREATE INDEX IF NOT EXISTS dslt_name_trgm
    ON datasets_lab_test USING gin (name gin_trgm_ops);
-- prefix rank: lower(name) LIKE 'q%'
CREATE INDEX IF NOT EXISTS dslt_name_prefix_idx
    ON datasets_lab_test (lower(name) text_pattern_ops);
"""

UPSERT = """
INSERT INTO datasets_lab_test (
    workspace_id, kb_id, lab_test_id, ekaid, name, display_name, aliases,
    loinc, kind, result_type, discipline, specimen, unit, unit_id,
    panel_members, panel_member_ids, method, body_part, laterality, view,
    is_active
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21)
ON CONFLICT (workspace_id, kb_id, lab_test_id) DO UPDATE SET
    ekaid = EXCLUDED.ekaid,
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    aliases = EXCLUDED.aliases,
    loinc = EXCLUDED.loinc,
    kind = EXCLUDED.kind,
    result_type = EXCLUDED.result_type,
    discipline = EXCLUDED.discipline,
    specimen = EXCLUDED.specimen,
    unit = EXCLUDED.unit,
    unit_id = EXCLUDED.unit_id,
    panel_members = EXCLUDED.panel_members,
    panel_member_ids = EXCLUDED.panel_member_ids,
    method = EXCLUDED.method,
    body_part = EXCLUDED.body_part,
    laterality = EXCLUDED.laterality,
    view = EXCLUDED.view,
    is_active = EXCLUDED.is_active,
    updated_at = now()
"""

BATCH = 1000


def _s(value, limit):
    """Trimmed string or None, clamped to the column length."""
    v = (value or "").strip()
    return v[:limit] if v else None


def _b(value, default=False):
    v = (value or "").strip().lower()
    if not v:
        return default
    return v in ("1", "true", "yes", "t")


def _arr(value):
    """Array cell: Postgres literal ('{Hb,Haemoglobin}') or '|'/';'
    separated."""
    v = (value or "").strip()
    if not v or v == "{}":
        return []
    if v.startswith("{") and v.endswith("}"):
        v = v[1:-1]
    parts = re.split(r"[|;,]", v)
    return [p.strip().strip('"') for p in parts if p.strip().strip('"')]


def csv_to_records(path, workspace_id, kb_id):
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            # the export names the partner's test id `partner_id`
            test_id = _s(row.get("lab_test_id") or row.get("partner_id"), 200)
            name = _s(row.get("name"), 300)
            if not test_id or not name:
                continue
            yield (
                workspace_id,
                kb_id,
                test_id,
                _s(row.get("ekaid"), 64),
                name,
                # importer rule: display_name defaults to name when absent
                _s(row.get("display_name"), 200) or name[:200],
                _arr(row.get("aliases")),
                _s(row.get("loinc"), 32),
                _s(row.get("kind"), 16) or "laboratory",
                _s(row.get("result_type"), 16) or "na",
                _arr(row.get("discipline")),
                _s(row.get("specimen"), 100),
                _s(row.get("unit"), 32),
                _s(row.get("unit_id"), 64),
                _arr(row.get("panel_members")),
                _arr(row.get("panel_member_ids")),
                _s(row.get("method"), 100),
                _s(row.get("body_part"), 100),
                _s(row.get("laterality"), 32),
                _s(row.get("view"), 64),
                _b(row.get("is_active"), default=True),
            )


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", help="CSV to load (omit for DDL only)")
    parser.add_argument(
        "--workspace-id",
        default="test-ws",
        help="workspace_id (b_id) to load rows under [default: test-ws]",
    )
    parser.add_argument("--kb-id", default="", help="kb_id [default: '']")
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="DROP the table first (local schema migration)",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="delete existing rows for (workspace-id, kb-id) before loading",
    )
    args = parser.parse_args()

    conn = await asyncpg.connect(
        host=os.getenv("ECHO_PG_HOST", "localhost"),
        port=int(os.getenv("ECHO_PG_PORT", "5433")),
        database=os.getenv("ECHO_PG_DATABASE", "matrix"),
        user=os.getenv("ECHO_PG_USER", "matrix"),
        password=os.getenv("ECHO_PG_PASSWORD", "matrix"),
    )
    try:
        if args.recreate:
            await conn.execute("DROP TABLE IF EXISTS datasets_lab_test")
            print("dropped datasets_lab_test (--recreate)")
        await conn.execute(DDL)
        print("DDL applied: datasets_lab_test (+ search columns/indexes)")

        if args.csv:
            # dedupe on the conflict key — a repeated id inside one batch
            # would abort the whole INSERT ("cannot affect row a second time")
            records = {r[2]: r for r in csv_to_records(args.csv, args.workspace_id, args.kb_id)}
            records = list(records.values())

            if args.truncate:
                deleted = await conn.execute(
                    "DELETE FROM datasets_lab_test WHERE workspace_id=$1 AND kb_id=$2",
                    args.workspace_id,
                    args.kb_id,
                )
                print(f"truncated existing rows: {deleted}")

            for i in range(0, len(records), BATCH):
                await conn.executemany(UPSERT, records[i : i + BATCH])
                print(f"upserted {min(i + BATCH, len(records))}/{len(records)}")

            count = await conn.fetchval(
                "SELECT count(*) FROM datasets_lab_test WHERE workspace_id=$1 AND kb_id=$2",
                args.workspace_id,
                args.kb_id,
            )
            print(
                f"done — {count} rows for workspace_id={args.workspace_id!r} "
                f"kb_id={args.kb_id!r}"
            )
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

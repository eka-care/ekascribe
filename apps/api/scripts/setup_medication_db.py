"""
Idempotent setup + CSV loader for the local datasets_medication table
(medication catalog searched by the AG-UI scribe enrichment — see
voice2rx/services/templates/ag_ui/tools/medication/search.py).

Mirrors the datasets (matrix) service's Django Medication model v2:
DatasetEntry base columns (workspace_id / kb_id / ekaid / name / aliases /
is_active / timestamps) + medication fields. `name` is the search/matching
field (prefix/full-text/trigram indexes live on it directly — no separate
name_search column in v2); `display_name` is the user-facing label
(defaults to `name` when the CSV doesn't supply one); `strength` is its
own column ("650MG", "2.5/500MG").

    search_vector  tsvector over name + generic_name + generic_list +
                   manufacturer (rank-2 full-text)

Deliberately dependency-free besides asyncpg (no voice2rx imports — those
pull AWS Secrets Manager at import time).

Connection comes from the same env the runtime uses:
    ECHO_PG_HOST (localhost) / ECHO_PG_PORT (5433) / ECHO_PG_DATABASE (matrix)
    ECHO_PG_USER (matrix)   / ECHO_PG_PASSWORD (matrix)
(defaults in parentheses match docker-compose-dev.yml's postgres service)

Usage:
    python scripts/setup_medication_db.py                       # DDL only
    python scripts/setup_medication_db.py --csv drugs.csv       # DDL + load
    python scripts/setup_medication_db.py --recreate --csv drugs.csv \
        --workspace-id <b_id> [--kb-id <kb>] [--truncate]

--recreate DROPS the table first (schema migrations on local dev).
Upserts on (workspace_id, kb_id, medication_id) — safe to re-run.
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

CREATE TABLE IF NOT EXISTS datasets_medication (
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
    -- Medication
    medication_id    varchar(200) NOT NULL,
    display_name     varchar(200) NOT NULL,
    generic_name     varchar(300),
    generic_id       varchar(64),
    generic_list     text[]       NOT NULL DEFAULT '{}',
    generic_list_ids text[]       NOT NULL DEFAULT '{}',
    form_id          varchar(64),
    form_name        varchar(64),
    strength         varchar(32),
    sku              integer,
    schedule_code    varchar(32),
    custom_type      varchar(64),
    therapy_class    varchar(128),
    therapy_class_id integer,
    action_class     varchar(128),
    action_class_id  integer,
    manufacturer     varchar(200),
    otc              boolean      NOT NULL DEFAULT FALSE,
    -- generated full-text column (rank 2); prefix/trigram search (ranks
    -- 1 and 3) runs directly on `name` — no name_search column in v2
    search_vector    tsvector GENERATED ALWAYS AS (
        to_tsvector('simple',
            coalesce(name, '') || ' ' ||
            coalesce(generic_name, '') || ' ' ||
            immutable_array_to_string(generic_list, ' ') || ' ' ||
            coalesce(manufacturer, ''))
    ) STORED,
    CONSTRAINT datasets_medication_ws_kb_medid_uniq
        UNIQUE (workspace_id, kb_id, medication_id)
);

CREATE INDEX IF NOT EXISTS dsm_med_ws_kb_act_upd_idx
    ON datasets_medication (workspace_id, kb_id, is_active, updated_at DESC);
CREATE INDEX IF NOT EXISTS dsm_med_ekaid_idx
    ON datasets_medication (ekaid);
CREATE INDEX IF NOT EXISTS dsm_med_ws_medid_idx
    ON datasets_medication (workspace_id, medication_id);
CREATE INDEX IF NOT EXISTS dsm_med_search_vector_gin
    ON datasets_medication USING gin (search_vector);
CREATE INDEX IF NOT EXISTS dsm_med_name_trgm
    ON datasets_medication USING gin (name gin_trgm_ops);
-- prefix rank: lower(name) LIKE 'q%'
CREATE INDEX IF NOT EXISTS dsm_med_name_prefix_idx
    ON datasets_medication (lower(name) text_pattern_ops);
"""

UPSERT = """
INSERT INTO datasets_medication (
    workspace_id, kb_id, medication_id, name, display_name, aliases,
    generic_name, generic_id, generic_list, generic_list_ids,
    form_id, form_name, strength, sku, schedule_code, custom_type,
    therapy_class, therapy_class_id, action_class, action_class_id,
    manufacturer, otc, is_active
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23)
ON CONFLICT (workspace_id, kb_id, medication_id) DO UPDATE SET
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    aliases = EXCLUDED.aliases,
    generic_name = EXCLUDED.generic_name,
    generic_id = EXCLUDED.generic_id,
    generic_list = EXCLUDED.generic_list,
    generic_list_ids = EXCLUDED.generic_list_ids,
    form_id = EXCLUDED.form_id,
    form_name = EXCLUDED.form_name,
    strength = EXCLUDED.strength,
    sku = EXCLUDED.sku,
    schedule_code = EXCLUDED.schedule_code,
    custom_type = EXCLUDED.custom_type,
    therapy_class = EXCLUDED.therapy_class,
    therapy_class_id = EXCLUDED.therapy_class_id,
    action_class = EXCLUDED.action_class,
    action_class_id = EXCLUDED.action_class_id,
    manufacturer = EXCLUDED.manufacturer,
    otc = EXCLUDED.otc,
    is_active = EXCLUDED.is_active,
    updated_at = now()
"""

BATCH = 1000


def _s(value, limit):
    """Trimmed string or None, clamped to the column length."""
    v = (value or "").strip()
    return v[:limit] if v else None


def _i(value):
    v = (value or "").strip()
    return int(v) if v else None


def _b(value, default=False):
    v = (value or "").strip().lower()
    if not v:
        return default
    return v in ("1", "true", "yes", "t")


def _list(value):
    """Split combo/list cells on | ; or + (e.g. 'Metformin 500mg+Myo
    Inositol 600mg' -> two elements)."""
    v = (value or "").strip()
    if not v:
        return []
    return [p.strip() for p in re.split(r"[|;+]", v) if p.strip()]


def csv_to_records(path, workspace_id, kb_id):
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            med_id = _s(row.get("medication_id"), 200)
            name = _s(row.get("name"), 300)
            if not med_id or not name:
                continue
            yield (
                workspace_id,
                kb_id,
                med_id,
                name,
                # importer rule: display_name defaults to name when absent
                _s(row.get("display_name"), 200) or name[:200],
                _list(row.get("aliases")),
                _s(row.get("generic_name"), 300),
                _s(row.get("generic_id"), 64),
                _list(row.get("generic_list")),
                _list(row.get("generic_list_ids")),
                _s(row.get("form_id"), 64),
                _s(row.get("form_name"), 64),
                _s(row.get("strength"), 32),
                _i(row.get("sku")),
                _s(row.get("schedule_code"), 32),
                _s(row.get("custom_type"), 64),
                _s(row.get("therapy_class"), 128),
                _i(row.get("therapy_class_id")),
                _s(row.get("action_class"), 128),
                _i(row.get("action_class_id")),
                _s(row.get("manufacturer"), 200),
                _b(row.get("otc"), default=False),
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
            await conn.execute("DROP TABLE IF EXISTS datasets_medication")
            print("dropped datasets_medication (--recreate)")
        await conn.execute(DDL)
        print("DDL applied: datasets_medication v2 (+ search columns/indexes)")

        if args.csv:
            # dedupe on the conflict key — a repeated id inside one batch
            # would abort the whole INSERT ("cannot affect row a second time")
            records = {r[2]: r for r in csv_to_records(args.csv, args.workspace_id, args.kb_id)}
            records = list(records.values())

            if args.truncate:
                deleted = await conn.execute(
                    "DELETE FROM datasets_medication WHERE workspace_id=$1 AND kb_id=$2",
                    args.workspace_id,
                    args.kb_id,
                )
                print(f"truncated existing rows: {deleted}")

            for i in range(0, len(records), BATCH):
                await conn.executemany(UPSERT, records[i : i + BATCH])
                print(f"upserted {min(i + BATCH, len(records))}/{len(records)}")

            count = await conn.fetchval(
                "SELECT count(*) FROM datasets_medication WHERE workspace_id=$1 AND kb_id=$2",
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

"""Relational specs for every logical table (plan B2, Phase 2).

Each Dynamo table maps to a Postgres table with REAL typed columns for its keys
and every field the code queries on (the old GSIs become btree indexes), plus a
``data JSONB`` column holding the full item. Reads reconstruct the item from
``data``; writes mirror the spec'd columns. This keeps Dynamo semantic parity
(the same call sites run on either backend) while giving deployments real SQL:

    SELECT txn_id, processing_status FROM voice2rx_transactions
    WHERE b_id = '...' AND created_at > '2026-07-01' ORDER BY created_at DESC;
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Tuple


@dataclass(frozen=True)
class TableSpec:
    logical_name: str                    # Dynamo table name used by call sites
    pg_name: str                         # physical Postgres table name
    pk: Tuple[str, ...]                  # primary key column(s): (partition,) or (partition, sort)
    columns: Tuple[str, ...] = ()        # extra mirrored/typed columns (all TEXT)
    indexes: Tuple[Tuple[str, ...], ...] = ()  # btree indexes (the old GSIs)

    @property
    def sort_key(self) -> str | None:
        return self.pk[1] if len(self.pk) > 1 else None


_SPECS: List[TableSpec] = [
    TableSpec(
        logical_name="voice2rx_transactions",
        pg_name="voice2rx_transactions",
        pk=("txn_id", "b_id"),
        columns=("uuid", "patient_oid", "oid", "created_at", "processing_status"),
        indexes=(("b_id", "created_at"), ("uuid", "created_at"), ("patient_oid", "created_at")),
    ),
    TableSpec(
        logical_name="ekascribe_document",
        pg_name="ekascribe_document",
        pk=("document_id",),
        columns=("session_id", "template_id", "created_at"),
        indexes=(("session_id", "template_id"),),
    ),
    TableSpec(
        logical_name="ekascribe-audio-details",
        pg_name="ekascribe_audio_details",
        pk=("composite_key", "record_type"),
    ),
    TableSpec(
        logical_name="ekascribe_template_result",
        pg_name="ekascribe_template_result",
        pk=("txn_id", "template_id"),
    ),
    TableSpec(
        logical_name="ekascribe_template",
        pg_name="ekascribe_template",
        pk=("id",),
        columns=("wid",),  # workspace id; "DEFAULT" = available to all
        indexes=(("wid", "id"),),  # the wid-id GSI
    ),
    TableSpec(
        logical_name="ekascribe_template_section",
        pg_name="ekascribe_template_section",
        pk=("id",),
        columns=("wid",),
        indexes=(("wid", "id"),),
    ),
    TableSpec(
        logical_name="ekascribe_config",
        pg_name="ekascribe_config",
        pk=("b_id", "user_uuid"),
    ),
    TableSpec(
        logical_name="ekascribe_document_tiptap",
        pg_name="ekascribe_document_tiptap",
        pk=("document_id",),
    ),
]

SPECS: Dict[str, TableSpec] = {s.logical_name: s for s in _SPECS}


def get_spec(logical_name: str) -> TableSpec:
    spec = SPECS.get(logical_name)
    if spec is None:
        # Unknown tables get a sensible generic shape: single "id" partition key.
        spec = TableSpec(
            logical_name=logical_name,
            pg_name=logical_name.replace("-", "_"),
            pk=("id",),
        )
    return spec

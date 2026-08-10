"""Chunk-level pipeline state in Postgres (multi-process / multi-container safe).

Every audio chunk gets a row in ``audio_chunks`` keyed by (txn_id, filename).
Workers CLAIM a chunk before transcribing — a compare-and-set on status /
claimed_at via conditional updates — so any number of uvicorn workers or
worker containers can race on the same session without duplicating STT work:

    pending --claim--> processing --ok--> done
       ^                    |
       +---- failed <-------+   (failed and stale claims are re-claimable)

The blob-level transcript artifacts stay the idempotent source of truth for
content; this table is coordination + observability (per-session chunk
status is queryable). A ``__stitch__`` sentinel row makes the commit-time
stitch a single-winner step across processes.
"""

from __future__ import annotations

import time
from typing import Dict, List

from scribe_core.db import ConditionalCheckFailed, get_table
from scribe_core.logging import get_logger

logger = get_logger(__name__)

TABLE = "audio_chunks"
# a processing claim older than this is considered abandoned (worker died)
CLAIM_TTL_SECONDS = 300

STATUS_PENDING = "pending"
STATUS_PROCESSING = "processing"
STATUS_DONE = "done"
STATUS_FAILED = "failed"

# sentinel row for the commit-time stitch step (one winner per session)
STITCH_SENTINEL = "__stitch__"


def _now() -> int:
    return int(time.time())


def register_chunk(
    txn_id: str, filename: str, b_id: str = "", chunk_key: str = ""
) -> None:
    """Idempotently create the chunk row (pending)."""
    table = get_table(TABLE)
    try:
        table.put_item(
            {
                "txn_id": txn_id,
                "filename": filename,
                "status": STATUS_PENDING,
                "b_id": b_id,
                "chunk_key": chunk_key,
                "attempt": 0,
                "claimed_at": 0,
                "created_at": _now(),
                "updated_at": _now(),
            },
            if_not_exists=True,
        )
    except ConditionalCheckFailed:
        pass  # already registered


def claim_chunk(txn_id: str, filename: str) -> bool:
    """Try to take ownership of a chunk for processing.

    True  -> this process now owns the chunk (nobody else can win the same
             claim: the transition is a conditional update).
    False -> the chunk is already done, or freshly claimed by a live worker.
    """
    table = get_table(TABLE)
    key = {"txn_id": txn_id, "filename": filename}
    row = table.get_item(key)
    if not row:
        register_chunk(txn_id, filename)
        row = table.get_item(key) or {}

    status = row.get("status")
    if status == STATUS_DONE:
        return False

    if status in (STATUS_PENDING, STATUS_FAILED):
        try:
            table.update_item(
                key,
                {
                    "status": STATUS_PROCESSING,
                    "claimed_at": _now(),
                    "attempt": int(row.get("attempt") or 0) + 1,
                    "updated_at": _now(),
                },
                require_exists=True,
                expect={"status": status},
            )
            return True
        except ConditionalCheckFailed:
            return False  # another worker moved it first

    # processing: steal only when the claim looks abandoned
    claimed_at = int(row.get("claimed_at") or 0)
    if status == STATUS_PROCESSING and _now() - claimed_at > CLAIM_TTL_SECONDS:
        try:
            table.update_item(
                key,
                {
                    "claimed_at": _now(),
                    "attempt": int(row.get("attempt") or 0) + 1,
                    "updated_at": _now(),
                },
                require_exists=True,
                expect={"claimed_at": claimed_at},
            )
            logger.warning("stale chunk claim stolen", txn_id=txn_id, chunk=filename)
            return True
        except ConditionalCheckFailed:
            return False
    return False


def mark_done(txn_id: str, filename: str, transcript_key: str = "") -> None:
    get_table(TABLE).update_item(
        {"txn_id": txn_id, "filename": filename},
        {
            "status": STATUS_DONE,
            "transcript_key": transcript_key,
            "updated_at": _now(),
        },
    )


def mark_failed(txn_id: str, filename: str, error: str = "") -> None:
    get_table(TABLE).update_item(
        {"txn_id": txn_id, "filename": filename},
        {"status": STATUS_FAILED, "error": error[:500], "updated_at": _now()},
    )


def session_chunk_stats(txn_id: str) -> Dict[str, int]:
    """status -> count for a session's real chunks (sentinel excluded)."""
    rows = get_table(TABLE).find([("txn_id", "eq", txn_id)])
    stats: Dict[str, int] = {}
    for row in rows:
        if row.get("filename") == STITCH_SENTINEL:
            continue
        stats[row.get("status", "unknown")] = stats.get(row.get("status", "unknown"), 0) + 1
    return stats


def not_done_chunks(txn_id: str, filenames: List[str]) -> List[str]:
    """Subset of `filenames` whose rows are not done yet (missing rows count
    as not done)."""
    rows = get_table(TABLE).find([("txn_id", "eq", txn_id)])
    done = {r.get("filename") for r in rows if r.get("status") == STATUS_DONE}
    return [f for f in filenames if f not in done]

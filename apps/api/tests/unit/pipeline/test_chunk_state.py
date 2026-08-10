"""Tests for the Postgres chunk-state layer (claims, CAS, staleness).

A FakeTable emulates the pg engine's conditional-update semantics
(require_exists + expect -> ConditionalCheckFailed) so claim races can be
exercised without a database.
"""

from unittest.mock import patch

import pytest

from scribe.pipeline import chunk_state
from scribe_core.db import ConditionalCheckFailed


class FakeTable:
    def __init__(self):
        self.rows = {}

    def _k(self, key):
        return (key["txn_id"], key["filename"])

    def put_item(self, item, if_not_exists=False):
        k = (item["txn_id"], item["filename"])
        if if_not_exists and k in self.rows:
            raise ConditionalCheckFailed("exists")
        self.rows[k] = dict(item)

    def get_item(self, key):
        row = self.rows.get(self._k(key))
        return dict(row) if row else None

    def update_item(self, key, updates, require_exists=False, expect=None):
        k = self._k(key)
        row = self.rows.get(k)
        if row is None:
            if require_exists:
                raise ConditionalCheckFailed("missing")
            row = dict(key)
            self.rows[k] = row
        if expect:
            for field, value in expect.items():
                if row.get(field) != value:
                    raise ConditionalCheckFailed(f"expect {field}")
        row.update(updates)
        return dict(row)

    def find(self, where=None, **kwargs):
        txn_id = None
        for cond in where or []:
            if cond[0] == "txn_id" and cond[1] == "eq":
                txn_id = cond[2]
        return [dict(r) for (t, _), r in self.rows.items() if t == txn_id]


@pytest.fixture
def table():
    fake = FakeTable()
    with patch.object(chunk_state, "get_table", return_value=fake):
        yield fake


def test_register_is_idempotent(table):
    chunk_state.register_chunk("t1", "0.webm", "b1", "prefix/0.webm")
    chunk_state.register_chunk("t1", "0.webm", "b1", "prefix/0.webm")
    assert len(table.rows) == 1
    assert table.rows[("t1", "0.webm")]["status"] == "pending"


def test_claim_pending_wins_once(table):
    chunk_state.register_chunk("t1", "0.webm")
    assert chunk_state.claim_chunk("t1", "0.webm") is True
    # second claimant loses: chunk is now processing with a fresh claim
    assert chunk_state.claim_chunk("t1", "0.webm") is False
    assert table.rows[("t1", "0.webm")]["status"] == "processing"
    assert table.rows[("t1", "0.webm")]["attempt"] == 1


def test_claim_done_chunk_returns_false(table):
    chunk_state.register_chunk("t1", "0.webm")
    assert chunk_state.claim_chunk("t1", "0.webm")
    chunk_state.mark_done("t1", "0.webm", "prefix/0.transcript.json")
    assert chunk_state.claim_chunk("t1", "0.webm") is False


def test_failed_chunk_is_reclaimable(table):
    chunk_state.register_chunk("t1", "0.webm")
    assert chunk_state.claim_chunk("t1", "0.webm")
    chunk_state.mark_failed("t1", "0.webm", "stt exploded")
    assert chunk_state.claim_chunk("t1", "0.webm") is True
    assert table.rows[("t1", "0.webm")]["attempt"] == 2


def test_stale_processing_claim_is_stolen(table):
    chunk_state.register_chunk("t1", "0.webm")
    assert chunk_state.claim_chunk("t1", "0.webm")
    # age the claim beyond the TTL
    table.rows[("t1", "0.webm")]["claimed_at"] -= chunk_state.CLAIM_TTL_SECONDS + 5
    assert chunk_state.claim_chunk("t1", "0.webm") is True


def test_fresh_processing_claim_is_respected(table):
    chunk_state.register_chunk("t1", "0.webm")
    assert chunk_state.claim_chunk("t1", "0.webm")
    assert chunk_state.claim_chunk("t1", "0.webm") is False


def test_claim_auto_registers_missing_row(table):
    assert chunk_state.claim_chunk("t9", "3.webm") is True
    assert table.rows[("t9", "3.webm")]["status"] == "processing"


def test_not_done_chunks_and_stats(table):
    for f in ("0.webm", "1.webm", "2.webm"):
        chunk_state.register_chunk("t1", f)
    chunk_state.claim_chunk("t1", "0.webm")
    chunk_state.mark_done("t1", "0.webm")
    chunk_state.register_chunk("t1", chunk_state.STITCH_SENTINEL)

    remaining = chunk_state.not_done_chunks("t1", ["0.webm", "1.webm", "2.webm"])
    assert remaining == ["1.webm", "2.webm"]

    stats = chunk_state.session_chunk_stats("t1")
    assert stats == {"done": 1, "pending": 2}  # sentinel excluded

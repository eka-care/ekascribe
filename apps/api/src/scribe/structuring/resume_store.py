"""
In-memory PausedRunStore for AG-UI runs that pause on UI tool calls.

Implements the echo.ag_ui.PausedRunStore Protocol. State lives in a
process-local dict with per-key expiry, so it survives for the resume
window but not an API restart.

Caveat: state is not shared across processes. If the API runs with
multiple Uvicorn workers, a run paused in one worker may be resumed in
another and read as expired. The core note-structuring flow does not
pause, so this store is sufficient for it regardless of worker count.
A Postgres-backed implementation is the upgrade path for cross-worker
HITL pause/resume.
"""

import time
from typing import Optional

from echo.ag_ui import PausedRun
from scribe.core.custom_logger import get_logger

logger = get_logger(__name__)


_DEFAULT_TTL = 1800  # 30 minutes — the resume window


class InMemoryPausedRunStore:
    """Process-local implementation of echo.ag_ui.PausedRunStore."""

    def __init__(self) -> None:
        # key -> (PausedRun, expires_at_epoch)
        self._store: dict = {}

    def _purge_expired(self) -> None:
        now = time.time()
        for k in [k for k, (_, exp) in self._store.items() if exp <= now]:
            self._store.pop(k, None)

    async def save(self, key: str, snapshot: "PausedRun", ttl: int = _DEFAULT_TTL) -> None:
        self._store[key] = (snapshot, time.time() + ttl)
        logger.info(
            "paused_run saved in-memory",
            key=key,
            ttl=ttl,
            thread_id=snapshot.thread_id,
            run_id=snapshot.run_id,
            tool_call_id=snapshot.tool_call_id,
        )

    async def load(self, key: str) -> Optional["PausedRun"]:
        self._purge_expired()
        entry = self._store.get(key)
        if entry is None:
            return None
        return entry[0]

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)
        logger.info("paused_run deleted from in-memory store", key=key)

    async def close(self) -> None:
        self._store.clear()


# Module-level singleton; the endpoint layer wires this into AgUiRunService.
paused_run_store = InMemoryPausedRunStore()

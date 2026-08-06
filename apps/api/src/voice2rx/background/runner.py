"""In-process background job runner (EXECUTION_MODE=inprocess).

Runs the scribe pipeline inside the FastAPI process — no procrastinate, no
separate worker container. Each job body is synchronous and blocking (STT,
HTTP PATCH, blob I/O), so it is offloaded to a bounded thread pool; delayed
jobs (finalize_session's 10s poll) use asyncio.sleep. Retry counts mirror the
procrastinate task decorators.

Durability note: jobs live only in this process. A crash mid-run loses the
in-flight job (fire-and-forget). For at-least-once durability + retries across
restarts, use EXECUTION_MODE=worker (Postgres/procrastinate). Intended for
single-process deployments — run uvicorn with --workers 1 in this mode so a
job is always visible to the process that scheduled it.
"""

from __future__ import annotations

import asyncio
import functools
import os
import time
from typing import Any, Dict, Optional, Set

from scribe_core.logging import get_logger

logger = get_logger(__name__)


class BackgroundJobRunner:
    def __init__(self, max_workers: int = 4) -> None:
        from concurrent.futures import ThreadPoolExecutor

        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="bgjob"
        )
        self._max_workers = max_workers
        self._tasks: Set[asyncio.Future] = set()

    # -- lifecycle -----------------------------------------------------------
    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        logger.info("background job runner started", max_workers=self._max_workers)

    def shutdown(self) -> None:
        for t in list(self._tasks):
            t.cancel()
        self._executor.shutdown(wait=False, cancel_futures=True)
        logger.info("background job runner stopped")

    # -- scheduling ----------------------------------------------------------
    def submit(self, task_name: str, payload: Dict[str, Any], delay_seconds: float = 0) -> None:
        """Schedule a job. Safe to call from the event loop or a worker thread."""
        coro = self._schedule(task_name, payload, delay_seconds)
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None

        if self._loop is not None and running is self._loop:
            # called from the event loop thread (e.g. a request handler)
            self._loop.create_task(coro)
        elif self._loop is not None:
            # called from a worker thread (e.g. a job self-enqueuing a follow-up)
            asyncio.run_coroutine_threadsafe(coro, self._loop)
        else:
            # no loop yet — last-resort inline execution in the thread pool
            coro.close()
            logger.warning("runner has no loop; running job inline", task=task_name)
            self._executor.submit(self._run_blocking, task_name, payload)

    async def _schedule(self, task_name: str, payload: Dict[str, Any], delay_seconds: float) -> None:
        if delay_seconds and delay_seconds > 0:
            await asyncio.sleep(delay_seconds)
        assert self._loop is not None
        fut = self._loop.run_in_executor(
            self._executor, functools.partial(self._run_blocking, task_name, payload)
        )
        task = asyncio.ensure_future(fut)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    # -- execution -----------------------------------------------------------
    def _run_blocking(self, task_name: str, payload: Dict[str, Any]) -> None:
        from voice2rx.background.pipeline import TASKS
        entry = TASKS.get(task_name)
        if entry is None:
            logger.error("unknown background task", task=task_name)
            return
        func, max_retries = entry

        attempt = 0
        while True:
            try:
                func(**payload)
                return
            except Exception as e:  # noqa: BLE001 — mirror procrastinate retry semantics
                if attempt >= max_retries:
                    logger.error(
                        "background job failed permanently",
                        task=task_name,
                        attempts=attempt + 1,
                        error=str(e),
                        severity="high",
                    )
                    return
                attempt += 1
                backoff = min(2 ** attempt, 30)
                logger.warning(
                    "background job failed; retrying",
                    task=task_name,
                    attempt=attempt,
                    backoff_s=backoff,
                    error=str(e),
                )
                time.sleep(backoff)


_runner: Optional[BackgroundJobRunner] = None
def get_background_runner() -> BackgroundJobRunner:
    global _runner
    if _runner is None:
        max_workers = int(os.getenv("BACKGROUND_JOB_CONCURRENCY", "4"))
        _runner = BackgroundJobRunner(max_workers=max_workers)
    return _runner

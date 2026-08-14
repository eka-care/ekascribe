"""In-process background job runner (EXECUTION_MODE=inprocess).

Runs the scribe pipeline inside the FastAPI process — no procrastinate, no
separate worker container. Each job body is synchronous and blocking (STT,
HTTP PATCH, blob I/O), so it is offloaded to a bounded thread pool; delayed
jobs (finalize_session's 10s poll) and retry backoff wait on the EVENT LOOP,
never inside a pool thread. That distinction matters: the pool is small
(BACKGROUND_JOB_CONCURRENCY, default 4) and shared by every job, so a burst of
failing chunk jobs sleeping off their backoff in worker threads would starve
process_session out of the pool entirely and the session would never commit.

Retry counts mirror the procrastinate task decorators (pipeline.TASKS).

Durability note: jobs live only in this process. A crash mid-run loses the
in-flight job (fire-and-forget). For at-least-once durability + retries across
restarts, use EXECUTION_MODE=worker (Postgres/procrastinate).

Multiple uvicorn workers ARE safe in this mode: chunk coordination lives in
the audio_chunks Postgres table (claims via conditional updates), so
concurrent processes never duplicate STT work, and process_session's
commit-time sweep re-dispatches anything a crashed process dropped. For
multi-CONTAINER scale-out, prefer EXECUTION_MODE=worker so jobs are durable
in the queue as well.
"""

from __future__ import annotations

import asyncio
import functools
import os
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
            self._track(self._loop.create_task(coro))
        elif self._loop is not None:
            # called from a worker thread (e.g. a job self-enqueuing a follow-up)
            asyncio.run_coroutine_threadsafe(coro, self._loop)
        else:
            # no loop yet — last-resort inline execution in the thread pool
            coro.close()
            logger.warning("runner has no loop; running job inline", task=task_name)
            self._executor.submit(self._run_once_logged, task_name, payload)

    def _track(self, task: asyncio.Future) -> None:
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _schedule(
        self,
        task_name: str,
        payload: Dict[str, Any],
        delay_seconds: float,
        attempt: int = 0,
    ) -> None:
        if delay_seconds and delay_seconds > 0:
            await asyncio.sleep(delay_seconds)
        assert self._loop is not None

        # One attempt occupies a pool thread only while it is actually running.
        error = await self._loop.run_in_executor(
            self._executor, functools.partial(self._run_once, task_name, payload)
        )
        if error is None:
            return

        max_retries = self._retries_for(task_name)
        if attempt >= max_retries:
            logger.error(
                "background job failed permanently",
                task=task_name,
                attempts=attempt + 1,
                error=str(error),
                severity="high",
            )
            return

        backoff = min(2 ** (attempt + 1), 30)
        logger.warning(
            "background job failed; retrying",
            task=task_name,
            attempt=attempt + 1,
            backoff_s=backoff,
            error=str(error),
        )
        # The backoff is awaited on the loop and the retry re-enters the pool
        # only when it is ready to run — a sleeping retry never holds a worker
        # slot (see the module docstring).
        self._track(
            self._loop.create_task(
                self._schedule(task_name, payload, backoff, attempt + 1)
            )
        )

    # -- execution -----------------------------------------------------------
    @staticmethod
    def _retries_for(task_name: str) -> int:
        from scribe.pipeline.pipeline import TASKS

        entry = TASKS.get(task_name)
        return entry[1] if entry else 0

    def _run_once(
        self, task_name: str, payload: Dict[str, Any]
    ) -> Optional[BaseException]:
        """Run the job body once, in a pool thread.

        Returns the exception rather than raising it: the retry policy lives on
        the event loop so the wait between attempts costs no worker slot.
        """
        from scribe.pipeline.pipeline import TASKS

        entry = TASKS.get(task_name)
        if entry is None:
            logger.error("unknown background task", task=task_name)
            return None
        func, _ = entry
        try:
            func(**payload)
            return None
        except Exception as e:  # noqa: BLE001 — reported to the scheduler
            return e

    def _run_once_logged(self, task_name: str, payload: Dict[str, Any]) -> None:
        """No-loop fallback: single attempt, failure logged (no retries)."""
        error = self._run_once(task_name, payload)
        if error is not None:
            logger.error(
                "background job failed (no loop; not retried)",
                task=task_name,
                error=str(error),
                severity="high",
            )


_runner: Optional[BackgroundJobRunner] = None
def get_background_runner() -> BackgroundJobRunner:
    global _runner
    if _runner is None:
        max_workers = int(os.getenv("BACKGROUND_JOB_CONCURRENCY", "4"))
        _runner = BackgroundJobRunner(max_workers=max_workers)
    return _runner

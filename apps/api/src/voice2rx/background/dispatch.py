"""Single job-dispatch seam. Chooses the execution backend from settings.

- EXECUTION_MODE=inprocess -> FastAPI in-process background jobs (this process)
- EXECUTION_MODE=worker    -> defer to the queue (Postgres/procrastinate or SQS)

Producers (audio upload, commit, chunker) and the pipeline's own follow-up
enqueues all go through here, so switching modes is a pure env change.
"""

from __future__ import annotations

from typing import Any, Dict

from scribe_core.logging import get_logger
from scribe_core.settings import get_settings

logger = get_logger(__name__)


def dispatch(task: str, payload: Dict[str, Any], delay_seconds: int = 0) -> None:
    """Run/enqueue a pipeline job by name."""
    mode = get_settings().execution_mode
    if mode == "inprocess":
        from voice2rx.background.runner import get_background_runner
        get_background_runner().submit(task, payload, delay_seconds)
    else:
        from scribe_core.queue import get_task_queue
        get_task_queue().enqueue(task, payload, delay_seconds=delay_seconds)

"""Worker entrypoint — procrastinate consumer for the "scribe" queue (plan B3).

Run:  procrastinate --app scribe_worker.main.queue_app worker -q scribe
(or `make worker`). The API defers jobs by task name; tasks live in
scribe_worker.tasks.pipeline.
"""

from __future__ import annotations

import procrastinate

from scribe_core.logging import get_logger
from scribe_core.settings import get_settings

logger = get_logger(__name__)

queue_app = procrastinate.App(
    connector=procrastinate.PsycopgConnector(conninfo=get_settings().procrastinate_dsn),
    import_paths=["scribe_worker.tasks.pipeline"],
)

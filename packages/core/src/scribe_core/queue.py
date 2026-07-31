"""Pluggable job queue (plan B2, Phase 3): QUEUE_BACKEND=postgres|sqs.

- postgres: procrastinate jobs in the same Postgres as everything else — zero
  extra infrastructure, durable, retries, inspectable with SQL. The API defers
  jobs by task name; apps/worker consumes them.
- sqs: preserves the original cloud shape (messages to named queues, consumed
  by an external service such as ekascribe-ds).

Task names are the contract between API and worker:
  process_session   — commit-time pipeline: transcribe chunks, stitch, structure
  transcribe_chunk  — early per-chunk STT while the session is still live
  vad_session       — VAD-chunk a batch upload (replaces the chunker lambda)
  finalize_session  — poll documents, then PATCH processing_status=success
"""

from __future__ import annotations

import threading
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

from scribe_core.settings import get_settings

#: procrastinate queue name shared by API (producer) and worker (consumer)
PROCRASTINATE_QUEUE = "scribe"


class TaskQueue(ABC):
    @abstractmethod
    def enqueue(self, task: str, payload: Dict[str, Any], delay_seconds: int = 0) -> bool:
        """Durably enqueue a job (optionally deferred by delay_seconds). Returns True on success."""


class ProcrastinateQueue(TaskQueue):
    """Postgres-backed via procrastinate; defers by task name (no worker import)."""

    def __init__(self):
        import procrastinate

        self._app = procrastinate.App(
            connector=procrastinate.SyncPsycopgConnector(
                conninfo=get_settings().procrastinate_dsn
            )
        )
        self._app.open()

    def enqueue(self, task: str, payload: Dict[str, Any], delay_seconds: int = 0) -> bool:
        kwargs = {"name": task, "queue": PROCRASTINATE_QUEUE}
        if delay_seconds and delay_seconds > 0:
            kwargs["schedule_in"] = {"seconds": int(delay_seconds)}
        self._app.configure_task(**kwargs).defer(**payload)
        return True


class SQSTaskQueue(TaskQueue):
    """Cloud parity: task name == SQS queue name, payload == message body."""

    def __init__(self):
        import boto3

        s = get_settings()
        self._client = boto3.client("sqs", region_name=s.aws_region)

    def enqueue(self, task: str, payload: Dict[str, Any], delay_seconds: int = 0) -> bool:
        import orjson

        url = self._client.get_queue_url(QueueName=task)["QueueUrl"]
        kwargs = {"QueueUrl": url, "MessageBody": orjson.dumps(payload).decode()}
        if delay_seconds and delay_seconds > 0:
            kwargs["DelaySeconds"] = min(int(delay_seconds), 900)  # SQS max 15 min
        self._client.send_message(**kwargs)
        return True


_queue: Optional[TaskQueue] = None
_lock = threading.Lock()
def get_task_queue() -> TaskQueue:
    global _queue
    if _queue is None:
        with _lock:
            if _queue is None:
                backend = get_settings().queue_backend
                _queue = ProcrastinateQueue() if backend == "postgres" else SQSTaskQueue()
    return _queue


def reset_task_queue() -> None:
    global _queue
    _queue = None

"""Worker task wrappers (EXECUTION_MODE=worker).

The pipeline logic lives once in ``voice2rx.background.pipeline``. These thin
wrappers register it with procrastinate for the Postgres-queue worker; the
pipeline's own follow-up enqueues route through ``dispatch`` (queue in this
mode). Retry= values match the pipeline's TASKS registry so both execution
modes fail the same way.
"""

from __future__ import annotations

from typing import Any, Dict

from scribe_worker.main import queue_app
from voice2rx.background import pipeline as bp


@queue_app.task(name="transcribe_chunk", queue="scribe", retry=3)
def transcribe_chunk(txn_id: str, b_id: str, s3_url: str, filename: str) -> None:
    bp.transcribe_chunk(txn_id=txn_id, b_id=b_id, s3_url=s3_url, filename=filename)


@queue_app.task(name="vad_session", queue="scribe", retry=3)
def vad_session(message: Dict[str, Any]) -> None:
    bp.vad_session(message=message)


@queue_app.task(name="process_session", queue="scribe", retry=5)
def process_session(message: Dict[str, Any]) -> None:
    bp.process_session(message=message)


@queue_app.task(name="finalize_session", queue="scribe")
def finalize_session(txn_id: str, b_id: str, attempt: int = 0) -> None:
    bp.finalize_session(txn_id=txn_id, b_id=b_id, attempt=attempt)

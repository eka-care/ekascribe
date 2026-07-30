"""Phase 3: queue routing — SQS-shaped call sites land as procrastinate jobs."""

import os

import pytest

DSN = os.getenv("TEST_DATABASE_URL", "postgresql://scribe:scribe@localhost:5432/scribe")


def _pg_available():
    try:
        import psycopg

        with psycopg.connect(DSN, connect_timeout=2):
            return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _pg_available(), reason="postgres not reachable")


@pytest.fixture()
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("QUEUE_BACKEND", "postgres")
    monkeypatch.setenv("DB_BACKEND", "postgres")
    monkeypatch.setenv("DATABASE_URL", DSN)
    monkeypatch.setenv("LOG_DIR", str(tmp_path / "logs"))
    from scribe_core.settings import get_settings

    get_settings.cache_clear()
    import scribe_core.queue as q

    q.reset_task_queue()

    # apply procrastinate schema (idempotent)
    import procrastinate

    app = procrastinate.App(
        connector=procrastinate.SyncPsycopgConnector(conninfo=DSN)
    )
    with app.open():
        try:
            app.schema_manager.apply_schema()
        except Exception:
            pass  # already applied
    yield
    q.reset_task_queue()
    get_settings.cache_clear()


def _job_count(task_name):
    import psycopg

    with psycopg.connect(DSN) as conn:
        return conn.execute(
            "SELECT count(*) FROM procrastinate_jobs WHERE task_name = %s", [task_name]
        ).fetchone()[0]


def test_task_queue_enqueues_procrastinate_job(env):
    from scribe_core.queue import get_task_queue

    before = _job_count("process_session")
    assert get_task_queue().enqueue("process_session", {"message": {"txn_id": "t1"}})
    assert _job_count("process_session") == before + 1


def test_sqs_service_routes_to_postgres_queue(env):
    from voice2rx.services.messaging.sqs_service import SQSService

    before = _job_count("process_session")
    resp = SQSService().send_message("voice2rx", {"txn_id": "t2", "action": "structuring"})
    assert resp["success"], resp
    assert resp["message_id"] == "pg:process_session"
    assert _job_count("process_session") == before + 1


def test_worker_tasks_registered():
    os.environ.setdefault("LOG_DIR", "/tmp/logs")
    from scribe_worker.main import queue_app
    import scribe_worker.tasks.pipeline  # noqa: F401

    names = set(queue_app.tasks)
    assert {"process_session", "transcribe_chunk", "vad_session", "finalize_session"} <= names

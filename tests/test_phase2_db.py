"""Phase 2: Postgres document engine, exercised through the repositories
(TransactionORM, DocumentORM, config path) and the async store.

Requires a running Postgres at DATABASE_URL (see Makefile / docker-compose).
"""

import os
import uuid as uuidlib

import pytest

DSN = os.getenv(
    "TEST_DATABASE_URL", "postgresql://scribe:scribe@localhost:5432/scribe"
)


def _pg_available() -> bool:
    try:
        import psycopg

        with psycopg.connect(DSN, connect_timeout=2):
            return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _pg_available(), reason="postgres not reachable")


@pytest.fixture()
def pg(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", DSN)
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path / "storage"))
    monkeypatch.setenv("LOG_DIR", str(tmp_path / "logs"))
    from scribe_core.settings import get_settings

    get_settings.cache_clear()
    from scribe_core.db import ensure_schema, reset_pool

    reset_pool()
    ensure_schema()
    yield
    reset_pool()
    get_settings.cache_clear()


def test_transaction_orm_crud_and_queries(pg):
    from scribe.repositories.transaction_orm import TransactionORM

    orm = TransactionORM()
    b_id = f"b-{uuidlib.uuid4().hex[:8]}"
    txns = []
    for i in range(3):
        txn_id = f"txn-{uuidlib.uuid4().hex[:8]}"
        txns.append(txn_id)
        orm.create_transaction(
            {
                "txn_id": txn_id,
                "b_id": b_id,
                "uuid": "user-1",
                "created_at": f"2026-07-30T10:0{i}:00Z",
                "processing_status": "init",
                "mode": "consultation",
                "oid": "oid-1",
            }
        )

    # duplicate create must be rejected (ConditionalCheckFailed path)
    dup = orm.create_transaction(
        {"txn_id": txns[0], "b_id": b_id, "uuid": "user-1", "created_at": "x"}
    )
    assert dup.get("success") is False or dup.get("code") == "duplicate_entry"

    got = orm.get_transaction(txns[1], b_id)
    assert got["processing_status"] == "init"
    assert got["mode"] == "consultation"

    orm.update_transaction(txns[1], b_id, {"processing_status": "success"})
    got = orm.get_transaction(txns[1], b_id)
    assert got["processing_status"] == "success"
    assert "updated_at" in got

    # indexed-field query (descending, archived filtered out)
    items = orm.query_transactions_by_business_id(b_id)
    assert len(items) == 3
    assert items[0]["created_at"] > items[-1]["created_at"]  # descending

    # archive filter: arc=true items are excluded
    orm.update_transaction(txns[2], b_id, {"arc": True})
    items = orm.query_transactions_by_business_id(b_id)
    assert len(items) == 2

    # uuid filter branch
    items = orm.query_transactions_by_business_id(b_id, uuid="user-1")
    assert len(items) == 2
    assert orm.query_transactions_by_business_id(b_id, uuid="someone-else") == []


def test_document_orm_session_queries(pg):
    from scribe.repositories.document_orm import EkascribeDocumentORM

    orm = EkascribeDocumentORM()
    session_id = f"s-{uuidlib.uuid4().hex[:8]}"
    ids = []
    for i, template in enumerate(["t-1", "t-1", "t-2"]):
        doc_id = f"d-{uuidlib.uuid4().hex[:8]}"
        ids.append(doc_id)
        orm.create_document(
            {
                "document_id": doc_id,
                "session_id": session_id,
                "template_id": template,
                "content": {"markdown": f"# doc {i}"},
            }
        )

    assert orm.get_document(ids[0])["content"]["markdown"] == "# doc 0"
    docs = orm.get_documents_by_session(session_id)
    assert len(docs) == 3
    docs = orm.get_documents_by_session_and_template(session_id, "t-1")
    assert len(docs) == 2

    orm.archive_document(ids[0])
    docs = orm.get_documents_by_session(session_id)
    assert len(docs) == 2

    fetched = orm.get_documents_by_ids(ids[1:])
    assert len(fetched) == 2


def test_audio_details_begins_with(pg):
    from scribe.repositories.audio_details_orm import AudioDetailsORM

    orm = AudioDetailsORM()
    b_id, txn = "b-audio", f"txn-{uuidlib.uuid4().hex[:6]}"
    composite = f"{b_id}#{txn}"
    for i in (1, 2):
        orm.create(
            {
                "composite_key": composite,
                "record_type": f"chunk#{i}.m4a",
                "txn_id": txn,
                "b_id": b_id,
                "snr": 20 + i,
            }
        )
    details = orm.get_audio_quality_details(b_id=b_id, txn_id=txn)
    assert len(details) == 2


def test_config_service_store_path(pg):
    from scribe.services.config_service import ConfigService

    svc = ConfigService()
    b_id = f"b-{uuidlib.uuid4().hex[:6]}"
    svc.db_helper.upsert_item(
        key_dict={"b_id": b_id, "user_uuid": "_"},
        update_dict={"my_templates": ["t-1"], "model_type": "pro"},
    )
    item = svc.db_helper.get_item(key_dict={"b_id": b_id, "user_uuid": "_"})
    assert item["my_templates"] == ["t-1"]


def test_async_store_template_service_surface(pg):
    """The async path template_service uses: create / query by wid / get."""
    import asyncio

    from scribe_core.db import get_async_store

    store = get_async_store()

    async def flow():
        sid = f"sec-{uuidlib.uuid4().hex[:6]}"
        ok = await store.create_item(
            "ekascribe_template_section",
            {"id": sid, "wid": "DEFAULT", "title": "Agenda"},
        )
        assert ok
        sections = await store.find(
            "ekascribe_template_section",
            [
                ("wid", "eq", "DEFAULT"),
                ("or", [("archived", "not_exists", None), ("archived", "ne", True)]),
            ],
        )
        assert any(s["id"] == sid for s in sections)
        item = await store.get_item("ekascribe_template_section", {"id": sid})
        assert item["title"] == "Agenda"

    asyncio.run(flow())

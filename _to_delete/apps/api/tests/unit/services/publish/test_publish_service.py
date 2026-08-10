"""Unit tests for PublishService orchestrator."""

from unittest.mock import MagicMock

import pytest

from voice2rx.core.exceptions import ResourceNotFoundException
from voice2rx.services.publish.base import PublishResult
from voice2rx.services.publish.publish_service import PublishService


SESSION_ID = "sess-1"
DOCUMENT_ID = "doc-1"
B_ID = "b-1"
UUID = "u-1"
OID = "o-1"


@pytest.fixture
def document_service():
    svc = MagicMock()
    svc.get_document.return_value = {
        "document_id": DOCUMENT_ID,
        "session_id": SESSION_ID,
        "uuid": UUID,
        "wid": B_ID,
        "document_path": "path/to/doc.txt",
    }
    return svc


@pytest.fixture
def transaction_repo():
    repo = MagicMock()
    repo.get_transaction.return_value = {
        "txn_id": SESSION_ID,
        "b_id": B_ID,
        "encounter_id": "enc-42",
    }
    return repo


@pytest.fixture
def config_service():
    cfg = MagicMock()
    cfg.get_merged_config.return_value = {
        "integrations": {"emr_webhook": {"enabled": True}}
    }
    return cfg


@pytest.fixture
def service(document_service, transaction_repo, config_service):
    return PublishService(
        document_service=document_service,
        transaction_repo=transaction_repo,
        config_service=config_service,
    )


@pytest.fixture
def background_tasks():
    return MagicMock()


@pytest.fixture
def token_data():
    return {"uuid": UUID, "oid": OID, "c-id": "client-1"}


class TestSchedulePublish:
    def test_accepts_and_queues_background_task(
        self, service, background_tasks, token_data
    ):
        ack = service.schedule_publish(
            session_id=SESSION_ID,
            document_id=DOCUMENT_ID,
            token_data=token_data,
            b_id=B_ID,
            background_tasks=background_tasks,
        )

        assert ack["document_id"] == DOCUMENT_ID
        assert ack["session_id"] == SESSION_ID
        assert isinstance(ack["accepted_at"], int)
        background_tasks.add_task.assert_called_once()

    def test_raises_when_document_missing(
        self, service, document_service, background_tasks, token_data
    ):
        document_service.get_document.return_value = None
        with pytest.raises(ResourceNotFoundException):
            service.schedule_publish(
                session_id=SESSION_ID,
                document_id=DOCUMENT_ID,
                token_data=token_data,
                b_id=B_ID,
                background_tasks=background_tasks,
            )

    def test_raises_on_ownership_mismatch(
        self, service, document_service, background_tasks, token_data
    ):
        document_service.get_document.return_value = {
            "document_id": DOCUMENT_ID,
            "session_id": SESSION_ID,
            "uuid": "someone-else",
            "wid": B_ID,
        }
        with pytest.raises(ResourceNotFoundException):
            service.schedule_publish(
                session_id=SESSION_ID,
                document_id=DOCUMENT_ID,
                token_data=token_data,
                b_id=B_ID,
                background_tasks=background_tasks,
            )

    def test_raises_on_session_mismatch(
        self, service, document_service, background_tasks, token_data
    ):
        document_service.get_document.return_value = {
            "document_id": DOCUMENT_ID,
            "session_id": "different-session",
            "uuid": UUID,
            "wid": B_ID,
        }
        with pytest.raises(ResourceNotFoundException):
            service.schedule_publish(
                session_id=SESSION_ID,
                document_id=DOCUMENT_ID,
                token_data=token_data,
                b_id=B_ID,
                background_tasks=background_tasks,
            )

    def test_raises_when_transaction_missing(
        self, service, transaction_repo, background_tasks, token_data
    ):
        transaction_repo.get_transaction.return_value = None
        with pytest.raises(ResourceNotFoundException):
            service.schedule_publish(
                session_id=SESSION_ID,
                document_id=DOCUMENT_ID,
                token_data=token_data,
                b_id=B_ID,
                background_tasks=background_tasks,
            )


class TestPersistResults:
    def test_persists_publish_status_and_vault_doc_id(
        self, service, document_service
    ):
        results = [
            PublishResult(
                integration="emr_webhook",
                status="success",
                data={"vault_doc_id": "vault-42"},
            ),
            PublishResult(
                integration="whatsapp",
                status="failed",
                error="boom",
            ),
        ]

        service._persist_results(DOCUMENT_ID, results)

        args, _ = document_service.update_document.call_args
        assert args[0] == DOCUMENT_ID
        update = args[1]
        assert update["vault_doc_id"] == "vault-42"
        assert "published_at" in update
        assert update["publish_status"]["emr_webhook"]["status"] == "success"
        assert update["publish_status"]["whatsapp"]["status"] == "failed"
        assert update["publish_status"]["whatsapp"]["error"] == "boom"

    def test_no_vault_id_no_published_at_when_all_fail(
        self, service, document_service
    ):
        results = [
            PublishResult(
                integration="emr_webhook", status="failed", error="fetch failed"
            )
        ]

        service._persist_results(DOCUMENT_ID, results)

        _, _ = document_service.update_document.call_args  # ensure called
        update = document_service.update_document.call_args[0][1]
        assert "vault_doc_id" not in update
        assert "published_at" not in update
        assert update["publish_status"]["emr_webhook"]["status"] == "failed"

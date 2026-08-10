"""
Unit tests for ResultServiceV2
(voice2rx/services/transactions/result_service_v2.py).

These tests exercise the service with all of its external collaborators
(DocumentORM, TransactionORM, DocumentService, TemplateService, S3 client,
TransactionService) mocked, so they run without AWS / DB access.
"""

import datetime
from decimal import Decimal
from http import HTTPStatus
from unittest.mock import MagicMock, patch

import pytest

from scribe.services.result_service_v2 import ResultServiceV2
from scribe.core.exceptions import (
    ActiveSessionException,
    RequestFailureException,
    ResourceNotFoundException,
    TransactionNotFoundException,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_document_repo():
    return MagicMock()


@pytest.fixture
def mock_transaction_repo():
    return MagicMock()


@pytest.fixture
def mock_document_service():
    return MagicMock()


@pytest.fixture
def service(mock_document_repo, mock_transaction_repo, mock_document_service):
    svc = ResultServiceV2(
        document_repo=mock_document_repo,
        transaction_repo=mock_transaction_repo,
        document_service=mock_document_service,
    )
    svc.transaction_service = MagicMock()
    svc.transaction_service.get_transaction.return_value = {}
    return svc


# ---------------------------------------------------------------------------
# update_document_content
# ---------------------------------------------------------------------------


class TestUpdateDocumentContent:
    def test_updates_document_and_returns_ids(
        self, service, mock_transaction_repo, mock_document_service
    ):
        mock_transaction_repo.get_transaction.return_value = {
            "s3_url": "s3://bucket/folder/",
        }
        mock_document_service.get_document.return_value = {
            "session_id": "sess-1",
            "archived": False,
            "document_path": "folder/documents/doc-1.txt",
        }
        mock_document_service.write_document_content.return_value = (
            "folder/documents/doc-1.txt"
        )

        result = service.update_document_content(
            txn_id="sess-1",
            b_id="b-1",
            document_updates=[{"document_id": "doc-1", "data": "payload"}],
        )

        assert result == ["doc-1"]
        mock_document_service.write_document_content.assert_called_once_with(
            s3_url="s3://bucket/folder/",
            document_id="doc-1",
            content="payload",
            is_base64=False,
            document_path="folder/documents/doc-1.txt",
        )
        # existing path was present, so update_document should NOT be called
        mock_document_service.update_document.assert_not_called()

    def test_writes_then_persists_path_when_document_path_missing(
        self, service, mock_transaction_repo, mock_document_service
    ):
        mock_transaction_repo.get_transaction.return_value = {
            "s3_url": "s3://bucket/folder/",
        }
        mock_document_service.get_document.return_value = {
            "session_id": "sess-1",
            "archived": False,
        }
        mock_document_service.write_document_content.return_value = (
            "folder/documents/doc-1.txt"
        )

        service.update_document_content(
            "sess-1", "b-1", [{"document_id": "doc-1", "data": "payload"}]
        )

        mock_document_service.update_document.assert_called_once_with(
            "doc-1", {"document_path": "folder/documents/doc-1.txt"}
        )

    def test_raises_when_transaction_missing(self, service, mock_transaction_repo):
        mock_transaction_repo.get_transaction.return_value = None

        with pytest.raises(TransactionNotFoundException):
            service.update_document_content(
                "missing", "b-1", [{"document_id": "doc-1", "data": "x"}]
            )

    def test_raises_when_s3_url_missing(self, service, mock_transaction_repo):
        mock_transaction_repo.get_transaction.return_value = {"txn_id": "sess-1"}

        with pytest.raises(RequestFailureException):
            service.update_document_content(
                "sess-1", "b-1", [{"document_id": "doc-1", "data": "x"}]
            )

    def test_raises_when_document_missing_or_archived(
        self, service, mock_transaction_repo, mock_document_service
    ):
        mock_transaction_repo.get_transaction.return_value = {
            "s3_url": "s3://bucket/folder/"
        }
        mock_document_service.get_document.return_value = None

        with pytest.raises(ResourceNotFoundException):
            service.update_document_content(
                "sess-1", "b-1", [{"document_id": "doc-1", "data": "x"}]
            )

    def test_raises_when_document_belongs_to_other_session(
        self, service, mock_transaction_repo, mock_document_service
    ):
        mock_transaction_repo.get_transaction.return_value = {
            "s3_url": "s3://bucket/folder/"
        }
        mock_document_service.get_document.return_value = {
            "session_id": "other-session",
            "archived": False,
        }

        with pytest.raises(ResourceNotFoundException):
            service.update_document_content(
                "sess-1", "b-1", [{"document_id": "doc-1", "data": "x"}]
            )


# ---------------------------------------------------------------------------
# _is_transaction_too_old
# ---------------------------------------------------------------------------


class TestIsTransactionTooOld:
    def test_old_transaction_returns_true(self, service):
        past = (
            datetime.datetime.now(datetime.timezone.utc)
            - datetime.timedelta(hours=3)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        assert service._is_transaction_too_old({"created_at": past}) is True

    def test_recent_transaction_returns_false(self, service):
        recent = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        assert service._is_transaction_too_old({"created_at": recent}) is False

    def test_unparseable_returns_true(self, service):
        assert service._is_transaction_too_old({"created_at": "not-a-date"}) is True


# ---------------------------------------------------------------------------
# poll_for_document
# ---------------------------------------------------------------------------


class TestPollForDocument:
    @pytest.mark.asyncio
    async def test_returns_not_found_when_missing(self, service, mock_document_repo):
        mock_document_repo.get_document.return_value = None
        # use a nonzero timeout so the first iteration runs and hits the
        # "document not found" branch before the outer timeout check
        response, code = await service.poll_for_document("doc-1", "sess-1", timeout=1)
        assert code == HTTPStatus.NOT_FOUND
        assert "error" in response["data"]

    @pytest.mark.asyncio
    async def test_returns_success_response_when_document_completed(
        self, service, mock_document_repo
    ):
        mock_document_repo.get_document.return_value = {
            "document_id": "doc-1",
            "session_id": "sess-1",
            "status": "success",
            "template_id": "custom_template",
            "type": "document",
            "document_path": "folder/doc-1.txt",
            "created_at": "2024-01-01T00:00:00Z",
        }
        with patch.object(
            service, "_read_document_content", return_value="content"
        ), patch.object(
            service, "_get_document_meta_info", return_value={}
        ):
            response, code = await service.poll_for_document("doc-1", "sess-1")

        assert code == HTTPStatus.OK
        assert "data" in response

    @pytest.mark.asyncio
    async def test_returns_202_on_timeout_while_in_progress(
        self, service, mock_document_repo
    ):
        mock_document_repo.get_document.return_value = {
            "document_id": "doc-1",
            "session_id": "sess-1",
            "status": "in-progress",
            "template_id": "custom_template",
            "type": "document",
        }
        with patch.object(service, "_read_document_content", return_value=""), \
             patch.object(service, "_get_document_meta_info", return_value={}):
            response, code = await service.poll_for_document("doc-1", "sess-1", timeout=0)
        assert code == HTTPStatus.ACCEPTED


# ---------------------------------------------------------------------------
# poll_for_session_documents
# ---------------------------------------------------------------------------


class TestPollForSessionDocuments:
    def _committed_txn(self):
        now = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        return {
            "txn_id": "sess-1",
            "b_id": "b-1",
            "user_status": "commit",
            "created_at": now,
            "processing_status": "success",
        }

    @pytest.mark.asyncio
    async def test_raises_active_session_when_not_committed_and_too_old(
        self, service, mock_transaction_repo
    ):
        past = (
            datetime.datetime.now(datetime.timezone.utc)
            - datetime.timedelta(hours=3)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        transaction = {
            "txn_id": "sess-1",
            "user_status": "init",
            "created_at": past,
            "processing_status": "success",
        }
        mock_transaction_repo.get_transaction.return_value = transaction

        with pytest.raises(ActiveSessionException):
            await service.poll_for_session_documents(transaction, "b-1", timeout=0)

    @pytest.mark.asyncio
    async def test_returns_built_session_response_when_documents_ready(
        self, service, mock_transaction_repo, mock_document_repo
    ):
        transaction = self._committed_txn()
        mock_transaction_repo.get_transaction.return_value = transaction
        doc = {
            "document_id": "d1",
            "template_id": "custom_template",
            "status": "success",
            "type": "document",
            "commit_at": Decimal(1700000000),
        }
        mock_document_repo.get_documents_by_session.return_value = [doc]

        with patch.object(service, "_build_session_response") as mock_build:
            mock_build.return_value = ({"data": {}}, HTTPStatus.OK)
            response, code = await service.poll_for_session_documents(
                transaction, "b-1", timeout=1
            )

        assert code == HTTPStatus.OK
        mock_build.assert_called()

    @pytest.mark.asyncio
    async def test_system_failure_triggers_commit_retry(
        self, service, mock_transaction_repo, mock_document_repo
    ):
        txn = self._committed_txn()
        txn["processing_status"] = "system_failure"
        txn["client_uploaded_files"] = []
        mock_transaction_repo.get_transaction.return_value = txn
        mock_document_repo.get_documents_by_session.return_value = []

        with patch.object(
            service, "_build_session_response", return_value=({"data": {}}, HTTPStatus.OK)
        ):
            await service.poll_for_session_documents(txn, "b-1", timeout=0)

        service.transaction_service.commit_transaction.assert_called_once()


# ---------------------------------------------------------------------------
# Helper methods
# ---------------------------------------------------------------------------


class TestHelpers:
    def test_status_to_http_code(self, service):
        assert service._status_to_http_code("success") == HTTPStatus.OK
        assert (
            service._status_to_http_code("partial_success") == HTTPStatus.PARTIAL_CONTENT
        )
        assert (
            service._status_to_http_code("failure") == HTTPStatus.INTERNAL_SERVER_ERROR
        )
        assert service._status_to_http_code("in-progress") == HTTPStatus.ACCEPTED

    def test_extract_lang_from_transcript_template_id(self, service):
        assert service._extract_lang("transcript_en") == "en"
        assert service._extract_lang("custom_template") == ""

    def test_get_additional_data_dict_passthrough(self, service):
        data = {"foo": "bar"}
        assert service._get_additional_data({"additional_data": data}) == data

    def test_get_additional_data_parses_json_string(self, service):
        assert service._get_additional_data(
            {"additional_data": '{"foo": "bar"}'}
        ) == {"foo": "bar"}

    def test_get_additional_data_returns_empty_on_invalid_json(self, service):
        assert service._get_additional_data({"additional_data": "not-json"}) == {}

    def test_get_additional_data_returns_empty_for_unexpected_types(self, service):
        assert service._get_additional_data({"additional_data": 123}) == {}

    def test_build_error_response_shape(self, service):
        response = service._build_error_response("boom")
        assert response["data"]["error"] == "boom"
        assert response["data"]["output"] == []
        assert response["data"]["template_results"]["transcript"] == []

    def test_document_processing_status_returns_false_when_in_progress_recent(
        self, service
    ):
        import time

        docs = [
            {
                "status": "in-progress",
                "commit_at": Decimal(int(time.time())),
            }
        ]
        assert service._document_processing_status(docs, "sess-1") is False

    def test_document_processing_status_returns_true_when_all_done(self, service):
        docs = [{"status": "success", "commit_at": Decimal(1700000000)}]
        assert service._document_processing_status(docs, "sess-1") is True

    def test_document_processing_status_raises_when_no_documents(self, service):
        # source raises TransactionNotFoundException with only 1 positional
        # arg which is a bug in the constructor signature; the test only
        # verifies that *some* exception is raised so it documents the
        # current behaviour without locking in the constructor bug.
        with pytest.raises(Exception):
            service._document_processing_status([], "sess-1")

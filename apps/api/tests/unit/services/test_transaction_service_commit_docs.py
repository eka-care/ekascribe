"""
Tests for deferred document creation (LIFE-2402):

- init skips document creation entirely for flavour-excluded apps
- _store_document_results always creates visual + integration + transcript
  docs (no flavour-based skipping inside it anymore)
- commit creates all documents for flavour-excluded sessions when none
  exist yet, idempotently (re-commit does not duplicate)
- ensure_session_documents ignores context/notes docs when deciding
  whether the session's documents exist
"""

from unittest.mock import MagicMock, patch

import pytest

from voice2rx.choices import DocumentType
from voice2rx.services.transactions.transaction_service import TransactionService


TXN_ID = "txn_123"
B_ID = "EC_test"
EXCLUDED_FLAVOUR = "ekascribe-web"
NORMAL_FLAVOUR = "android"


def _request_templates():
    return {
        "visual": [{"template_id": "tpl_visual", "template_name": "Visual"}],
        "integration": [{"template_id": "tpl_integration", "template_name": "Integration"}],
    }


def _transaction(flavour=EXCLUDED_FLAVOUR, **overrides):
    txn = {
        "uuid": "user-uuid",
        "b_id": B_ID,
        "flavour": flavour,
        "user_status": "init",
        "request_templates": _request_templates(),
        "s3_url": f"s3://test-bucket/{TXN_ID}",
    }
    txn.update(overrides)
    return txn


@pytest.fixture
def service():
    svc = TransactionService(
        transaction_repo=MagicMock(),
        audio_repo=MagicMock(),
        template_results_repo=MagicMock(),
    )
    svc.document_service = MagicMock()
    svc.document_service.create_document.return_value = {"document_id": "doc_new"}
    svc.tempalte_service = MagicMock()
    svc.tempalte_service.get_template.return_value = {"title": "Some Template"}
    svc.config_service = MagicMock()
    return svc


# ---------------------------------------------------------------------------
#  initialize_transaction: doc creation gated on flavour
# ---------------------------------------------------------------------------


def _run_init(service, flavour):
    prepared = _transaction(flavour=flavour)
    with patch.object(
        service, "_prepare_transaction_data", return_value=prepared
    ), patch.object(service, "_validate_transaction_limit"), patch(
        "voice2rx.services.transactions.transaction_service.validate_s3_urls"
    ), patch.object(
        service, "_store_document_results"
    ) as store_mock, patch.object(
        service, "_publish_to_sns_for_vadding"
    ):
        service.transaction_repo.create_transaction.return_value = {}
        service.initialize_transaction(TXN_ID, {}, {})
    return store_mock


def test_init_skips_document_creation_for_excluded_flavour(service):
    store_mock = _run_init(service, EXCLUDED_FLAVOUR)
    store_mock.assert_not_called()


def test_init_creates_documents_for_normal_flavour(service):
    store_mock = _run_init(service, NORMAL_FLAVOUR)
    store_mock.assert_called_once_with(TXN_ID, _transaction(flavour=NORMAL_FLAVOUR))


# ---------------------------------------------------------------------------
#  _store_document_results: no flavour-based skipping anymore
# ---------------------------------------------------------------------------


def test_store_document_results_creates_all_docs_even_for_excluded_flavour(service):
    txn = _transaction(flavour=EXCLUDED_FLAVOUR)

    service._store_document_results(TXN_ID, txn)

    created_template_ids = [
        call.kwargs["template_id"]
        for call in service.document_service.create_document.call_args_list
    ]
    # visual + integration + transcript — the old visual skip is gone
    assert created_template_ids == ["tpl_visual", "tpl_integration", "transcript"]


def test_store_document_results_writes_document_ids_back(service):
    txn = _transaction()
    service.document_service.create_document.return_value = {"document_id": "doc_x"}

    service._store_document_results(TXN_ID, txn)

    assert txn["request_templates"]["visual"][0]["document_id"] == "doc_x"
    assert txn["request_templates"]["integration"][0]["document_id"] == "doc_x"


# ---------------------------------------------------------------------------
#  ensure_session_documents
# ---------------------------------------------------------------------------


def test_ensure_session_documents_noop_when_docs_exist(service):
    existing = [{"document_id": "doc_1", "type": DocumentType.CUSTOM}]
    service.document_service.get_documents_for_session.return_value = existing

    with patch.object(service, "_store_document_results") as store_mock:
        result = service.ensure_session_documents(TXN_ID, B_ID, _transaction())

    store_mock.assert_not_called()
    service.transaction_repo.update_transaction.assert_not_called()
    assert result == existing


def test_ensure_session_documents_creates_when_none_exist(service):
    created = [{"document_id": "doc_new", "type": DocumentType.CUSTOM}]
    service.document_service.get_documents_for_session.side_effect = [[], created]
    txn = _transaction()

    with patch.object(service, "_store_document_results") as store_mock:
        result = service.ensure_session_documents(TXN_ID, B_ID, txn)

    store_mock.assert_called_once_with(TXN_ID, txn)
    assert result == created


def test_ensure_session_documents_ignores_context_and_notes_docs(service):
    context_only = [{"document_id": "ctx_1", "type": DocumentType.CONTEXT}]
    created = context_only + [{"document_id": "doc_new", "type": DocumentType.CUSTOM}]
    service.document_service.get_documents_for_session.side_effect = [
        context_only,
        created,
    ]
    service.transaction_repo.update_transaction.return_value = {}

    with patch.object(service, "_store_document_results") as store_mock:
        service.ensure_session_documents(TXN_ID, B_ID, _transaction())

    store_mock.assert_called_once()


# ---------------------------------------------------------------------------
#  commit_transaction: deferred creation for excluded flavours, idempotent
# ---------------------------------------------------------------------------


def _run_commit(service, transaction, docs_sequence):
    service.transaction_repo.get_transaction.return_value = transaction
    service.transaction_repo.update_transaction.return_value = {}
    service.document_service.get_documents_for_session.side_effect = docs_sequence
    return service.commit_transaction(TXN_ID, B_ID, ["audio_1.mp3"])


def test_commit_creates_documents_for_excluded_flavour_when_missing(service):
    created = [{"document_id": "doc_new", "type": DocumentType.CUSTOM}]
    txn = _transaction(flavour=EXCLUDED_FLAVOUR)

    with patch.object(service, "_store_document_results") as store_mock:
        # ensure check → [], ensure refetch → created
        result = _run_commit(service, txn, [[], created])

    store_mock.assert_called_once_with(TXN_ID, txn)
    # commit_at stamped on the freshly created doc
    service.document_service.update_document.assert_called_once()
    assert (
        service.document_service.update_document.call_args.kwargs["document_id"]
        == "doc_new"
    )
    assert result == txn


def test_commit_does_not_recreate_documents_on_recommit(service):
    existing = [{"document_id": "doc_1", "type": DocumentType.CUSTOM}]
    txn = _transaction(flavour=EXCLUDED_FLAVOUR)

    with patch.object(service, "_store_document_results") as store_mock:
        _run_commit(service, txn, [existing])

    store_mock.assert_not_called()
    service.document_service.update_document.assert_called_once()


def test_commit_continues_for_normal_flavour_without_documents(service):
    txn = _transaction(flavour=NORMAL_FLAVOUR)

    with patch.object(service, "_store_document_results") as store_mock:
        result = _run_commit(service, txn, [[]])

    store_mock.assert_not_called()
    service.document_service.update_document.assert_not_called()
    assert result == txn


def test_commit_skips_document_creation_when_already_committed(service):
    existing = [{"document_id": "doc_1", "type": DocumentType.CUSTOM}]
    txn = _transaction(flavour=EXCLUDED_FLAVOUR, user_status="commit")

    with patch.object(service, "_store_document_results") as store_mock:
        _run_commit(service, txn, [existing])

    store_mock.assert_not_called()
    service.document_service.update_document.assert_called_once()

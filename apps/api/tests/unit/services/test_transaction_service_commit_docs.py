"""
Tests for document creation around the session lifecycle:

- init skips TEMPLATE doc creation for flavour-excluded apps but always
  creates the transcript placeholder
- _store_document_results always creates visual + integration + transcript
  docs (no flavour-based skipping inside it anymore)
- commit never creates documents; it stamps commit_at on whatever
  documents the session already has
"""

from unittest.mock import MagicMock, patch

import pytest

from scribe.core.choices import DocumentType
from scribe.services.transaction_service import TransactionService


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
    svc = TransactionService(transaction_repo=MagicMock())
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
    ), patch(
        "scribe.services.transaction_service.validate_s3_urls"
    ), patch.object(
        service, "_store_document_results"
    ) as store_mock, patch.object(
        service, "_publish_to_sns_for_vadding"
    ):
        service.transaction_repo.create_transaction.return_value = {}
        service.initialize_transaction(TXN_ID, {}, {})
    return store_mock


def test_init_skips_template_docs_but_creates_transcript_for_excluded_flavour(service):
    store_mock = _run_init(service, EXCLUDED_FLAVOUR)
    store_mock.assert_not_called()
    # web/desktop sessions still get the transcript placeholder at init —
    # the FE polls it right after end-session and the AG-UI resolver
    # requires it to exist.
    service.document_service.create_document.assert_called_once()
    assert (
        service.document_service.create_document.call_args.kwargs["template_id"]
        == "transcript"
    )


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
#  commit_transaction: never creates documents, stamps commit_at
# ---------------------------------------------------------------------------


def _run_commit(service, transaction, docs):
    service.transaction_repo.get_transaction.return_value = transaction
    service.transaction_repo.update_transaction.return_value = {}
    service.document_service.get_documents_for_session.return_value = docs
    return service.commit_transaction(TXN_ID, B_ID, ["audio_1.mp3"])


def test_commit_never_creates_documents(service):
    txn = _transaction(flavour=EXCLUDED_FLAVOUR)

    with patch.object(service, "_store_document_results") as store_mock:
        result = _run_commit(service, txn, [])

    store_mock.assert_not_called()
    service.document_service.update_document.assert_not_called()
    assert result == txn


def test_commit_stamps_commit_at_on_existing_documents(service):
    existing = [{"document_id": "doc_1", "type": DocumentType.CUSTOM}]
    txn = _transaction()

    with patch.object(service, "_store_document_results") as store_mock:
        _run_commit(service, txn, existing)

    store_mock.assert_not_called()
    service.document_service.update_document.assert_called_once()
    assert (
        service.document_service.update_document.call_args.kwargs["document_id"]
        == "doc_1"
    )


def test_commit_continues_for_normal_flavour_without_documents(service):
    txn = _transaction(flavour=NORMAL_FLAVOUR)

    with patch.object(service, "_store_document_results") as store_mock:
        result = _run_commit(service, txn, [])

    store_mock.assert_not_called()
    service.document_service.update_document.assert_not_called()
    assert result == txn

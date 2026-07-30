"""
Unit tests for internally-generated integration templates.

Covers the three pure-logic touch points of the feature:
  1. init injects the user's configured integration templates from config
  2. commit -> SQS drops these ids (they are not in OUTPUT_TEMPLATES)
  3. result API categorizes their documents under the integration section as JSON
"""

import pytest
from unittest.mock import MagicMock, patch

from voice2rx.choices import DocumentType
from voice2rx.services.transactions.transaction_service import TransactionService
from voice2rx.services.transactions.result_service_v2 import ResultServiceV2


# ---------------------------------------------------------------------------
# 1. Init: inject configured integration templates
# ---------------------------------------------------------------------------

def _service_with_config(configured):
    svc = TransactionService.__new__(TransactionService)
    svc.config_service = MagicMock()
    svc.config_service.get_config.return_value = {"integrations": configured}
    return svc


def test_inject_appends_configured_integration_templates():
    svc = _service_with_config([{"name": "EMR Note", "id": "soap_emr"}])
    item = {"uuid": "u1", "request_templates": {"visual": [], "integration": []}}

    svc._inject_configured_integration_templates(item, "b1")

    integration = item["request_templates"]["integration"]
    assert [t["template_id"] for t in integration] == ["soap_emr"]
    assert integration[0]["template_type"] == "integration"
    assert integration[0]["template_name"] == "EMR Note"


def test_inject_is_idempotent_on_existing_ids():
    svc = _service_with_config(
        [{"name": "Dup", "id": "existing"}, {"name": "New", "id": "soap_emr"}]
    )
    item = {
        "uuid": "u1",
        "request_templates": {"visual": [], "integration": [{"template_id": "existing"}]},
    }

    svc._inject_configured_integration_templates(item, "b1")

    ids = [t["template_id"] for t in item["request_templates"]["integration"]]
    assert ids == ["existing", "soap_emr"]


def test_inject_noop_without_uuid():
    svc = _service_with_config([{"name": "EMR", "id": "soap_emr"}])
    item = {"request_templates": {"visual": [], "integration": []}}

    svc._inject_configured_integration_templates(item, "b1")

    assert item["request_templates"]["integration"] == []
    svc.config_service.get_config.assert_not_called()


def test_inject_noop_when_no_integrations_configured():
    svc = _service_with_config([])
    item = {"uuid": "u1", "request_templates": {"visual": [], "integration": []}}

    svc._inject_configured_integration_templates(item, "b1")

    assert item["request_templates"]["integration"] == []


def test_inject_propagates_config_errors():
    svc = TransactionService.__new__(TransactionService)
    svc.config_service = MagicMock()
    svc.config_service.get_config.side_effect = Exception("config down")
    item = {"uuid": "u1", "request_templates": {"visual": [], "integration": []}}

    # config lookup failures propagate to the caller (not swallowed)
    with pytest.raises(Exception, match="config down"):
        svc._inject_configured_integration_templates(item, "b1")


# ---------------------------------------------------------------------------
# 2. Commit: internal integration ids are filtered out of the SQS payload
# ---------------------------------------------------------------------------

def test_internal_integration_id_skipped_from_sqs():
    svc = TransactionService.__new__(TransactionService)

    transaction_data = {
        "txn_id": "txn1",
        "s3_url": "s3://bucket/c1/txn1",
        "model_type": "pro",
        "request_templates": {
            "visual": [],
            # soap_emr is internally-generated (not in OUTPUT_TEMPLATES);
            # eka_emr_template is an external integration that DOES go to SQS.
            "integration": [
                {"template_id": "soap_emr", "template_type": "integration"},
                {"template_id": "eka_emr_template", "template_type": "default"},
            ],
        },
    }

    captured = {}

    def _capture(_queue, message):
        captured["message"] = message
        return {"success": True}

    with patch(
        "voice2rx.services.transactions.transaction_service.SQSService"
    ) as MockSQS:
        MockSQS.return_value.send_message.side_effect = _capture
        ok = svc.send_commit_to_sqs("txn1", "b1", transaction_data, audio_files=[])

    assert ok is True
    sent_ids = [
        t.get("template_id")
        for t in captured["message"].get("output_format_template", [])
    ]
    assert "soap_emr" not in sent_ids
    assert "eka_emr_template" in sent_ids


# ---------------------------------------------------------------------------
# 3. Result API: internal integration document -> integration section, JSON
# ---------------------------------------------------------------------------

def test_internal_integration_doc_categorized_as_integration_json():
    svc = ResultServiceV2.__new__(ResultServiceV2)
    svc.template_service = MagicMock()
    # no ekascribe_template row for an internally-generated id
    svc.template_service.get_templates_by_ids.return_value = []

    docs = [
        {
            "document_id": "d1",
            "template_id": "soap_emr",
            "type": DocumentType.INTEGRATION,
            "document_name": "EMR Note",
        }
    ]

    meta = svc._get_document_meta_info(docs)

    assert meta["d1"]["template_type"] == "integration"
    assert meta["d1"]["response_type"] == "json"

"""Per-trigger tests for the ekascribe webhook events.

Each test patches `emit` / `emit_raw` at the consuming module path and asserts
the right event fires (or doesn't) with the right identifiers.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from voice2rx.services.webhooks import ScribeEvent

TXN_ID = "txn-webhook-123"
B_ID = "test-business-id"
C_ID = "C_connect"
DOCTOR_UUID = "doctor-uuid-1"


def _transaction(**overrides):
    txn = {
        "txn_id": TXN_ID,
        "b_id": B_ID,
        "c_id": C_ID,
        "uuid": DOCTOR_UUID,
        "oid": "oid-1",
        "patient_oid": "patient-oid-1",
        "mode": "consultation",
        "model_type": "pro",
        "input_language": ["en"],
        "flavour": "android",
        "transfer": "vaded",
        "user_status": "init",
        "processing_status": "in-progress",
        "s3_url": f"s3://test-bucket/{TXN_ID}",
        "request_templates": {
            "visual": [{"template_id": "tpl_v", "document_id": "doc_v"}],
            "integration": [{"template_id": "tpl_i", "document_id": "doc_i"}],
        },
    }
    txn.update(overrides)
    return txn


# ---------------------------------------------------------------------------
#  scribe_session_init / scribe_session_end (service layer)
# ---------------------------------------------------------------------------


@pytest.fixture
def transaction_service():
    from voice2rx.services.transactions.transaction_service import TransactionService

    svc = TransactionService(
        transaction_repo=MagicMock(),
        audio_repo=MagicMock(),
        template_results_repo=MagicMock(),
    )
    svc.document_service = MagicMock()
    svc.tempalte_service = MagicMock()
    svc.config_service = MagicMock()
    return svc


def _run_init(service, prepared):
    with patch.object(
        service, "_prepare_transaction_data", return_value=dict(prepared)
    ), patch.object(service, "_validate_transaction_limit"), patch(
        "voice2rx.services.transactions.transaction_service.validate_s3_urls"
    ), patch.object(service, "_store_document_results"), patch.object(
        service, "_publish_to_sns_for_vadding"
    ), patch(
        "voice2rx.services.transactions.transaction_service.emit"
    ) as mock_emit:
        service.transaction_repo.create_transaction.return_value = {}
        service.initialize_transaction(TXN_ID, {}, {})
    return mock_emit


class TestSessionInitTrigger:
    def test_init_emits_session_init(self, transaction_service):
        mock_emit = _run_init(transaction_service, _transaction())

        mock_emit.assert_called_once()
        args, kwargs = mock_emit.call_args
        assert args[0] == ScribeEvent.SESSION_INIT
        assert kwargs["b_id"] == B_ID
        assert kwargs["c_id"] == C_ID
        assert kwargs["txn_id"] == TXN_ID
        # minimal payload: identifiers only, details come from the GET APIs
        assert kwargs["data"] == {"session_id": TXN_ID}

    def test_init_emits_even_on_protocol_non_vaded_early_return(
        self, transaction_service
    ):
        prepared = _transaction(
            additional_data=json.dumps({"_protocol": {"upload_type": "non-vaded"}})
        )
        mock_emit = _run_init(transaction_service, prepared)

        mock_emit.assert_called_once()
        assert mock_emit.call_args.args[0] == ScribeEvent.SESSION_INIT

    def test_init_does_not_emit_on_duplicate(self, transaction_service):
        from voice2rx.core.exceptions import DuplicateTransactionException

        with patch.object(
            transaction_service, "_prepare_transaction_data",
            return_value=_transaction(),
        ), patch.object(
            transaction_service, "_validate_transaction_limit"
        ), patch(
            "voice2rx.services.transactions.transaction_service.validate_s3_urls"
        ), patch.object(
            transaction_service, "_store_document_results"
        ), patch(
            "voice2rx.services.transactions.transaction_service.emit"
        ) as mock_emit:
            transaction_service.transaction_repo.create_transaction.return_value = {
                "error": "duplicate",
                "code": "duplicate_entry",
            }
            with pytest.raises(DuplicateTransactionException):
                transaction_service.initialize_transaction(TXN_ID, {}, {})

        mock_emit.assert_not_called()


class TestSessionEndTrigger:
    def test_commit_emits_session_end(self, transaction_service):
        txn = _transaction()
        transaction_service.transaction_repo.get_transaction.return_value = txn
        transaction_service.transaction_repo.update_transaction.return_value = {}
        transaction_service.document_service.get_documents_for_session.return_value = [
            {"document_id": "doc_v", "type": "custom"}
        ]

        with patch(
            "voice2rx.services.transactions.transaction_service.emit"
        ) as mock_emit:
            transaction_service.commit_transaction(
                TXN_ID, B_ID, ["a1.mp3", "a2.mp3"]
            )

        mock_emit.assert_called_once()
        args, kwargs = mock_emit.call_args
        assert args[0] == ScribeEvent.SESSION_END
        assert kwargs["c_id"] == C_ID
        assert kwargs["data"] == {"session_id": TXN_ID}


# ---------------------------------------------------------------------------
#  scribe_transcript_generate / scribe_session_delete (legacy routes)
# ---------------------------------------------------------------------------


def _jwt_header(with_uuid=False):
    payload = {"b-id": B_ID, "user_id": "test-user"}
    if with_uuid:
        payload["uuid"] = DOCTOR_UUID
    return {
        "jwt-payload": json.dumps(payload),
        "authorization": "Bearer test-token",
        "content-type": "application/json",
    }


class TestTranscriptGenerateTrigger:
    def test_pipeline_patch_with_transcript_success_emits(self, client):
        with patch(
            "voice2rx.services.transactions.transaction_service.TransactionService.get_transaction",
            return_value=_transaction(),
        ), patch(
            "voice2rx.services.transactions.transaction_service.TransactionService.update_transaction",
            return_value={},
        ), patch(
            "voice2rx.services.documents.document_service.DocumentService.get_documents_by_ids",
            return_value=[],
        ), patch(
            "voice2rx.services.documents.populate_documents_service.PopulateDocumentsService.populate_transcript"
        ), patch(
            "voice2rx.api.endpoints.transactions.transaction_actions.emit"
        ) as mock_emit, patch(
            "voice2rx.protocol.routes.sessions.emit"
        ) as mock_protocol_emit:
            response = client.patch(
                f"/voice/api/v2/transaction/{TXN_ID}",
                json={"transcript_status": "success"},
                headers=_jwt_header(),
            )

        assert response.status_code == 200
        mock_emit.assert_called_once()
        args, kwargs = mock_emit.call_args
        assert args[0] == ScribeEvent.TRANSCRIPT_GENERATE
        # DS-service JWT has no c-id — falls back to the transaction's c_id
        assert kwargs["c_id"] == C_ID
        assert kwargs["data"] == {
            "session_id": TXN_ID,
            "transcript_status": "success",
        }
        # the pipeline PATCH must NOT fire the config-update event
        mock_protocol_emit.assert_not_called()

    def test_pipeline_patch_without_transcript_success_does_not_emit(self, client):
        with patch(
            "voice2rx.services.transactions.transaction_service.TransactionService.get_transaction",
            return_value=_transaction(),
        ), patch(
            "voice2rx.services.transactions.transaction_service.TransactionService.update_transaction",
            return_value={},
        ), patch(
            "voice2rx.api.endpoints.transactions.transaction_actions.emit"
        ) as mock_emit:
            response = client.patch(
                f"/voice/api/v2/transaction/{TXN_ID}",
                json={"some_other_field": "value"},
                headers=_jwt_header(),
            )

        assert response.status_code == 200
        mock_emit.assert_not_called()


class TestSessionDeleteTrigger:
    def test_delete_emits_session_delete(self, client):
        with patch(
            "voice2rx.services.transactions.transaction_service.TransactionService.get_transaction",
            return_value=_transaction(),
        ), patch(
            "voice2rx.services.transactions.transaction_service.TransactionService.update_transaction",
            return_value={},
        ), patch(
            "voice2rx.api.endpoints.transactions.transaction_actions.emit"
        ) as mock_emit:
            response = client.delete(
                f"/voice/api/v2/transaction/{TXN_ID}",
                headers=_jwt_header(with_uuid=True),
            )

        assert response.status_code == 200
        mock_emit.assert_called_once()
        args, kwargs = mock_emit.call_args
        assert args[0] == ScribeEvent.SESSION_DELETE
        assert kwargs["c_id"] == C_ID
        assert kwargs["data"] == {"session_id": TXN_ID}


# ---------------------------------------------------------------------------
#  scribe_session_config_update (protocol PATCH /sessions/{id})
# ---------------------------------------------------------------------------


class TestSessionConfigUpdateTrigger:
    def test_protocol_patch_emits_config_update(self, client):
        with patch(
            "voice2rx.protocol.routes.sessions.transaction_service"
        ) as mock_svc, patch(
            "voice2rx.protocol.routes.sessions.emit"
        ) as mock_emit:
            mock_svc.get_transaction.return_value = _transaction()
            mock_svc.update_transaction.return_value = {}
            response = client.patch(
                f"/voice/v1/sessions/{TXN_ID}",
                json={"language_hint": ["hi"], "session_mode": "dictation"},
                headers=_jwt_header(),
            )

        assert response.status_code == 200
        mock_emit.assert_called_once()
        args, kwargs = mock_emit.call_args
        assert args[0] == ScribeEvent.SESSION_CONFIG_UPDATE
        assert kwargs["txn_id"] == TXN_ID
        # no c-id in the JWT — falls back to the transaction's c_id
        assert kwargs["c_id"] == C_ID
        assert kwargs["data"] == {"session_id": TXN_ID}


# ---------------------------------------------------------------------------
#  scribe_document_generate (conversion pipeline + AG-UI)
# ---------------------------------------------------------------------------


def _conversion_ctx(**overrides):
    from voice2rx.services.templates.conversion_pipeline import ConversionContext

    defaults = dict(
        txn_id=TXN_ID,
        b_id=B_ID,
        template_id="tpl_v",
        document_id="doc_v",
        transaction_data=_transaction(),
    )
    defaults.update(overrides)
    return ConversionContext(**defaults)


@pytest.fixture
def pipeline():
    from voice2rx.services.templates.conversion_pipeline import ConversionPipeline

    p = ConversionPipeline.__new__(ConversionPipeline)
    p.document_service = MagicMock()
    return p


class TestDocumentGenerateTrigger:
    def test_agent_success_emits_with_background_source(self, pipeline):
        with patch(
            "voice2rx.services.templates.conversion_pipeline.emit"
        ) as mock_emit:
            pipeline._update_document_success(_conversion_ctx(), "docs/doc_v.txt")

        mock_emit.assert_called_once()
        args, kwargs = mock_emit.call_args
        assert args[0] == ScribeEvent.DOCUMENT_GENERATE
        assert kwargs["c_id"] == C_ID
        assert kwargs["data"] == {
            "session_id": TXN_ID,
            "document_id": "doc_v",
            "template_id": "tpl_v",
            "status": "success",
            "source": "background_agent",
        }

    def test_integration_success_emits_with_integration_source(self, pipeline):
        ctx = _conversion_ctx(is_integration_generation=True)
        with patch(
            "voice2rx.services.templates.conversion_pipeline.emit"
        ) as mock_emit:
            pipeline._update_document_success(ctx, "docs/doc_v.txt")

        assert mock_emit.call_args.kwargs["data"]["source"] == "integration_agent"

    @pytest.mark.parametrize(
        "flag", ["is_translation", "is_direct_transcript"]
    )
    def test_translation_and_transcript_flows_do_not_emit(self, pipeline, flag):
        ctx = _conversion_ctx(**{flag: True})
        with patch(
            "voice2rx.services.templates.conversion_pipeline.emit"
        ) as mock_emit:
            pipeline._update_document_success(ctx, "docs/doc_v.txt")

        mock_emit.assert_not_called()

    def test_failure_path_does_not_emit(self, pipeline):
        with patch(
            "voice2rx.services.templates.conversion_pipeline.emit"
        ) as mock_emit:
            pipeline._update_document_failure(_conversion_ctx(), Exception("boom"))

        mock_emit.assert_not_called()

    def test_ag_ui_helper_emits_with_ag_ui_source(self):
        from voice2rx.services.templates.ag_ui.run_service import (
            AgUiRunService,
            ResolvedRunInputs,
        )

        inputs = ResolvedRunInputs(
            b_id=B_ID,
            txn_id=TXN_ID,
            document_id="doc_agui",
            template_id="tpl_agui",
            s3_url=f"s3://test-bucket/{TXN_ID}",
            transcript="",
            template_prompt="",
            c_id=C_ID,
            doctor_uuid=DOCTOR_UUID,
        )

        with patch(
            "voice2rx.services.templates.ag_ui.run_service.emit"
        ) as mock_emit:
            AgUiRunService._emit_document_generated(MagicMock(), inputs)

        mock_emit.assert_called_once()
        args, kwargs = mock_emit.call_args
        assert args[0] == ScribeEvent.DOCUMENT_GENERATE
        assert kwargs["c_id"] == C_ID
        assert kwargs["data"] == {
            "session_id": TXN_ID,
            "document_id": "doc_agui",
            "template_id": "tpl_agui",
            "status": "success",
            "source": "ag_ui",
        }


# ---------------------------------------------------------------------------
#  migrated legacy senders
# ---------------------------------------------------------------------------


class TestLegacySenderMigration:
    def test_send_webhook_notification_emits_v2rx_completed(self):
        from voice2rx.services.messaging.webhook import send_webhook_notification

        with patch("voice2rx.services.messaging.webhook.emit") as mock_emit:
            send_webhook_notification(TXN_ID, B_ID, C_ID, send_audio_url=False)

        mock_emit.assert_called_once()
        args, kwargs = mock_emit.call_args
        assert args[0] == ScribeEvent.V2RX_COMPLETED
        assert kwargs["b_id"] == B_ID
        assert kwargs["c_id"] == C_ID
        assert kwargs["txn_id"] == TXN_ID
        assert kwargs["data"] == {}

    def test_emr_publish_webhook_preserves_legacy_payload(self):
        from voice2rx.services.publish.base import PublishContext
        from voice2rx.services.publish.integrations.emr_webhook import _send_webhook

        ctx = PublishContext(
            document={"document_id": "doc_pub"},
            transaction=_transaction(),
            session_id=TXN_ID,
            encounter_id="enc-1",
            b_id=B_ID,
            uuid=DOCTOR_UUID,
            oid="patient-oid-1",
            jwt_payload={},
            client_id=C_ID,
        )

        with patch(
            "voice2rx.services.publish.integrations.emr_webhook.emit_raw"
        ) as mock_emit_raw:
            _send_webhook(ctx, {"webhook_endpoint": "http://custom-endpoint"})

        mock_emit_raw.assert_called_once()
        payload = mock_emit_raw.call_args.args[0]
        assert mock_emit_raw.call_args.kwargs["url_override"] == "http://custom-endpoint"
        assert payload["event_id"] == "scribe.document.publish"
        assert payload["business_id"] == B_ID
        assert payload["client_id"] == C_ID
        # legacy payload shape preserved: extra keys at the payload level
        inner = payload["payload"]
        assert inner["encounter_id"] == "enc-1"
        assert inner["document_id"] == "doc_pub"
        assert inner["doctor_uuid"] == DOCTOR_UUID
        assert inner["data"]["patient_oid"] == "patient-oid-1"

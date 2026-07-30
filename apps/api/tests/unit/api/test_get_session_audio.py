"""Tests for GET /voice/v1/sessions/{session_id}/audio and the related
audio_api_enabled webhook gating + protocol end-session audio combining."""

import json
from unittest.mock import MagicMock, patch

SESSION_ID = "txn-audio-123"
B_ID = "test-business-id"
C_ID = "C_connect"


def _jwt_header(c_id=None):
    payload = {"b-id": B_ID, "user_id": "test-user"}
    if c_id:
        payload["c-id"] = c_id
    return {
        "jwt-payload": json.dumps(payload),
        "authorization": "Bearer test-token",
        "content-type": "application/json",
    }


def _transaction(**overrides):
    txn = {
        "txn_id": SESSION_ID,
        "b_id": B_ID,
        "c_id": C_ID,
        "transfer": "vaded",
        "user_status": "commit",
        "processing_status": "in-progress",
        "s3_url": f"s3://test-bucket/{SESSION_ID}",
    }
    txn.update(overrides)
    return txn


class TestGetSessionAudioAPI:
    URL = f"/voice/v1/sessions/{SESSION_ID}/audio"

    def _call(self, client, *, transaction=..., audio_full=True,
              object_exists=True, expiry_hours=24, presigned="https://s3/presigned"):
        transaction = _transaction() if transaction is ... else transaction
        storage = MagicMock()
        storage.object_exists.return_value = object_exists
        storage.generate_presigned_get_url.return_value = presigned

        with patch(
            "voice2rx.protocol.routes.audio.transaction_service"
        ) as svc, patch(
            "voice2rx.protocol.routes.audio.config_service"
        ) as cfg, patch(
            "voice2rx.protocol.routes.audio.S3StorageClient",
            return_value=storage,
        ) as storage_cls:
            svc.get_transaction.return_value = transaction
            cfg.check_audio_full_enabled.return_value = audio_full
            cfg.get_audio_url_expiry_hours.return_value = expiry_hours
            response = client.get(self.URL, headers=_jwt_header())
        return response, storage, storage_cls

    def test_success_returns_presigned_url(self, client):
        response, storage, _ = self._call(client)

        assert response.status_code == 200
        body = response.json()
        assert body["session_id"] == SESSION_ID
        assert body["status"] == "success"
        assert body["audio_url"] == "https://s3/presigned"
        assert body["expires_in"] == 24 * 3600
        assert isinstance(body["expires_at"], int)
        storage.generate_presigned_get_url.assert_called_once_with(
            f"{B_ID}/{SESSION_ID}_combined.mp3", expires_in=24 * 3600
        )

    def test_expiry_comes_from_business_config(self, client):
        response, storage, _ = self._call(client, expiry_hours=48)

        assert response.status_code == 200
        assert response.json()["expires_in"] == 48 * 3600
        storage.generate_presigned_get_url.assert_called_once_with(
            f"{B_ID}/{SESSION_ID}_combined.mp3", expires_in=48 * 3600
        )

    def test_uses_combined_audio_bucket(self, client):
        _, _, storage_cls = self._call(client)
        assert (
            storage_cls.call_args.kwargs["bucket_name"]
            == "m-prod-voice-record-audio"
        )

    def test_unknown_session_returns_404(self, client):
        response, _, _ = self._call(client, transaction=None)

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "resource_not_found"

    def test_audio_full_disabled_returns_403(self, client):
        response, storage, _ = self._call(client, audio_full=False)

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "audio_not_enabled"
        storage.generate_presigned_get_url.assert_not_called()

    def test_missing_combined_audio_returns_404(self, client):
        response, storage, _ = self._call(client, object_exists=False)

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "audio_not_available"
        storage.generate_presigned_get_url.assert_not_called()

    def test_presign_failure_returns_500(self, client):
        response, _, _ = self._call(client, presigned=None)

        assert response.status_code == 500
        assert response.json()["error"]["code"] == "audio_url_generation_failed"


class TestWebhookAudioUrlGating:
    """audio_api_enabled=True must strip the presigned URL from v2rx.completed."""

    def _patch_transaction_update(self, client, audio_api_enabled):
        with patch(
            "voice2rx.services.transactions.transaction_service.TransactionService.get_transaction",
            return_value=_transaction(),
        ), patch(
            "voice2rx.services.transactions.transaction_service.TransactionService.update_transaction",
            return_value={},
        ), patch(
            "voice2rx.api.endpoints.transactions.transaction_actions.config_service"
        ) as cfg, patch(
            "voice2rx.api.endpoints.transactions.transaction_actions.send_webhook_notification"
        ) as send_webhook, patch(
            "voice2rx.api.endpoints.transactions.transaction_actions.process_fhir_data"
        ):
            cfg.check_audio_full_enabled.return_value = True
            cfg.check_audio_api_enabled.return_value = audio_api_enabled
            response = client.patch(
                f"/voice/api/v2/transaction/{SESSION_ID}",
                json={"processing_status": "success"},
                headers=_jwt_header(c_id=C_ID),
            )
        return response, send_webhook

    def test_audio_api_enabled_omits_presigned_url(self, client):
        response, send_webhook = self._patch_transaction_update(
            client, audio_api_enabled=True
        )

        assert response.status_code == 200
        send_webhook.assert_called_once()
        assert send_webhook.call_args.args[3] is False  # send_audio_url

    def test_audio_api_disabled_keeps_presigned_url(self, client):
        response, send_webhook = self._patch_transaction_update(
            client, audio_api_enabled=False
        )

        assert response.status_code == 200
        send_webhook.assert_called_once()
        assert send_webhook.call_args.args[3] is True  # send_audio_url


class TestCommitSchedulesAudioCombine:
    """commit_transaction (service layer) schedules combining for both surfaces."""

    def _commit(self, *, audio_full, transfer="vaded", background_tasks=...):
        from voice2rx.services.transactions.transaction_service import (
            TransactionService,
        )

        service = TransactionService(
            transaction_repo=MagicMock(),
            audio_repo=MagicMock(),
            template_results_repo=MagicMock(),
        )
        service.document_service = MagicMock()
        service.document_service.get_documents_for_session.return_value = [
            {"document_id": "doc_1", "type": "custom"}
        ]
        service.config_service = MagicMock()
        service.config_service.check_audio_full_enabled.return_value = audio_full
        service.transaction_repo.get_transaction.return_value = _transaction(
            transfer=transfer
        )
        service.transaction_repo.update_transaction.return_value = {}

        bg = MagicMock() if background_tasks is ... else background_tasks
        with patch(
            "voice2rx.services.transactions.transaction_service.emit"
        ):
            service.commit_transaction(
                SESSION_ID, B_ID, ["0.mp3"], background_tasks=bg
            )
        return bg

    def test_schedules_combine_when_audio_full_and_vaded(self):
        from voice2rx.services.transactions.transaction_service import (
            background_audio_combine_task,
        )

        bg = self._commit(audio_full=True)

        bg.add_task.assert_called_once_with(
            background_audio_combine_task,
            txn_id=SESSION_ID,
            b_id=B_ID,
            source_s3_path=f"s3://test-bucket/{SESSION_ID}",
        )

    def test_no_combine_when_audio_full_disabled(self):
        bg = self._commit(audio_full=False)
        bg.add_task.assert_not_called()

    def test_no_combine_for_non_vaded_transfer(self):
        bg = self._commit(audio_full=True, transfer="non-vaded")
        bg.add_task.assert_not_called()

    def test_no_background_tasks_does_not_crash(self):
        self._commit(audio_full=True, background_tasks=None)

    def test_protocol_end_session_passes_background_tasks(self, client):
        with patch(
            "voice2rx.protocol.routes.sessions.transaction_service"
        ) as svc, patch(
            "voice2rx.protocol.routes.sessions.get_s3_client"
        ), patch(
            "voice2rx.protocol.routes.sessions.list_files_in_s3_folder",
            return_value=["0.mp3"],
        ), patch(
            "voice2rx.protocol.routes.sessions.session_adaptor"
        ) as adaptor, patch(
            "voice2rx.protocol.routes.sessions.emit"
        ):
            svc.get_transaction.return_value = _transaction()
            svc.commit_transaction.return_value = _transaction()
            adaptor.create_end_session_response.return_value = {
                "session_id": SESSION_ID,
                "status": "processing",
                "message": "Session ended",
                "audio_files_received": 1,
                "audio_files": ["0.mp3"],
            }
            response = client.post(
                f"/voice/v1/sessions/{SESSION_ID}/end", headers=_jwt_header()
            )

        assert response.status_code == 202
        assert svc.commit_transaction.call_args.kwargs["background_tasks"] is not None

    def test_legacy_commit_route_passes_background_tasks(self, client):
        with patch(
            "voice2rx.api.endpoints.transactions.commit_router.transaction_service"
        ) as svc:
            svc.commit_transaction.return_value = _transaction()
            svc.send_commit_to_sqs.return_value = True
            response = client.post(
                f"/voice/api/v2/transaction/commit/{SESSION_ID}",
                json={"audio_files": ["0.mp3"]},
                headers=_jwt_header(),
            )

        assert response.status_code == 200
        assert svc.commit_transaction.call_args.kwargs["background_tasks"] is not None

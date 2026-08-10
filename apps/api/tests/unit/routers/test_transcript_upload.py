"""Tests for POST /voice/api/v1/transaction/{txn_id}/convert-to-template.

Only the transcript-upload slice of the old endpoint survives: persist the
pasted transcript, fill the transcript document, mark the session done.
Structuring happens later via the AG-UI flow.
"""

import orjson
from unittest.mock import patch

ROUTER = "scribe.routers.transcript_upload"


def _url(txn_id="sc-1"):
    return f"/voice/api/v1/transaction/{txn_id}/convert-to-template"


def _jwt_header(uuid="user-1", b_id="biz-1"):
    return {
        "jwt-payload": orjson.dumps(
            {"uuid": uuid, "b-id": b_id, "iss": "test"}
        ).decode()
    }


def _txn(user_status="init"):
    return {
        "txn_id": "sc-1",
        "b_id": "biz-1",
        "uuid": "user-1",
        "user_status": user_status,
        "s3_url": "s3://voice-records/250810/sc-1",
    }


class TestTranscriptUpload:
    def test_accepts_transcript_and_processes_in_background(self, client):
        with patch(f"{ROUTER}.transaction_service") as svc, \
             patch(f"{ROUTER}.document_service") as docs, \
             patch(f"{ROUTER}.blob_repo") as blob:
            svc.get_transaction.return_value = _txn()
            blob.upload_json.return_value = True

            response = client.post(
                _url(), json={"transcript": "we agreed to ship friday"},
                headers=_jwt_header(),
            )

        assert response.status_code == 202
        body = response.json()
        # ResponseFormatter.success merges additional_data at the top level,
        # so {"status": "in-progress"} intentionally overrides "success" —
        # this matches the legacy endpoint's wire shape.
        assert body["status"] == "in-progress"
        assert body["txn_id"] == "sc-1"

        # TestClient runs background tasks before returning — assert effects
        blob.upload_json.assert_called_once()
        args = blob.upload_json.call_args.args
        assert args[1].endswith("logs/transcript.json")
        assert args[2] == {"text": "we agreed to ship friday"}

        docs.create_transcript_document.assert_called_once_with(
            session_id="sc-1",
            b_id="biz-1",
            uuid_val="user-1",
            s3_url="s3://voice-records/250810/sc-1",
        )
        svc.update_transaction.assert_called_once_with(
            "sc-1",
            "biz-1",
            {
                "user_status": "commit",
                "transcript_status": "success",
                "processing_status": "success",
            },
        )

    def test_missing_transcript_returns_400(self, client):
        with patch(f"{ROUTER}.transaction_service") as svc:
            response = client.post(_url(), json={}, headers=_jwt_header())

        assert response.status_code == 400
        svc.update_transaction.assert_not_called()

    def test_non_init_session_returns_400(self, client):
        with patch(f"{ROUTER}.transaction_service") as svc, \
             patch(f"{ROUTER}.document_service") as docs:
            svc.get_transaction.return_value = _txn(user_status="commit")

            response = client.post(
                _url(), json={"transcript": "hello"}, headers=_jwt_header()
            )

        assert response.status_code == 400
        docs.create_transcript_document.assert_not_called()
        svc.update_transaction.assert_not_called()

    def test_blob_failure_does_not_mark_session_done(self, client):
        with patch(f"{ROUTER}.transaction_service") as svc, \
             patch(f"{ROUTER}.document_service") as docs, \
             patch(f"{ROUTER}.blob_repo") as blob:
            svc.get_transaction.return_value = _txn()
            blob.upload_json.return_value = False

            response = client.post(
                _url(), json={"transcript": "hello"}, headers=_jwt_header()
            )

        # request itself succeeds (202); the background failure is logged and
        # the session must NOT be flipped to success
        assert response.status_code == 202
        docs.create_transcript_document.assert_not_called()
        svc.update_transaction.assert_not_called()

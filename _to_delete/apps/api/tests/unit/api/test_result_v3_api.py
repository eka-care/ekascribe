"""
Unit tests for result v3 status API (/voice/api/v3/status/{session_id}).

The v3 endpoints are thin wrappers around ResultServiceV2 and
PopulateDocumentsService. These tests exercise the router layer by mocking
the service layer, so they are resilient to internal service refactors as
long as the public service interface is stable.

Covered:
- GET /status/{session_id}            (session-level polling)
- GET /status/{session_id}?template_id=transcript  (transcript polling)
- GET /status/{session_id}?document_id=...         (single-document polling)
- PATCH /status/{session_id}          (update document content)
"""

from http import HTTPStatus
from unittest.mock import patch, AsyncMock

import pytest

from tests.unit.utils.test_helpers import create_valid_jwt_header


SESSION_ID = "test-session-123"
B_ID = "test-business-id"


def _sample_session_response():
    return {
        "data": {
            "created_at": "2024-01-01T00:00:00Z",
            "output": [
                {
                    "template_id": "eka_emr_template",
                    "value": "base64encodeddata",
                    "type": "eka_emr",
                    "name": "EMR Template",
                    "status": "success",
                    "errors": [],
                    "warnings": [],
                }
            ],
            "additional_data": {},
            "audio_matrix": {"quality": 0.95},
            "template_results": {
                "integration": [],
                "custom": [],
                "transcript": [],
            },
        }
    }


class TestGetSessionStatus:
    """GET /status/{session_id} without template/document filters."""

    def test_session_status_success_200(self, client):
        headers = create_valid_jwt_header()
        transaction = {
            "txn_id": SESSION_ID,
            "b_id": B_ID,
            "s3_url": "s3://bucket/folder/",
            "uuid": "user-uuid",
            "prompt_s3_url": None,
        }

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc:
            mock_svc.transaction_repo.get_transaction.return_value = transaction
            mock_svc.has_documents.return_value = True
            mock_svc.poll_for_session_documents = AsyncMock(
                return_value=(_sample_session_response(), HTTPStatus.OK)
            )

            response = client.get(
                f"/voice/api/v3/status/{SESSION_ID}", headers=headers
            )

        assert response.status_code == HTTPStatus.OK
        body = response.json()
        assert "data" in body
        assert body["data"]["output"][0]["template_id"] == "eka_emr_template"
        mock_svc.has_documents.assert_called_once_with(SESSION_ID)
        mock_svc.poll_for_session_documents.assert_awaited_once_with(
            transaction, B_ID, False
        )

    def test_session_status_in_progress_202(self, client):
        headers = create_valid_jwt_header()

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc:
            mock_svc.has_documents.return_value = True
            mock_svc.poll_for_session_documents = AsyncMock(
                return_value=(_sample_session_response(), HTTPStatus.ACCEPTED)
            )

            response = client.get(
                f"/voice/api/v3/status/{SESSION_ID}", headers=headers
            )

        assert response.status_code == HTTPStatus.ACCEPTED

    def test_session_status_partial_content_206(self, client):
        headers = create_valid_jwt_header()

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc:
            mock_svc.has_documents.return_value = True
            mock_svc.poll_for_session_documents = AsyncMock(
                return_value=(_sample_session_response(), HTTPStatus.PARTIAL_CONTENT)
            )

            response = client.get(
                f"/voice/api/v3/status/{SESSION_ID}", headers=headers
            )

        assert response.status_code == HTTPStatus.PARTIAL_CONTENT

    def test_missing_jwt_returns_error(self, client):
        response = client.get(f"/voice/api/v3/status/{SESSION_ID}")
        # RequestHandler raises -> from_exception -> error response
        assert response.status_code >= 400

    def test_lazy_migration_triggered_when_no_documents(self, client):
        headers = create_valid_jwt_header()
        transaction = {
            "txn_id": SESSION_ID,
            "b_id": B_ID,
            "s3_url": "s3://bucket/folder/",
            "uuid": "user-uuid",
            "prompt_s3_url": None,
        }

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc, patch(
            "voice2rx.api.endpoints.result_router.populate_documents_service"
        ) as mock_populate:
            mock_svc.has_documents.return_value = False
            mock_svc.transaction_repo.get_transaction.return_value = transaction
            mock_svc.poll_for_session_documents = AsyncMock(
                return_value=(_sample_session_response(), HTTPStatus.OK)
            )
            mock_populate.populate_documents = AsyncMock(return_value=[])

            response = client.get(
                f"/voice/api/v3/status/{SESSION_ID}", headers=headers
            )

        assert response.status_code == HTTPStatus.OK
        mock_populate.populate_documents.assert_awaited_once()
        # ensure the populate call received the expected session/b_id
        _, kwargs = mock_populate.populate_documents.call_args
        assert kwargs["session_id"] == SESSION_ID
        assert kwargs["b_id"] == B_ID
        assert kwargs["patch_api_call"] is False

    def test_lazy_migration_skipped_when_transaction_missing(self, client):
        headers = create_valid_jwt_header()

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc, patch(
            "voice2rx.api.endpoints.result_router.populate_documents_service"
        ) as mock_populate:
            mock_svc.transaction_repo.get_transaction.return_value = None
            mock_populate.populate_documents = AsyncMock()

            response = client.get(
                f"/voice/api/v3/status/{SESSION_ID}", headers=headers
            )

        assert response.status_code == HTTPStatus.NOT_FOUND
        mock_populate.populate_documents.assert_not_called()

    def test_nic_client_transcript_success_forces_200(self, client):
        nic_b_id = "EC_175308121952375"
        headers = create_valid_jwt_header(b_id=nic_b_id)

        response_payload = _sample_session_response()
        response_payload["data"]["template_results"]["transcript"] = [
            {"status": "success"}
        ]

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc:
            mock_svc.has_documents.return_value = True
            mock_svc.poll_for_session_documents = AsyncMock(
                return_value=(response_payload, HTTPStatus.ACCEPTED)
            )

            response = client.get(
                f"/voice/api/v3/status/{SESSION_ID}", headers=headers
            )

        assert response.status_code == HTTPStatus.OK

    def test_unhandled_exception_returns_error_response(self, client):
        headers = create_valid_jwt_header()

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc:
            mock_svc.has_documents.side_effect = RuntimeError("boom")

            response = client.get(
                f"/voice/api/v3/status/{SESSION_ID}", headers=headers
            )

        assert response.status_code >= 400
        assert response.json()["status"] == "failed"


class TestGetDocumentStatus:
    """GET /status/{session_id}?document_id=... single document polling."""

    def test_document_polling_returns_document_response(self, client):
        headers = create_valid_jwt_header()
        document_id = "doc-abc"
        doc_response = _sample_session_response()

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc:
            mock_svc.poll_for_document = AsyncMock(
                return_value=(doc_response, HTTPStatus.OK)
            )
            mock_svc.poll_for_session_documents = AsyncMock()

            response = client.get(
                f"/voice/api/v3/status/{SESSION_ID}?document_id={document_id}",
                headers=headers,
            )

        assert response.status_code == HTTPStatus.OK
        mock_svc.poll_for_document.assert_awaited_once_with(
            document_id, SESSION_ID, B_ID
        )
        # session-level polling must NOT have been touched
        mock_svc.poll_for_session_documents.assert_not_awaited()

    def test_transcript_flag_resolves_document_then_polls(self, client):
        headers = create_valid_jwt_header()

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc, patch(
            "voice2rx.api.endpoints.result_router.document_service"
        ) as mock_doc_svc:
            mock_doc_svc.get_document_id_by_session_and_template.return_value = (
                "transcript-doc-id"
            )
            mock_svc.poll_for_document = AsyncMock(
                return_value=(_sample_session_response(), HTTPStatus.OK)
            )

            response = client.get(
                f"/voice/api/v3/status/{SESSION_ID}?transcript=true",
                headers=headers,
            )

        assert response.status_code == HTTPStatus.OK
        mock_doc_svc.get_document_id_by_session_and_template.assert_called_once_with(
            SESSION_ID, "transcript"
        )
        mock_svc.poll_for_document.assert_awaited_once_with(
            "transcript-doc-id", SESSION_ID, B_ID
        )


class TestUpdateStatus:
    """PATCH /status/{session_id}."""

    def test_update_status_success(self, client):
        headers = create_valid_jwt_header()
        body = [{"document-id": "doc-1", "data": "base64-content"}]

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc:
            mock_svc.update_document_content.return_value = ["doc-1"]

            response = client.patch(
                f"/voice/api/v3/status/{SESSION_ID}", headers=headers, json=body
            )

        assert response.status_code == HTTPStatus.OK
        response_json = response.json()
        assert response_json["status"] == "success"
        assert response_json["txn_id"] == SESSION_ID
        assert response_json["b_id"] == B_ID
        mock_svc.update_document_content.assert_called_once_with(
            SESSION_ID,
            B_ID,
            [{"document_id": "doc-1", "data": "base64-content"}],
        )

    def test_update_status_multiple_documents(self, client):
        headers = create_valid_jwt_header()
        body = [
            {"document-id": "doc-1", "data": "content-1"},
            {"document-id": "doc-2", "data": "content-2"},
        ]

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc:
            mock_svc.update_document_content.return_value = ["doc-1", "doc-2"]

            response = client.patch(
                f"/voice/api/v3/status/{SESSION_ID}", headers=headers, json=body
            )

        assert response.status_code == HTTPStatus.OK
        assert "Successfully updated 2 documents" in response.json()["message"]

    def test_update_status_invalid_body_returns_validation_error(self, client):
        headers = create_valid_jwt_header()
        # missing the required "document-id" alias
        body = [{"data": "only-data"}]

        response = client.patch(
            f"/voice/api/v3/status/{SESSION_ID}", headers=headers, json=body
        )

        assert response.status_code >= 400
        assert response.json()["status"] == "failed"

    def test_update_status_service_error_returns_error(self, client):
        from voice2rx.core.exceptions import ResourceNotFoundException

        headers = create_valid_jwt_header()
        body = [{"document-id": "doc-1", "data": "content"}]

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc:
            mock_svc.update_document_content.side_effect = ResourceNotFoundException(
                "Document not available that you are trying to edit.",
                txn_id=SESSION_ID,
                b_id=B_ID,
            )

            response = client.patch(
                f"/voice/api/v3/status/{SESSION_ID}", headers=headers, json=body
            )

        assert response.status_code >= 400
        assert response.json()["status"] == "failed"

    def test_update_status_empty_array_success(self, client):
        headers = create_valid_jwt_header()

        with patch(
            "voice2rx.api.endpoints.result_router.result_service_v2"
        ) as mock_svc:
            mock_svc.update_document_content.return_value = []

            response = client.patch(
                f"/voice/api/v3/status/{SESSION_ID}", headers=headers, json=[]
            )

        assert response.status_code == HTTPStatus.OK
        assert "Successfully updated 0 documents" in response.json()["message"]

"""
Integration tests for GET /voice/api/v1/sessions/{session_id}.

The router is a thin wrapper around SessionDetailsService; tests mock the
service and assert the wiring (JWT extraction, query-param handling, status
codes, error envelope) rather than the assembly logic.
"""

import json
from http import HTTPStatus
from unittest.mock import AsyncMock, patch

import pytest

from scribe.core.exceptions import ResourceNotFoundException


SESSION_ID = "test-session-123"
B_ID = "test-business-id"
UUID = "test-uuid"


def _jwt_header(b_id: str = B_ID, uuid: str = UUID) -> dict:
    payload = {}
    if b_id is not None:
        payload["b-id"] = b_id
    if uuid is not None:
        payload["uuid"] = uuid
    return {
        "jwt-payload": json.dumps(payload),
        "authorization": "Bearer test-token",
        "content-type": "application/json",
    }


def _ok_response():
    return {
        "status": "success",
        "data": {
            "schema_version": "2026-04-29",
            "session_id": SESSION_ID,
            "uuid": UUID,
            "b_id": B_ID,
            "created_at": "2024-01-01T00:00:00Z",
            "audio_matrix": {"quality": 0.9},
            "documents": [],
        },
    }


# ---------------------------------------------------------------------------
# happy path
# ---------------------------------------------------------------------------


class TestGetSessionDetails:
    def test_returns_200_on_success(self, client):
        with patch(
            "scribe.routers.session_details_router."
            "session_details_service"
        ) as mock_svc:
            mock_svc.get_session_details = AsyncMock(
                return_value=(_ok_response(), HTTPStatus.OK)
            )

            response = client.get(
                f"/voice/api/v1/sessions/{SESSION_ID}",
                headers=_jwt_header(),
            )

        assert response.status_code == HTTPStatus.OK
        body = response.json()
        assert body["status"] == "success"
        assert body["data"]["session_id"] == SESSION_ID
        mock_svc.get_session_details.assert_called_once_with(
            session_id=SESSION_ID,
            jwt_uuid=UUID,
            jwt_b_id=B_ID,
            presigned=False,
            flavour="",
            version="",
        )

    def test_returns_202_when_service_says_in_progress(self, client):
        with patch(
            "scribe.routers.session_details_router."
            "session_details_service"
        ) as mock_svc:
            mock_svc.get_session_details = AsyncMock(
                return_value=(_ok_response(), HTTPStatus.ACCEPTED)
            )

            response = client.get(
                f"/voice/api/v1/sessions/{SESSION_ID}",
                headers=_jwt_header(),
            )

        assert response.status_code == HTTPStatus.ACCEPTED

    def test_presigned_query_param_passed_to_service(self, client):
        with patch(
            "scribe.routers.session_details_router."
            "session_details_service"
        ) as mock_svc:
            mock_svc.get_session_details = AsyncMock(
                return_value=(_ok_response(), HTTPStatus.OK)
            )

            client.get(
                f"/voice/api/v1/sessions/{SESSION_ID}?presigned=true",
                headers=_jwt_header(),
            )

        _, kwargs = mock_svc.get_session_details.call_args
        assert kwargs["presigned"] is True

    def test_presigned_default_is_false(self, client):
        with patch(
            "scribe.routers.session_details_router."
            "session_details_service"
        ) as mock_svc:
            mock_svc.get_session_details = AsyncMock(
                return_value=(_ok_response(), HTTPStatus.OK)
            )

            client.get(
                f"/voice/api/v1/sessions/{SESSION_ID}",
                headers=_jwt_header(),
            )

        _, kwargs = mock_svc.get_session_details.call_args
        assert kwargs["presigned"] is False


# ---------------------------------------------------------------------------
# auth / not-found
# ---------------------------------------------------------------------------


class TestAuthAndNotFound:
    def test_missing_uuid_in_jwt_returns_404(self, client):
        with patch(
            "scribe.routers.session_details_router."
            "session_details_service"
        ) as mock_svc:
            response = client.get(
                f"/voice/api/v1/sessions/{SESSION_ID}",
                headers=_jwt_header(uuid=None),
            )

        assert response.status_code == HTTPStatus.NOT_FOUND
        mock_svc.get_session_details.assert_not_called()

    def test_missing_b_id_in_jwt_returns_404(self, client):
        with patch(
            "scribe.routers.session_details_router."
            "session_details_service"
        ) as mock_svc:
            response = client.get(
                f"/voice/api/v1/sessions/{SESSION_ID}",
                headers=_jwt_header(b_id=None),
            )

        assert response.status_code == HTTPStatus.NOT_FOUND
        mock_svc.get_session_details.assert_not_called()

    def test_service_raises_not_found_returns_404(self, client):
        with patch(
            "scribe.routers.session_details_router."
            "session_details_service"
        ) as mock_svc:
            mock_svc.get_session_details.side_effect = ResourceNotFoundException(
                f"Session not found: {SESSION_ID}",
                txn_id=SESSION_ID,
                b_id=B_ID,
            )

            response = client.get(
                f"/voice/api/v1/sessions/{SESSION_ID}",
                headers=_jwt_header(),
            )

        assert response.status_code == HTTPStatus.NOT_FOUND
        body = response.json()
        assert body["status"] == "failed"
        assert body["error"]["code"] == "resource_not_found"

    def test_unexpected_exception_returns_500_with_error_envelope(self, client):
        with patch(
            "scribe.routers.session_details_router."
            "session_details_service"
        ) as mock_svc:
            mock_svc.get_session_details.side_effect = RuntimeError("boom")

            response = client.get(
                f"/voice/api/v1/sessions/{SESSION_ID}",
                headers=_jwt_header(),
            )

        assert response.status_code == HTTPStatus.INTERNAL_SERVER_ERROR
        body = response.json()
        assert body["status"] == "failed"
        assert body["error"]["code"] == "unexpected_error"

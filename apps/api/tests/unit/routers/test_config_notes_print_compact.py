import json
from unittest.mock import patch

import pytest
from fastapi import status


class TestConfigNotesIdsAndPrintCompact:
    @pytest.fixture
    def jwt_headers(self):
        return {
            "jwt-payload": json.dumps({
                "b-id": "test-business-id",
                "uuid": "test-user-uuid",
                "cc": {"esc": 0},
            })
        }

    @patch('scribe.routers.language_config.config_service')
    def test_get_config_defaults(self, mock_config_service, client, jwt_headers):
        mock_config_service.get_workspace_config.return_value = None
        mock_config_service.get_user_config.return_value = None

        response = client.get("/voice/api/v2/config/", headers=jwt_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["notes_ids"] == []
        assert data["print_compact"] is True

    @patch('scribe.routers.language_config.config_service')
    def test_get_config_returns_stored_values(self, mock_config_service, client, jwt_headers):
        mock_config_service.get_workspace_config.return_value = {
            "notes_ids": [{"id": "n1", "name": "Progress Note"}],
            "print_compact": False,
        }
        mock_config_service.get_user_config.return_value = None

        response = client.get("/voice/api/v2/config/", headers=jwt_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["notes_ids"] == [{"id": "n1", "name": "Progress Note"}]
        # False must survive the merge, not fall back to the default True
        assert data["print_compact"] is False

    @patch('scribe.routers.language_config.config_service')
    def test_get_config_user_overrides_workspace(self, mock_config_service, client, jwt_headers):
        mock_config_service.get_workspace_config.return_value = {
            "notes_ids": [{"id": "w1", "name": "Workspace Note"}],
            "print_compact": False,
        }
        mock_config_service.get_user_config.return_value = {
            "notes_ids": [{"id": "u1", "name": "User Note"}],
        }

        response = client.get("/voice/api/v2/config/", headers=jwt_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["notes_ids"] == [{"id": "u1", "name": "User Note"}]
        # user config has no print_compact, workspace value stays
        assert data["print_compact"] is False

    @patch('scribe.routers.language_config.config_service')
    def test_upsert_user_config_with_notes_ids_and_print_compact(
        self, mock_config_service, client, jwt_headers
    ):
        mock_config_service.upsert_config.return_value = {
            "action": "updated", "b_id": "test-business-id", "user_uuid": "test-user-uuid",
        }

        response = client.put(
            "/voice/api/v2/config/",
            headers=jwt_headers,
            json={
                "request_type": "user",
                "data": {
                    "notes_ids": [{"id": "n1", "name": "Progress Note"}],
                    "print_compact": False,
                },
            },
        )

        assert response.status_code == status.HTTP_200_OK
        item = mock_config_service.upsert_config.call_args[0][0]
        assert item["notes_ids"] == [{"id": "n1", "name": "Progress Note"}]
        assert item["print_compact"] is False

    @patch('scribe.routers.language_config.config_service')
    def test_upsert_workspace_config_with_notes_ids_and_print_compact(
        self, mock_config_service, client, jwt_headers
    ):
        mock_config_service.upsert_config.return_value = {
            "action": "updated", "b_id": "test-business-id", "user_uuid": "_",
        }

        response = client.put(
            "/voice/api/v2/config/",
            headers=jwt_headers,
            json={
                "request_type": "workspace",
                "data": {
                    "notes_ids": [{"id": "n2", "name": "Discharge Summary"}],
                    "print_compact": True,
                },
            },
        )

        assert response.status_code == status.HTTP_200_OK
        item = mock_config_service.upsert_config.call_args[0][0]
        assert item["notes_ids"] == [{"id": "n2", "name": "Discharge Summary"}]
        assert item["print_compact"] is True

    @patch('scribe.routers.language_config.config_service')
    def test_upsert_invalid_notes_ids_rejected(self, mock_config_service, client, jwt_headers):
        response = client.put(
            "/voice/api/v2/config/",
            headers=jwt_headers,
            json={
                "request_type": "user",
                "data": {"notes_ids": [{"id": "n1"}]},  # missing name
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        mock_config_service.upsert_config.assert_not_called()

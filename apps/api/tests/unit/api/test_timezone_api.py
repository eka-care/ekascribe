
import pytest
import json
from datetime import datetime
from unittest.mock import patch
from fastapi import status


class TestTimezoneAPI:
    @pytest.fixture
    def jwt_headers(self):
        return {
            "jwt-payload": json.dumps({
                "b-id": "test-business-id",
                "uuid": "test-user-uuid",
                "cc": {"esc": 0}
            })
        }

    @patch('voice2rx.api.endpoints.language_config.config_service')
    def test_get_current_time_valid_timezone_asia_kolkata(self, mock_config_service, client, jwt_headers):
        response = client.get(
            "/voice/api/v2/config/",
            params={"timezone": "Asia/Kolkata"},
            headers=jwt_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        assert "timezone" in data
        assert "current_time_utc" in data
        assert "timestamp" in data
        assert data["timezone"] == "Asia/Kolkata"
        
        utc_time = data["current_time_utc"]
        assert utc_time.endswith("+00:00") or utc_time.endswith("Z")
        
        parsed_time = datetime.fromisoformat(utc_time.replace("Z", "+00:00"))
        assert parsed_time.tzinfo is not None

    @patch('voice2rx.api.endpoints.language_config.config_service')
    def test_get_current_time_valid_timezone_america_new_york(self, mock_config_service, client, jwt_headers):
        response = client.get(
            "/voice/api/v2/config/",
            params={"timezone": "America/New_York"},
            headers=jwt_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        assert data["timezone"] == "America/New_York"
        assert "current_time_utc" in data
        assert "timestamp" in data

    @patch('voice2rx.api.endpoints.language_config.config_service')
    def test_get_current_time_valid_timezone_utc(self, mock_config_service, client, jwt_headers):
        response = client.get(
            "/voice/api/v2/config/",
            params={"timezone": "UTC"},
            headers=jwt_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        assert data["timezone"] == "UTC"
        assert "current_time_utc" in data

    @patch('voice2rx.api.endpoints.language_config.config_service')
    def test_get_current_time_valid_timezone_europe_london(self, mock_config_service, client, jwt_headers):
        response = client.get(
            "/voice/api/v2/config/",
            params={"timezone": "Europe/London"},
            headers=jwt_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        assert data["timezone"] == "Europe/London"

    @patch('voice2rx.api.endpoints.language_config.config_service')
    def test_get_current_time_invalid_timezone(self, mock_config_service, client, jwt_headers):
        response = client.get(
            "/voice/api/v2/config/",
            params={"timezone": "Invalid/Timezone"},
            headers=jwt_headers
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert "detail" in data
        assert "Invalid timezone" in data["detail"]

    def test_get_config_missing_jwt_payload(self, client):
        response = client.get(
            "/voice/api/v2/config/",
            params={"timezone": "Asia/Kolkata"}
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert "detail" in data
        assert "jwt-payload" in data["detail"].lower() or "missing" in data["detail"].lower()

    def test_get_config_missing_bid_in_jwt(self, client):
        headers = {"jwt-payload": json.dumps({"uuid": "test-user"})}
        response = client.get(
            "/voice/api/v2/config/",
            params={"timezone": "Asia/Kolkata"},
            headers=headers
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert "detail" in data
        assert "b-id" in data["detail"]

    @patch('voice2rx.api.endpoints.language_config.config_service')
    def test_timestamp_consistency(self, mock_config_service, client, jwt_headers):
        response = client.get(
            "/voice/api/v2/config/",
            params={"timezone": "Asia/Kolkata"},
            headers=jwt_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        iso_time = datetime.fromisoformat(data["current_time_utc"].replace("Z", "+00:00"))
        iso_timestamp = iso_time.timestamp()
        
        assert abs(iso_timestamp - data["timestamp"]) < 1.0

    @patch('voice2rx.api.endpoints.language_config.config_service')
    def test_response_structure(self, mock_config_service, client, jwt_headers):
        response = client.get(
            "/voice/api/v2/config/",
            params={"timezone": "Asia/Tokyo"},
            headers=jwt_headers
        )
        
        assert response.status_code == status.HTTP_200_OK       
        data = response.json()
        
        expected_keys = {"timezone", "current_time_utc", "timestamp"}
        assert set(data.keys()) == expected_keys
        
        assert "user_details" not in data
        assert "selected_preferences" not in data
        assert "supported_languages" not in data

    @patch('voice2rx.api.endpoints.language_config.config_service')
    def test_multiple_timezone_requests(self, mock_config_service, client, jwt_headers):
        timezones = ["Asia/Kolkata", "America/Los_Angeles", "Europe/Paris", "Australia/Sydney"]
        
        for tz in timezones:
            response = client.get(
                "/voice/api/v2/config/",
                params={"timezone": tz},
                headers=jwt_headers
            )
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["timezone"] == tz
            assert "current_time_utc" in data

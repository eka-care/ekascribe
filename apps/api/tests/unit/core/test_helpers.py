"""Common test utilities and helper functions."""

import json
from typing import Dict, Any
from unittest.mock import MagicMock


def create_mock_response(status_code: int = 200, json_data: Dict[str, Any] = None):
    """Create a mock HTTP response object."""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.json.return_value = json_data or {}
    mock_response.text = json.dumps(json_data or {})
    return mock_response


def create_mock_db_response(status: str = "success", data: Dict[str, Any] = None):
    """Create a mock DB response."""
    return {
        "status": status,
        "data": data or {},
        "error": {} if status == "success" else {"message": "DB error"}
    }


def assert_error_response(response_json: Dict[str, Any], expected_code: str, expected_message: str = None):
    """Assert that response is a proper error response."""
    assert response_json["status"] == "failed"
    assert "error" in response_json
    assert response_json["error"]["code"] == expected_code
    if expected_message:
        assert expected_message in response_json["error"]["message"]
        
def assert_jwt_validation_error(response_json: Dict[str, Any], expected_code:str, expected_message: str = None):
    """Assert that response is a proper JWT validation error response."""
    assert "error" in response_json
    assert response_json["error"]["code"] == expected_code
    if expected_message:
        assert expected_message in response_json["error"]["message"]


def assert_success_response(response_json: Dict[str, Any], expected_keys: list = None):
    """Assert that response is a proper success response."""
    assert response_json["status"] == "success"
    if expected_keys:
        for key in expected_keys:
            assert key in response_json


def create_valid_jwt_header(b_id: str = "test-business-id", user_id: str = "test-user") -> Dict[str, str]:
    """Create valid JWT payload header for testing."""
    jwt_payload = {
        "b-id": b_id,
        "user_id": user_id
    }
    return {
        "jwt-payload": json.dumps(jwt_payload),
        "authorization": "Bearer test-token",
        "content-type": "application/json"
    }


def create_sample_transaction_request():
    """Create a sample transaction init request."""
    return {
        "mode": "consultation",  # Changed from "live" to valid enum value
        "transfer": "vaded",
        "s3_url": "s3://test-bucket/test-folder/",  # Added required s3_url for vaded transfer
        "output_format_template": [
            {
                "template_id": "integration_template_a",
                "language_output": "en-IN",  # Changed from "en_in" to valid enum value
            }
        ],
        "model_type": "pro"
    }

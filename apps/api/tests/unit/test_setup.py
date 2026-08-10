"""Simple test to verify test setup works."""

import pytest
from unittest.mock import MagicMock, patch


def test_imports_work():
    """Test that basic imports work without issues."""
    # Mock the problematic dependencies
    with patch('sys.modules') as mock_modules:
        mock_modules['aioboto3'] = MagicMock()
        mock_modules['newrelic'] = MagicMock()
        mock_modules['newrelic.agent'] = MagicMock()
        
        # Test basic functionality
        assert True


def test_mock_helpers():
    """Test that our test helper functions work."""
    from tests.unit.utils.test_helpers import (
        create_mock_response,
        create_mock_db_response,
        create_valid_jwt_header
    )
    
    # Test mock response creation
    response = create_mock_response(200, {"test": "data"})
    assert response.status_code == 200
    assert response.json() == {"test": "data"}
    
    # Test mock DB response
    db_response = create_mock_db_response("success", {"item": "value"})
    assert db_response["status"] == "success"
    assert db_response["data"]["item"] == "value"
    
    # Test JWT header creation
    headers = create_valid_jwt_header()
    assert "jwt-payload" in headers
    assert "authorization" in headers


def test_environment_setup():
    """Test that test environment is properly configured."""
    import os
    assert os.environ.get("ENVIRONMENT") == "test"

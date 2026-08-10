"""Unit tests for transaction stop API."""

import pytest
from unittest.mock import patch, MagicMock
from fastapi import status
from tests.unit.utils.test_helpers import (
    assert_error_response,
    assert_success_response,
    create_valid_jwt_header,
    create_mock_dynamodb_response
)


class TestStopAPI:
    """Test cases for transaction stop API - Router -> Service -> Repository."""
    
    def test_stop_transaction_success(self, client):
        """Test successful transaction stop with complete service layer flow."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": ["audio1.wav", "audio2.wav"]
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer response
        mock_transaction_data = {
            "txn_id": txn_id,
            "b_id": "test-business-id",
            "s3_url": "s3://test-bucket/test-folder/",
            "user_status": "stopped"
        }
        
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.stop_transaction') as mock_stop:
            # Configure service layer response
            mock_stop.return_value = mock_transaction_data
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/stop/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert
        assert response.status_code == status.HTTP_200_OK
        response_json = response.json()
        assert_success_response(response_json, ["txn_id", "b_id", "message"])
        assert response_json["txn_id"] == txn_id
        assert response_json["b_id"] == "test-business-id"
        assert "stopped successfully" in response_json["message"]
        
        # Verify service layer was called correctly
        mock_stop.assert_called_once()
        call_args = mock_stop.call_args
        assert call_args[0][0] == txn_id  # txn_id parameter
        assert call_args[0][1] == "test-business-id"  # b_id parameter
        assert call_args[0][2] == request_data["audio_files"]  # audio_files parameter

    def test_stop_transaction_missing_business_id(self, client):
        """Test stop fails when business ID is missing from JWT header."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": ["audio1.wav"]
        }
        headers = {"content-type": "application/json"}  # No JWT payload
        
        # Act - Should fail at handler layer (RequestHandler.extract_business_id_from_request)
        response = client.post(
            f"/voice/api/v2/transaction/stop/{txn_id}",
            json=request_data,
            headers=headers
        )
        
        # Assert
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response_json = response.json()
        assert_error_response(response_json, "business_id_required")

    def test_stop_transaction_missing_audio_files(self, client):
        """Test stop fails when audio files are missing at validation layer."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": []  # Empty audio files list
        }
        headers = create_valid_jwt_header()
        
        # Act - Should fail at validation layer (validate_audio_files)
        response = client.post(
            f"/voice/api/v2/transaction/stop/{txn_id}",
            json=request_data,
            headers=headers
        )
        
        # Assert
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response_json = response.json()
        assert "error" in response_json
        assert response_json["error"]["code"] == "validation_error"

    def test_stop_transaction_nonexistent_transaction(self, client):
        """Test stop fails when transaction doesn't exist at service/repository layer."""
        # Arrange
        txn_id = "nonexistent-txn"
        request_data = {
            "audio_files": ["audio1.wav"]
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer to raise TransactionNotFoundException
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.stop_transaction') as mock_stop:
            from voice2rx.core.exceptions import TransactionNotFoundException
            mock_stop.side_effect = TransactionNotFoundException(txn_id, "test-business-id")
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/stop/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert
        assert response.status_code == status.HTTP_404_NOT_FOUND
        response_json = response.json()
        assert_error_response(response_json, "transaction_not_found")

    def test_stop_transaction_update_failure(self, client):
        """Test stop fails when repository update fails."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": ["audio1.wav"]
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer to raise exception (repository failure)
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.stop_transaction') as mock_stop:
            mock_stop.side_effect = Exception("Database update failed")
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/stop/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert - Generic exception returns 500
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        response_json = response.json()
        assert_error_response(response_json, "unexpected_error")


    def test_stop_transaction_with_chunk_info(self, client):
        """Test stop with chunk info provided."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": ["audio1.wav", "audio2.wav"],
            "chunk_info": [
                {"chunk_id": "chunk1", "duration": 5.5},
                {"chunk_id": "chunk2", "duration": 7.2}
            ]
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer response
        mock_transaction_data = {
            "txn_id": txn_id,
            "b_id": "test-business-id",
            "s3_url": "s3://test-bucket/test-folder/",
            "user_status": "stopped",
            "chunk_info": request_data["chunk_info"]
        }
        
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.stop_transaction') as mock_stop:
            # Configure service layer response
            mock_stop.return_value = mock_transaction_data
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/stop/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert
        assert response.status_code == status.HTTP_200_OK
        response_json = response.json()
        assert_success_response(response_json, ["txn_id", "b_id"])
        
        # Verify service layer was called with chunk_info
        mock_stop.assert_called_once()
        call_args = mock_stop.call_args
        assert call_args[0][3] == request_data["chunk_info"]  # chunk_info parameter

    def test_stop_transaction_exception_handling(self, client):
        """Test stop API handles unexpected exceptions gracefully."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": ["audio1.wav"]
        }
        headers = create_valid_jwt_header()
        
        # Mock exception in service layer
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.stop_transaction') as mock_stop:
            mock_stop.side_effect = Exception("Unexpected database error")
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/stop/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        response_json = response.json()
        assert_error_response(response_json, "unexpected_error")

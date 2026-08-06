"""Unit tests for transaction commit API."""

import pytest
from unittest.mock import patch, MagicMock
from fastapi import status
from tests.unit.utils.test_helpers import (
    assert_error_response,
    assert_success_response,
    create_valid_jwt_header,
    create_mock_dynamodb_response
)


class TestCommitAPI:
    """Test cases for transaction commit API - Router -> Service -> Repository."""
    
    def test_commit_transaction_success(self, client):
        """Test successful transaction commit with complete service layer flow."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": ["audio1.wav", "audio2.wav"]
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer responses
        mock_transaction_data = {
            "txn_id": txn_id,
            "b_id": "test-business-id",
            "s3_url": "s3://test-bucket/test-folder/",
            "user_status": "commit",
            "model_type": "pro",
            "transfer": "vaded",
            "client_generated_files": [],
            "output_format_template": []
        }
        
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.commit_transaction') as mock_commit, \
             patch('voice2rx.services.transactions.transaction_service.TransactionService.enqueue_processing') as mock_enqueue, \
             patch('voice2rx.services.config_service.ConfigService.check_audio_full_enabled') as mock_audio_config:
            
            # Configure service layer responses
            mock_commit.return_value = mock_transaction_data
            mock_enqueue.return_value = True
            mock_audio_config.return_value = False
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/commit/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert
        assert response.status_code == status.HTTP_200_OK
        response_json = response.json()
        assert_success_response(response_json, ["txn_id", "b_id", "message"])
        assert response_json["txn_id"] == txn_id
        assert response_json["b_id"] == "test-business-id"
        
        # Verify service layer was called correctly
        mock_commit.assert_called_once()
        mock_enqueue.assert_called_once()

    def test_commit_transaction_missing_business_id(self, client):
        """Test commit fails when business ID is missing from JWT header."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": ["audio1.wav"]
        }
        headers = {"content-type": "application/json"}  # No JWT payload
        
        # Act - Should fail at handler layer (RequestHandler.extract_business_id_from_request)
        response = client.post(
            f"/voice/api/v2/transaction/commit/{txn_id}",
            json=request_data,
            headers=headers
        )
        
        # Assert
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response_json = response.json()
        assert_error_response(response_json, "business_id_required")

    def test_commit_transaction_missing_audio_files(self, client):
        """Test commit fails when audio files are missing at validation layer."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": []  # Empty audio files list
        }
        headers = create_valid_jwt_header()
        
        # Act - Should fail at validation layer (validate_audio_files)
        response = client.post(
            f"/voice/api/v2/transaction/commit/{txn_id}",
            json=request_data,
            headers=headers
        )
        
        # Assert
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response_json = response.json()
        assert "error" in response_json
        assert response_json["error"]["code"] == "validation_error"

    def test_commit_transaction_nonexistent_transaction(self, client):
        """Test commit fails when transaction doesn't exist at service/repository layer."""
        # Arrange
        txn_id = "nonexistent-txn"
        request_data = {
            "audio_files": ["audio1.wav"]
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer to raise TransactionNotFoundException
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.commit_transaction') as mock_commit:
            from voice2rx.core.exceptions import TransactionNotFoundException
            mock_commit.side_effect = TransactionNotFoundException(txn_id, "test-business-id")
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/commit/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert
        assert response.status_code == status.HTTP_404_NOT_FOUND
        response_json = response.json()
        assert_error_response(response_json, "transaction_not_found")

    def test_commit_transaction_enqueue_failure(self, client):
        """Test commit continues even if SQS fails at service layer."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": ["audio1.wav"]
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer responses
        mock_transaction_data = {
            "txn_id": txn_id,
            "b_id": "test-business-id",
            "s3_url": "s3://test-bucket/test-folder/",
            "user_status": "commit",
            "model_type": "pro",
            "transfer": "vaded",
            "client_generated_files": [],
            "output_format_template": []
        }
        
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.commit_transaction') as mock_commit, \
             patch('voice2rx.services.transactions.transaction_service.TransactionService.enqueue_processing') as mock_enqueue, \
             patch('voice2rx.services.config_service.ConfigService.check_audio_full_enabled') as mock_audio_config:
            
            # Configure service responses - SQS fails but commit succeeds
            mock_commit.return_value = mock_transaction_data
            mock_enqueue.return_value = False  # enqueue failed
            mock_audio_config.return_value = False
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/commit/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert - Should still succeed despite SQS failure (logged but not blocking)
        assert response.status_code == status.HTTP_200_OK
        response_json = response.json()
        assert_success_response(response_json, ["txn_id", "b_id"])

    def test_commit_transaction_update_failure(self, client):
        """Test commit fails when repository update fails."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": ["audio1.wav"]
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer to raise exception (repository failure)
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.commit_transaction') as mock_commit:
            mock_commit.side_effect = Exception("Database update failed")
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/commit/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert - Generic exception returns 500
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        response_json = response.json()
        assert_error_response(response_json, "unexpected_error")

    def test_commit_transaction_with_s3_urls_in_audio_files(self, client):
        """Test commit with audio files that already have S3 URLs - service layer handles path building."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": [
                "s3://test-bucket/test-folder/audio1.wav",  # Already has S3 URL
                "audio2.wav"  # Regular filename
            ]
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer responses
        mock_transaction_data = {
            "txn_id": txn_id,
            "b_id": "test-business-id",
            "s3_url": "s3://test-bucket/test-folder/",
            "user_status": "commit",
            "model_type": "pro",
            "transfer": "vaded",
            "client_generated_files": [],
            "output_format_template": []
        }
        
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.commit_transaction') as mock_commit, \
             patch('voice2rx.services.transactions.transaction_service.TransactionService.enqueue_processing') as mock_enqueue, \
             patch('voice2rx.services.config_service.ConfigService.check_audio_full_enabled') as mock_audio_config:
            
            # Configure service responses
            mock_commit.return_value = mock_transaction_data
            mock_enqueue.return_value = True
            mock_audio_config.return_value = False
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/commit/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert
        assert response.status_code == status.HTTP_200_OK
        response_json = response.json()
        assert_success_response(response_json, ["txn_id", "b_id"])
        
        # Verify service layer was called with the audio files (path building is internal to service)
        mock_commit.assert_called_once()
        call_args = mock_commit.call_args
        assert call_args[0][2] == request_data["audio_files"]  # audio_files parameter

    def test_commit_transaction_with_client_generated_files(self, client):
        """Test commit with client generated files - service layer handles this."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": ["audio1.wav"]
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer responses with client generated files
        mock_transaction_data = {
            "txn_id": txn_id,
            "b_id": "test-business-id",
            "s3_url": "s3://test-bucket/test-folder/",
            "user_status": "commit",
            "model_type": "pro",
            "transfer": "vaded",
            "client_generated_files": ["generated1.json", "generated2.json"],
            "output_format_template": []
        }
        
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.commit_transaction') as mock_commit, \
             patch('voice2rx.services.transactions.transaction_service.TransactionService.enqueue_processing') as mock_enqueue, \
             patch('voice2rx.services.config_service.ConfigService.check_audio_full_enabled') as mock_audio_config:
            
            # Configure service responses
            mock_commit.return_value = mock_transaction_data
            mock_enqueue.return_value = True
            mock_audio_config.return_value = False
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/commit/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert
        assert response.status_code == status.HTTP_200_OK
        response_json = response.json()
        assert_success_response(response_json, ["txn_id", "b_id"])
        
        # Verify service layer was called and handled client generated files internally
        mock_commit.assert_called_once()
        mock_enqueue.assert_called_once()
        
        # Verify the transaction data was passed to SQS service
        enqueue_call_args = mock_enqueue.call_args
        assert enqueue_call_args[0][2] == mock_transaction_data  # transaction_data parameter
    
    def test_commit_transaction_with_audio_combine_enabled(self, client):
        """Commit route hands background_tasks to the service, which owns the
        audio-combine scheduling (gating tested at the service layer)."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "audio_files": ["audio1.wav", "audio2.wav"]
        }
        headers = create_valid_jwt_header()

        # Mock service layer responses
        mock_transaction_data = {
            "txn_id": txn_id,
            "b_id": "test-business-id",
            "s3_url": "s3://test-bucket/test-folder/",
            "user_status": "commit",
            "model_type": "pro",
            "transfer": "vaded",  # Must be vaded for audio combine
            "client_generated_files": [],
            "output_format_template": []
        }

        with patch('voice2rx.services.transactions.transaction_service.TransactionService.commit_transaction') as mock_commit, \
             patch('voice2rx.services.transactions.transaction_service.TransactionService.enqueue_processing') as mock_enqueue:

            mock_commit.return_value = mock_transaction_data
            mock_enqueue.return_value = True

            # Act
            response = client.post(
                f"/voice/api/v2/transaction/commit/{txn_id}",
                json=request_data,
                headers=headers
            )

        # Assert
        assert response.status_code == status.HTTP_200_OK
        response_json = response.json()
        assert_success_response(response_json, ["txn_id", "b_id"])

        # Verify the route passes background_tasks so the service can schedule
        # the combine job
        assert mock_commit.call_args.kwargs["background_tasks"] is not None

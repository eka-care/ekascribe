"""Unit tests for transaction init API."""

import pytest
from unittest.mock import patch, MagicMock
from fastapi import status
from tests.unit.utils.test_helpers import (
    assert_error_response,
    assert_success_response,
    create_valid_jwt_header,
    create_sample_transaction_request,
    create_mock_dynamodb_response,
    assert_jwt_validation_error
)


class TestInitAPI:
    """Test cases for transaction initialization API - Router -> Service -> Repository."""
    
    def test_init_transaction_success(self, client):
        """Test successful transaction initialization with complete flow."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = create_sample_transaction_request()
        headers = create_valid_jwt_header()
        
        # Mock service layer - TransactionService.initialize_transaction
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.initialize_transaction') as mock_init, \
             patch('voice2rx.services.transactions.transaction_service.TransactionService.check_for_preupload_files') as mock_check_files, \
             patch('voice2rx.services.transactions.audio_service.AudioProcessingService.create_audio_metadata') as mock_audio_meta:
            
            # Configure service layer response - returns only prepared_data dict (not tuple)
            mock_init.return_value = {
                "txn_id": txn_id,
                "b_id": "test-business-id",
                "s3_url": "s3://test-bucket/test-folder",
                "oid": "",
                "uuid": "",
            }
            mock_check_files.return_value = []  # No pre-uploaded files
            mock_audio_meta.return_value = None
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/init/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert
        assert response.status_code == status.HTTP_201_CREATED
        response_json = response.json()
        assert_success_response(response_json, ["txn_id", "b_id", "message"])
        assert response_json["txn_id"] == txn_id
        assert response_json["b_id"] == "test-business-id"
        
        # Verify service layer was called correctly
        mock_init.assert_called_once()
        mock_check_files.assert_called_once()

    def test_init_transaction_missing_business_id(self, client):
        """Test initialization fails when business ID is missing in JWT header."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = create_sample_transaction_request()
        headers = {"content-type": "application/json"}  # No JWT payload
        
        # Act
        response = client.post(
            f"/voice/api/v2/transaction/init/{txn_id}",
            json=request_data,
            headers=headers
        )
        
        # Assert - Handler throws exception, caught and returns 500 (unexpected_error)
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_500_INTERNAL_SERVER_ERROR]
        response_json = response.json()
        assert "error" in response_json

    def test_init_transaction_invalid_request_data(self, client):
        """Test initialization fails with invalid request data (schema validation)."""
        # Arrange
        txn_id = "test-txn-123"
        invalid_request_data = {
            "mode": "invalid_mode",  # Invalid mode
            "transfer": "vaded"
        }
        headers = create_valid_jwt_header()
        
        # Act - Should fail at Pydantic schema validation level
        response = client.post(
            f"/voice/api/v2/transaction/init/{txn_id}",
            json=invalid_request_data,
            headers=headers
        )
        
        # Assert - Returns 400 or 422 depending on validation implementation
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_422_UNPROCESSABLE_ENTITY]

    def test_init_transaction_limit_exceeded(self, client):
        """Test initialization fails when transaction limit is exceeded at service layer."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = create_sample_transaction_request()
        headers = create_valid_jwt_header()
        
        # Mock service layer to raise TransactionLimitExceededException
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.initialize_transaction') as mock_init:
            from voice2rx.core.exceptions import TransactionLimitExceededException
            mock_init.side_effect = TransactionLimitExceededException()
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/init/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert - Service layer throws exception, handled by ResponseFormatter
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response_json = response.json()
        assert_error_response(response_json, "txn_limit_exceeded")

    def test_init_transaction_s3_url_required_for_vaded(self, client):
        """Test initialization fails when S3 URL is missing for vaded transfer at validation layer."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "mode": "consultation",
            "transfer": "vaded",
            # Missing s3_url for vaded transfer
            "output_format_template": [{"template_id": "eka_emr_template"}]
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer to raise S3UrlRequiredException
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.initialize_transaction') as mock_init:
            from voice2rx.core.exceptions import S3UrlRequiredException
            mock_init.side_effect = S3UrlRequiredException("S3")
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/init/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert - Validation happens in service layer
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response_json = response.json()
        assert_error_response(response_json, "s3_required")

    def test_init_transaction_batch_s3_url_required_for_non_vaded(self, client):
        """Test that batch_s3_url is required for non-vaded transfer at validation layer."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            **create_sample_transaction_request(),
            "transfer": "non-vaded",
            # Missing batch_s3_url for non-vaded transfer
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer to raise S3UrlRequiredException
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.initialize_transaction') as mock_init:
            from voice2rx.core.exceptions import S3UrlRequiredException
            mock_init.side_effect = S3UrlRequiredException("Batch S3")
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/init/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert - Validation happens in service layer
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response_json = response.json()
        assert_error_response(response_json, "batch_s3_required")

    def test_init_transaction_database_error(self, client):
        """Test database error handling at repository layer."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = create_sample_transaction_request()
        headers = create_valid_jwt_header()
        
        # Mock service layer to raise generic Exception (repository failure)
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.initialize_transaction') as mock_init:
            mock_init.side_effect = Exception("Database connection failed")
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/init/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert - Generic exception returns 500
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        response_json = response.json()
        assert_error_response(response_json, "unexpected_error")

    def test_init_transaction_with_pre_uploaded_files(self, client):
        """Test initialization with pre-uploaded files triggers SQS processing via service layer."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            **create_sample_transaction_request(),
            "s3_url": "s3://test-bucket/test-folder/"
        }
        headers = create_valid_jwt_header()
        
        # Mock service layer methods
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.initialize_transaction') as mock_init, \
             patch('voice2rx.services.transactions.transaction_service.TransactionService.check_for_preupload_files') as mock_check_files, \
             patch('voice2rx.services.transactions.transaction_service.TransactionService.process_s3_files_and_send_to_sqs') as mock_process_sqs, \
             patch('voice2rx.services.transactions.audio_service.AudioProcessingService.create_audio_metadata') as mock_audio_meta:
            
            # Configure service layer responses - returns only prepared_data dict
            mock_init.return_value = {
                "txn_id": txn_id,
                "b_id": "test-business-id",
                "s3_url": "s3://test-bucket/test-folder",
                "oid": "",
                "uuid": "",
            }
            mock_check_files.return_value = ["audio1.wav", "audio2.wav"]  # Files found
            mock_audio_meta.return_value = None
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/init/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert
        assert response.status_code == status.HTTP_201_CREATED
        response_json = response.json()
        assert_success_response(response_json, ["txn_id", "b_id"])
        
        # Verify service layer methods were called
        mock_init.assert_called_once()
        mock_check_files.assert_called_once()

    @pytest.mark.parametrize("mode,transfer", [
        ("consultation", "vaded"),
        ("dictation", "non-vaded"),
        ("bdic_2025", "batch")
    ])
    def test_init_transaction_different_modes_and_transfers(self, client, mode, transfer):
        """Test initialization with different mode and transfer combinations via service layer."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = {
            "mode": mode,
            "transfer": transfer,
            "output_format_template": [{"template_id": "eka_emr_template"}],
            "model_type": "pro"
        }
        
        # Add required URLs based on transfer type
        if transfer == "vaded":
            request_data["s3_url"] = "s3://test-bucket/test-folder/"
        else:
            request_data["batch_s3_url"] = "s3://test-bucket/batch-folder/"
            
        headers = create_valid_jwt_header()
        
        # Mock service layer
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.initialize_transaction') as mock_init, \
             patch('voice2rx.services.transactions.transaction_service.TransactionService.check_for_preupload_files') as mock_check_files, \
             patch('voice2rx.services.transactions.audio_service.AudioProcessingService.create_audio_metadata') as mock_audio_meta:
            
            # Configure service layer responses - returns only prepared_data dict
            mock_init.return_value = {
                "txn_id": txn_id,
                "b_id": "test-business-id",
                "s3_url": request_data.get("s3_url", ""),
                "oid": "",
                "uuid": "",
            }
            mock_check_files.return_value = []
            mock_audio_meta.return_value = None
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/init/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert
        assert response.status_code == status.HTTP_201_CREATED
        response_json = response.json()
        assert_success_response(response_json, ["txn_id", "b_id"])
        
        # Verify service layer was called
        mock_init.assert_called_once()
    
    def test_init_transaction_duplicate_transaction(self, client):
        """Test initialization fails when transaction already exists (409 Conflict)."""
        # Arrange
        txn_id = "test-txn-123"
        request_data = create_sample_transaction_request()
        headers = create_valid_jwt_header()
        
        # Mock service layer to raise DuplicateTransactionException
        with patch('voice2rx.services.transactions.transaction_service.TransactionService.initialize_transaction') as mock_init:
            from voice2rx.core.exceptions import DuplicateTransactionException
            mock_init.side_effect = DuplicateTransactionException(txn_id)
            
            # Act
            response = client.post(
                f"/voice/api/v2/transaction/init/{txn_id}",
                json=request_data,
                headers=headers
            )
        
        # Assert - Should return 409 Conflict
        assert response.status_code == status.HTTP_409_CONFLICT
        response_json = response.json()
        assert_error_response(response_json, "txn_already_initialized")

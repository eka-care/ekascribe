"""Unit tests for process_fhir_data service."""

import base64
import json
import pytest
from unittest.mock import MagicMock, patch


class TestFHIRResponse:
    """Test cases for FHIRResponse class."""

    def test_fhir_response_init(self):
        """Test FHIRResponse initialization."""
        from voice2rx.services.messaging.process_fhir_data import FHIRResponse

        response = FHIRResponse(200, '{"status": "success"}')
        assert response.status_code == 200
        assert response.text == '{"status": "success"}'

    def test_fhir_response_json(self):
        """Test FHIRResponse json method."""
        from voice2rx.services.messaging.process_fhir_data import FHIRResponse

        response = FHIRResponse(200, '{"status": "success", "data": {"id": "123"}}')
        parsed = response.json()
        assert parsed["status"] == "success"
        assert parsed["data"]["id"] == "123"


class TestDownloadS3JsonSimple:
    """Test cases for download_s3_json_simple function."""

    @patch("voice2rx.services.messaging.process_fhir_data.boto3")
    def test_download_s3_json_success(self, mock_boto3):
        """Test successful S3 download."""
        from voice2rx.services.messaging.process_fhir_data import download_s3_json_simple

        mock_s3_client = MagicMock()
        mock_boto3.client.return_value = mock_s3_client

        mock_body = MagicMock()
        mock_body.read.return_value = b'{"structured_outputs": {"eka_emr_template": "test_data"}}'
        mock_s3_client.get_object.return_value = {"Body": mock_body}

        result = download_s3_json_simple("s3://test-bucket/path/to/folder")

        assert result["structured_outputs"]["eka_emr_template"] == "test_data"
        mock_s3_client.get_object.assert_called_once_with(
            Bucket="test-bucket", Key="path/to/folder/output.json"
        )

    @patch("voice2rx.services.messaging.process_fhir_data.boto3")
    def test_download_s3_json_with_trailing_slash(self, mock_boto3):
        """Test S3 download with trailing slash in URL."""
        from voice2rx.services.messaging.process_fhir_data import download_s3_json_simple

        mock_s3_client = MagicMock()
        mock_boto3.client.return_value = mock_s3_client

        mock_body = MagicMock()
        mock_body.read.return_value = b'{"data": "test"}'
        mock_s3_client.get_object.return_value = {"Body": mock_body}

        result = download_s3_json_simple("s3://test-bucket/path/to/folder/")

        assert result["data"] == "test"
        mock_s3_client.get_object.assert_called_once_with(
            Bucket="test-bucket", Key="path/to/folder/output.json"
        )

    def test_download_s3_json_invalid_url(self):
        """Test S3 download with invalid URL."""
        from voice2rx.services.messaging.process_fhir_data import download_s3_json_simple

        with pytest.raises(ValueError, match="Invalid S3 URL format"):
            download_s3_json_simple("https://test-bucket/path")

    @patch("voice2rx.services.messaging.process_fhir_data.boto3")
    def test_download_s3_json_file_not_found(self, mock_boto3):
        """Test S3 download when file not found."""
        from botocore.exceptions import ClientError
        from voice2rx.services.messaging.process_fhir_data import download_s3_json_simple

        mock_s3_client = MagicMock()
        mock_boto3.client.return_value = mock_s3_client

        error_response = {"Error": {"Code": "NoSuchKey", "Message": "Not found"}}
        mock_s3_client.get_object.side_effect = ClientError(error_response, "GetObject")

        with pytest.raises(FileNotFoundError, match="File not found"):
            download_s3_json_simple("s3://test-bucket/path/to/folder")

    @patch("voice2rx.services.messaging.process_fhir_data.boto3")
    def test_download_s3_json_bucket_not_found(self, mock_boto3):
        """Test S3 download when bucket not found."""
        from botocore.exceptions import ClientError
        from voice2rx.services.messaging.process_fhir_data import download_s3_json_simple

        mock_s3_client = MagicMock()
        mock_boto3.client.return_value = mock_s3_client

        error_response = {"Error": {"Code": "NoSuchBucket", "Message": "Not found"}}
        mock_s3_client.get_object.side_effect = ClientError(error_response, "GetObject")

        with pytest.raises(FileNotFoundError, match="Bucket not found"):
            download_s3_json_simple("s3://nonexistent-bucket/path")

    @patch("voice2rx.services.messaging.process_fhir_data.boto3")
    def test_download_s3_json_invalid_json(self, mock_boto3):
        """Test S3 download with invalid JSON content."""
        from voice2rx.services.messaging.process_fhir_data import download_s3_json_simple

        mock_s3_client = MagicMock()
        mock_boto3.client.return_value = mock_s3_client

        mock_body = MagicMock()
        mock_body.read.return_value = b"not valid json"
        mock_s3_client.get_object.return_value = {"Body": mock_body}

        with pytest.raises(ValueError, match="Invalid JSON format"):
            download_s3_json_simple("s3://test-bucket/path")


class TestSendToFhirProcessor:
    """Test cases for send_to_fhir_processor function."""

    @patch("voice2rx.services.messaging.process_fhir_data._get_fhir_processor_url")
    def test_send_to_fhir_processor_no_url_configured(self, mock_get_url):
        """Test when FHIR processor URL is not configured."""
        from voice2rx.services.messaging.process_fhir_data import send_to_fhir_processor

        mock_get_url.return_value = None

        response = send_to_fhir_processor({"test": "data"})

        assert response.status_code == 500
        assert "not configured" in response.text

    @patch("urllib.request.urlopen")
    @patch("voice2rx.services.messaging.process_fhir_data._get_fhir_processor_url")
    def test_send_to_fhir_processor_success(self, mock_get_url, mock_urlopen):
        """Test successful FHIR processor API call."""
        from voice2rx.services.messaging.process_fhir_data import send_to_fhir_processor

        mock_get_url.return_value = "http://fhir-processor.example.com/api"

        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = b'{"status": "success"}'
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        response = send_to_fhir_processor({"visitid": "test-123"})

        assert response.status_code == 200
        assert response.text == '{"status": "success"}'

    @patch("urllib.request.urlopen")
    @patch("voice2rx.services.messaging.process_fhir_data._get_fhir_processor_url")
    def test_send_to_fhir_processor_http_error(self, mock_get_url, mock_urlopen):
        """Test FHIR processor API HTTP error."""
        import urllib.error
        from voice2rx.services.messaging.process_fhir_data import send_to_fhir_processor

        mock_get_url.return_value = "http://fhir-processor.example.com/api"

        http_error = urllib.error.HTTPError(
            url="http://test.com",
            code=400,
            msg="Bad Request",
            hdrs={},
            fp=MagicMock(read=MagicMock(return_value=b'{"error": "bad request"}')),
        )
        http_error.read = MagicMock(return_value=b'{"error": "bad request"}')
        mock_urlopen.side_effect = http_error

        response = send_to_fhir_processor({"visitid": "test-123"})

        assert response.status_code == 400

    @patch("urllib.request.urlopen")
    @patch("voice2rx.services.messaging.process_fhir_data._get_fhir_processor_url")
    def test_send_to_fhir_processor_timeout(self, mock_get_url, mock_urlopen):
        """Test FHIR processor API timeout."""
        from voice2rx.services.messaging.process_fhir_data import send_to_fhir_processor

        mock_get_url.return_value = "http://fhir-processor.example.com/api"
        mock_urlopen.side_effect = TimeoutError("Request timed out")

        response = send_to_fhir_processor({"visitid": "test-123"})

        assert response.status_code == 408
        assert "timeout" in response.text.lower()

    @patch("urllib.request.urlopen")
    @patch("voice2rx.services.messaging.process_fhir_data._get_fhir_processor_url")
    def test_send_to_fhir_processor_url_error(self, mock_get_url, mock_urlopen):
        """Test FHIR processor API URL/network error."""
        import urllib.error
        from voice2rx.services.messaging.process_fhir_data import send_to_fhir_processor

        mock_get_url.return_value = "http://fhir-processor.example.com/api"
        mock_urlopen.side_effect = urllib.error.URLError("Network error")

        response = send_to_fhir_processor({"visitid": "test-123"})

        assert response.status_code == 500
        assert "network error" in response.text.lower()


class TestUpdateFhirIngestedStatus:
    """Test cases for update_fhir_ingested_status function."""

    @patch("voice2rx.services.messaging.process_fhir_data.boto3")
    def test_update_fhir_ingested_status_success(self, mock_boto3):
        """Test successful DynamoDB update."""
        from voice2rx.services.messaging.process_fhir_data import update_fhir_ingested_status

        mock_table = MagicMock()
        mock_dynamodb = MagicMock()
        mock_dynamodb.Table.return_value = mock_table
        mock_boto3.resource.return_value = mock_dynamodb

        mock_table.update_item.return_value = {
            "Attributes": {"fhir_ingested": True, "updated_at": "2024-01-01T00:00:00Z"}
        }

        result = update_fhir_ingested_status("test-txn-123", "test-b-id", status=True)

        assert result["status"] == "success"
        assert result["txn_id"] == "test-txn-123"
        assert result["b_id"] == "test-b-id"
        mock_table.update_item.assert_called_once()

    @patch("voice2rx.services.messaging.process_fhir_data.boto3")
    def test_update_fhir_ingested_status_error(self, mock_boto3):
        """Test DynamoDB update error."""
        from voice2rx.services.messaging.process_fhir_data import update_fhir_ingested_status

        mock_table = MagicMock()
        mock_dynamodb = MagicMock()
        mock_dynamodb.Table.return_value = mock_table
        mock_boto3.resource.return_value = mock_dynamodb

        mock_table.update_item.side_effect = Exception("DynamoDB error")

        result = update_fhir_ingested_status("test-txn-123", "test-b-id")

        assert result["status"] == "error"
        assert "DynamoDB error" in result["error"]


class TestProcessFhirData:
    """Test cases for process_fhir_data function."""

    def test_process_fhir_data_no_emr_template(self):
        """Test processing when no EMR template is present."""
        from voice2rx.services.messaging.process_fhir_data import process_fhir_data

        transaction_data = {
            "txn_id": "test-123",
            "b_id": "test-b-id",
            "oid": "test-oid",
            "s3_url": "s3://test-bucket/path",
            "output_format_template": [
                {"template_id": "clinical_note_template", "language_output": "en-IN"}
            ],
        }

        result = process_fhir_data(transaction_data, "test-123", "test-b-id", "test-c-id")

        assert result["txn_id"] == "test-123"
        assert result["fhir_status"]["status"] == "skipped"
        assert "not eka_emr_template" in result["fhir_status"]["message"]

    def test_process_fhir_data_no_s3_url(self):
        """Test processing when s3_url is missing."""
        from voice2rx.services.messaging.process_fhir_data import process_fhir_data

        transaction_data = {
            "txn_id": "test-123",
            "b_id": "test-b-id",
            "oid": "test-oid",
            "s3_url": "",
            "output_format_template": [
                {"template_id": "eka_emr_template", "language_output": "en-IN"}
            ],
        }

        result = process_fhir_data(transaction_data, "test-123", "test-b-id", "test-c-id")

        assert result["fhir_status"]["status"] == "skipped"
        assert result["fhir_status"]["data"]["s3_url"] == ""

    def test_process_fhir_data_with_request_templates_format(self):
        """Test processing with new request_templates format."""
        from voice2rx.services.messaging.process_fhir_data import process_fhir_data

        transaction_data = {
            "txn_id": "test-123",
            "b_id": "test-b-id",
            "oid": "test-oid",
            "s3_url": "",
            "request_templates": {
                "visual": [{"template_id": "clinical_note_template"}],
                "integration": [{"template_id": "eka_emr_template"}],
            },
        }

        result = process_fhir_data(transaction_data, "test-123", "test-b-id", "test-c-id")

        # Still skipped because s3_url is empty
        assert result["fhir_status"]["status"] == "skipped"
        assert result["fhir_status"]["data"]["emr-template-found"] is True

    @patch("voice2rx.services.messaging.process_fhir_data.download_s3_json_simple")
    def test_process_fhir_data_s3_download_error(self, mock_download):
        """Test processing when S3 download fails."""
        from voice2rx.services.messaging.process_fhir_data import process_fhir_data

        mock_download.side_effect = Exception("S3 download failed")

        transaction_data = {
            "txn_id": "test-123",
            "b_id": "test-b-id",
            "oid": "test-oid",
            "s3_url": "s3://test-bucket/path",
            "output_format_template": [
                {"template_id": "eka_emr_template", "language_output": "en-IN"}
            ],
        }

        result = process_fhir_data(transaction_data, "test-123", "test-b-id", "test-c-id")

        assert result["s3_status"]["status"] == "error"
        assert "S3 download failed" in result["s3_status"]["error"]

    @patch("voice2rx.services.messaging.process_fhir_data.download_s3_json_simple")
    def test_process_fhir_data_no_eka_emr_data_in_output(self, mock_download):
        """Test processing when eka_emr_template data is missing in output.json."""
        from voice2rx.services.messaging.process_fhir_data import process_fhir_data

        mock_download.return_value = {
            "structured_outputs": {"clinical_note_template": "some_data"}
        }

        transaction_data = {
            "txn_id": "test-123",
            "b_id": "test-b-id",
            "oid": "test-oid",
            "s3_url": "s3://test-bucket/path",
            "output_format_template": [
                {"template_id": "eka_emr_template", "language_output": "en-IN"}
            ],
        }

        result = process_fhir_data(transaction_data, "test-123", "test-b-id", "test-c-id")

        assert result["s3_status"]["status"] == "success"
        assert result["fhir_status"]["status"] == "error"
        assert "not found in output.json" in result["fhir_status"]["message"]

    @patch("voice2rx.services.messaging.process_fhir_data.download_s3_json_simple")
    def test_process_fhir_data_empty_prescription(self, mock_download):
        """Test processing when prescription data is empty."""
        from voice2rx.services.messaging.process_fhir_data import process_fhir_data

        # Create base64 encoded data with empty prescription
        emr_data = {"prescription": {}}
        encoded_data = base64.b64encode(json.dumps(emr_data).encode()).decode()

        mock_download.return_value = {"structured_outputs": {"eka_emr_template": encoded_data}}

        transaction_data = {
            "txn_id": "test-123",
            "b_id": "test-b-id",
            "oid": "test-oid",
            "s3_url": "s3://test-bucket/path",
            "output_format_template": [
                {"template_id": "eka_emr_template", "language_output": "en-IN"}
            ],
        }

        result = process_fhir_data(transaction_data, "test-123", "test-b-id", "test-c-id")

        assert result["s3_status"]["status"] == "success"
        # fhir_status should be None since we returned early
        assert result["fhir_status"] is None

    @patch("voice2rx.services.messaging.process_fhir_data.update_fhir_ingested_status")
    @patch("voice2rx.services.messaging.process_fhir_data.send_to_fhir_processor")
    @patch("voice2rx.services.messaging.process_fhir_data.download_s3_json_simple")
    def test_process_fhir_data_success(self, mock_download, mock_send_fhir, mock_update_status):
        """Test successful FHIR data processing."""
        from voice2rx.services.messaging.process_fhir_data import FHIRResponse, process_fhir_data

        # Create base64 encoded data with prescription
        emr_data = {
            "prescription": {
                "medications": [{"name": "Test Med", "dosage": "10mg"}],
                "diagnosis": "Test diagnosis",
            }
        }
        encoded_data = base64.b64encode(json.dumps(emr_data).encode()).decode()

        mock_download.return_value = {"structured_outputs": {"eka_emr_template": encoded_data}}
        mock_send_fhir.return_value = FHIRResponse(200, '{"status": "success"}')
        mock_update_status.return_value = {"status": "success"}

        transaction_data = {
            "txn_id": "test-123",
            "b_id": "test-b-id",
            "oid": "test-oid",
            "s3_url": "s3://test-bucket/path",
            "output_format_template": [
                {"template_id": "eka_emr_template", "language_output": "en-IN"}
            ],
        }

        result = process_fhir_data(transaction_data, "test-123", "test-b-id", "test-c-id")

        assert result["s3_status"]["status"] == "success"
        assert result["fhir_status"]["status"] == "success"
        assert result["fhir_status"]["status_code"] == 200

        # Verify FHIR processor was called with correct payload
        mock_send_fhir.assert_called_once()
        call_args = mock_send_fhir.call_args[1]["payload"]
        assert call_args["visitid"] == "test-123"
        assert call_args["doctor_oid"] == "test-oid"
        assert call_args["tool"]["medications"][0]["name"] == "Test Med"

        # Verify DynamoDB was updated
        mock_update_status.assert_called_once_with("test-123", "test-b-id", status=True)

    @patch("voice2rx.services.messaging.process_fhir_data.update_fhir_ingested_status")
    @patch("voice2rx.services.messaging.process_fhir_data.send_to_fhir_processor")
    @patch("voice2rx.services.messaging.process_fhir_data.download_s3_json_simple")
    def test_process_fhir_data_fhir_api_error(
        self, mock_download, mock_send_fhir, mock_update_status
    ):
        """Test FHIR data processing when FHIR API fails."""
        from voice2rx.services.messaging.process_fhir_data import FHIRResponse, process_fhir_data

        emr_data = {"prescription": {"medications": [{"name": "Test Med"}]}}
        encoded_data = base64.b64encode(json.dumps(emr_data).encode()).decode()

        mock_download.return_value = {"structured_outputs": {"eka_emr_template": encoded_data}}
        mock_send_fhir.return_value = FHIRResponse(500, '{"error": "Internal error"}')

        transaction_data = {
            "txn_id": "test-123",
            "b_id": "test-b-id",
            "oid": "test-oid",
            "s3_url": "s3://test-bucket/path",
            "output_format_template": [
                {"template_id": "eka_emr_template", "language_output": "en-IN"}
            ],
        }

        result = process_fhir_data(transaction_data, "test-123", "test-b-id", "test-c-id")

        assert result["fhir_status"]["status"] == "error"
        assert result["fhir_status"]["status_code"] == 500

        # DynamoDB should NOT be updated on error
        mock_update_status.assert_not_called()

    @patch("voice2rx.services.messaging.process_fhir_data.update_fhir_ingested_status")
    @patch("voice2rx.services.messaging.process_fhir_data.send_to_fhir_processor")
    @patch("voice2rx.services.messaging.process_fhir_data.download_s3_json_simple")
    def test_process_fhir_data_dynamo_update_error(
        self, mock_download, mock_send_fhir, mock_update_status
    ):
        """Test FHIR processing continues even if DynamoDB update fails."""
        from voice2rx.services.messaging.process_fhir_data import FHIRResponse, process_fhir_data

        emr_data = {"prescription": {"medications": [{"name": "Test Med"}]}}
        encoded_data = base64.b64encode(json.dumps(emr_data).encode()).decode()

        mock_download.return_value = {"structured_outputs": {"eka_emr_template": encoded_data}}
        mock_send_fhir.return_value = FHIRResponse(200, '{"status": "success"}')
        mock_update_status.return_value = {"status": "error", "error": "DynamoDB error"}

        transaction_data = {
            "txn_id": "test-123",
            "b_id": "test-b-id",
            "oid": "test-oid",
            "s3_url": "s3://test-bucket/path",
            "output_format_template": [
                {"template_id": "eka_emr_template", "language_output": "en-IN"}
            ],
        }

        result = process_fhir_data(transaction_data, "test-123", "test-b-id", "test-c-id")

        # FHIR status should still be success even if DynamoDB update failed
        assert result["fhir_status"]["status"] == "success"

    def test_process_fhir_data_client_data_populated(self):
        """Test that client_data is properly populated in result."""
        from voice2rx.services.messaging.process_fhir_data import process_fhir_data

        transaction_data = {
            "txn_id": "test-123",
            "b_id": "test-b-id",
            "oid": "doctor-oid-456",
            "s3_url": "",
            "output_format_template": [],
        }

        result = process_fhir_data(
            transaction_data, "test-123", "test-b-id", "client-id-789"
        )

        assert result["client_data"]["txn_id"] == "test-123"
        assert result["client_data"]["b_id"] == "test-b-id"
        assert result["client_data"]["c_id"] == "client-id-789"
        assert result["client_data"]["o_id"] == "doctor-oid-456"

    @patch("voice2rx.services.messaging.process_fhir_data.TemplateFormatConverter")
    def test_process_fhir_data_exception_handling(self, mock_converter):
        """Test exception handling in process_fhir_data."""
        from voice2rx.services.messaging.process_fhir_data import process_fhir_data

        mock_converter.convert_to_old_format.side_effect = Exception("Conversion error")

        transaction_data = {
            "txn_id": "test-123",
            "b_id": "test-b-id",
            "oid": "test-oid",
            "s3_url": "s3://test-bucket/path",
        }

        result = process_fhir_data(transaction_data, "test-123", "test-b-id", "test-c-id")

        # Result should be returned even on exception
        assert result["txn_id"] == "test-123"


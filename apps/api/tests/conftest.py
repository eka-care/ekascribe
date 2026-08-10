import pytest
import os
import sys
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import Request

# Set test environment
os.environ["ENVIRONMENT"] = "test"

# Mock heavy optional imports at module level
mock_pydub = MagicMock()
mock_pydub.AudioSegment = MagicMock()
# pydub.silence is used by VADChunkingService
mock_pydub.silence = MagicMock()
mock_pydub.silence.detect_nonsilent = MagicMock(return_value=[])

sys.modules['pydub'] = mock_pydub
sys.modules['pydub.silence'] = mock_pydub.silence


@pytest.fixture(scope="session", autouse=True)
def mock_aws_globally():
    """Mock AWS services globally for all tests."""
    # Mock logging config to prevent file handler issues
    with patch('logging.config.dictConfig') as mock_logging, \
         patch('boto3.client') as mock_client:

        # Configure logging mock
        mock_logging.return_value = None

        # Configure S3 client mock
        mock_s3_client = MagicMock()
        mock_client.return_value = mock_s3_client
        mock_s3_client.list_objects_v2.return_value = {'Contents': []}
        
        yield


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Setup test environment with mocked AWS services."""
    # Set required environment variables
    test_env = {
        "TABLE_NAME": "test-voice2rx-transactions",
        "S3_VADED_BUCKET_NAME": "test-bucket",
        "AWS_ACCESS_KEY_ID": "test-key",
        "AWS_SECRET_ACCESS_KEY": "test-secret",
        "AWS_DEFAULT_REGION": "us-east-1",
        "LOG_LEVEL": "ERROR"  # Reduce logging noise in tests
    }
    
    for key, value in test_env.items():
        os.environ[key] = value
    
    # Create logs directory if it doesn't exist (for file handlers)
    import pathlib
    logs_dir = pathlib.Path("/tmp/test_logs")
    logs_dir.mkdir(parents=True, exist_ok=True)
    
    yield
    
    # Cleanup
    for key in test_env.keys():
        if key in os.environ:
            del os.environ[key]


@pytest.fixture
def client():
    """FastAPI test client fixture."""
    from scribe.main import app
    return TestClient(app)


@pytest.fixture
def mock_request():
    """Mock FastAPI Request object."""
    request = MagicMock(spec=Request)
    request.headers = {
        "jwt-payload": '{"b-id": "test-business-id", "user_id": "test-user"}',
        "authorization": "Bearer test-token",
        "content-type": "application/json"
    }
    request.query_params = {}
    return request


@pytest.fixture
def mock_jwt_payload():
    """Standard JWT payload for testing."""
    return {
        "b-id": "test-business-id",
        "user_id": "test-user",
        "permissions": ["read", "write"]
    }


@pytest.fixture
def sample_transaction_data():
    """Sample transaction data for testing."""
    return {
        "txn_id": "test-txn-123",
        "b_id": "test-business-id",
        "status": "success",
        "mode": "live",
        "transfer": "vaded",
        "s3_url": "s3://test-bucket/test-folder/",
        "processing_status": "in_progress",
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z"
    }


@pytest.fixture
def sample_s3_file_data():
    """Sample S3 file data for testing."""
    return {
        "structured_outputs": {
            "eka_emr_template": "base64encodeddata",
            "transcript_template": "base64encodeddata"
        },
        "meta_information": {
            "eka_emr_template": {
                "name": "EMR Template",
                "type": "json"
            }
        }
    }


@pytest.fixture
def mock_logger():
    """Mock logger."""
    with patch('scribe.core.custom_logger.get_logger') as mock:
        yield mock.return_value
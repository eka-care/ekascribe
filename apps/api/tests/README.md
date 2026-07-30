# Unit Testing Documentation

## Overview
This project uses a structured unit testing approach with pytest to test the voice2rx APIs. The test suite covers the main API endpoints with request validation, response format validation, and business logic testing.

## Test Structure

```
tests/
├── conftest.py              # Global test configuration and fixtures
├── pytest.ini              # Pytest configuration
├── utils/
│   └── test_helpers.py      # Common test utilities and helper functions
└── unit/
    └── api/
        ├── test_init_api.py         # Init API tests
        ├── test_commit_api.py       # Commit API tests
        ├── test_stop_api.py         # Stop API tests
        ├── test_result_v3_api.py    # Result v3 API tests
```

## APIs Covered

### 1. Init API (`/voice/api/v2/transaction/init/{txn_id}`)
- **Purpose**: Initialize a new transaction
- **Test Cases**:
  - Successful transaction initialization
  - Missing business ID validation
  - Invalid request data validation
  - Transaction limit exceeded for unpaid users
  - S3 URL validation for different transfer types
  - Database insertion failures
  - Pre-uploaded files processing

### 2. Commit API (`/voice/api/v2/transaction/commit/{txn_id}`)
- **Purpose**: Commit a transaction with audio files
- **Test Cases**:
  - Successful transaction commit
  - Missing business ID and audio files validation
  - Nonexistent transaction handling
  - Chunk info processing
  - SQS service failures
  - Database update failures
  - S3 URL handling for audio files

### 3. Stop API (`/voice/api/v2/transaction/stop/{txn_id}`)
- **Purpose**: Stop a transaction and update status
- **Test Cases**:
  - Successful transaction stop
  - Request validation (business ID, audio files)
  - Database update scenarios
  - S3 URL path handling
  - Exception handling

### 4. Result V3 API (`/voice/api/v3/status/{session_id}`)
- **Purpose**: Get transaction status and results
- **Test Cases**:
  - Successful results with all templates
  - In-progress transaction status
  - Partial success scenarios
  - All templates failed scenarios
  - Multiple templates with different statuses
  - Special business ID with FHIR data
  - No output file scenarios

## Running Tests

### Basic Test Run
```bash
# Run all unit tests
pytest tests/unit/ -v

# Run specific test file
pytest tests/unit/api/test_init_api.py -v

# Run specific test method
pytest tests/unit/api/test_init_api.py::TestInitAPI::test_init_transaction_success -v
```

### With Coverage
```bash
# Run tests with coverage report
pytest tests/unit/ --cov=voice2rx --cov-report=html --cov-report=term-missing

# Using the provided script
./run_tests.sh
```

### Test Markers
```bash
# Run only unit tests
pytest -m unit

# Run tests in parallel (if pytest-xdist is installed)
pytest tests/unit/ -n auto
```

## Test Configuration

### Environment Variables
Tests automatically mock environment variables:
- `TABLE_NAME`: DynamoDB table name
- `AUDIO_TABLE_NAME`: Audio details table name
- `S3_VADED_BUCKET_NAME`: S3 bucket name
- `SNS_TOPIC_ARN`: SNS topic ARN
- `SQS_QUEUE_URL`: SQS queue URL

### Mock Strategy
- **External Services**: All external API calls are mocked
- **Database Operations**: DynamoDB operations are mocked
- **S3 Operations**: S3 client and operations are mocked
- **SQS Operations**: SQS service is mocked
- **Authentication**: JWT validation is mocked

## Key Test Utilities

### `test_helpers.py`
- `create_mock_response()`: Create mock HTTP responses
- `create_mock_dynamodb_response()`: Create mock DynamoDB responses
- `assert_error_response()`: Assert error response format
- `assert_success_response()`: Assert success response format
- `create_valid_jwt_header()`: Create valid JWT headers for testing
- `create_sample_transaction_request()`: Create sample request data

### Fixtures in `conftest.py`
- `client`: FastAPI test client
- `mock_request`: Mock FastAPI Request object
- `mock_jwt_payload`: Standard JWT payload
- `sample_transaction_data`: Sample transaction data
- `mock_dynamo_helper`: Mock DynamoDB helper
- `mock_s3_client`: Mock S3 client
- `mock_sqs_service`: Mock SQS service

## Coverage Goals
- **Minimum Coverage**: 10%
- **Focus Areas**: 
  - Request validation logic
  - Response formatting
  - Business logic paths
  - Error handling scenarios

## Adding New Tests

### For New APIs
1. Create a new test file in `tests/unit/api/`
2. Follow the naming convention: `test_{api_name}_api.py`
3. Use the existing test class structure
4. Mock external dependencies appropriately

### Test Case Categories
For each API, ensure tests cover:
1. **Happy Path**: Successful execution
2. **Validation Errors**: Invalid inputs
3. **Business Logic**: Edge cases and conditions
4. **External Failures**: Service unavailability
5. **Exception Handling**: Unexpected errors

### Example Test Structure
```python
class TestNewAPI:
    """Test cases for new API."""
    
    def test_success_scenario(self, client, mocks):
        """Test successful API execution."""
        # Arrange, Act, Assert
        
    def test_validation_error(self, client):
        """Test validation error scenarios."""
        # Arrange, Act, Assert
        
    def test_business_logic_edge_case(self, client, mocks):
        """Test specific business logic."""
        # Arrange, Act, Assert
```

## Best Practices
1. **Isolation**: Each test should be independent
2. **Clarity**: Use descriptive test names
3. **Mocking**: Mock external dependencies, not internal logic
4. **Assertions**: Use specific assertions for better error messages
5. **Parametrization**: Use `@pytest.mark.parametrize` for similar test cases
6. **Setup/Teardown**: Use fixtures for common setup

## Troubleshooting

### Debugging Tests
```bash
# Run with detailed output
pytest tests/unit/ -v -s

# Run with debugger
pytest tests/unit/ --pdb

# Run with coverage and missing lines
pytest tests/unit/ --cov=voice2rx --cov-report=term-missing
```

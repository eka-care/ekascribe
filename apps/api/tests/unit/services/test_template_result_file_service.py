import pytest
from unittest.mock import MagicMock, patch
from scribe.services.template_result_file_service import (
    TemplateResultFileService,
)


@pytest.fixture
def service():
    return TemplateResultFileService(bucket_name="test-bucket")


@patch(
    "scribe.services.template_result_file_service.list_files_in_s3_folder"
)
@patch("scribe.services.template_result_file_service.download_s3_file")
def test_read_all_transcripts_base_exists(mock_download, mock_list, service):
    # Setup
    s3_url = "s3://test-bucket/txn_1"
    txn_id = "txn_1"
    mock_list.return_value = [
        "txn_1/template_results/transcripts/txn_1_transcript.json"
    ]
    mock_download.return_value = {"text": "hello world"}

    # Execute
    results = service.read_all_transcripts(s3_url, txn_id)

    # Verify
    assert len(results) == 1
    assert results[0]["text"] == "hello world"
    assert results[0]["lang"] == ""
    # Should not call read_transcript_file (mocked via self in actual call, but we can check download)
    mock_download.assert_called_once()


@patch(
    "scribe.services.template_result_file_service.list_files_in_s3_folder"
)
@patch("scribe.services.template_result_file_service.download_s3_file")
def test_read_all_transcripts_base_missing_with_translations(
    mock_download, mock_list, service
):
    # Setup
    s3_url = "s3://test-bucket/txn_1"
    txn_id = "txn_1"
    # Only translation exists
    mock_list.return_value = [
        "txn_1/template_results/transcripts/txn_1_transcript_hi.json"
    ]

    # Mock download_s3_file for the translation
    def side_effect(bucket, key, filename, txn):
        if "txn_1_transcript_hi.json" in key:
            return {"text": "namaste"}
        if "logs/transcript.json" in key:  # Legacy location
            return {"text": "hello world"}
        return None

    mock_download.side_effect = side_effect

    # Execute
    results = service.read_all_transcripts(s3_url, txn_id)

    # Verify - only translation is returned since base transcript isn't in folder
    # and legacy fallback only triggers when results is completely empty
    assert len(results) == 1
    assert results[0]["text"] == "namaste"
    assert results[0]["lang"] == "hi"


@patch(
    "scribe.services.template_result_file_service.list_files_in_s3_folder"
)
@patch("scribe.services.template_result_file_service.download_s3_file")
def test_read_all_transcripts_empty_location(mock_download, mock_list, service):
    # Setup
    s3_url = "s3://test-bucket/txn_1"
    txn_id = "txn_1"
    mock_list.return_value = []
    mock_download.return_value = {"text": "legacy text"}

    # Execute
    results = service.read_all_transcripts(s3_url, txn_id)

    # Verify
    assert len(results) == 1
    assert results[0]["text"] == "legacy text"
    mock_download.assert_called()

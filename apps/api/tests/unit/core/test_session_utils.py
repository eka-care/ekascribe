"""Unit tests for compute_upload_url version/upload_type routing."""
from unittest.mock import MagicMock, patch

import pytest

from scribe.services.session_utils import compute_upload_url

SESSION_ID = "test-session-123"
BACKEND_URL = f"http://localhost:8000/voice/v1/sessions/{SESSION_ID}/audio"
PRESIGNED_RESPONSE = {
    "uploadData": {"url": "https://bucket.s3.amazonaws.com/", "fields": {}},
    "folderPath": "some/prefix/",
    "txn_id": SESSION_ID,
}


@pytest.fixture
def mock_audio_adaptor():
    with patch(
        "scribe.services.adaptors.audio_adaptor.AudioAdaptor"
    ) as adaptor_cls:
        instance = MagicMock()
        instance.generate_presigned_post_for_upload.return_value = (
            PRESIGNED_RESPONSE
        )
        adaptor_cls.return_value = instance
        yield instance


class TestComputeUploadUrlSingle:
    """Single uploads always get the backend URL, on every version."""

    def test_single_default_version_returns_backend(self, mock_audio_adaptor):
        url = compute_upload_url(
            SESSION_ID,
            "single",
            batch_s3_url="s3://bucket/batch/prefix",
            flavour="ekascribe-web",
        )
        assert url == BACKEND_URL
        mock_audio_adaptor.generate_presigned_post_for_upload.assert_not_called()

    def test_single_v2_returns_backend(self, mock_audio_adaptor):
        url = compute_upload_url(
            SESSION_ID,
            "single",
            batch_s3_url="s3://bucket/batch/prefix",
            version="v2",
        )
        assert url == BACKEND_URL
        mock_audio_adaptor.generate_presigned_post_for_upload.assert_not_called()


class TestComputeUploadUrlChunkedV2:
    """?version=v2 gets S3 presigned POST for chunked, no flavour check."""

    def test_v2_no_flavour_returns_presigned(self, mock_audio_adaptor):
        url = compute_upload_url(
            SESSION_ID,
            "chunked",
            s3_url="s3://bucket/chunked/prefix",
            b_id="biz-1",
            version="v2",
        )
        assert url == PRESIGNED_RESPONSE
        mock_audio_adaptor.generate_presigned_post_for_upload.assert_called_once()

    def test_v2_desktop_flavour_returns_presigned(self, mock_audio_adaptor):
        url = compute_upload_url(
            SESSION_ID,
            "chunked",
            s3_url="s3://bucket/chunked/prefix",
            flavour="ekascribe-desktop-mac",
            version="v2",
        )
        assert url == PRESIGNED_RESPONSE

    def test_v2_is_case_insensitive(self, mock_audio_adaptor):
        url = compute_upload_url(
            SESSION_ID,
            "chunked",
            s3_url="s3://bucket/chunked/prefix",
            version="V2",
        )
        assert url == PRESIGNED_RESPONSE


class TestComputeUploadUrlChunkedLegacy:
    """No version / v1 keeps the existing flavour-gated behavior."""

    def test_no_version_no_flavour_returns_backend(self, mock_audio_adaptor):
        url = compute_upload_url(
            SESSION_ID, "chunked", s3_url="s3://bucket/chunked/prefix"
        )
        assert url == BACKEND_URL
        mock_audio_adaptor.generate_presigned_post_for_upload.assert_not_called()

    def test_v1_no_flavour_returns_backend(self, mock_audio_adaptor):
        url = compute_upload_url(
            SESSION_ID,
            "chunked",
            s3_url="s3://bucket/chunked/prefix",
            version="v1",
        )
        assert url == BACKEND_URL

    def test_flavour_with_s3_url_returns_presigned(self, mock_audio_adaptor):
        url = compute_upload_url(
            SESSION_ID,
            "chunked",
            s3_url="s3://bucket/chunked/prefix",
            flavour="ekascribe-web",
        )
        assert url == PRESIGNED_RESPONSE

    def test_desktop_flavour_returns_backend(self, mock_audio_adaptor):
        for flavour in ("ekascribe-desktop-mac", "ekascribe-desktop-windows"):
            url = compute_upload_url(
                SESSION_ID,
                "chunked",
                s3_url="s3://bucket/chunked/prefix",
                flavour=flavour,
            )
            assert url == BACKEND_URL
        mock_audio_adaptor.generate_presigned_post_for_upload.assert_not_called()

    def test_flavour_without_s3_url_returns_backend(self, mock_audio_adaptor):
        url = compute_upload_url(SESSION_ID, "chunked", flavour="ekascribe-web")
        assert url == BACKEND_URL
        mock_audio_adaptor.generate_presigned_post_for_upload.assert_not_called()

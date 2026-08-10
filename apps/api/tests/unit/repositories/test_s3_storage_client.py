"""
Unit tests for S3StorageClient (voice2rx/services/storage/s3_storage_client.py).

The boto3 S3 client is fully mocked; tests run without AWS credentials.
"""

from io import BytesIO
from unittest.mock import MagicMock

import pytest

from scribe.repositories.blob import S3StorageClient, get_storage_client


BUCKET = "test-bucket"
KEY = "240101/txn-1/documents/abc.txt"


@pytest.fixture
def mock_boto():
    return MagicMock()


@pytest.fixture
def client(mock_boto):
    return S3StorageClient(bucket_name=BUCKET, s3_client=mock_boto)


# ---------------------------------------------------------------------------
# generate_presigned_get_url
# ---------------------------------------------------------------------------


class TestGeneratePresignedGetUrl:
    def test_returns_url_on_success(self, client, mock_boto):
        mock_boto.generate_presigned_url.return_value = "https://s3/presigned-get"

        url = client.generate_presigned_get_url(KEY, expires_in=1200)

        assert url == "https://s3/presigned-get"
        mock_boto.generate_presigned_url.assert_called_once_with(
            "get_object",
            Params={"Bucket": BUCKET, "Key": KEY},
            ExpiresIn=1200,
        )

    def test_default_expiry_is_3600(self, client, mock_boto):
        mock_boto.generate_presigned_url.return_value = "https://s3/x"

        client.generate_presigned_get_url(KEY)

        _, kwargs = mock_boto.generate_presigned_url.call_args
        assert kwargs["ExpiresIn"] == 3600

    def test_returns_none_for_empty_key(self, client, mock_boto):
        assert client.generate_presigned_get_url("") is None
        mock_boto.generate_presigned_url.assert_not_called()

    def test_returns_none_on_exception(self, client, mock_boto):
        mock_boto.generate_presigned_url.side_effect = RuntimeError("boom")

        assert client.generate_presigned_get_url(KEY) is None


# ---------------------------------------------------------------------------
# generate_presigned_put_url
# ---------------------------------------------------------------------------


class TestGeneratePresignedPutUrl:
    def test_returns_url_with_content_type(self, client, mock_boto):
        mock_boto.generate_presigned_url.return_value = "https://s3/presigned-put"

        url = client.generate_presigned_put_url(
            KEY, expires_in=600, content_type="application/json"
        )

        assert url == "https://s3/presigned-put"
        mock_boto.generate_presigned_url.assert_called_once_with(
            "put_object",
            Params={
                "Bucket": BUCKET,
                "Key": KEY,
                "ContentType": "application/json",
            },
            ExpiresIn=600,
        )

    def test_returns_none_for_empty_key(self, client, mock_boto):
        assert client.generate_presigned_put_url("") is None
        mock_boto.generate_presigned_url.assert_not_called()

    def test_returns_none_on_exception(self, client, mock_boto):
        mock_boto.generate_presigned_url.side_effect = RuntimeError("boom")

        assert client.generate_presigned_put_url(KEY) is None


# ---------------------------------------------------------------------------
# get_object / put_object
# ---------------------------------------------------------------------------


class TestGetObject:
    def test_reads_bytes(self, client, mock_boto):
        mock_boto.get_object.return_value = {"Body": BytesIO(b"hello")}

        assert client.get_object(KEY) == b"hello"
        mock_boto.get_object.assert_called_once_with(Bucket=BUCKET, Key=KEY)

    def test_propagates_exception(self, client, mock_boto):
        mock_boto.get_object.side_effect = RuntimeError("nope")

        with pytest.raises(RuntimeError):
            client.get_object(KEY)


class TestPutObject:
    def test_writes_with_content_type(self, client, mock_boto):
        client.put_object(KEY, b"payload", content_type="application/json")

        mock_boto.put_object.assert_called_once_with(
            Bucket=BUCKET,
            Key=KEY,
            Body=b"payload",
            ContentType="application/json",
        )

    def test_default_content_type(self, client, mock_boto):
        client.put_object(KEY, b"payload")

        _, kwargs = mock_boto.put_object.call_args
        assert kwargs["ContentType"] == "text/plain"

    def test_propagates_exception(self, client, mock_boto):
        mock_boto.put_object.side_effect = RuntimeError("nope")

        with pytest.raises(RuntimeError):
            client.put_object(KEY, b"payload")


# ---------------------------------------------------------------------------
# get_storage_client factory
# ---------------------------------------------------------------------------


class TestGetStorageClient:
    def test_returns_singleton(self):
        a = get_storage_client()
        b = get_storage_client()
        assert a is b

    def test_default_is_local(self):
        # STORAGE_BACKEND defaults to local on-prem
        from scribe.repositories.blob import LocalStorageClient

        assert isinstance(get_storage_client(), LocalStorageClient)

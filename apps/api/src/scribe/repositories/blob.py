"""Blob storage access for the API layer — the single S3/blob module.

Every call site goes through this module; everything routes through
scribe_core.storage (``STORAGE_BACKEND=local|s3``), so the same code runs
on the local filesystem backend and on S3/MinIO.

Two surfaces:

- ``blob_repo`` (``BlobFileRepo``): JSON/text file reads and writes plus
  folder listings, addressed by (bucket, key) or an s3:// URL.
- ``StorageClient`` protocol + ``LocalStorageClient``/``S3StorageClient``:
  bucket-scoped clients for presigned GET/PUT URLs and raw object access.
  Obtain one via ``get_storage_client()`` (process-wide, default bucket)
  or ``storage_client_for_bucket(name)`` (backend-aware, any bucket).
"""

import os
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable
from urllib.parse import urlparse

import orjson

from scribe.core.custom_logger import get_logger
from scribe_core.storage import get_blob_store

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# File-level helpers (JSON/text blobs, folder listings)
# ---------------------------------------------------------------------------


class BlobFileRepo:
    """File reads/writes and listings on the configured blob backend."""

    def download_file(self, bucket_name, file_key, local_filename, session_id=None):
        """Read a blob and decode it (JSON for .json filenames, utf-8 text,
        else raw bytes). Returns None when missing or on error."""
        try:
            content = get_blob_store().get(bucket_name, file_key)
            if local_filename.endswith(".json"):
                return orjson.loads(content)
            try:
                return content.decode("utf-8")
            except Exception:
                return content
        except Exception:
            return None

    def upload_json(
        self, bucket_name: str, file_key: str, data: Dict[Any, Any], session_id: str = None
    ) -> bool:
        """Write dict as JSON to the blob backend. Returns True on success."""
        try:
            get_blob_store().put(
                bucket_name, file_key, orjson.dumps(data), content_type="application/json"
            )
            return True
        except Exception as e:
            logger.error(
                f"Failed to upload JSON to {file_key} in bucket {bucket_name}"
                + (f" for session {session_id}" if session_id else "")
                + f" :: error {e}"
            )
            return False

    def list_files(
        self,
        bucket_name: str = None,
        folder_path: str = None,
        extension: str = None,
        s3_url: str = None,
        exclude_extensions: List[str] = None,
    ) -> List[str]:
        """List files under a folder in the blob backend, with extension
        filters. Pass either (bucket_name, folder_path) or an s3:// URL."""
        try:
            if s3_url:
                parsed_url = urlparse(s3_url)
                bucket_name = parsed_url.netloc
                folder_path = parsed_url.path.lstrip("/")

            if not folder_path.endswith("/"):
                folder_path += "/"

            keys = get_blob_store().list(bucket_name, folder_path)

            exclude_extensions = exclude_extensions or []
            files = []
            for key in keys:
                if key.endswith("/"):
                    continue
                if exclude_extensions and any(
                    key.lower().endswith(ext.lower()) for ext in exclude_extensions
                ):
                    continue
                if extension and not key.lower().endswith(extension.lower()):
                    continue
                files.append(key)
            return files
        except Exception as e:
            logger.error(f"Error listing files in blob storage: {e}", severity="medium")
            return []


blob_repo = BlobFileRepo()


# ---------------------------------------------------------------------------
# Bucket-scoped storage clients (presigned URLs, raw object access)
# ---------------------------------------------------------------------------


@runtime_checkable
class StorageClient(Protocol):
    """Minimal blob storage contract used by sessions/documents code paths."""

    def generate_presigned_get_url(
        self, key: str, expires_in: int = 3600
    ) -> Optional[str]:
        """Return a presigned URL the client can GET from. None on failure."""
        ...

    def generate_presigned_put_url(
        self,
        key: str,
        expires_in: int = 3600,
        content_type: str = "text/plain",
    ) -> Optional[str]:
        """Return a presigned URL the client can PUT to. None on failure."""
        ...

    def object_exists(self, key: str) -> bool:
        """True when `key` exists in the bucket."""
        ...

    def get_object(self, key: str) -> bytes:
        """Read raw bytes at `key`. Raises on failure."""
        ...

    def put_object(
        self,
        key: str,
        body: bytes,
        content_type: str = "text/plain",
    ) -> None:
        """Write raw bytes to `key`. Raises on failure."""
        ...


class LocalStorageClient:
    """StorageClient backed by the local filesystem blob store. "Presigned"
    URLs are HMAC-tokenized URLs served by the API's blob router."""

    def __init__(self, bucket_name: Optional[str] = None):
        self.bucket_name = bucket_name or os.getenv("S3_VADED_BUCKET_NAME", "voice-records")
        self._store = get_blob_store()

    def generate_presigned_get_url(self, key: str, expires_in: int = 3600) -> Optional[str]:
        if not key:
            return None
        return self._store.presigned_get_url(self.bucket_name, key, expires_in)

    def generate_presigned_put_url(
        self, key: str, expires_in: int = 3600, content_type: str = "text/plain"
    ) -> Optional[str]:
        if not key:
            return None
        return self._store.presigned_put_url(self.bucket_name, key, expires_in, content_type)

    def object_exists(self, key: str) -> bool:
        return bool(key) and self._store.exists(self.bucket_name, key)

    def get_object(self, key: str) -> bytes:
        return self._store.get(self.bucket_name, key)

    def put_object(self, key: str, body: bytes, content_type: str = "text/plain") -> None:
        self._store.put(self.bucket_name, key, body, content_type=content_type)


def _default_boto3_client():
    import boto3

    from scribe_core.settings import get_settings

    s = get_settings()
    return boto3.client("s3", region_name=s.aws_region, endpoint_url=s.s3_endpoint_url)


class S3StorageClient:
    """StorageClient backed by Amazon S3 (endpoint-aware for MinIO)."""

    def __init__(
        self,
        bucket_name: Optional[str] = None,
        s3_client=None,
    ):
        self.bucket_name = bucket_name or os.getenv(
            "S3_VADED_BUCKET_NAME", "voice-records"
        )
        self._client = s3_client or _default_boto3_client()

    def generate_presigned_get_url(
        self, key: str, expires_in: int = 3600
    ) -> Optional[str]:
        if not key:
            return None
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": key},
                ExpiresIn=expires_in,
            )
        except Exception as e:
            logger.error(
                "S3StorageClient: failed to generate presigned GET url",
                key=key,
                error=str(e),
                severity="medium",
            )
            return None

    def generate_presigned_put_url(
        self,
        key: str,
        expires_in: int = 3600,
        content_type: str = "text/plain",
    ) -> Optional[str]:
        if not key:
            return None
        try:
            return self._client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
            )
        except Exception as e:
            logger.error(
                "S3StorageClient: failed to generate presigned PUT url",
                key=key,
                error=str(e),
                severity="medium",
            )
            return None

    def object_exists(self, key: str) -> bool:
        if not key:
            return False
        try:
            self._client.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except Exception:
            return False

    def get_object(self, key: str) -> bytes:
        response = self._client.get_object(Bucket=self.bucket_name, Key=key)
        return response["Body"].read()

    def put_object(
        self,
        key: str,
        body: bytes,
        content_type: str = "text/plain",
    ) -> None:
        self._client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=body,
            ContentType=content_type,
        )


# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------


def storage_client_for_bucket(bucket_name: Optional[str] = None) -> StorageClient:
    """Backend-aware StorageClient for any bucket."""
    from scribe_core.settings import get_settings

    if get_settings().storage_backend == "local":
        return LocalStorageClient(bucket_name=bucket_name)
    return S3StorageClient(bucket_name=bucket_name)


_default_storage_client: Optional[StorageClient] = None


def get_storage_client() -> StorageClient:
    """Return the process-wide StorageClient for the default bucket."""
    global _default_storage_client
    if _default_storage_client is None:
        _default_storage_client = storage_client_for_bucket()
    return _default_storage_client


__all__ = [
    "BlobFileRepo",
    "blob_repo",
    "StorageClient",
    "LocalStorageClient",
    "S3StorageClient",
    "storage_client_for_bucket",
    "get_storage_client",
]

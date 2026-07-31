"""Local-filesystem implementation of the StorageClient protocol.

Bucket-scoped adapter over scribe_core.storage.LocalFSBlobStore. "Presigned"
URLs are HMAC-tokenized URLs served by the API's blob router.
"""

import os
from typing import Optional

from logs.custom_logger import get_logger
from scribe_core.storage import get_blob_store

logger = get_logger(__name__)


class LocalStorageClient:
    """StorageClient backed by the local filesystem blob store."""

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

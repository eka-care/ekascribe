"""Backend-aware storage factory (Phase 1).

``get_storage_client()`` keeps the original ``StorageClient`` protocol so every
existing caller works unchanged, but now returns an implementation backed by the
configured blob backend (``STORAGE_BACKEND=local|s3``) via scribe_core.storage.
"""

from typing import Optional

from scribe.repositories.storage_client import StorageClient
from scribe.repositories.s3_storage_client import S3StorageClient
from scribe.repositories.local_storage_client import LocalStorageClient

_default_storage_client: Optional[StorageClient] = None


def get_storage_client() -> StorageClient:
    """Return the process-wide StorageClient for the configured backend."""
    global _default_storage_client
    if _default_storage_client is None:
        from scribe_core.settings import get_settings

        if get_settings().storage_backend == "local":
            _default_storage_client = LocalStorageClient()
        else:
            _default_storage_client = S3StorageClient()
    return _default_storage_client


__all__ = ["StorageClient", "S3StorageClient", "LocalStorageClient", "get_storage_client"]

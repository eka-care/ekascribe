"""
Provider-agnostic blob storage interface.

New code paths (e.g. the sessions API) talk to this Protocol, not directly to
boto3. Today the only implementation is S3StorageClient; future providers
(Azure Blob, GCS) can plug in without touching callers.

Existing services (document_service, result_service_v2, s3_service) still use
boto3 directly. They will migrate onto this interface in a follow-up.
"""

from typing import Optional, Protocol, runtime_checkable


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

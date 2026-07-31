"""
S3 implementation of StorageClient.

Wraps the existing boto3 client from voice2rx.services.storage.s3_service so
both code paths share the same client and credentials. Bucket defaults to
S3_VADED_BUCKET_NAME but can be overridden per instance.
"""

import os
from typing import Optional

from logs.custom_logger import get_logger

logger = get_logger(__name__)


def _default_client():
    import boto3

    from scribe_core.settings import get_settings

    s = get_settings()
    return boto3.client("s3", region_name=s.aws_region, endpoint_url=s.s3_endpoint_url)


class S3StorageClient:
    """StorageClient backed by Amazon S3."""

    def __init__(
        self,
        bucket_name: Optional[str] = None,
        s3_client=None,
    ):
        self.bucket_name = bucket_name or os.getenv(
            "S3_VADED_BUCKET_NAME", "voice-records"
        )
        self._client = s3_client or _default_client()

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

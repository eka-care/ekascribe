"""Pluggable blob storage (plan B2, Phase 1).

Everything in the pipeline addresses blobs with s3://-style URLs
(``s3://<bucket>/<key>``) — those stay the canonical *logical* format in DB rows
regardless of backend, so DB rows are portable between deployments.

Backends:
- ``LocalFSBlobStore`` — files under ``STORAGE_ROOT/<bucket>/<key>``. "Presigned"
  URLs are HMAC-tokenized URLs served by the API's blob router (the alliance SDK
  sends storage requests with ``attachAuth: false``, so auth must ride in the URL).
- ``S3BlobStore`` — real S3, with ``endpoint_url`` override ⇒ LocalStack/MinIO.

The S3-POST-shaped ``presigned_post`` dict is what keeps the frontend's
``AwsS3StorageProvider`` working unchanged against a local backend (plan A4).
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

from scribe_core.settings import get_settings


def parse_blob_url(url: str) -> Tuple[str, str]:
    """``s3://bucket/key/parts`` → ``("bucket", "key/parts")``."""
    if not url.startswith("s3://"):
        raise ValueError(f"Invalid blob URL: {url}")
    path = url[5:]
    parts = path.split("/", 1)
    return parts[0], parts[1] if len(parts) > 1 else ""


# --- URL token signing (local backend) --------------------------------------


def _sign(secret: str, *parts: str) -> str:
    msg = ":".join(parts).encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def make_blob_token(method: str, bucket: str, key_or_prefix: str, expires_at: int) -> str:
    s = get_settings()
    return _sign(s.upload_url_signing_secret, method.upper(), bucket, key_or_prefix, str(expires_at))


def verify_blob_token(
    token: str, method: str, bucket: str, key_or_prefix: str, expires_at: int
) -> bool:
    if expires_at < int(time.time()):
        return False
    expected = make_blob_token(method, bucket, key_or_prefix, expires_at)
    return hmac.compare_digest(token, expected)


# --- Interface ----------------------------------------------------------------


class BlobStore(ABC):
    """Sync blob-store contract (call sites run it in executors where needed)."""

    @abstractmethod
    def get(self, bucket: str, key: str) -> bytes: ...

    @abstractmethod
    def put(
        self,
        bucket: str,
        key: str,
        body: bytes,
        content_type: str = "application/octet-stream",
        metadata: Optional[Dict[str, str]] = None,
    ) -> None: ...

    @abstractmethod
    def exists(self, bucket: str, key: str) -> bool: ...

    @abstractmethod
    def delete(self, bucket: str, key: str) -> None: ...

    @abstractmethod
    def list(self, bucket: str, prefix: str) -> List[str]:
        """All object keys under prefix (no folder pseudo-entries)."""
        ...

    @abstractmethod
    def presigned_get_url(self, bucket: str, key: str, expires_in: int = 3600) -> Optional[str]: ...

    @abstractmethod
    def presigned_put_url(
        self, bucket: str, key: str, expires_in: int = 3600, content_type: str = "text/plain"
    ) -> Optional[str]: ...

    @abstractmethod
    def presigned_post(
        self,
        bucket: str,
        key_prefix: str,
        metadata: Optional[Dict[str, str]] = None,
        expires_in: int = 10800,
    ) -> Dict[str, Any]:
        """S3-POST-shaped dict: ``{"url": ..., "fields": {..., "key": "<prefix>/${filename}"}}``."""
        ...


# --- Local filesystem backend -------------------------------------------------


class LocalFSBlobStore(BlobStore):
    def __init__(self, root: Optional[str] = None, self_url: Optional[str] = None):
        s = get_settings()
        self.root = Path(root or s.storage_root).resolve()
        self.self_url = (self_url or s.self_url).rstrip("/")
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, bucket: str, key: str) -> Path:
        p = (self.root / bucket / key).resolve()
        if not str(p).startswith(str(self.root)):
            raise ValueError(f"Path traversal attempt: {bucket}/{key}")
        return p

    def get(self, bucket: str, key: str) -> bytes:
        return self._path(bucket, key).read_bytes()

    def put(self, bucket, key, body, content_type="application/octet-stream", metadata=None):
        p = self._path(bucket, key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(body)

    def exists(self, bucket: str, key: str) -> bool:
        return self._path(bucket, key).is_file()

    def delete(self, bucket: str, key: str) -> None:
        p = self._path(bucket, key)
        if p.is_file():
            p.unlink()

    def list(self, bucket: str, prefix: str) -> List[str]:
        base = self.root / bucket
        if not base.is_dir():
            return []
        results = []
        prefix = prefix.lstrip("/")
        for p in base.rglob("*"):
            if p.is_file():
                key = str(p.relative_to(base))
                if key.startswith(prefix):
                    results.append(key)
        return sorted(results)

    # URLs served by the API blob router --------------------------------------

    def _url(self, method: str, bucket: str, key: str, expires_in: int, **extra) -> str:
        expires_at = int(time.time()) + expires_in
        token = make_blob_token(method, bucket, key, expires_at)
        q = "&".join(
            [f"expires={expires_at}", f"token={token}"]
            + [f"{k}={quote(str(v))}" for k, v in extra.items()]
        )
        return f"{self.self_url}/voice/v1/blob/{bucket}/{quote(key)}?{q}"

    def presigned_get_url(self, bucket, key, expires_in=3600):
        return self._url("GET", bucket, key, expires_in)

    def presigned_put_url(self, bucket, key, expires_in=3600, content_type="text/plain"):
        return self._url("PUT", bucket, key, expires_in)

    def presigned_post(self, bucket, key_prefix, metadata=None, expires_in=10800):
        key_prefix = key_prefix.rstrip("/")
        expires_at = int(time.time()) + expires_in
        token = make_blob_token("POST", bucket, key_prefix, expires_at)
        fields: Dict[str, Any] = {
            "key": f"{key_prefix}/${{filename}}",
            "x-scribe-prefix": key_prefix,
            "x-scribe-expires": str(expires_at),
            "x-scribe-token": token,
        }
        for mk, mv in (metadata or {}).items():
            fields[f"x-amz-meta-{mk}"] = mv
        return {
            "url": f"{self.self_url}/voice/v1/blob-upload/{bucket}",
            "fields": fields,
        }


# --- S3 backend ---------------------------------------------------------------


class S3BlobStore(BlobStore):
    def __init__(self, client=None):
        s = get_settings()
        if client is None:
            import boto3

            client = boto3.client(
                "s3",
                region_name=s.aws_region,
                endpoint_url=s.s3_endpoint_url,  # None ⇒ real AWS
            )
        self.client = client

    def get(self, bucket, key):
        return self.client.get_object(Bucket=bucket, Key=key)["Body"].read()

    def put(self, bucket, key, body, content_type="application/octet-stream", metadata=None):
        kwargs = dict(Bucket=bucket, Key=key, Body=body, ContentType=content_type)
        if metadata:
            kwargs["Metadata"] = metadata
        self.client.put_object(**kwargs)

    def exists(self, bucket, key):
        try:
            self.client.head_object(Bucket=bucket, Key=key)
            return True
        except Exception:
            return False

    def delete(self, bucket, key):
        self.client.delete_object(Bucket=bucket, Key=key)

    def list(self, bucket, prefix):
        keys: List[str] = []
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                if not item["Key"].endswith("/"):
                    keys.append(item["Key"])
        return keys

    def presigned_get_url(self, bucket, key, expires_in=3600):
        try:
            return self.client.generate_presigned_url(
                "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=expires_in
            )
        except Exception:
            return None

    def presigned_put_url(self, bucket, key, expires_in=3600, content_type="text/plain"):
        try:
            return self.client.generate_presigned_url(
                "put_object",
                Params={"Bucket": bucket, "Key": key, "ContentType": content_type},
                ExpiresIn=expires_in,
            )
        except Exception:
            return None

    def presigned_post(self, bucket, key_prefix, metadata=None, expires_in=10800):
        key_prefix = key_prefix.rstrip("/")
        fields = {f"x-amz-meta-{k}": v for k, v in (metadata or {}).items()}
        conditions: List[Any] = [
            ["starts-with", "$key", key_prefix],
            ["starts-with", "$Content-Type", "audio/"],
            ["content-length-range", 0, 524288000],
        ] + [{k: v} for k, v in fields.items()]
        client = self._presign_client()
        response = client.generate_presigned_post(
            Bucket=bucket,
            Key=f"{key_prefix}/${{filename}}",
            Fields=fields,
            Conditions=conditions,
            ExpiresIn=expires_in,
        )
        return {"url": response["url"], "fields": response["fields"]}

    def _presign_client(self):
        """Optionally presign with an assumed role (ASSUME_ROLE_ARN env), as upstream did."""
        role_arn = os.getenv("ASSUME_ROLE_ARN")
        if not role_arn:
            return self.client
        import boto3

        s = get_settings()
        sts = boto3.client("sts")
        creds = sts.assume_role(RoleArn=role_arn, RoleSessionName="presigned-post-session")[
            "Credentials"
        ]
        return boto3.client(
            "s3",
            region_name=s.aws_region,
            endpoint_url=s.s3_endpoint_url,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
        )


# --- Factory ------------------------------------------------------------------

_store: Optional[BlobStore] = None


def get_blob_store() -> BlobStore:
    global _store
    if _store is None:
        s = get_settings()
        _store = LocalFSBlobStore() if s.storage_backend == "local" else S3BlobStore()
    return _store


def reset_blob_store() -> None:
    """Test hook."""
    global _store
    _store = None

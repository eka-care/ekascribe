"""Blob helpers used across services — now backend-agnostic (Phase 1).

``download_s3_file`` / ``upload_file_to_s3`` keep their signatures but route
through scribe_core.storage, so they work identically on the local filesystem
backend and on S3/MinIO/LocalStack.
"""

import logging
from typing import Any, Dict

import orjson

from scribe_core.storage import get_blob_store

log = logging.getLogger(__name__)


def __getattr__(name):
    # Legacy import surface: `from voice2rx.services.storage.s3_service import s3_client`.
    # Only meaningful on the s3 backend; constructed lazily so the local backend
    # never needs boto3 credentials.
    if name == "s3_client":
        import boto3

        from scribe_core.settings import get_settings

        s = get_settings()
        return boto3.client("s3", region_name=s.aws_region, endpoint_url=s.s3_endpoint_url)
    raise AttributeError(name)


def download_s3_file(bucket_name, file_key, local_filename, session_id):
    """Read a blob and decode it (JSON for .json filenames, utf-8 text, else bytes)."""
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


def upload_file_to_s3(
    bucket_name: str, file_key: str, data: Dict[Any, Any], session_id: str = None
) -> bool:
    """Write dict as JSON to the blob backend. Returns True on success."""
    try:
        get_blob_store().put(
            bucket_name, file_key, orjson.dumps(data), content_type="application/json"
        )
        return True
    except Exception as e:
        log.error(
            f"Failed to upload JSON to {file_key} in bucket {bucket_name}"
            + (f" for session {session_id}" if session_id else "")
            + f" :: error {e}"
        )
        return False

"""Blob-path helpers — backend-agnostic (Phase 1).

``list_files_in_s3_folder`` keeps its signature (first arg was a boto3 client;
it is now ignored) and lists from the configured blob backend instead.
"""

from datetime import datetime, timezone
from urllib.parse import urlparse

from scribe_core.storage import get_blob_store

WHITELISTED_ERRORS = ["whitelisted_error_1", "whitelisted_error_2"]


def get_s3_client():
    """Legacy accessor. On the s3 backend returns a real (endpoint-aware) boto3
    client; on the local backend returns None — every migrated call path passes
    the result straight into helpers that no longer use it."""
    from scribe_core.settings import get_settings

    s = get_settings()
    if s.storage_backend != "s3":
        return None
    import boto3

    return boto3.client("s3", region_name=s.aws_region, endpoint_url=s.s3_endpoint_url)


def list_files_in_s3_folder(
    s3_client, bucket_name, folder_path, extension=None, s3_url=None, exclude_extensions=None
):
    """List files under a folder in the blob backend, with extension filters.

    The ``s3_client`` argument is ignored (kept for signature compatibility).
    """
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
        print(f"Error listing files in blob storage: {str(e)}")
        return []


def build_s3_folder_path(txn_id):
    """Storage folder for a transaction: <YYMMDD>/<txn_id>/ (UTC — plan B4)."""
    date_str = datetime.now(timezone.utc).strftime("%y%m%d")
    return f"{date_str}/{txn_id}/"


def get_template_result_s3_url(transaction_data, s3_vaded_bucket):
    s3_url = transaction_data.get("s3_url", "")
    folder_name = s3_url.removeprefix(f"s3://{s3_vaded_bucket}/")
    if folder_name.endswith("/"):
        template_result_s3_url = f"{s3_url}output.json"
    else:
        template_result_s3_url = f"{s3_url}/output.json"
    return template_result_s3_url

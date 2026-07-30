"""
S3 path helpers for AG-UI scribe artifacts.

The existing legacy pipeline writes markdown artifacts at:

    {s3_url}/documents/{document_id}.txt
    {s3_url}/prompts/prompt.json

AG-UI runs add structured-state artifacts under a sibling prefix that
does not collide with anything legacy reads:

    {s3_url}/ag_ui/
        {document_id}.state.json       # ScribeState snapshot
        ...future (planned in docs/ag_ui_implementation_plan.md):
        {document_id}.events/          # NDJSON event log per run
        {document_id}.checkpoint.{run_id}.json   # paused-run snapshot
"""

AG_UI_PREFIX = "ag_ui"
STATE_FILE_SUFFIX = ".state.json"


def parse_s3_url(s3_url: str, bucket_name: str) -> str:
    """Strip ``s3://{bucket}/`` from the front of an S3 URL.

    Returns the folder path within the bucket, with no trailing slash.
    If the URL doesn't start with the expected bucket prefix, returns
    the URL stripped of leading/trailing slashes — defensive fallback;
    callers should normally pass a well-formed URL.
    """
    prefix = f"s3://{bucket_name}/"
    if s3_url.startswith(prefix):
        return s3_url.removeprefix(prefix).rstrip("/")
    return s3_url.lstrip("/").rstrip("/")


def make_state_path(s3_url: str, bucket_name: str, document_id: str) -> str:
    """Return the S3 object key for a document's ScribeState snapshot.

    Args:
        s3_url: Full s3://{bucket}/{prefix} URL for the run.
        bucket_name: Bucket name; used to strip the s3:// prefix.
        document_id: Document UUID.

    Example:
        >>> make_state_path(
        ...     s3_url="s3://m-prod-voice-record/sessions/txn_99",
        ...     bucket_name="m-prod-voice-record",
        ...     document_id="doc_42",
        ... )
        'sessions/txn_99/ag_ui/doc_42.state.json'
    """
    folder = parse_s3_url(s3_url, bucket_name)
    return f"{folder}/{AG_UI_PREFIX}/{document_id}{STATE_FILE_SUFFIX}"

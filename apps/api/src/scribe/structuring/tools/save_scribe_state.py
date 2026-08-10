"""
save_scribe_state — internal helper that persists ScribeState to S3.

Called by the run service on RUN_FINISHED (not registered as an LLM
tool). Serializes ScribeState via state.snapshot() (model_dump(mode=
"json")) and writes to:

    {s3_url}/ag_ui/{document_id}.state.json
"""

from scribe.core.custom_logger import get_logger

from scribe.repositories.blob import blob_repo

from ..state import ScribeState
from ..storage import make_state_path

logger = get_logger(__name__)


async def save_scribe_state(
    state: ScribeState,
    *,
    s3_url: str,
    s3_bucket: str,
    document_id: str,
    txn_id: str = "",
) -> str:
    """Persist `state` as JSON to S3.

    Returns the s3 path on success, or a string starting with "Error:"
    on failure. The caller is expected to log the result; this function
    only logs the success/failure event.
    """
    if not s3_url:
        return "Error: s3_url is empty."
    if not s3_bucket:
        return "Error: s3_bucket is empty."
    document_id = state.document_id or document_id
    if not document_id:
        return "Error: document_id missing on state and in arguments."

    txn_id = state.txn_id or txn_id
    path = make_state_path(s3_url, s3_bucket, document_id)
    snapshot = state.snapshot()

    ok = blob_repo.upload_json(s3_bucket, path, snapshot, txn_id)
    if not ok:
        logger.error(
            "save_scribe_state: upload failed",
            txn_id=txn_id,
            document_id=document_id,
            bucket=s3_bucket,
            path=path,
            severity="critical",
        )
        return f"Error: failed to upload ScribeState to s3://{s3_bucket}/{path}."

    logger.info(
        "save_scribe_state: persisted",
        txn_id=txn_id,
        document_id=document_id,
        bucket=s3_bucket,
        path=path,
        sections_count=len(state.sections),
        severity="medium",
    )
    return path

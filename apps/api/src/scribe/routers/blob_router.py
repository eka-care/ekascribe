"""Backend-served blob endpoints (local storage backend).

These are the targets of the tokenized URLs produced by LocalFSBlobStore:
- GET  /voice/v1/blob/{bucket}/{key}   — download (presigned-GET equivalent)
- PUT  /voice/v1/blob/{bucket}/{key}   — save (presigned-PUT equivalent; the web
  app's putToS3() PUTs the edited document to whatever URL the backend returned)
- POST /voice/v1/blob-upload/{bucket}  — S3-POST-shaped multipart upload target
  used by the alliance SDK's AwsS3StorageProvider (fields carry the HMAC token;
  requests arrive with attachAuth: false, so no bearer header)

Auth is the HMAC token minted by scribe_core.storage — NOT the session bearer
token; the whole prefix is exempted in the auth middleware.

The POST target is also where live audio chunks land: the web app gets a
presigned POST from create-session (compute_upload_url -> presigned, for
version=v2 chunked uploads) and the SDK posts each chunk straight here,
bypassing POST /voice/v1/sessions/{id}/audio/{file}. That route is the only
other place per-chunk STT is kicked off, so without the hook below nothing
transcribes until commit — process_session then discovers all N chunks at once
and fans them out in one burst.

Caveat: with STORAGE_BACKEND=s3 and BLOB_VIA_API unset, the browser posts
DIRECTLY to the bucket and never reaches this route, so live per-chunk STT
cannot start (everything still works, just at commit time). Set
BLOB_VIA_API=true to keep uploads flowing through the API.
"""

from __future__ import annotations

import mimetypes
import re
from collections import OrderedDict
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response
from starlette.datastructures import UploadFile

from scribe.core.custom_logger import get_logger
from scribe_core.storage import get_blob_store, verify_blob_token

logger = get_logger(__name__)

blob_router = APIRouter()


# --- live audio-chunk hook ----------------------------------------------------
# Chunk objects are named by index inside the session prefix (0.webm, 1.m4a, ...)
# — the same shape pipeline._chunk_files looks for at commit.
_CHUNK_RE = re.compile(r"^(\d+)\.[A-Za-z0-9]+$")
_AUDIO_EXTS = (".m4a", ".mp3", ".wav", ".webm", ".ogg", ".mp4", ".aac")

# The session's STT language is fixed at create-session, so resolve it once per
# session instead of re-reading the transaction for every chunk.
_LANG_CACHE: "OrderedDict[str, Optional[str]]" = OrderedDict()
_LANG_CACHE_MAX = 512


def _is_audio_chunk(key: str, prefix: str) -> bool:
    """True only for the session's numbered audio objects — never documents,
    transcript artifacts or header/footer images sharing the prefix.

    Must be a DIRECT child of the prefix: transcribe_chunk reassembles the path
    as ``{prefix}/{filename}``, so a nested key would resolve to an object that
    does not exist.
    """
    name = key.rsplit("/", 1)[-1]
    return (
        key == f"{prefix.rstrip('/')}/{name}"
        and bool(_CHUNK_RE.match(name))
        and name.lower().endswith(_AUDIO_EXTS)
    )


def _cached_session_language(txn_id: str, b_id: str) -> Optional[str]:
    if txn_id in _LANG_CACHE:
        _LANG_CACHE.move_to_end(txn_id)
        return _LANG_CACHE[txn_id]
    from scribe.pipeline.pipeline import session_language

    lang = session_language(txn_id, b_id)
    _LANG_CACHE[txn_id] = lang
    while len(_LANG_CACHE) > _LANG_CACHE_MAX:
        _LANG_CACHE.popitem(last=False)
    return lang


def _dispatch_chunk_stt(
    bucket: str, key: str, prefix: str, metadata: Dict[str, Any]
) -> None:
    """Start STT for a chunk that just landed, so transcripts are written while
    the session is still live instead of all at once at commit.

    Best-effort by design: a failure here must never fail the upload, because
    process_session's commit-time sweep re-dispatches anything still pending.
    """
    txn_id = str(metadata.get("txnid") or "")
    if not txn_id or not _is_audio_chunk(key, prefix):
        return
    b_id = str(metadata.get("bid") or "")
    filename = key.rsplit("/", 1)[-1]
    try:
        from scribe.pipeline.dispatch import dispatch

        dispatch(
            "transcribe_chunk",
            {
                "txn_id": txn_id,
                "b_id": b_id,
                "s3_url": f"s3://{bucket}/{prefix.rstrip('/')}",
                "filename": filename,
                "language": _cached_session_language(txn_id, b_id),
            },
        )
        logger.info(
            "chunk STT dispatched on upload",
            session_id=txn_id,
            b_id=b_id,
            chunk=filename,
        )
    except Exception as e:  # noqa: BLE001 — the upload itself already succeeded
        logger.error(
            "failed to dispatch transcribe_chunk on upload "
            "(it will run at commit instead)",
            session_id=txn_id,
            chunk=filename,
            error=str(e),
            severity="medium",
        )


def _check(token: str, method: str, bucket: str, key_or_prefix: str, expires: int) -> None:
    if not verify_blob_token(token, method, bucket, key_or_prefix, expires):
        raise HTTPException(status_code=403, detail="invalid or expired storage token")


@blob_router.get("/blob/{bucket}/{key:path}")
async def download_blob(
    bucket: str,
    key: str,
    expires: int = Query(...),
    token: str = Query(...),
):
    _check(token, "GET", bucket, key, expires)
    store = get_blob_store()
    if not store.exists(bucket, key):
        raise HTTPException(status_code=404, detail="not found")
    body = store.get(bucket, key)
    content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
    return Response(content=body, media_type=content_type)


@blob_router.put("/blob/{bucket}/{key:path}")
async def upload_blob(
    bucket: str,
    key: str,
    request: Request,
    expires: int = Query(...),
    token: str = Query(...),
):
    _check(token, "PUT", bucket, key, expires)
    body = await request.body()
    content_type = request.headers.get("content-type", "application/octet-stream")
    get_blob_store().put(bucket, key, body, content_type=content_type)
    return Response(status_code=200)


@blob_router.post("/blob-upload/{bucket}")
async def post_blob(bucket: str, request: Request):
    """S3-shaped multipart POST: fields + file, 204 on success (like S3)."""
    form = await request.form()
    key = form.get("key")
    prefix = form.get("x-scribe-prefix")
    expires = form.get("x-scribe-expires")
    token = form.get("x-scribe-token")
    file = form.get("file")

    if not all([key, prefix, expires, token]) or not isinstance(file, UploadFile):
        raise HTTPException(status_code=400, detail="missing multipart fields")
    try:
        expires_i = int(expires)
    except ValueError:
        raise HTTPException(status_code=400, detail="bad expires")

    _check(token, "POST", bucket, prefix, expires_i)

    # S3 semantics: client substitutes ${filename}; enforce the signed prefix.
    key = str(key).replace("${filename}", file.filename or "0")
    if not key.startswith(str(prefix)) or ".." in key:
        raise HTTPException(status_code=403, detail="key outside signed prefix")

    body = await file.read()
    content_type = file.content_type or "application/octet-stream"
    metadata = {
        k.removeprefix("x-amz-meta-"): str(v)
        for k, v in form.items()
        if k.startswith("x-amz-meta-")
    }
    try:
        get_blob_store().put(
            bucket, key, body, content_type=content_type, metadata=metadata
        )
    except Exception as e:  # noqa: BLE001 — the object store rejected the write
        # Without this the caller just gets a bare 500 and the reason is buried
        # in a stack trace. Name the bucket/key/error so the log line IS the
        # diagnosis (missing bucket, bad creds, unreachable endpoint, TLS).
        logger.error(
            "blob write FAILED — object store rejected the upload",
            bucket=bucket,
            key=key,
            size_bytes=len(body),
            error=f"{type(e).__name__}: {e}",
            severity="critical",
        )
        raise HTTPException(
            status_code=502,
            detail=f"storage write failed ({type(e).__name__}) — see api logs",
        )

    _dispatch_chunk_stt(bucket, key, str(prefix), metadata)
    return Response(status_code=204)

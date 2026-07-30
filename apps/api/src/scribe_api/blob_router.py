"""Backend-served blob endpoints (local storage backend).

These are the targets of the tokenized URLs produced by LocalFSBlobStore:
- GET  /voice/v1/blob/{bucket}/{key}   — download (presigned-GET equivalent)
- PUT  /voice/v1/blob/{bucket}/{key}   — save (presigned-PUT equivalent; the web
  app's putToS3() PUTs the edited document to whatever URL the backend returned)
- POST /voice/v1/blob-upload/{bucket}  — S3-POST-shaped multipart upload target
  used by the alliance SDK's AwsS3StorageProvider (fields carry the HMAC token;
  requests arrive with attachAuth: false, so no bearer header)

Auth is the HMAC token minted by scribe_core.storage — NOT the session bearer
token; the whole prefix is exempted in DevAuthMiddleware.
"""

from __future__ import annotations

import mimetypes

from fastapi import APIRouter, HTTPException, Query, Request, Response
from starlette.datastructures import UploadFile

from scribe_core.storage import get_blob_store, verify_blob_token

blob_router = APIRouter()


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
    get_blob_store().put(bucket, key, body, content_type=content_type, metadata=metadata)
    return Response(status_code=204)

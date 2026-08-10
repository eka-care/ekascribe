"""Client for the Eka Care vault (`/mr/api/v1/docs`).

Two operations, both returning an S3 presigned POST form `{url, fields}`:
  - create_doc(): create a new vault document; form is nested under
    `batch_response[0].forms[0]`.
  - replace_content(): refresh content on an existing vault document; form is
    at the top-level `forms[0]` (no `batch_response`).

`upload_pdf_via_form()` posts PDF bytes (multipart) to the returned form.
All API requests authenticate using the `jwt-payload` header (not Bearer tokens).
"""

import json
import os
from typing import Any, Dict, Tuple

import requests

from logs.custom_logger import get_logger

logger = get_logger(__name__)


DOC_TYPE_PRESCRIPTION = "ps"
PDF_CONTENT_TYPE = "application/pdf"
DEFAULT_FILE_INDEX = 1


class VaultClientError(Exception):
    """Raised on any vault API / upload failure."""


def _vault_base_url() -> str:
    env = (os.getenv("ENV") or "").lower()
    if env != "prod":
        return "http://vault.orbi.dev"
    return "http://vault.orbi.orbi"

def _headers(jwt_payload: Dict[str, Any], oid: str) -> Dict[str, str]:
    return {
        "Content-Type": "application/json",
        "jwt-payload": json.dumps(jwt_payload),
        "X-Pt-Id": oid,
        "service-id" : 'ndhm'
    }


def create_doc(
    document_id: str,
    pdf_size: int,
    jwt_payload: Dict[str, Any],
    oid: str,
) -> Tuple[str, Dict[str, Any]]:
    """Create a new vault document.

    Returns a tuple of (vault_doc_id, form) where `form` is the S3 presigned POST
    payload: `{"url": str, "fields": dict}`. Caller uses it with `upload_pdf_via_form`.

    The local `document_id` is passed through so the returned `vault_doc_id` can
    equal it (per Eka Care API semantics).
    """
    url = f"{_vault_base_url()}/internal/api/v4/docs?p_oid={oid}"
    body = {
        "batch_request": [
            {
                "dt": DOC_TYPE_PRESCRIPTION,
                "files": [
                    {"contentType": PDF_CONTENT_TYPE, "file_size": pdf_size}
                ],
                "document_id": document_id,
            }
        ]
    }

    try:
        response = requests.post(
            url, headers=_headers(jwt_payload, oid), json=body, timeout=30
        )
    except requests.RequestException as exc:
        raise VaultClientError(f"create_doc request failed: {exc}") from exc

    if response.status_code >= 300:
        raise VaultClientError(
            f"create_doc returned {response.status_code}: {response.text[:300]}"
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise VaultClientError(f"create_doc invalid JSON: {exc}") from exc

    if data.get("error"):
        raise VaultClientError(f"create_doc error flag set: {data.get('message')}")

    batch = data.get("batch_response") or []
    if not batch:
        raise VaultClientError("create_doc returned empty batch_response")

    entry = batch[0]
    vault_doc_id = entry.get("document_id")
    forms = entry.get("forms") or []
    if not vault_doc_id or not forms:
        raise VaultClientError(
            f"create_doc missing document_id/forms in response: {entry}"
        )

    return vault_doc_id, forms[0]


def replace_content(
    vault_doc_id: str,
    jwt_payload: Dict[str, Any],
    oid: str,
    file_index: int = DEFAULT_FILE_INDEX,
) -> Tuple[str, Dict[str, Any]]:
    """Request a new presigned POST form to replace content of an existing doc.

    Returns (vault_doc_id, form) where `form` is `{url, fields}` and is consumed
    by `upload_pdf_via_form`. The `forms` list is at the top level of the
    response (no `batch_response`).
    """
    url = f"{_vault_base_url()}/internal/api/v1/docs/{vault_doc_id}/replace-content?oid={oid}"
    body = {"content_type": PDF_CONTENT_TYPE}

    try:
        response = requests.post(
            url, headers=_headers(jwt_payload, oid), json=body, timeout=30
        )
    except requests.RequestException as exc:
        raise VaultClientError(f"replace_content request failed: {exc}") from exc

    if response.status_code >= 300:
        raise VaultClientError(
            f"replace_content returned {response.status_code}: {response.text[:300]}"
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise VaultClientError(f"replace_content invalid JSON: {exc}") from exc

    if data.get("error"):
        raise VaultClientError(f"replace_content error flag set: {data}")

    forms = data.get("forms") or []
    if not forms:
        raise VaultClientError(
            f"replace_content missing forms in response: {data}"
        )

    returned_doc_id = data.get("document_id") or vault_doc_id
    return returned_doc_id, forms[0]


def upload_pdf_via_form(form: Dict[str, Any], pdf_bytes: bytes) -> None:
    """Upload PDF bytes to an S3 presigned POST form (from create_doc)."""
    url = form.get("url")
    fields = form.get("fields") or {}
    if not url:
        raise VaultClientError("presigned form is missing 'url'")

    try:
        response = requests.post(
            url,
            data=fields,
            files={"file": ("document.pdf", pdf_bytes, PDF_CONTENT_TYPE)},
            timeout=60,
        )
    except requests.RequestException as exc:
        raise VaultClientError(f"presigned form upload failed: {exc}") from exc

    if response.status_code >= 300:
        raise VaultClientError(
            f"presigned form upload returned {response.status_code}: {response.text[:300]}"
        )


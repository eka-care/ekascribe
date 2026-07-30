"""EMR webhook integration.

Steps executed in `publish()`:
  1. Download markdown from S3 (falling back between base64 and raw).
  2. Resolve the doctor's PRINT template layout (parchi.eka.care).
  3. Render markdown + header/footer into a PDF (WeasyPrint).
  4. Upload the PDF to the Eka Care vault (create-or-replace semantics).
  5. Fire the `scribe.document.publish` webhook to the configured endpoint
     (defaults to messenger).
"""

import base64
import os
import time
from typing import Any, Dict, Optional
import uuid

from logs.custom_logger import get_logger
from voice2rx.services.publish.base import (
    BaseIntegration,
    PublishContext,
    PublishResult,
)
from voice2rx.services.publish.pdf.doctor_profile_client import (
    DoctorProfileError,
    fetch_print_layout,
)
from voice2rx.services.publish.pdf.pdf_builder import build_pdf
from voice2rx.services.publish.vault.vault_client import (
    VaultClientError,
    create_doc,
    replace_content,
    upload_pdf_via_form,
)
from voice2rx.services.storage.s3_service import s3_client
from voice2rx.services.webhooks import emit_raw

logger = get_logger(__name__)


PUBLISH_EVENT_ID = "scribe.document.publish"
SERVICE_ID = "v2rx"


class EMRWebhookIntegration(BaseIntegration):
    """Publish a document PDF to the Eka Care vault, then notify via webhook."""

    name = "emr_webhook"

    def publish(self, ctx: PublishContext, cfg: Dict[str, Any]) -> PublishResult:
        document_id = ctx.document.get("document_id", "")
        try:
            markdown_text = _download_markdown(ctx.document)
            layout = fetch_print_layout(ctx.oid, ctx.jwt_payload)
            pdf_bytes = build_pdf(markdown_text, layout)
            # _debug_dump_pdf(document_id, pdf_bytes)
            vault_doc_id = _upload_to_vault(ctx, pdf_bytes)
            _send_webhook(ctx, cfg)

            logger.info(
                "EMR webhook publish succeeded",
                document_id=document_id,
                vault_doc_id=vault_doc_id,
                severity="medium",
            )
            return PublishResult(
                integration=self.name,
                status="success",
                data={"vault_doc_id": vault_doc_id},
            )
        except (DoctorProfileError, VaultClientError) as exc:
            logger.error(
                "EMR webhook publish failed",
                document_id=document_id,
                error=str(exc),
                exc_info=True,
                severity="critical",
            )
            return PublishResult(
                integration=self.name, status="failed", error=str(exc)
            )
        except Exception as exc:
            logger.error(
                "EMR webhook publish unexpected error",
                document_id=document_id,
                error=str(exc),
                exc_info=True,
                severity="critical",
            )
            return PublishResult(
                integration=self.name, status="failed", error=str(exc)
            )

def _debug_dump_pdf(document_id: str, pdf_bytes: bytes) -> None:
    """Write the generated PDF to cwd when `PUBLISH_DEBUG_PDF` env is truthy.

    Intended for local testing only — lets the developer inspect the PDF
    produced by the pipeline before it is uploaded to the vault.
    """

    path = os.path.join(os.getcwd(), f"publish_debug_{document_id or 'unknown'}.pdf")
    try:
        with open(path, "wb") as fh:
            fh.write(pdf_bytes)
        logger.info("Debug PDF written", path=path, size_bytes=len(pdf_bytes))
    except Exception as exc:
        logger.warning("Failed to write debug PDF", path=path, error=str(exc), severity="low")


def _download_markdown(document: Dict[str, Any]) -> str:
    """Download the markdown content from S3, trying base64 first then raw."""
    document_path = document.get("document_path")
    if not document_path:
        raise VaultClientError("document has no document_path to download")

    bucket = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")
    try:
        obj = s3_client.get_object(Bucket=bucket, Key=document_path)
        raw_bytes = obj["Body"].read()
    except Exception as exc:
        raise VaultClientError(
            f"failed to download markdown from s3://{bucket}/{document_path}: {exc}"
        ) from exc

    try:
        decoded = base64.b64decode(raw_bytes, validate=True)
        return decoded.decode("utf-8")
    except Exception:
        try:
            return raw_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise VaultClientError(
                f"markdown payload is not utf-8 decodable: {exc}"
            ) from exc


def _upload_to_vault(ctx: PublishContext, pdf_bytes: bytes) -> str:
    """Upload PDF to the vault; return the vault_doc_id (new or existing)."""
    existing_vault_doc_id = ctx.document.get("vault_doc_id")

    if existing_vault_doc_id:
        vault_doc_id, form = replace_content(
            vault_doc_id=existing_vault_doc_id,
            jwt_payload=ctx.jwt_payload,
            oid=ctx.oid,
        )
    else:
        vault_doc_id, form = create_doc(
            document_id=ctx.document.get("document_id", ""),
            pdf_size=len(pdf_bytes),
            jwt_payload=ctx.jwt_payload,
            oid=ctx.oid,
        )

    upload_pdf_via_form(form, pdf_bytes)
    return vault_doc_id


def _send_webhook(ctx: PublishContext, cfg: Dict[str, Any]) -> None:
    """Send the scribe.document.publish event via the async webhook dispatcher.

    The integration config key is `webhook_endpoint` (generic — could be
    messenger or any other compatible endpoint). Falls back to the messenger
    default when unset.
    """
    payload = {
        "business_id": ctx.b_id,
        "client_id": ctx.client_id,
        "service_id": SERVICE_ID,
        "event_id": PUBLISH_EVENT_ID,
        "payload": {
            "service": SERVICE_ID,
            "event": PUBLISH_EVENT_ID,
            "event_time": int(time.time()),
            "encounter_id": ctx.encounter_id,
            "document_id": ctx.document.get("document_id", ""),
            "doctor_uuid": ctx.uuid,
            "transaction_id": str(uuid.uuid4()),
            "data" : {
                "encounter_id": ctx.encounter_id,
                "document_id": ctx.document.get("document_id", ""),
                "patient_oid" : ctx.oid,
                "event_time": int(time.time()),
                "doctor_uuid": ctx.uuid,
            }
            # "vault_document_id": 
        },
    }

    emit_raw(payload, url_override=cfg.get("webhook_endpoint"))

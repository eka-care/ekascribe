"""
Transcript upload (v1 convert-to-template).

POST /{txn_id}/convert-to-template — accepts a user-supplied transcript for a
session created without audio (the paste-transcript flow). It persists the
transcript (legacy logs/transcript.json + the transcript document) and marks
the session committed/processed. Structuring is NOT triggered here — the app
runs the AG-UI flow afterwards.

This is the surviving slice of the old convert-to-template endpoint; the
server-side template generation and translation branches were removed with
the agent pipeline.
"""

import os

from fastapi import APIRouter, BackgroundTasks, Request

from scribe.core.custom_logger import get_logger
from scribe.core.http import RequestHandler, ResponseFormatter
from scribe.repositories.blob import blob_repo
from scribe.schemas.template_schema import TemplateRequestData
from scribe.services.document_service import DocumentService
from scribe.services.transaction_service import TransactionService

logger = get_logger(__name__)

transcript_upload_router = APIRouter()

transaction_service = TransactionService()
document_service = DocumentService()

_S3_BUCKET = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")


def upload_transcript_in_background(
    txn_id: str,
    b_id: str,
    transcript_text: str,
    transaction_data: dict,
) -> None:
    """Persist a user-supplied transcript and mark the session processed.

    1. Write the pipeline-compatible transcript file (logs/transcript.json).
    2. Create/fill the transcript document from it (same helper the pipeline
       callback uses, so both flows converge on identical state).
    3. Flip the transaction to commit/success so the session reads as done.
    """
    try:
        s3_url = transaction_data.get("s3_url", "")
        folder = s3_url.removeprefix(f"s3://{_S3_BUCKET}/")
        ok = blob_repo.upload_json(
            _S3_BUCKET,
            f"{folder}/logs/transcript.json",
            {"text": transcript_text},
            txn_id,
        )
        if not ok:
            raise Exception("transcript upload to blob storage failed")

        document_service.create_transcript_document(
            session_id=txn_id,
            b_id=b_id,
            uuid_val=transaction_data.get("uuid", ""),
            s3_url=s3_url,
        )

        transaction_service.update_transaction(
            txn_id,
            b_id,
            {
                "user_status": "commit",
                "transcript_status": "success",
                "processing_status": "success",
            },
        )
        logger.info(
            "Direct transcript-only upload completed",
            txn_id=txn_id,
            b_id=b_id,
            severity="medium",
        )
    except Exception as e:
        logger.critical(
            "Direct transcript-only upload failed",
            txn_id=txn_id,
            b_id=b_id,
            error=str(e),
            exc_info=True,
            severity="critical",
        )


@transcript_upload_router.post("/{txn_id}/convert-to-template")
def upload_transcript(
    txn_id: str,
    request_data: TemplateRequestData,
    request: Request,
    background_tasks: BackgroundTasks,
):
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)

        if not request_data.transcript:
            return ResponseFormatter.error(
                code="invalid_request",
                message="transcript is required",
                txn_id=txn_id,
                b_id=b_id,
                status_code=400,
            )

        transaction_data = transaction_service.get_transaction(txn_id, b_id)

        if transaction_data.get("user_status", "") != "init":
            return ResponseFormatter.error(
                code="invalid_request",
                message=(
                    "Transaction not in init state for direct transcript. "
                    f"Current status: {transaction_data.get('user_status')}"
                ),
                txn_id=txn_id,
                b_id=b_id,
                status_code=400,
            )

        background_tasks.add_task(
            upload_transcript_in_background,
            txn_id=txn_id,
            b_id=b_id,
            transcript_text=request_data.transcript,
            transaction_data=transaction_data,
        )
        logger.info(
            "Direct transcript-only upload started in background",
            txn_id=txn_id,
            b_id=b_id,
        )
        return ResponseFormatter.success(
            message="Transcript upload started in background",
            txn_id=txn_id,
            b_id=b_id,
            additional_data={"status": "in-progress"},
            status_code=202,
        )

    except Exception as e:
        logger.critical(
            "CONVERT-TO-TEMPLATE: transcript upload failed",
            txn_id=txn_id,
            error=str(e) if str(e) else "",
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, txn_id)

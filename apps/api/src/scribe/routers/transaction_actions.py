"""
Transaction actions router.

- GET /history: latest sessions for the authenticated user (session list).
- GET /{txn_id}: transaction details.
- PATCH /{txn_id}: processing-status callback from the pipeline. When the
  raw transcript is done (transcript_status=success) the transcript
  document is created/updated in the background. Structuring happens on
  demand via the AG-UI flow — no server-side per-template generation.
- DELETE /{txn_id}: soft-archive a transaction.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Query, Request
from fastapi.responses import JSONResponse

from scribe.core.http import (
    RequestHandler,
    ResponseFormatter,
)
from scribe.core.choices import VOICE2RX_PROCESSING_STATUS
from scribe.core.custom_logger import get_logger
from scribe.core.time_utils import get_current_utc_timestamp
from scribe.services.document_service import DocumentService
from scribe.services.format_adapter import TemplateFormatConverter
from scribe.services.transaction_service import TransactionService

transaction_actions_router = APIRouter()

logger = get_logger(__name__)

# Initialize services
transaction_service = TransactionService()
document_service = DocumentService()


# NOTE: registered before /{txn_id} so the literal path wins route matching.
@transaction_actions_router.get(
    "/history", summary="List sessions for the authenticated user, newest first"
)
def list_transactions(
    request: Request,
    count: Optional[int] = Query(
        None, description="Number of latest sessions to fetch.", ge=1
    ),
    oid: Optional[str] = Query(None, description="patient oid"),
):
    try:
        token_data = RequestHandler.extract_token_data_from_request(request)
        b_id = token_data.get("b-id", None)
        uuid = token_data.get("uuid", None)
        if not uuid:
            return JSONResponse(
                {"status": "failed", "error": "UUID is required"},
                status_code=400,
            )

        if oid and b_id:
            transactions = transaction_service.get_patient_sessions(
                b_id=b_id, oid=oid, uuid=uuid, limit=count
            )
        else:
            transactions = transaction_service.get_transactions(uuid, limit=count)

        if not transactions:
            return JSONResponse(
                {"status": "failed", "error": "No transactions found"},
                status_code=404,
            )

        response_data = {
            "status": "success",
            "data": transactions,
            "retrieved_count": len(transactions),
        }

        return ResponseFormatter.json_response(response_data, status_code=200)

    except Exception as e:
        return ResponseFormatter.from_exception(e)


@transaction_actions_router.get("/{txn_id}")
def get_transaction_details(request: Request, txn_id: str):
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)
        logger.info(
            "GET TXN API: Getting transaction details", txn_id=txn_id, b_id=b_id
        )
        resp = transaction_service.get_transaction(txn_id, b_id)
        if resp.get("request_templates"):
            resp = TemplateFormatConverter.convert_to_old_format(resp)
        response_data = {
            "status": "success",
            "message": "Transaction details fetched successfully",
            "data": resp,
        }
        return ResponseFormatter.json_response(response_data, 200)

    except Exception as e:
        logger.critical(
            "GET TXN API: Error fetching transaction",
            txn_id=txn_id,
            b_id=b_id if "b_id" in locals() else None,
            exc_info=True,
            error=str(e) if str(e) else "",
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, txn_id, b_id)


@transaction_actions_router.patch("/{txn_id}")
def update_transaction_api(
    request: Request, 
    txn_id: str, 
    update_data: dict,
    background_tasks: BackgroundTasks
):
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)
        logger.info(
            "UPDATE TXN API: Updating transaction",
            txn_id=txn_id,
            b_id=b_id,
            payload=update_data,
        )

        # Get transaction data for file operations
        transaction_data = transaction_service.get_transaction(txn_id, b_id)
        s3_url = transaction_data.get("s3_url", "")

        # transcript is ready.
        # the ds-service sends us path status updates as processing completes. when the raw transcript is done it sets `transcript_status = success
        # when all downstream processing is done it sets `processing_status = success.
        transcript_status = update_data.get("transcript_status", "")
        if transcript_status == "success":
            logger.info(
                "UPDATE TXN API: Transcript status is success, creating transcript document",
                txn_id=txn_id,
                b_id=b_id,
                severity="medium",
            )
            # write the transcript into the documents folder in the background;
            # post processing reads it from the document folder only.
            user_uuid = transaction_data.get("uuid", "")
            background_tasks.add_task(
                document_service.create_transcript_document,
                session_id=txn_id,
                b_id=b_id,
                uuid_val=user_uuid,
                s3_url=s3_url,
            )

            # Structuring happens on demand via the AG-UI flow (scribe agent
            # runs) — no server-side per-template generation here.

        processing_status = update_data.get("processing_status", "")
        if processing_status == VOICE2RX_PROCESSING_STATUS.SUCCESS.value:
            if transaction_data.get("processed_at", None) is None:
                update_data["processed_at"] = update_data.get(
                    "processed_at", get_current_utc_timestamp()
                )

            txn_processing_status = transaction_data["processing_status"]
            if txn_processing_status == VOICE2RX_PROCESSING_STATUS.IN_PROGRESS.value:
                logger.info(
                    "UPDATE TXN API: transaction in progress",
                    txn_id=txn_id,
                    b_id=b_id,
                )

        if update_data.get("patient_details"):
            patient_details = update_data.get("patient_details")
            patient_oid = patient_details.get("oid")
            if patient_oid:
                update_data["patient_oid"] = patient_oid

        resp = transaction_service.update_transaction(txn_id, b_id, update_data)
        response = {
            "status": "success",
            "message": "Transaction updated successfully",
            "data": resp,
        }
        return ResponseFormatter.json_response(response, 200)

    except Exception as e:
        logger.critical(
            "UPDATE TXN API: Error updating transaction",
            txn_id=txn_id,
            b_id=b_id if "b_id" in locals() else None,
            exc_info=True,
            error=str(e) if str(e) else "",
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, txn_id, b_id)

@transaction_actions_router.delete("/{txn_id}")
def delete_transaction_item(request: Request, txn_id: str):
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)
        token_data = RequestHandler.extract_token_data_from_request(request)
        transaction_data = transaction_service.get_transaction(txn_id, b_id)

        if not _is_archive_authorized(token_data, transaction_data):
            return ResponseFormatter.error(
                code="invalid_request",
                message="You are not allowed to delete the transaction data",
                txn_id=txn_id,
                b_id=b_id,
                status_code=400,
            )

        archive_data = {
            "arc": True,
            "arc_at": int(datetime.now(timezone.utc).timestamp()),
        }
        _ = transaction_service.update_transaction(txn_id, b_id, archive_data)
        return ResponseFormatter.json_response(
            {
                "status": "success",
                "message": "Transaction deleted successfully"
            },
            status_code=200,
        )
    except Exception as e:
        logger.critical(
            "DELETE TXN API: Error archiving transaction",
            txn_id=txn_id,
            b_id=b_id if "b_id" in locals() else None,
            exc_info=True,
            error=str(e) if str(e) else "",
            severity="critical",
        )
        return ResponseFormatter.from_exception(
            e, txn_id, b_id if "b_id" in locals() else ""
        )


def _is_archive_authorized(token_data: dict, transaction_data: dict) -> bool:
    transaction_uuid = transaction_data.get("uuid")
    token_uuid = token_data.get("uuid")
    if transaction_uuid:
        return bool(token_uuid and str(token_uuid) == str(transaction_uuid))

    token_c_id = token_data.get("c-id")
    transaction_c_id = transaction_data.get("c_id")
    return bool(token_c_id and transaction_c_id and str(token_c_id) == str(transaction_c_id))

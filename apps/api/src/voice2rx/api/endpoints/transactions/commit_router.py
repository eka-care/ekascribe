"""
Refactored Commit API with clean three-layer architecture.
"""
from typing import Dict
from fastapi import APIRouter, BackgroundTasks, Request
from logs.custom_logger import get_logger

from voice2rx.api.endpoints.transactions.handlers import RequestHandler, ResponseFormatter
from voice2rx.services.transactions.transaction_service import TransactionService
from voice2rx.core.validation import validate_audio_files

logger = get_logger(__name__)

# Initialize router
commit_api_router = APIRouter()

# Initialize services
transaction_service = TransactionService()


@commit_api_router.post("/commit/{txn_id}")
async def commit_transaction(
    request: Request,
    background_tasks: BackgroundTasks,
    txn_id: str,
    body: Dict,
):
    """
    Commit a transaction and trigger processing.

    This endpoint:
    1. Validates the request
    2. Updates transaction status to COMMIT
    3. Triggers audio processing
    4. Sends message to SQS for structuring

    Args:
        request: FastAPI request object
        background_tasks: FastAPI background tasks
        txn_id: Transaction ID
        body: Request body containing audio_files and optional chunk_info

    Returns:
        JSONResponse with status
    """
    b_id = None
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)
        audio_files = body.get("audio_files", [])
        chunk_info = body.get("chunk_info")

        logger.info(
            "COMMIT API: Committing transaction",
            txn_id=txn_id,
            b_id=b_id,
            audio_files=audio_files,
            severity="medium",
        )

        validate_audio_files(audio_files)
        transaction_data = transaction_service.commit_transaction(
            txn_id, b_id,
            audio_files,
            chunk_info,
            background_tasks=background_tasks,
        )

        # send the request to sqs with transaction data and audio file pahts for structuring.
        sqs_success = transaction_service.send_commit_to_sqs(
            txn_id, b_id, 
            transaction_data, 
            audio_files
        )

        if not sqs_success:
            logger.error(
                "COMMIT API: Failed to send message to SQS",
                txn_id=txn_id,
                b_id=b_id,
                severity="critical",
            )

        logger.info(
            "COMMIT API: Transaction committed successfully",
            txn_id=txn_id,
            b_id=b_id,
            severity="medium",
        )

        return ResponseFormatter.success(
            message="Transaction committed successfully",
            txn_id=txn_id,
            b_id=b_id,
        )

    except Exception as e:
        logger.critical(
            f"COMMIT API: Error committing transaction {txn_id}",
            txn_id=txn_id,
            b_id=b_id if b_id else "",
            error=str(e),
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, txn_id, b_id)


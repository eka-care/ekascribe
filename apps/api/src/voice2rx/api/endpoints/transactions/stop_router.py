"""
Refactored Stop API with clean three-layer architecture.
"""
from typing import Dict
from fastapi import APIRouter, Request
from logs.custom_logger import get_logger

from voice2rx.api.endpoints.transactions.handlers import RequestHandler, ResponseFormatter
from voice2rx.services.transactions.transaction_service import TransactionService
from voice2rx.core.validation import validate_audio_files

logger = get_logger(__name__)

# Initialize router
stop_api_router = APIRouter()

# Initialize service
transaction_service = TransactionService()


@stop_api_router.post("/stop/{txn_id}")
async def stop_transaction(
    request: Request,
    txn_id: str,
    body: Dict,
):
    """
    Stop a transaction and update its status.

    This endpoint:
    1. Validates the request
    2. Updates transaction status to STOPPED
    3. Stores audio file information

    Args:
        request: FastAPI request object
        txn_id: Transaction ID
        body: Request body containing audio_files and optional chunk_info

    Returns:
        JSONResponse with status
    """
    b_id = ""
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)
        audio_files = body.get("audio_files", [])
        chunk_info = body.get("chunk_info")

        logger.info(
            "STOP API: Stopping transaction",
            txn_id=txn_id,
            b_id=b_id,
            audio_files=audio_files,
            severity="medium",
        )

        # validate audio files.
        validate_audio_files(audio_files)

        transaction_service.stop_transaction(
            txn_id, b_id, audio_files, chunk_info
        )

        logger.info(
            "STOP API: Transaction stopped successfully",
            txn_id=txn_id,
            b_id=b_id,
            severity="medium",
        )

        return ResponseFormatter.success(
            message="Transaction stopped successfully",
            txn_id=txn_id,
            b_id=b_id,
        )

    except Exception as e:
        logger.critical(
            f"STOP API: Failed to stop transaction {txn_id}",
            txn_id=txn_id,
            b_id=b_id if b_id else "",
            error=str(e),
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, txn_id, b_id)


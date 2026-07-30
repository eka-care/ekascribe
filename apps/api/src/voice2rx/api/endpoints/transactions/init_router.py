"""
Refactored Init API with clean three-layer architecture.
"""

from fastapi import APIRouter, BackgroundTasks, Path, Request

from logs.custom_logger import get_logger
from voice2rx.api.endpoints.transactions.handlers import (
    RequestHandler,
    ResponseFormatter,
)
from voice2rx.api.schemas.transaction import TransactionInitRequest
from voice2rx.choices import Action
from voice2rx.services import (
    AudioProcessingService,
    TransactionService,
)
from voice2rx.utils.eka_usage_client import record_safe as record_usage

logger = get_logger(__name__)

init_api_router = APIRouter()

# Initialize services (these will be reused across requests)
transaction_service = TransactionService()
audio_service = AudioProcessingService()


@init_api_router.post("/init/{txn_id}")
async def initialize_transaction(
    request: Request,
    background_tasks: BackgroundTasks,
    txn_id: str = Path(..., description="Transaction ID"),
    transaction_data: TransactionInitRequest = None,
):
    """
    Initialize a new transaction.

    This endpoint:
    1. Validates the int request and request headers.
    2. Creates a transaction record
    3. Processes templates and create prompts for custom templates and store in s3.
    4. Checks for pre-uploaded files and send to sqs for processing.
    5. Returns success response

    Args:
        request: FastAPI request object
        background_tasks: FastAPI background tasks
        txn_id: Unique transaction identifier
        transaction_data: Transaction initialization data

    Returns:
        JSONResponse with transaction details
    """
    b_id = ""
    try:
        headers = RequestHandler.extract_headers(request, txn_id)
        transaction_dict = transaction_data.model_dump(exclude_none=True)

        b_id = RequestHandler.extract_business_id_from_request(request)
        logger.info(
            "INIT API: Initializing transaction",
            txn_id=txn_id,
            b_id=b_id ,
            payload=transaction_dict,
            severity="medium",
        )

        prepared_data = transaction_service.initialize_transaction(
            txn_id,
            transaction_dict,
            headers,
        )

        record_usage(
            workspace_id=b_id,
            product="ekascribe",
            metric_type="transcription_session",
            metadata={"txn_id": txn_id},
            c_id=headers["token_data"].get("c-id"),
            idp=headers["token_data"].get("idp"),
        )

        # create audio metadata record in background, only if transaction initialized successfully.
        # no need to create entry for failed transactions. [[verify this also once.]]
        background_tasks.add_task(
            audio_service.create_audio_metadata,
            txn_id=txn_id,
            b_id=b_id,
            amazon_trace_id=headers.get("amazon_trace_id", ""),
        )

        # check for pre-uploaded files and , if some files are already uploaded
        # from client then push it to sqs for processing.

        # note [[learning]]: service layer should remain framework-agnostic and expose its own async/sync
        # functions that can be scheduled, but should not depend on FastAPI internals,
        # do not pass background_tasks to service layer.

        s3_url = prepared_data.get("s3_url")
        if s3_url:
            logger.info(
                "TRANSACTION_SERVICE: Checking for pre-uploaded files",
                txn_id=txn_id,
                b_id=b_id,
                s3_url=s3_url,
            )
            s3_files = transaction_service.check_for_preupload_files(
                s3_url, txn_id, b_id
            )

            if s3_files:
                logger.info(
                    f"INIT API: Found {len(s3_files)} pre-uploaded files. Adding SQS background task.",
                    txn_id=txn_id,
                    b_id=b_id,
                )
                background_tasks.add_task(
                    transaction_service.process_s3_files_and_send_to_sqs,
                    prepared_data,
                    s3_files,
                    Action.TRANSCRIPTION.value,
                )
            else:
                logger.info(
                    "INIT API: No pre-uploaded files found",
                    txn_id=txn_id,
                    b_id=b_id,
                )

        logger.info(
            "INIT API: Transaction initialized successfully",
            txn_id=txn_id,
            b_id=b_id,
            severity="medium",
        )

        return ResponseFormatter.success(
            message="Transaction initialized successfully",
            txn_id=txn_id,
            b_id=b_id,
            additional_data={
                "oid": prepared_data.get("oid", ""),
                "uuid": prepared_data.get("uuid", ""),
            },
            status_code=201,
        )

    except Exception as e:
        logger.critical(
            f"INIT API: Error initializing transaction {txn_id}",
            txn_id=txn_id,
            b_id=b_id if b_id else "",
            error=str(e) if str(e) else "",
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, txn_id, b_id)

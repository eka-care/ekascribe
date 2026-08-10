from fastapi.responses import JSONResponse
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks
from decimal import Decimal
from fastapi.encoders import jsonable_encoder
from fastapi import Request
from scribe.core.http import (
    RequestHandler,
    ResponseFormatter,
)

from scribe.core.choices import NON_TEMPLATE_DOCUMENT_ID, VOICE2RX_PROCESSING_STATUS, AudioStatus, DocumentType, Transfer
from scribe.repositories import TxnTemplateResultsORM
from scribe.services.document_service import DocumentService
from scribe.services.format_adapter import TemplateFormatConverter
from scribe.services.transaction_background_service import TransactionBackgroundService
from scribe.services.transaction_service import TransactionService
from scribe.services.populate_documents_service import PopulateDocumentsService
from scribe.core.custom_logger import get_logger
from scribe.schemas.transaction import AudioDataModel
from scribe.core.time_utils import get_current_utc_timestamp
from scribe.services.config_service import ConfigService


# todo : this needs to be refactored also.....
def convert_decimals(obj):
    if isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return float(obj)
    else:
        return obj


transaction_actions_router = APIRouter()

from scribe.repositories.audio_details_orm import AudioDetailsORM

audio_repo = AudioDetailsORM()

logger = get_logger(__name__)

# Initialize services
config_service = ConfigService()
transaction_service = TransactionService()
txn_template_results_repo = TxnTemplateResultsORM()
transaction_background_service = TransactionBackgroundService()
populate_documents_service = PopulateDocumentsService()
document_service = DocumentService()



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
        is_connect_client, c_id = RequestHandler.is_connect_client(request)
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
                "UPDATE TXN API: Transcript status is success, copying transcript to new location",
                txn_id=txn_id,
                b_id=b_id,
                severity="medium",
            )
            # copy the transcript to the documents folder in the background. it will be directly fetch from the doucment folder only
            # for post processing 
            user_uuid = transaction_data.get("uuid", "")
            background_tasks.add_task(
                populate_documents_service.populate_transcript,
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

        # --- if block end here ---
        output_template_result = update_data.get("output_template_result", {})
        processing_error = update_data.get("processing_error", None)

        if output_template_result or processing_error:
            user_uuid = transaction_data.get("uuid", "")
            background_tasks.add_task(
                populate_documents_service.populate_documents,
                session_id=txn_id,
                b_id=b_id,
                uuid_val=user_uuid,
                s3_url=s3_url,
                output_template_result=output_template_result,
                patch_api_call=True,
                processing_status=processing_status,
                transaction_data=transaction_data,
                processing_error=processing_error,
            )     
        
        # if transaction actions 
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

# todo: below audio details API's also need to be refactored and moved to the audio_repository
@transaction_actions_router.patch("/audio-details/{txn_id}")
def update_audio_details(request: Request, txn_id: str, audio_data: AudioDataModel):
    """
    Update audio details.
    """
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)
        logger.info(
            "UPDATE AUDIO DETAILS API: Updating audio details", txn_id=txn_id, b_id=b_id
        )
        # Audio metadata rows are keyed by (composite_key, record_type)
        key = {"composite_key": f"{b_id}#{txn_id}", "record_type": "METADATA"}
        existing_audio_record = audio_repo.get(key)
        if not existing_audio_record:
            logger.error(
                "UPDATE AUDIO DETAILS API: Audio record not found",
                txn_id=txn_id,
                b_id=b_id,
                severity="medium",
            )
            return JSONResponse(
                {"status": "failed", "error": "Audio record not found"}, status_code=404
            )

        # Convert AudioDataModel to dict and add timestamp
        update_data = audio_data.model_dump()
        update_data["updated_at"] = datetime.now(timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        update_data["status"] = AudioStatus.UPDATED.value

        try:
            audio_repo.update(key, update_data)
            response = {"success": True}
        except Exception as e:  # noqa: BLE001
            response = {"error": str(e)}

        if "error" in response:
            logger.error(
                "UPDATE AUDIO DETAILS API: Failed to update audio details",
                txn_id=txn_id,
                b_id=b_id,
                error=response["error"],
                severity="medium",
            )
            return JSONResponse(
                {"status": "failed", "error": response["error"]}, status_code=500
            )

        logger.info(
            "UPDATE AUDIO DETAILS API: Audio details updated successfully",
            txn_id=txn_id,
            b_id=b_id,
        )

        updated_item = jsonable_encoder(response.get("response").get("Attributes"))

        return JSONResponse(
            {
                "status": "success",
                "message": "Audio details updated successfully",
                "data": updated_item,
            },
            status_code=200,
        )

    except Exception as e:
        logger.critical(
            "UPDATE AUDIO DETAILS API: Error updating audio details",
            txn_id=txn_id,
            b_id=b_id if "b_id" in locals() else None,
            error=str(e) if str(e) else "",
            exc_info=True,
            severity="critical",
        )
        return JSONResponse({"status": "failed", "error": str(e)}, status_code=500)


def get_audio_quality_details(txn_id: str, b_id: str) -> dict:
    """
    Fetch audio quality details for chunk records from ekascribe-audio-details table.

    Args:
        txn_id (str): Transaction ID
        b_id (str): Business ID

    Returns:
        dict: Audio data which contains quality details
    """
    try:
        # Create composite key for querying
        composite_key = f"{b_id}#{txn_id}"

        # Records with sort key starting with "chunk"
        items = audio_repo.table.find(
            [
                ("composite_key", "eq", composite_key),
                ("record_type", "begins_with", "chunk"),
            ]
        )

        if not items:
            logger.warning(
                "AUDIO QUALITY: No audio quality details found",
                txn_id=txn_id,
                b_id=b_id,
                severity="medium",
            )
            return {"status": "failed", "error": "No audio quality details found"}

        logger.info(
            "AUDIO QUALITY: Successfully fetched audio quality details",
            txn_id=txn_id,
            b_id=b_id,
            total_chunks=len(items),
            composite_key=composite_key,
            audio_data=items,
        )

        return {"status": "success", "data": items}

    except Exception as e:
        logger.error(
            "AUDIO QUALITY: Error fetching audio quality details",
            txn_id=txn_id,
            b_id=b_id,
            error=str(e),
            exc_info=True,
            severity="medium",
        )
        return {"status": "failed", "error": str(e)}

from fastapi.responses import JSONResponse
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks
from decimal import Decimal
from fastapi.encoders import jsonable_encoder
from fastapi import Request
from voice2rx.api.endpoints.template_result import (
    generate_template_in_background,
    generate_integration_template_in_background,
)
from voice2rx.api.endpoints.transactions.handlers import (
    RequestHandler,
    ResponseFormatter,
)
from boto3.dynamodb.conditions import Key

from voice2rx.choices import NON_TEMPLATE_DOCUMENT_ID, VOICE2RX_PROCESSING_STATUS, AudioStatus, DocumentType, Transfer
from voice2rx.model_orms import TxnTemplateResultsORM
from voice2rx.services.documents.document_service import DocumentService
from voice2rx.services.messaging.process_fhir_data import process_fhir_data
from voice2rx.services.storage.dynamodb_service import DynamoDBOperations
from voice2rx.services.templates.format_adapter import TemplateFormatConverter
from voice2rx.services.transactions.result_service import ResultService
from voice2rx.services.transactions.transaction_background_service import TransactionBackgroundService
from voice2rx.services.transactions.transaction_service import TransactionService
from voice2rx.services.messaging.webhook import send_webhook_notification
from voice2rx.services.documents.populate_documents_service import PopulateDocumentsService
from logs.custom_logger import get_logger
from voice2rx.api.schemas.transaction import AudioDataModel
from voice2rx.utils.time_utils import get_current_utc_timestamp
from voice2rx.services.config_service import ConfigService
from voice2rx.services.transactions.result_service import OUTPUT_TEMPLATES
from voice2rx.services.webhooks import (
    ScribeEvent,
    build_session_data,
    build_transcript_data,
    emit,
)


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
from scribe_core.db import get_dynamo_resource

dynamodb = get_dynamo_resource()
table = dynamodb.Table("voice2rx_transactions")
db_ops = DynamoDBOperations("voice2rx_transactions")
audio_table = dynamodb.Table("ekascribe-audio-details")
audio_db_ops = DynamoDBOperations("ekascribe-audio-details")

logger = get_logger(__name__)

# Initialize services
config_service = ConfigService()
transaction_service = TransactionService()
result_service = ResultService()
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

            # the ds-service JWT has no c-id, so fall back to the c_id stored
            # on the transaction at init
            emit(
                ScribeEvent.TRANSCRIPT_GENERATE,
                b_id=b_id,
                c_id=c_id or transaction_data.get("c_id", ""),
                txn_id=txn_id,
                data=build_transcript_data(txn_id),
            )

            # once the transcripts exists, we can start the structring the template outputs in the background.
            # case 1 : (custom -> visual) templates : structured here the backend by spawining one background agent per template document.
            # case 2: integration templates that the backend generates iteself (rather then receiving from the ds-service): 
                    # a seperate background agent generates and stores there results.
            # case 3: clients that drive structuring by tehemselves via the streaming au-ui flow. 
                #  hack here ; clients might pass the template id in both init call and in on demand generate calls.
                # so the clients such as web, desktop will be excluded from this background generate ...  remove from init itself.
            templates_documents = transaction_data.get("request_templates", {}).get("visual", [])
            document_ids = [t.get("document_id") for t in templates_documents if t.get("document_id")]
            documents = document_service.get_documents_by_ids(document_ids=document_ids)
            for document in documents:
                if (
                    document.get("type")
                    not in [DocumentType.TRANSCRIPT, DocumentType.CONTEXT]
                    and document.get("template_id") != NON_TEMPLATE_DOCUMENT_ID
                ):
                    background_tasks.add_task(
                        generate_template_in_background,
                        txn_id,
                        document.get("template_id"),
                        b_id,
                        document.get("document_id"),
                        transaction_data,
                    )
                

            integration_templates = transaction_data.get("request_templates", {}).get("integration", [])
            integration_documents_ids = [
                t.get("document_id") for t in integration_templates
                if t.get("document_id") and t.get("template_id") not in OUTPUT_TEMPLATES
            ]
            if integration_documents_ids:
                integration_docs = document_service.get_documents_by_ids(document_ids=integration_documents_ids)
                for document in integration_docs:
                    background_tasks.add_task(
                        generate_integration_template_in_background,
                        txn_id,
                        document.get("template_id"),
                        b_id,
                        document.get("document_id"),
                        transaction_data,
                        document.get("document_name", ""),
                    )

        processing_status = update_data.get("processing_status", "")
        if processing_status == VOICE2RX_PROCESSING_STATUS.SUCCESS.value:
            if transaction_data.get("processed_at", None) is None:
                update_data["processed_at"] = update_data.get(
                    "processed_at", get_current_utc_timestamp()
                )

            txn_processing_status = transaction_data["processing_status"]
            if txn_processing_status == VOICE2RX_PROCESSING_STATUS.IN_PROGRESS.value:
                if is_connect_client:
                    audio_full_enabled = config_service.check_audio_full_enabled(b_id)
                    send_audio_url = (
                        audio_full_enabled
                        and transaction_data.get("transfer") == Transfer.VADED.value
                        and not config_service.check_audio_api_enabled(b_id)
                    )
                    background_tasks.add_task(
                        send_webhook_notification, txn_id, b_id, c_id, send_audio_url
                    )
                else:
                    logger.info(
                        "UPDATE TXN API: Skipping webhook - no client id",
                        txn_id=txn_id,
                        b_id=b_id,
                    )

                background_tasks.add_task(
                    process_fhir_data, transaction_data, txn_id, b_id, c_id
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
        if update_data.get("session_details"):
            session_details = update_data.get("session_details")
            patient_oid = session_details.get("oid")
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
        emit(
            ScribeEvent.SESSION_DELETE,
            b_id=b_id,
            c_id=transaction_data.get("c_id", ""),
            txn_id=txn_id,
            data=build_session_data(txn_id),
        )
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
    Update audio details in DynamoDB.
    """
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)
        logger.info(
            "UPDATE AUDIO DETAILS API: Updating audio details", txn_id=txn_id, b_id=b_id
        )
        key = {"txn_id": txn_id, "b_id": b_id}
        # Check if the item exists in audio table
        existing_audio_record = audio_table.get_item(
            Key={"txn_id": txn_id, "b_id": b_id}
        )
        if "Item" not in existing_audio_record:
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

        # Call the update_item function of DynamoDBOperations for audio table
        response = audio_db_ops.update_item(
            key=key,
            update_data=update_data,
        )

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

        # Query for records with sort key starting with "chunk"
        response = audio_table.query(
            KeyConditionExpression=Key("composite_key").eq(composite_key)
            & Key("record_type").begins_with("chunk"),
            ProjectionExpression="composite_key, record_type, quality",  # Only fetch required fields
            Select="SPECIFIC_ATTRIBUTES",
        )

        items = response.get("Items", [])

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

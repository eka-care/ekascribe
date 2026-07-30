from fastapi import APIRouter, Path, Request
from fastapi.responses import JSONResponse
from logs.custom_logger import get_logger
from datetime import datetime, timezone
from voice2rx.services.storage.dynamodb_service import DynamoDBOperations
from voice2rx.utils.custom_response import create_error_response, format_validation_error, format_generic_error
from voice2rx.utils.eka_usage_client import record_safe as record_usage
from pydantic import ValidationError
import orjson
import os

txn_metrics_router = APIRouter()
AUDIO_TABLE_NAME = os.getenv("AUDIO_TABLE_NAME", "ekascribe-audio-details")
dynamo_client = DynamoDBOperations(AUDIO_TABLE_NAME)

logger = get_logger(__name__) 

def extract_headers(request: Request, txn_id: str):
    headers = {txn_id: txn_id, "token_data": ""}
    
    for key, value in request.headers.items():
            key_lower = key.lower()
            if key_lower == "jwt-payload":
                jwt_data = orjson.loads(value)
                headers['token_data'] = jwt_data
                break
            
    return headers


@txn_metrics_router.patch("/{txn_id}")
async def update_txn_metrics(
    request: Request,
    txn_id: str = Path(..., description="Transaction ID")
):
    """
    Add transaction level information (input_token, output_token)
    """
    try:
        request_data = await request.json()
        headers = extract_headers(request, txn_id)
        token_data = headers['token_data']
        b_id = token_data.get("b-id", "") or token_data.get("c-id", "")
        
        if not b_id:
            logger.error("METRICS TRANSACTION PUT API: Missing business ID in headers", txn_id=txn_id, severity="medium")
            return create_error_response("MISSING_BUSINESS_ID", "b_id not found in headers", 400)
    
        composite_key = f"{b_id}#{txn_id}"
        key = {
            "composite_key": composite_key,
            "record_type": "METADATA"
        }
        item = {
            "txn_id": txn_id,
            "b_id": b_id,
            "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        }

        # Add all fields from request_data to item
        for field_key, field_value in request_data.items():
            item[field_key] = field_value

        result = dynamo_client.update_item(key, item)

        if "error" in result:
            logger.critical("METRICS TRANSACTION PUT API: DynamoDB update failed", error=result.get("error"), txn_id=txn_id, b_id=b_id, severity="medium")
            return create_error_response("UNKNOWN_ERROR", f"Failed to insert transaction metrics: {result['error']}", 500)
        
        logger.info("METRICS TRANSACTION PUT API: Successfully updated transaction metrics", txn_id=txn_id, b_id=b_id, severity="medium")
        return JSONResponse({
            "status": "success",
            "message": "Transaction metrics added successfully",
            "txn_id": txn_id,
            "bid": b_id
        }, status_code=201)
        
    except ValidationError as ve:
        logger.error("METRICS TRANSACTION PUT API: Validation error in endpoint", error=str(ve), txn_id=txn_id, severity="medium")
        return format_validation_error(ve, "VALIDATION_ERROR", 400)
    except Exception as e:
        logger.critical("METRICS TRANSACTION PUT API: Unexpected error in endpoint", error=str(e), txn_id=txn_id, severity="medium")
        return format_generic_error(e, "UNEXPECTED_ERROR", 500)


@txn_metrics_router.patch("/{txn_id}/chunk/{chunk_id}")
async def update_chunk_metrics(
    request: Request,
    txn_id: str = Path(..., description="Transaction ID"),
    chunk_id: str = Path(..., description="Chunk ID")
):
    """
    Add chunk level information for a transaction (audio_length etc)
    """
    try:
        # Parse and validate request body manually
        request_data = await request.json()
        headers = extract_headers(request, txn_id)
        token_data = headers['token_data']
        b_id = token_data.get("b-id", "") or token_data.get("c-id", "")
        
        if not b_id:
            logger.error("METRICS CHUNK PUT API: Missing business ID in headers", txn_id=txn_id, chunk_id=chunk_id, severity="medium")
            return create_error_response("MISSING_BUSINESS_ID", "b_id not found in headers", 400)
        
        composite_key = f"{b_id}#{txn_id}"
        record_type = f"chunk#{chunk_id}"
        current_time = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # Prepare the item to insert
        key = {
            "composite_key": composite_key,
            "record_type": record_type
        }
        item = {
            "b_id": b_id,
            "txn_id": txn_id,
            "created_at": current_time,
            "updated_at": current_time
        }
        
        # Add all fields from request_data to item
        for field_key, field_value in request_data.items():
            item[field_key] = field_value
            
        # Insert the item if it doesn't exist (using composite_key and record_type as unique constraint)
        result = dynamo_client.update_item(key, item)

        if "error" in result:
            logger.critical("METRICS CHUNK PUT API: DynamoDB update failed", error=result.get("error"), txn_id=txn_id, b_id=b_id, chunk_id=chunk_id, severity="medium")
            return create_error_response("UNKNOWN_ERROR", f"Failed to insert chunk metrics: {result['error']}", 500)

        audio_length = request_data.get("audio_length")
        if audio_length is not None:
            try:
                record_usage(
                    workspace_id=b_id,
                    product="ekascribe",
                    metric_type="transcription_minute",
                    quantity=float(audio_length),
                    metadata={"txn_id": txn_id, "chunk_id": chunk_id},
                    c_id=token_data.get("c-id"),
                    idp=token_data.get("idp"),
                )
            except (TypeError, ValueError) as e:
                logger.warning(
                    "METRICS CHUNK PUT API: Skipping usage record, invalid audio_length",
                    error=str(e),
                    audio_length=audio_length,
                    txn_id=txn_id,
                    chunk_id=chunk_id,
                    severity="medium",
                )

        logger.info("METRICS CHUNK PUT API: Successfully updated chunk metrics", txn_id=txn_id, b_id=b_id, chunk_id=chunk_id, severity="medium")
        return JSONResponse({
            "status": "success",
            "message": "Chunk metrics added successfully",
            "txn_id": txn_id,
            "bid": b_id
        }, status_code=201)

    except ValidationError as ve:
        logger.error("METRICS CHUNK PUT API: Validation error in endpoint", error=str(ve), txn_id=txn_id, chunk_id=chunk_id, severity="medium")
        return format_validation_error(ve, "VALIDATION_ERROR", 400)
    except Exception as e:
        logger.critical("METRICS CHUNK PUT API: Unexpected error in endpoint", error=str(e), txn_id=txn_id, chunk_id=chunk_id, severity="medium")
        return format_generic_error(e, "UNEXPECTED_ERROR", 500)
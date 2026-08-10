import boto3
import orjson
from fastapi import APIRouter, Path, Request, HTTPException, status
from fastapi.responses import JSONResponse
from logs.custom_logger import get_logger
from voice2rx.services.storage.dynamodb_service import DynamoDBOperations

logger = get_logger(__name__)
TABLE_NAME = "voice2rx_transactions"

consent_router = APIRouter()
db_ops = DynamoDBOperations(table_name=TABLE_NAME)

@consent_router.patch("/{txn_id}")
async def update_consent_status(
    request: Request,
    txn_id: str = Path(..., description="Transaction ID"),
    accepted: bool = True
):  # `accepted` is a query param
    """
    Endpoint to update consent for a transaction.
    """
    try:
        jwt_payload_header = request.headers.get("jwt-payload")
        if not jwt_payload_header:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="jwt-payload header not found.")

        jwt_resp = orjson.loads(jwt_payload_header)
        b_id = jwt_resp.get("b-id")

        if not b_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="b-id not found in jwt-payload.")

        logger.info(f"Updating consent for txn_id: {txn_id}, b_id: {b_id} with accepted: {accepted}")

        key = {"b_id": b_id, "txn_id": txn_id}
        update_data = {"consent": accepted}

        result = db_ops.update_item(key, update_data)

        if "error" in result:
            logger.error(f"Failed to update consent for {txn_id}: {result['error']}", severity="critical")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result['error'])

        logger.info(f"Successfully updated consent for txn_id: {txn_id}", severity="medium")
        return JSONResponse(content={"status": "success", "message": "Consent updated successfully."}, status_code=200)

    except HTTPException as http_exc:
        # Re-raise HTTPException to let FastAPI handle it
        raise http_exc
    except Exception as e:
        logger.error(f"An unexpected server error occurred while updating consent for {txn_id}: {str(e)}", severity="critical")
        return JSONResponse({"error":{"code": "500", "message": str(e)}}, status_code=500)
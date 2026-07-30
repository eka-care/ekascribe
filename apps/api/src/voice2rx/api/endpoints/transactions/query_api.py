import orjson
from typing import Optional
from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse

from voice2rx.api.endpoints.transactions.handlers import (
    RequestHandler,
    ResponseFormatter,
)
from voice2rx.services import TransactionService
query_api_router = APIRouter()

@query_api_router.get(
    "/history", summary="List transactions by b_id, ordered by creation date"
)
async def list_transactions(
    request: Request,
    count: Optional[int] = Query(
        None, description="Number of latest transactions to fetch.", ge=1
    ),
    oid: Optional[str] = Query(None, description="patient oid")
):
    try:
        transaction_service = TransactionService()
        token_data = RequestHandler.extract_token_data_from_request(request)
        b_id = token_data.get("b-id", None)
        uuid = token_data.get("uuid", None)
        if not uuid:
            return JSONResponse(
                {"status": "failed", "error": "UUID is required"},
                status_code=400,
            )
        
        if oid and b_id:
            transactions = transaction_service.get_patient_sessions(b_id=b_id,oid=oid, uuid=uuid, limit=count)
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

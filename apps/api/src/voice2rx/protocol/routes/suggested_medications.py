"""
Suggested Medications Route

GET /voice/v1/session/{session_id}/suggested-medications

Fetches medications from session template results, extracts them via LLM agent,
and enriches with Alchemist coded medication data.
"""

import json

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

from logs.custom_logger import get_logger
from voice2rx.services.suggested_medication_service import SuggestedMedicationService
from voice2rx.api.endpoints.transactions.handlers import (
    RequestHandler,
)

logger = get_logger(__name__)

suggested_medications_router = APIRouter()
suggested_medication_service = SuggestedMedicationService()


@suggested_medications_router.get(
    "/session/{session_id}/suggested-medications",
    tags=["suggested-medications"],
    summary="Get Suggested Medications",
    description="Extract medications from session template results and enrich via Alchemist search",
    responses={
        200: {"description": "Medications retrieved successfully"},
        400: {"description": "Bad request - missing session ID or auth"},
        404: {"description": "Session not found"},
        500: {"description": "Internal server error"},
    },
)
async def get_suggested_medications(
    request: Request,
    session_id: str,
):
    """
    Get suggested medications for a session.

    Extracts medications from the session's template results using an LLM agent,
    then enriches each medication by calling the Alchemist search API.
    """
    try:
        b_id = RequestHandler.extract_business_id_from_request(request=request)

        logger.info(
            "Suggested medications requested",
            session_id=session_id,
            b_id=b_id,
        )

        result = await suggested_medication_service.get_suggested_medications(
            session_id=session_id,
            b_id=b_id,
        )

        logger.info(
            "Suggested medications response",
            session_id=session_id,
            medication_count=len(result.get("medications", [])),
        )

        return JSONResponse(
            status_code=200,
            content=result,
        )

    except ValueError as e:
        logger.warning(
            "Session not found for suggested medications",
            session_id=session_id,
            error=str(e),
            severity="medium",
        )
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "error": {
                    "code": "session_not_found",
                    "message": str(e),
                }
            },
        )

    except Exception as e:
        logger.error(
            "Error retrieving suggested medications",
            session_id=session_id,
            error=str(e),
            exc_info=True,
            severity="medium",
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "Failed to retrieve suggested medications",
                }
            },
        )

"""
Patient Summary Route

GET /voice/v1/patient/summary - Generate or retrieve patient summary

Supports two flows:
1. Lucid API summary (when oid is provided)
2. Session-history agent summary (fallback or when no oid)
"""

import json
from typing import Optional

from fastapi import APIRouter, Query, Request, status
from fastapi.responses import JSONResponse

from logs.custom_logger import get_logger
from voice2rx.services.patient_summary_service import PatientSummaryService
from voice2rx.api.endpoints.transactions.handlers import (
    RequestHandler,
    ResponseFormatter,
)

logger = get_logger(__name__)

patient_summary_router = APIRouter()
patient_summary_service = PatientSummaryService()


def _extract_jwt_data(request: Request) -> dict:
    """Extract b_id from jwt-payload header."""
    jwt_payload = request.headers.get("jwt-payload", "{}")
    try:
        payload = json.loads(jwt_payload)
        return {
            "b_id": payload.get("b-id", ""),
            "uuid": payload.get("uuid", ""),
        }
    except Exception as e:
        logger.error(f"Error parsing jwt-payload: {e}", severity="medium")
        return {"b_id": "", "uuid": ""}


@patient_summary_router.get(
    "/patient/summary",
    tags=["patient-summary"],
    summary="Get Patient Summary",
    description="Generate or retrieve a patient summary from Lucid API or past session transcripts",
    responses={
        200: {"description": "Summary generated successfully"},
        400: {"description": "Bad request - missing required parameters"},
        500: {"description": "Internal server error"},
    },
)
async def get_patient_summary(
    request: Request,
    oid: str = Query(..., description="Patient OID"),
    flavour: str = Query("scribe", description="Flavour for Lucid API"),
):
    """
    Get patient summary.
    -- patient oid is always mandatory in API request.
    """
    try:
        auth_data = RequestHandler.extract_headers(request, "")
        b_id = RequestHandler.extract_business_id_from_request(request=request)

        if not oid:
            raise 

        logger.info(
            "Patient summary requested",
            b_id=b_id,
            oid=oid,
            flavour=flavour,
        )

        result = await patient_summary_service.get_patient_summary(
            b_id=b_id,
            oid=oid,
            flavour=flavour,
        )
        logger.info(
            "Patient summary response",
            b_id=b_id,
            oid=oid,
            source_type=result.get("source_type"),
            has_summary=bool(result.get("summary_text")),
        )

        return JSONResponse(
            status_code=200,
            content=result,
        )

    except Exception as e:
        logger.error(
            "Error generating patient summary",
            oid=oid,
            error=str(e),
            exc_info=True,
            severity="medium",
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "Failed to generate patient summary",
                }
            },
        )

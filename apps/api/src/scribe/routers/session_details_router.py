"""
Session details endpoint.

GET /voice/api/v1/sessions/{session_id}?presigned=true|false

Resource-reader for sessions. No polling, no lazy migration, no S3 reads on
the request path. Returns the transaction header + the documents list with
metadata (`audio_matrix` is a deprecated always-empty field kept for wire
compatibility). Presigned download URLs are attached only when the
caller passes ?presigned=true; otherwise clients should call
GET /voice/api/v1/documents/{document_id} to fetch a fresh URL on demand.

Response shape evolution:
- Additive only. New fields may appear on `data` or on documents.
  Clients MUST ignore unknown fields.
- `data.schema_version` is bumped only for breaking changes.
- New top-level components (e.g. consent, integration outputs) are added as
  new keys, never folded into existing ones.

Auth (strict): both JWT `uuid` and `b-id` must match the session's owner.
Any mismatch returns 404 to avoid leaking session existence.
"""

from fastapi import APIRouter, Query, Request

from scribe.core.custom_logger import get_logger
from scribe.core.http import (
    RequestHandler,
    ResponseFormatter,
)
from scribe.schemas.session_schema import SessionDetailsResponse
from scribe.core.exceptions import ResourceNotFoundException
from scribe.services.session_details_service import SessionDetailsService

logger = get_logger(__name__)

session_details_router = APIRouter()
session_details_service = SessionDetailsService()


@session_details_router.get(
    "/sessions/{session_id}",
    response_model=SessionDetailsResponse,
    summary="Get full session details (resource read; no polling)",
)
async def get_session_details(
    session_id: str,
    request: Request,
    presigned: bool = Query(
        False,
        description=(
            "If true, response includes presigned GET URLs for every "
            "document. Default false; clients should lazy-load via "
            "GET /voice/api/v1/documents/{document_id}."
        ),
    ),
    version: str = Query(
        default="",
        description="Upload URL contract version",
    ),
):
    b_id = ""
    try:
        token = RequestHandler.extract_token_data_from_request(request)
        jwt_uuid = token.get("uuid", "")
        b_id = token.get("b-id", "")

        if not jwt_uuid or not b_id:
            raise ResourceNotFoundException(
                f"Session not found: {session_id}",
                txn_id=session_id,
            )

        body, status_code = await session_details_service.get_session_details(
            session_id=session_id,
            jwt_uuid=jwt_uuid,
            jwt_b_id=b_id,
            presigned=presigned,
            flavour=request.headers.get("flavour", ""),
            version=version,
        )
        return ResponseFormatter.json_response(body, status_code=status_code)

    except Exception as e:
        logger.error(
            "GET SESSION DETAILS: failed",
            session_id=session_id,
            b_id=b_id or None,
            error=str(e),
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(
            e, txn_id=session_id, b_id=b_id
        )

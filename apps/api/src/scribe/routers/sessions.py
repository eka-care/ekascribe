"""
Session Protocol Routes

FastAPI endpoints for session lifecycle management according to
MedScribeAlliance Protocol Specification v0.1

Endpoints:
- POST /sessions - Create new session
- GET /sessions/{session_id} - Get session status
- POST /sessions/{session_id}/end - End session
"""

import os
import re
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks, Path, Body, Query, status
from fastapi.responses import JSONResponse
from typing import Dict, Optional

from scribe.core.custom_logger import get_logger

from scribe.core.exceptions import (
    BadRequestException,
    ResourceNotFoundException,
    Voice2RxException,
)
from scribe.core.choices import UserStatus, VOICE2RX_MODEL_TYPE
from scribe.schemas import (
    CreateSessionRequest,
    CreateSessionResponse,
    SessionProcessingResponse,
    SessionCompletedResponse,
    SessionPartialResponse,
    EndSessionResponse,
    ExpiredSessionResponse,
    SessionStatus,
    ErrorResponse,
    PatchSessionRequest,
    PatchSessionResponse,
    ProcessTemplateResponse,
    UploadType,
)

# NOTE(oss): streaming is feature-flagged (FEATURE_STREAMING); its heavy native
# deps (onnxruntime/pipecat) must not load at import time, so the import is
# deferred into the upload_type == STREAM branch below.
from scribe.services.adaptors import SessionAdaptor, TemplateAdaptor
from scribe.schemas.sessions import EndSessionRequest
from scribe.services.transaction_service import TransactionService
from scribe.services import process_template_service
from scribe.repositories.blob import blob_repo
from scribe.core.http import (
    RequestHandler,
    ResponseFormatter,
)

logger = get_logger(__name__)

sessions_router = APIRouter()

transaction_service = TransactionService()
session_adaptor = SessionAdaptor(transaction_service=transaction_service)
template_adaptor = TemplateAdaptor()


def extract_headers(request: Request) -> Dict[str, str]:
    """Extract required headers from request"""
    headers = {}

    jwt_payload = request.headers.get("jwt-payload", "{}")
    try:
        import json

        payload = json.loads(jwt_payload)
        headers["b_id"] = payload.get("b-id", "")
        headers["uuid"] = payload.get("uuid", "")
    except Exception as e:
        logger.error(f"Error extracting headers: {e}", severity="medium")
        headers["b_id"] = ""
        headers["uuid"] = ""

    headers["client_id"] = request.headers.get("client-id", "")
    headers["amazon_trace_id"] = request.headers.get("x-amzn-trace-id", "")
    headers["user_agent"] = request.headers.get("user-agent", "")

    return headers


@sessions_router.post(
    "/sessions",
    response_model=CreateSessionResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Session created successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request"},
        401: {"model": ErrorResponse, "description": "Authentication failed"},
        422: {"model": ErrorResponse, "description": "Validation error"},
    },
    tags=["sessions"],
    summary="Create Session",
    description="Creates a new voice capture session",
)
async def create_session(
    request: Request,
    session_request: CreateSessionRequest,
    version: Optional[str] = Query(
        default=None,
        description="Upload URL contract version.",
    ),
):
    """
    Create a new session for voice capture and extraction.

    This endpoint:
    1. Validates the request and templates
    2. Generates a unique session ID
    3. Initializes backend transaction
    4. Returns session details with upload URL
    """
    b_id = ""
    session_id = ""
    try:
        headers = RequestHandler.extract_headers(request, session_id)
        b_id = headers["token_data"].get("b-id", "")
        if not headers["token_data"].get("c-id"):
            headers["token_data"]["c-id"] = b_id

        is_valid, error_msg = await template_adaptor.validate_template_ids(
            session_request.templates, b_id
        )
        if not is_valid:
            raise BadRequestException(error_msg,txn_id=session_id, b_id=b_id)

        session_id = session_request.session_id or session_adaptor.generate_session_id()

        logger.info(
            "Creating protocol session",
            session_id=session_id,
            b_id=b_id,
            templates=session_request.templates,
            upload_type=session_request.upload_type,
        )

        backend_request = session_adaptor.protocol_to_backend_request(
            request=request,
            session_id=session_id,
            session_request=session_request,
            headers=headers,
        )

        transaction_data = transaction_service.initialize_transaction(
            txn_id=session_id,
            transaction_data=backend_request,
            headers=headers,
        )

        logger.info(
            "Backend transaction initialized",
            session_id=session_id,
            b_id=b_id,
            severity="medium",
        )

        protocol_response = session_adaptor.backend_to_protocol_response(
            session_id=session_id,
            backend_data=transaction_data,
            request=session_request,
            flavour=headers.get("flavour", ""),
            version=version or "",
        )

        if session_request.upload_type == UploadType.STREAM:
            raise HTTPException(
                status_code=400,
                detail="Streaming upload is not supported; use chunked or single.",
            )

        logger.info(
            "Protocol session created successfully",
            session_id=session_id,
            b_id=b_id,
            upload_url=protocol_response.upload_url,
            severity="medium",
        )

        return protocol_response

    except ValueError as e:
        logger.error(
            f"Validation error creating session: {e}",
            session_id=session_id,
            b_id=b_id,
            severity="critical",
        )
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error": {
                    "code": "invalid_request",
                    "message": str(e),
                }
            },
        )
    except Exception as e:
        logger.error(
            f"Error creating session: {e}",
            session_id=session_id,
            b_id=b_id,
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, session_id, b_id)


@sessions_router.get(
    "/sessions/{session_id}",
    responses={
        200: {"model": SessionCompletedResponse, "description": "Session completed"},
        202: {"model": SessionProcessingResponse, "description": "Session processing"},
        206: {"model": SessionPartialResponse, "description": "Session partial"},
        404: {"model": ErrorResponse, "description": "Session, template, or document not found"},
        410: {"model": ExpiredSessionResponse, "description": "Session expired"},
    },
    tags=["sessions"],
    summary="Get Session Status",
    description=(
        "Retrieves session status and extraction results if complete.\n\n"
        "Optionally narrow the result to a single document by passing "
        "`template_id` or `document_id` as query parameters: only that document "
        "is fetched instead of polling every document of the session. When only "
        "`template_id` is given, its document_id is resolved automatically. "
        "Returns 404 if the requested template/document does not exist."
    ),
)
async def get_session_status(
    request: Request,
    session_id: str = Path(...),
    template_id: Optional[str] = Query(
        default=None,
        description="If provided, fetch only the document for this template_id instead of all session documents",
    ),
    document_id: Optional[str] = Query(
        default=None,
        description="If provided, fetch only this document instead of all session documents",
    ),
    version: Optional[str] = Query(
        default=None,
        description="Upload URL contract version.",
    ),
):
    """
    Get the current status of a session.

    Returns different responses based on session state:
    - 202 Accepted: Session is still processing
    - 200 OK: Session completed successfully
    - 206 Partial Content: Session completed with partial results
    - 410 Gone: Session expired
    - 404 Not Found: Session doesn't exist

    When template_id or document_id is supplied, only that single document is
    fetched (the document_id is resolved from template_id when needed) instead
    of polling every document of the session.
    """
    b_id = ""
    try:
        headers = RequestHandler.extract_headers(request, session_id)
        b_id = headers.get("token_data", {}).get("b-id", "")

        logger.info(
            "Getting session status",
            session_id=session_id,
            b_id=b_id,
            template_id=template_id,
            document_id=document_id,
        )

        if document_id or template_id:
            backend_status = await session_adaptor.get_document_status(
                session_id,
                b_id,
                template_id=template_id,
                document_id=document_id,
            )
        else:
            backend_status = await session_adaptor.get_transaction_status(
                session_id,
                b_id,
            )

        protocol_response = session_adaptor.backend_status_to_protocol_response(
            session_id,
            backend_status,
            flavour=headers.get("flavour", ""),
            version=version or "",
        )

        session_status = protocol_response.get("status")

        if session_status == SessionStatus.COMPLETED:
            http_status = status.HTTP_200_OK
        elif session_status == SessionStatus.PARTIAL:
            http_status = status.HTTP_206_PARTIAL_CONTENT
        elif session_status == SessionStatus.FAILED:
            http_status = status.HTTP_200_OK
        elif session_status == SessionStatus.EXPIRED:
            http_status = status.HTTP_410_GONE
        else:
            http_status = status.HTTP_202_ACCEPTED

        logger.info(
            "Session status retrieved",
            session_id=session_id,
            b_id=b_id,
            status=session_status,
        )

        return ResponseFormatter.json_response(protocol_response, http_status)

    except Exception as e:
        logger.error(
            f"Error getting session status: {e}",
            session_id=session_id,
            b_id=b_id,
            exc_info=True,
            severity="medium",
        )
        return ResponseFormatter.from_exception(e, session_id, b_id)


@sessions_router.post(
    "/sessions/{session_id}/end",
    response_model=EndSessionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        202: {"description": "Session ended, processing started"},
        404: {"model": ErrorResponse, "description": "Session not found"},
        400: {"model": ErrorResponse, "description": "Session already ended"},
    },
    tags=["sessions"],
    summary="End Session",
    description="Explicitly ends a session and triggers processing",
)
async def end_session(
    request: Request,
    session_id: str = Path(...),
    session_request: Optional[EndSessionRequest] = Body(default=None),
):
    """
    End a session and trigger processing.

    This endpoint:
    1. Validates session exists and is not already ended
    2. Retrieves all uploaded audio files
    3. Commits backend transaction
    4. Returns processing status
    """
    b_id = ""
    try:
        headers = extract_headers(request)
        b_id = headers.get("b_id", "")

        logger.info(
            "Ending session",
            session_id=session_id,
            b_id=b_id,
            number_of_audio_files=session_request.audio_files_sent if session_request else None,
        )

        session_data = transaction_service.get_transaction(
            session_id,
            b_id,
        )

        if not session_data:
            raise ResourceNotFoundException(
                f"Session '{session_id}' does not exist",
                session_id=session_id,
                b_id=b_id,
            )

        audio_files = session_data.get("client_uploaded_files", [])
        # sort audio files by sequence number (e.g., 0.webm, 1.mp3, 2.wav)
        def _get_sort_key(x):
            try:
                # extracts the numeric part from the basename (e.g., "0.m4a" -> 0, "audio_1.webm" -> 1)
                filename = os.path.basename(x).split(".")[0]
                match = re.search(r'(\d+)$', filename)
                return int(match.group(1)) if match else 0
            except Exception:
                return 0
            
        s3_url = session_data.get("s3_url", "")
        parsed_url = urlparse(s3_url)
        bucket_name = parsed_url.netloc
        prefix = parsed_url.path.lstrip("/")

        s3_files = blob_repo.list_files(
            bucket_name,
            prefix,
            exclude_extensions=[".json", ".txt"],
        )

        audio_files = [f"s3://{bucket_name}/{f}" for f in s3_files]
        audio_files.sort(key=_get_sort_key)
        logger.info(
            "Retrieved audio files from S3 for session",
            session_id=session_id,
            b_id=b_id,
            audio_files_count=len(audio_files),
            audio_files=audio_files,
        )

        update_data = {
            "client_generated_files": audio_files,
            "client_uploaded_files": audio_files,
        }

        transaction_service.update_transaction(
            session_id,
            b_id,
            update_data,
        )
        
        transaction_data = transaction_service.commit_transaction(
            session_id,
            b_id,
            audio_files,
            chunk_info=None,
        )

        # send to SQS for processing
        transaction_service.enqueue_processing(
            session_id,
            b_id,
            transaction_data,
            audio_files,
        )

        logger.info(
            "Session ended successfully",
            session_id=session_id,
            b_id=b_id,
            audio_files_count=len(audio_files),
            severity="medium",
        )

        # create protocol response
        protocol_response = session_adaptor.create_end_session_response(
            session_id,
            audio_files,
            # number_of_audio_files=session_request.audio_files_sent,
        )

        return protocol_response

    except Exception as e:
        logger.error(
            f"Error ending session: {e}",
            session_id=session_id,
            b_id=b_id,
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, session_id, b_id)

@sessions_router.post(
    "/sessions/{session_id}/process/template",
    response_model=ProcessTemplateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        200: {"description": "AG-UI SSE stream (x-protocol: ag-ui)"},
        202: {"description": "Template generation started (x-protocol: agent)"},
        400: {"model": ErrorResponse, "description": "Unsupported x-protocol/x-format or invalid input"},
        404: {"model": ErrorResponse, "description": "Session, template or document not found"},
    },
    tags=["sessions"],
    summary="Process Template (from session)",
    description=(
        "Trigger template conversion using the template configured on the session "
        "(first entry of request_templates.visual), a document_id, or both. "
        "Dispatches on the x-protocol header: 'agent' (default, 202 + poll) "
        "or 'ag-ui' (SSE stream)."
    ),
    include_in_schema=False,
)
async def process_session_template_no_id(
    request: Request,
    background_tasks: BackgroundTasks,
    session_id: str = Path(...),
    document_id: Optional[str] = Query(default=None),
):
    return await process_template_service.process_session_template(
        request, background_tasks, session_id,
        template_id=None, document_id=document_id,
    )


@sessions_router.post(
    "/sessions/{session_id}/process/template/{template_id}",
    response_model=ProcessTemplateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        200: {"description": "AG-UI SSE stream (x-protocol: ag-ui)"},
        202: {"description": "Template generation started (x-protocol: agent)"},
        400: {"model": ErrorResponse, "description": "Unsupported x-protocol/x-format or invalid input"},
        404: {"model": ErrorResponse, "description": "Session, template or document not found"},
    },
    tags=["sessions"],
    summary="Process Template",
    description=(
        "Trigger template conversion for the given session and template_id. "
        "Dispatches on the x-protocol header: 'agent' (default, 202 + poll) "
        "or 'ag-ui' (SSE stream)."
    ),
)
async def process_session_template(
    request: Request,
    background_tasks: BackgroundTasks,
    session_id: str = Path(...),
    template_id: str = Path(...),
    document_id: Optional[str] = Query(default=None),
):
    return await process_template_service.process_session_template(
        request, background_tasks, session_id,
        template_id=template_id, document_id=document_id,
    )


@sessions_router.patch(
    "/sessions/{session_id}",
    response_model=PatchSessionResponse,
    responses={
        200: {"description": "Session updated"},
        404: {"model": ErrorResponse, "description": "Session not found"},
        409: {
            "model": ErrorResponse,
            "description": "mode/model update not allowed after the session is committed",
        },
        422: {"model": ErrorResponse, "description": "Validation error"},
    },
    tags=["sessions"],
    summary="Patch Session",
    description=(
        "Update session metadata (patient_details, user_status, processing_status, "
        "additional_data, language_hint, templates, session_mode, model). "
        "`session_mode` and `model` may only be changed before the session is "
        "committed (user_status != 'commit'), otherwise a 409 is returned."
    ),
)
async def patch_session(
    request: Request,
    session_id: str = Path(...),
    patch_request: PatchSessionRequest = Body(...),
):
    """
    Update an existing session.

    Validation:
    - Only fields declared in PatchSessionRequest are accepted (extra=forbid).
    - session_mode / model can only be updated before the session is committed;
      attempting to change them after commit is rejected with 409.
    """
    b_id = ""
    try:
        headers = RequestHandler.extract_headers(request, session_id)
        b_id = headers.get("token_data", {}).get("b-id", "")

        transaction_data = transaction_service.get_transaction(session_id, b_id)
        if not transaction_data:
            raise ResourceNotFoundException(
                f"Session '{session_id}' does not exist",
                session_id=session_id,
                b_id=b_id,
            )
    
        update_data = patch_request.model_dump(exclude_none=True)
        if not update_data:
            raise BadRequestException(
                "No fields supplied to update", txn_id=session_id, b_id=b_id
            )

        if (
            patch_request.session_mode is not None or patch_request.model is not None
        ) and transaction_data.get("user_status") == UserStatus.COMMIT.value:
            raise Voice2RxException(
                message="mode and model can only be updated before the session is committed",
                code="session_already_committed",
                status_code=409,
                details={"txn_id": session_id, "b_id": b_id},
            )

        for key in ("user_status", "processing_status"):
            value = update_data.get(key)
            if hasattr(value, "value"):
                update_data[key] = value.value

        if patch_request.session_mode is not None:
            update_data.pop("session_mode", None)
            update_data["mode"] = patch_request.session_mode.value

        if patch_request.model is not None:
            update_data.pop("model", None)
            model_type_mapping = {
                "pro": VOICE2RX_MODEL_TYPE.PRO.value,
                "lite": VOICE2RX_MODEL_TYPE.LITE.value,
            }
            update_data["model_type"] = model_type_mapping.get(
                patch_request.model.value, VOICE2RX_MODEL_TYPE.LITE.value
            )

        if patch_request.patient_details:
            update_data["patient_details"] = patch_request.patient_details
            patient_oid = patch_request.patient_details.get("oid")
            if patient_oid:
                update_data["patient_oid"] = patient_oid

        if patch_request.language_hint:
            update_data["input_language"] = patch_request.language_hint

        if patch_request.templates:
            update_data["request_templates"] = {
                "visual": [{"template_id": tid} for tid in patch_request.templates]
            }

        transaction_service.update_transaction(session_id, b_id, update_data)


        logger.info(
            "Protocol session patched",
            session_id=session_id,
            b_id=b_id,
            fields=list(update_data.keys()),
            severity="medium",
        )

        return PatchSessionResponse(session_id=session_id)

    except Exception as e:
        logger.error(
            f"Error patching session: {e}",
            session_id=session_id,
            b_id=b_id,
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, session_id, b_id)

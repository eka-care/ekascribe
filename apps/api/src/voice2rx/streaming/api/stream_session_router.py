"""
Provider-independent streaming session management.

POST /voice/v1/stream/sessions
  Creates (or re-registers) a streaming session and returns the WSS URL that
  the client (or telephony provider) should connect to for audio streaming.

Any client can use this endpoint:
  - Mobile apps streaming audio directly
  - Telephony webhook handlers (internally, after creating a backend session)
  - Any custom WebSocket audio client

Request body:
  {
    "session_id": "<existing protocol session_id from POST /voice/v1/sessions>",
    "b_id": "<business id>",
    "caller_number": "<optional — phone number for telephony callers>",
    "provider": "<optional — 'vobiz' | 'exotel' | 'plivo' | null for direct clients>",
    "additional_data": {}
  }

Response:
  {
    "stream_id": "<unique id for this stream>",
    "wss_url": "wss://host/voice/v1/stream/sessions/<stream_id>/audio"
  }
"""

import os
import secrets
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from logs.custom_logger import get_logger
from voice2rx.api.endpoints.transactions.handlers.request_handler import RequestHandler
from voice2rx.protocol.adaptors.session_adaptor import SessionAdaptor
from voice2rx.protocol.models.sessions import (
    CommunicationProtocol,
    CreateSessionRequest,
    UploadType,
)
from voice2rx.services.transactions.transaction_service import TransactionService
from voice2rx.streaming.session.stream_session_store import stream_session_store
from voice2rx.choices import TransactionMode

logger = get_logger(__name__)

stream_session_router = APIRouter()

_transaction_service = TransactionService()
_session_adaptor = SessionAdaptor(transaction_service=_transaction_service)

class CreateStreamSessionRequest(BaseModel):
    """Request body for creating a new streaming session."""

    session_id: Optional[str] = None
    b_id: Optional[str] = None
    uuid: Optional[str] = None
    caller_number: Optional[str] = None
    provider: Optional[str] = None
    additional_data: Optional[Dict[str, Any]] = None
    # auto commit for telephony sessions but not for other flows.
    commit_on_close: bool = True


class CreateStreamSessionResponse(BaseModel):
    """Response containing the stream_id and WSS URL for audio streaming."""

    stream_id: str
    wss_url: str
    session_id: str
    b_id: str


def _build_fake_headers(b_id: str, uuid: str) -> Dict[str, Any]:
    """Build synthetic request headers for machine-to-machine sessions."""
    return {
        "token_data": {
            "b-id": b_id,
            "c-id": b_id,
            "uuid": uuid,
            "oid": "",
        },
        "flavour": "stream",
        "version": "1.0",
        "sdk_version": "stream-0.1",
        "paid_user": True,
        "amazon_trace_id": "",
    }


def _generate_stream_id() -> str:
    return "str_" + secrets.token_hex(10)


@stream_session_router.post("/sessions", response_model=CreateStreamSessionResponse)
async def create_stream_session(
    body: CreateStreamSessionRequest, request: Request = None
):
    """
    Create or re-register a streaming session.
    If session_id is provided, re-uses an existing backend transaction (useful
    when the caller already created a session via POST /voice/v1/sessions).
    If session_id is omitted, a new backend transaction is created automatically.

    Identifiers (b_id, uuid) are resolved from the jwt-payload header when present
    (e.g. SDK clients behind the gateway) and fall back to the request body (e.g.
    telephony / machine-to-machine callers), so both flows keep working.

    Returns stream_id and wss_url for the WebSocket audio stream.
    """
    token_data = (
        RequestHandler.extract_token_data_from_request(request) if request else {}
    )
    b_id = token_data.get("b-id") or body.b_id
    uuid = token_data.get("uuid") or body.uuid

    if not b_id:
        raise HTTPException(
            status_code=400,
            detail="b_id is required: provide it in the request body or the jwt-payload header",
        )

    session_id = body.session_id
    if not session_id:
        session_id = _session_adaptor.generate_session_id()
        if token_data:
            headers = RequestHandler.extract_headers(request, session_id)
        else:
            headers = _build_fake_headers(b_id, uuid)

        headers["token_data"]["b-id"] = b_id
        headers["token_data"].setdefault("c-id", b_id)
        if uuid:
            headers["token_data"]["uuid"] = uuid
        headers["flavour"] = headers.get("flavour") or "stream"

        additional = body.additional_data or {}
        if body.provider:
            additional["provider"] = body.provider
        if body.caller_number:
            additional["caller_number"] = body.caller_number

        if additional and additional.get("template_id"):
            templates = [additional.pop("template_id")]
        else:
            templates = ["9d9675c6-b29b-424a-abac-99ddd3b8909c"]

        #!hack: for vikalp account
        language_code = "auto_detect"
        if b_id == "77088166996724":
            language_code = "ny"

        session_request = CreateSessionRequest(
            session_mode=TransactionMode.CONSULTATION,
            templates=templates,
            model=None,
            language_hint=[language_code],
            upload_type=UploadType.CHUNKED,
            communication_protocol=CommunicationProtocol.HTTP,
            additional_data=additional,
        )

        backend_request = _session_adaptor.protocol_to_backend_request(
            request=None,
            session_id=session_id,
            session_request=session_request,
            headers=headers,
        )

        try:
            transaction_data = _transaction_service.initialize_transaction(
                session_id,
                backend_request,
                headers,
            )
        except Exception:
            logger.exception(
                "Failed to initialize stream session transaction",
                session_id=session_id,
                b_id=b_id,
                severity="critical",
            )
            raise HTTPException(
                status_code=500,
                detail="Failed to initialize streaming session",
            )

        s3_url = transaction_data.get("s3_url", "")
        batch_s3_url = transaction_data.get("batch_s3_url", "")
    else:
        try:
            existing_txn = _transaction_service.get_transaction(session_id, b_id)
        except Exception:
            logger.exception(
                "Failed to fetch existing transaction for stream session",
                session_id=session_id,
                b_id=b_id,
                severity="critical",
            )
            raise HTTPException(
                status_code=404,
                detail=f"Session '{session_id}' not found",
            )
        s3_url = existing_txn.get("s3_url", "")
        batch_s3_url = existing_txn.get("batch_s3_url", "")

    stream_id = _generate_stream_id()

    await stream_session_store.save_session(
        stream_id,
        {
            "session_id": session_id,
            "b_id": b_id,
            "s3_url": s3_url,
            "batch_s3_url": batch_s3_url,
            "provider": body.provider,
            "caller_number": body.caller_number,
            "commit_on_close": body.commit_on_close,
            "status": "created",
        },
    )

    public_url = os.getenv("HOST", "https://api.dev.eka.care")
    ws_host = public_url.replace("https://", "").replace("http://", "")
    wss_url = f"wss://{ws_host}/voice/v1/stream/sessions/{stream_id}/audio"

    logger.info(
        "Stream session created",
        stream_id=stream_id,
        session_id=session_id,
        b_id=b_id,
        provider=body.provider,
        wss_url=wss_url,
        severity="medium",
    )

    return CreateStreamSessionResponse(
        stream_id=stream_id,
        wss_url=wss_url,
        session_id=session_id,
        b_id=b_id,
    )

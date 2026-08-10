"""
Refactored Result API with clean three-layer architecture.
All result polling goes through V2 (ekascribe_document table).
Lazy migration for old sessions without documents.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Query, Request
from logs.custom_logger import get_logger

from voice2rx.api.endpoints.transactions.handlers import (
    RequestHandler,
    ResponseFormatter,
)
from voice2rx.core.exceptions import ResourceNotFoundException
from voice2rx.services.transactions.result_service_v2 import ResultServiceV2
from voice2rx.services.documents.populate_documents_service import PopulateDocumentsService
from voice2rx.api.schemas.transaction import ResultUpdateBody, ResultUpdateResponse
from voice2rx.utils.custom_response import (
    format_validation_error,
)

logger = get_logger(__name__)


status_api_router_v3 = APIRouter()

# result service (v1) is not getting used now. its been kept only for the chunk transcript endpoint
# (TODO: chunk transcript also needs to be modified to fetch from documents instead of template results or logs/transcripts)

populate_documents_service = PopulateDocumentsService()
result_service_v2 = ResultServiceV2()
document_service = result_service_v2.document_service


@status_api_router_v3.get("/status/{session_id}")
async def voice2rx_status_v3(
    session_id: str,
    request: Request,
    template_id: str = None,
    transcript: bool = False,
    document_id: str = None,
    dlp: str = Query("false", alias="dlp")
):
    """
    Get transaction status and results (V3).

    All polling goes through V2 ResultServiceV2 (ekascribe_document table).
    Old sessions without documents are lazily migrated on first access.

    Args:
        session_id: Transaction ID
        request: FastAPI request object
        template_id: Optional template ID to filter results
        transcript: Optional flag to poll transcript only
        document_id: Optional document UUID for specific document polling
    """
    b_id = ""
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)
        logger.info(
            "STATUS API v3: Status check initiated",
            txn_id=session_id,
            b_id=b_id,
            template_id=template_id,
            document_id=document_id,
        )
        # document specific polling (if document_id provided or transcipt flag is true)
        if template_id == "transcript" or transcript:
            # get document Id where session_id = session_id and template_id = "transcript"
            document_id = document_service.get_document_id_by_session_and_template(session_id, "transcript")
            if not document_id:
                raise ResourceNotFoundException(
                    f"Transcript document not found for session {session_id}"
                )

        if document_id:
            doc_response, doc_status_code = await result_service_v2.poll_for_document(
                document_id, session_id, b_id
            )
            return ResponseFormatter.json_response(
                doc_response, status_code=doc_status_code
            )

        # poll for all the session documents (lazy migration happens inside if no documents found)
        transaction_data = await _ensure_documents_exist(session_id, b_id)
        if not transaction_data:
            raise ResourceNotFoundException("Session Not found")

        v2_response, v2_status_code = await result_service_v2.poll_for_session_documents(
            transaction_data, b_id, dlp.lower() == "true"
        )
        # NIC client special handling
        try:
            if b_id in ["EC_175308121952375", "EC_173754209749052"]:
                if (
                    v2_response["data"]["template_results"]["transcript"][0].get("status")
                    == "success"
                ):
                    v2_status_code = 200
        except (IndexError, KeyError):
            pass

        logger.info(
            "STATUS API v3: Status check completed",
            txn_id=session_id,
            b_id=b_id,
            status_code=v2_status_code,
        )

        return ResponseFormatter.json_response(
            v2_response, status_code=v2_status_code
        )

    except Exception as e:
        logger.critical(
            "STATUS API v3: Processing failed",
            txn_id=session_id,
            b_id=b_id if b_id else None,
            error=str(e),
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, session_id, b_id)


async def _ensure_documents_exist(session_id: str, b_id: str) -> Optional[Dict[str, Any]]:
    """
    Check if documents exist for a session. If not, trigger lazy migration
    from legacy template_results/output.json to ekascribe_document table.
    """
    transaction_data = result_service_v2.transaction_repo.get_transaction(
        session_id, b_id
    )

    if not transaction_data:
        logger.warning(
            "STATUS API v3: Transaction not found for lazy migration",
            txn_id=session_id,
            b_id=b_id,
            severity="medium",
        )
        return
    
    if result_service_v2.has_documents(session_id):
        return transaction_data

    logger.info(
        "STATUS API v3: No documents found, triggering lazy migration",
        txn_id=session_id,
        b_id=b_id,
    )


    s3_url = transaction_data.get("s3_url", "")
    uuid_val = transaction_data.get("uuid", "")

    await populate_documents_service.populate_documents(
        session_id=session_id,
        b_id=b_id,
        uuid_val=uuid_val,
        s3_url=s3_url,
        patch_api_call=False,
        prompt_s3_url=transaction_data.get("prompt_s3_url", None),
        transaction_data=transaction_data,
    )
    # this is to mark that the document migration has been done.
    transaction_data["__doc_migration"] = True
    return transaction_data


@status_api_router_v3.patch("/status/{session_id}", response_model=ResultUpdateResponse)
async def update_status(session_id: str, request: Request):
    """
    Update document content in the documents/ folder.

    Client sends a list of {document-id, data} where `data` is the
    base64-encoded text to be stored verbatim at
    {s3_url}/documents/{document_id}.txt (no decoding applied).

    Args:
        session_id: Transaction ID
        request: FastAPI request object with list of document updates

    Returns:
        ResultUpdateResponse with success/failure status
    """
    b_id = ""
    try:
        try:
            raw_body = await request.json()
            request_body = [ResultUpdateBody(**item) for item in raw_body]
        except Exception as e:
            return format_validation_error(e, "INVALID_REQUEST_BODY")

        b_id = RequestHandler.extract_business_id_from_request(request)
        logger.info(
            "UPDATE RESULT STATUS: Document update initiated",
            txn_id=session_id,
            b_id=b_id,
            document_count=len(request_body),
        )

        document_updates = [
            {"document_id": item.document_id, "data": item.data}
            for item in request_body
        ]
        updated_documents = result_service_v2.update_document_content(
            session_id, b_id, document_updates
        )
        logger.info(
            "UPDATE RESULT STATUS: Document update completed successfully",
            txn_id=session_id,
            b_id=b_id,
            updated_documents=updated_documents,
            severity="medium",
        )

        return ResponseFormatter.success(
            message=f"Successfully updated {len(updated_documents)} documents",
            txn_id=session_id,
            b_id=b_id,
        )

    except Exception as e:
        error_message = str(e)
        logger.error(
            "UPDATE RESULT STATUS: Error updating document content",
            txn_id=session_id,
            b_id=b_id if b_id else None,
            error=error_message,
            severity="critical",
        )
        return ResponseFormatter.from_exception(
            e, txn_id=session_id, b_id=b_id if b_id else None
        )


@status_api_router_v3.get("/transcript/{txn_id}/{file_name}")
async def get_transcript(txn_id: str, file_name: str, request: Request):
    """
    Get transcript of each audio chunk requested by txn_id and file name
    """
    try:
        if not file_name:
            raise ValueError("File name is required")

        jwt_token = RequestHandler.extract_token_data_from_request(request)
        if not jwt_token:
            raise ValueError("JWT token is required")

        b_id = jwt_token.get("b-id")
        transcript = result_service_v2.get_chunk_transcript(txn_id, file_name, b_id)
        return ResponseFormatter.json_response(transcript, status_code=200)

    except Exception as e:
        # logger.error(
        #     "GET TRANSCRIPT: Error getting transcript",
        #     txn_id=txn_id,
        #     file_name=file_name,
        #     b_id=b_id,
        #     error=str(e),
        # )
        return ResponseFormatter.from_exception(e, txn_id, file_name)

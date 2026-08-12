"""
Document CRUD Endpoints

POST   /documents                                                  - Create document + get presigned upload URL
GET    /documents/{document_id}                                    - Get document metadata + presigned download URL
GET    /sessions/{session_id}/documents                            - List all documents for a session
PUT    /documents/{document_id}                                    - Get presigned upload URL for client PUT
DELETE /documents/{document_id}                                    - Soft delete (archive) a document
"""

from fastapi import APIRouter, BackgroundTasks, Request
from scribe.core.custom_logger import get_logger

from scribe.core.http import (
    RequestHandler,
    ResponseFormatter,
)
from scribe.schemas.document_schema import CreateDocumentRequest
from scribe.schemas.transaction import ContextPatchRequest
from scribe.services.document_service import DocumentService
from scribe.services.context_patch_service import (
    append_document_to_context,
    merge_context_append,
    merge_context_remove,
)
from scribe.repositories.transaction_orm import TransactionORM, convert_decimals
from scribe.core.choices import DocumentType
from scribe.core.exceptions import ResourceNotFoundException
from scribe.core.time_utils import get_current_epoch_timestamp, iso_to_epoch

from scribe.services.document_tiptap_service import (
    save_tiptap_json,
    get_document_record,
)
from scribe.core.exceptions import InvalidTiptapJson

logger = get_logger(__name__)

document_router = APIRouter()
document_service = DocumentService()
transaction_repo = TransactionORM()
def _extract_uuid_from_request(request: Request) -> str:
    """Extract user UUID from JWT token in request headers."""
    token_data = RequestHandler.extract_token_data_from_request(request)
    return token_data.get("uuid", "")


def _validate_document_ownership(doc: dict, jwt_uuid: str, document_id: str) -> None:
    """Validate that the document belongs to the requesting user."""
    if doc.get("uuid") != jwt_uuid:
        raise ResourceNotFoundException(f"Document not found: {document_id}")



def _tiptap_enabled(tiptap_json: str | bool) -> bool:
    """Return True if the request includes ?tiptap_json=true (case-insensitive)."""
    return tiptap_json is True or (
        isinstance(tiptap_json, str) and tiptap_json.lower() == "true"
    )


_NON_UPDATABLE_FIELDS = {"document_id", "session_id", "created_at", "document_path"}


def _handle_create(body: CreateDocumentRequest, transaction: dict, jwt_uuid: str, b_id: str):
    """Create a new document, write an empty S3 file, append to CONTEXT if applicable."""
    s3_url = transaction.get("s3_url", "")
    current_epoch_time = get_current_epoch_timestamp()
    # type : context/transcript/custom/notes/integration

    doc = document_service.create_document(
        session_id=body.session_id,
        template_id=body.template_id,
        uuid_val=jwt_uuid,
        wid=b_id,
        doc_type=body.type,
        status="success",
        document_id=body.document_id,
        document_name=body.document_name,
        prompt_path=body.prompt_path,
        created_at=current_epoch_time,
        commit_at=current_epoch_time,
        processed_at=current_epoch_time,
    )

    document_id = doc["document_id"]
    file_key = document_service.write_document_content(
        s3_url=s3_url,
        document_id=document_id,
        content="",
    )
    document_service.update_document(document_id, {"document_path": file_key})
    doc["document_path"] = file_key

    if body.type == DocumentType.CONTEXT:
        merged_context = append_document_to_context(
            transaction.get("context"), document_id
        )
        update_result = transaction_repo.update_transaction(
            body.session_id, b_id, {"context": merged_context}
        )
        if not update_result.get("success"):
            raise RuntimeError(
                f"Failed to append document to transaction context: "
                f"{update_result.get('error', 'unknown error')}"
            )

    return doc, file_key, 201


def _handle_update(body: CreateDocumentRequest, jwt_uuid: str):
    doc = document_service.get_document(body.document_id)
    if not doc or doc.get("archived"):
        raise ResourceNotFoundException(f"Document not found: {body.document_id}")
    _validate_document_ownership(doc, jwt_uuid, body.document_id)

    update_data = {
        k: v
        for k, v in body.model_dump(exclude_none=True, exclude_unset=True).items()
        if k not in _NON_UPDATABLE_FIELDS
    }
    update_data.pop("tiptap_json", None)

    if update_data:
        document_service.update_document(body.document_id, update_data)
        doc.update(update_data)
    
    return doc, doc.get("document_path"), 200

@document_router.post("/documents")
async def create_document(body: CreateDocumentRequest, request: Request):
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)
        jwt_uuid = _extract_uuid_from_request(request)

        transaction = transaction_repo.get_transaction(body.session_id, b_id)
        if not transaction:
            raise ResourceNotFoundException(
                f"Transaction not found: {body.session_id}"
            )

        s3_url = transaction.get("s3_url", "")
        if not body.document_id:
            doc, file_key, status_code = _handle_create(
                body, transaction, jwt_uuid, b_id
            )
        else:
            doc, file_key, status_code = _handle_update(body, jwt_uuid)

        document_id = doc["document_id"]
        presigned_url = document_service.generate_presigned_upload_url(
            document_id, s3_url, document_path=file_key or None
        )

        response_data = {
            "document_id": document_id,
            "session_id": doc.get("session_id"),
            "template_id": doc.get("template_id"),
            "document_name": doc.get("document_name", ""),
            "type": "markdown",
            "document_type": doc.get("type", ""),
            "status": doc.get("status", ""),
            "errors": doc.get("errors", []),
            "warnings": doc.get("warnings", []),
            "usage_information": doc.get("usage_information", {}),
            "presigned_url": presigned_url,
            "created_at": doc.get("created_at", ""),
            "updated_at": doc.get("updated_at", ""),
        }
        
        tiptap_json=request.query_params.get("tiptap_json", "")
        if _tiptap_enabled(tiptap_json) and body.tiptap_json:
            try:
                save_tiptap_json(document_id, body.tiptap_json)
                response_data["tiptap_json"] = body.tiptap_json
            except InvalidTiptapJson as e:
                return ResponseFormatter.from_exception(e, body.session_id, "")

        return ResponseFormatter.json_response(
            {"status": "success", "data": response_data},
            status_code=status_code,
        )

    except Exception as e:
        logger.error(
            "CREATE DOCUMENT: Error creating/updating document",
            session_id=getattr(body, "session_id", ""),
            document_id=getattr(body, "document_id", ""),
            error=str(e),
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(
            e, getattr(body, "session_id", ""), ""
        )


@document_router.get("/documents/{document_id}")
async def get_document(document_id: str, request: Request):
    try:
        _ = RequestHandler.extract_business_id_from_request(request)
        jwt_uuid = _extract_uuid_from_request(request)

        doc = document_service.get_document(document_id)
        if not doc:
            raise ResourceNotFoundException(f"Document not found: {document_id}")

        _validate_document_ownership(doc, jwt_uuid, document_id)
        if doc.get("archived"):
            raise ResourceNotFoundException(f"Document has been deleted: {document_id}")
        presigned_url = document_service.generate_presigned_download_url(
            doc.get("document_path", "")
        )

        response_data = {
            "document_id": doc.get("document_id"),
            "session_id": doc.get("session_id"),
            "template_id": doc.get("template_id"),
            "document_name": doc.get("document_name", ""),
            "type": "markdown",
            "document_type": doc.get("type", ""),
            "status": doc.get("status", ""),
            "errors": doc.get("errors", []),
            "warnings": doc.get("warnings", []),
            "usage_information": doc.get("usage_information", {}),
            "presigned_url": presigned_url,
            "created_at": doc.get("created_at", ""),
            "updated_at": doc.get("updated_at", ""),
        }
        
        tiptap_record = {}
        try:
            tiptap_record = get_document_record(document_id) or {}
        except Exception as e:
            logger.warning(
                "GET DOCUMENT: Failed to fetch tiptap record for data flags",
                document_id=document_id,
                error=str(e),
            )
        
        tip_tap_data = tiptap_record.get("tiptap_json")
        response_data["tip_tap_data"] = tip_tap_data
        response_data["ag_ui_data"] = tiptap_record.get("agui_state")
        response_data["markdown_data"] = presigned_url if tip_tap_data is not None else None

        titap_json=request.query_params.get("tiptap_json", "")
        if _tiptap_enabled(titap_json) and tip_tap_data:
            response_data["tiptap_json"] = tiptap_record["tiptap_json"]

        return ResponseFormatter.json_response(
            {"status": "success", "data": convert_decimals(response_data)},
            status_code=200,
        )

    except Exception as e:
        logger.error(
            "GET DOCUMENT: Error fetching document",
            document_id=document_id,
            error=str(e),
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, document_id, "")

@document_router.delete("/documents/{document_id}")
def delete_document(document_id: str, request: Request):
    try:
        _ = RequestHandler.extract_business_id_from_request(request)
        jwt_uuid = _extract_uuid_from_request(request)

        doc = document_service.get_document(document_id)
        if not doc:
            raise ResourceNotFoundException(f"Document not found: {document_id}")

        _validate_document_ownership(doc, jwt_uuid, document_id)

        if doc.get("archived"):
            return ResponseFormatter.json_response(
                {"status": "success", "message": "Document already deleted"},
                status_code=200,
            )

        document_service.archive_document(document_id)

        return ResponseFormatter.json_response(
            {"status": "success", "message": "Document deleted successfully"},
            status_code=200,
        )

    except Exception as e:
        logger.error(
            "DELETE DOCUMENT: Error deleting document",
            document_id=document_id,
            error=str(e),
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, document_id, "")

def _enrich_past_sessions(past_sessions: list, b_id: str) -> list:
    enriched = []
    for entry in past_sessions:
        session_id = entry if isinstance(entry, str) else entry.get("session_id")
        if not session_id:
            continue
        date_epoch = None
        title = None
        try:
            past_txn = transaction_repo.get_transaction(session_id, b_id)
            if past_txn:
                session_date = past_txn.get("created_at")
                date_epoch = iso_to_epoch(session_date)
                # Same row already in hand — no extra read to carry the title.
                session_details = past_txn.get("session_details") or {}
                if isinstance(session_details, dict):
                    title = session_details.get("title") or None
        except Exception as e:
            logger.warning(
                "Failed to fetch past session for context enrichment",
                session_id=session_id,
                error=str(e),
                severity="medium",
            )
        enriched.append(
            {"session_id": session_id, "date_epoch": date_epoch, "title": title}
        )
    return enriched

def _apply_context_patch(
    session_id: str,
    b_id: str,
    patch: dict,
    merge_fn,
) -> dict:
    transaction = transaction_repo.get_transaction(session_id, b_id)
    if not transaction:
        raise ResourceNotFoundException(f"Transaction not found: {session_id}")

    merged = merge_fn(transaction.get("context"), patch)

    update_result = transaction_repo.update_transaction(
        session_id, b_id, {"context": merged}
    )
    if not update_result.get("success"):
        raise RuntimeError(
            f"Failed to update transaction context: "
            f"{update_result.get('error', 'unknown error')}"
        )
    return merged


@document_router.patch("/sessions/{session_id}/context")
def patch_session_context(
    session_id: str,
    body: ContextPatchRequest,
    request: Request,
):
    try:
        token_data = RequestHandler.extract_token_data_from_request(request=request)
        b_id = token_data.get("b-id")
        oid = token_data.get("oid")

        patch = body.context.model_dump(exclude_unset=True)

        if patch.get("attachments"):
            for attachment in patch["attachments"]:
                # client sends patient_oid; normalise to patient_id
                if attachment.get("patient_oid"):
                    attachment.setdefault("patient_id", attachment.pop("patient_oid"))
                if not attachment.get("patient_id"):
                    attachment["patient_id"] = oid

        if patch.get("past_sessions"):
            patch["past_sessions"] = _enrich_past_sessions(
                patch["past_sessions"], b_id
            )

        merged = _apply_context_patch(session_id, b_id, patch, merge_context_append)

        return ResponseFormatter.json_response(
            {"status": "success", "data": {"context": merged}},
            status_code=200,
        )

    except Exception as e:
        logger.error(
            "PATCH CONTEXT: Error appending to session context",
            session_id=session_id,
            error=str(e),
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, session_id, "")


@document_router.delete("/sessions/{session_id}/context")
def delete_session_context(
    session_id: str,
    body: ContextPatchRequest,
    request: Request,
):
    """
    Remove values from a session's transaction context. For each of
    past_sessions / documents / attachments in the payload, drop any matching
    entries from the existing list.
    """
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)
        patch = body.context.model_dump(exclude_unset=True)

        merged = _apply_context_patch(session_id, b_id, patch, merge_context_remove)

        return ResponseFormatter.json_response(
            {"status": "success", "data": {"context": merged}},
            status_code=200,
        )

    except Exception as e:
        logger.error(
            "DELETE CONTEXT: Error removing from session context",
            session_id=session_id,
            error=str(e),
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(e, session_id, "")

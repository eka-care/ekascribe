"""
Template Result Common Utilities

Shared utilities for the template conversion pipeline:
- Template status checking and initialization (document-first)
- S3 file path utilities
- Output encoding/decoding utilities
- External service fallback
"""

import base64
import os
import time
from scribe.core.custom_logger import get_logger
from scribe.repositories.transaction_orm import TransactionORM
from scribe.services.template_service import TemplateService
from scribe.core.time_utils import get_current_epoch_timestamp
from scribe.core.exceptions import (
    RequestFailureException,
)
from scribe.core.choices import DocumentType
from scribe.services.document_service import DocumentService


logger = get_logger(__name__)

# initialize shared repositories
transaction_repo = TransactionORM()
document_service = DocumentService()
template_service = TemplateService()
s3_vaded_bucket = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")


def check_and_initialize_documents(
    txn_id: str,
    template_id: str,
    b_id: str,
    transcript: bool = False,
    transaction_data: dict = None,
    document_id: str = None,
) -> dict:
    """
    Create a fresh ekascribe_document entry for this conversion request.
    Args:
        txn_id: Transaction ID
        template_id: Template ID
        b_id: Business ID
        transcript: Whether this is a direct transcript flow
        document_id: Existing document to process into (skips creation)

    Returns:
        dict with keys:
        - should_continue: bool - whether to proceed with generation
        - response: dict - response to return if should_continue is False
        - document_id: str - document UUID for this conversion
    """
    if not template_id:
        request_templates = transaction_data.get("request_templates", {}).get("visual", [])
        templates = request_templates[0] if request_templates else None
        template_id = templates.get("template_id") if templates else None
        if not template_id:
            raise RequestFailureException(
                "No template_id provided and no visual templates found in transaction data"
            )
        document_id = document_id or templates.get("document_id")

    # crate a fresh ekascribe_document entry for every conversion request
    doc_type = DocumentType.TRANSCRIPT if transcript else DocumentType.CUSTOM
    user_uuid = transaction_data.get("uuid", "")
    try:
        if not document_id:
            current_epoch_time = get_current_epoch_timestamp()
            template_details = template_service.get_template(template_id=template_id)
            doc = document_service.create_document(
                session_id=txn_id,
                template_id=template_id,
                document_name=template_details.get("title"),
                uuid_val=user_uuid,
                wid=b_id,
                doc_type=doc_type,
                status="in-progress",
                created_at=current_epoch_time,
                commit_at=current_epoch_time
            )
            document_id = doc["document_id"]
        else:
            # update in existing document.
            pass

    except Exception as e:
        logger.error(
            "Error creating document entry in check_and_initialize",
            txn_id=txn_id,
            template_id=template_id,
            error=str(e),
            severity="critical",
        )
        raise RequestFailureException(
            f"Failed to create document for template {template_id}: {str(e)}"
        )

    return {
        "should_continue": True,
        "response": None,
        "existing_result": None,
        "document_id": document_id,
        "template_id": template_id,
    }


def encode_template_output(output_data: str) -> str:
    """
    Encode template output to base64.

    Args:
        output_data: Raw output data

    Returns:
        Base64 encoded string
    """
    return base64.b64encode(output_data.encode()).decode()


def get_s3_bucket_name() -> str:
    """Get the S3 bucket name from environment."""
    return s3_vaded_bucket


def call_external_service(
    transcript_text: str, final_prompt: str, txn_id: str, response_type: str
) -> str:
    """
    Call external service for template generation (deprecated fallback).

    Args:
        transcript_text: Transcript text
        final_prompt: Prompt for generation
        txn_id: Transaction ID
        response_type: Response type (json or markdown)

    Returns:
        Generated output
    """
    import requests
    import orjson

    ds_service_url = "http://ekascribe.orbi.orbi/generate_output_for_custom_template"

    payload = {
        "transcript": str(transcript_text),
        "prompt": final_prompt,
        "mode": "pro",
        "response_type": response_type,
        "txn_id": txn_id,
    }

    start_time = time.time()

    headers = {"Content-Type": "application/json"}
    payload_bytes = orjson.dumps(payload)
    response = requests.post(ds_service_url, headers=headers, data=payload_bytes)

    logger.info(
        "External service call completed",
        txn_id=txn_id,
        elapsed=f"{time.time() - start_time:.2f}s",
        status_code=response.status_code,
        severity="medium",
    )

    if response.status_code != 200:
        raise RequestFailureException(
            f"External service returned status {response.status_code}"
        )

    return response.json().get("output", "")

"""
Response schemas for GET /voice/api/v1/sessions/{session_id}.

These models exist to give Swagger / OpenAPI a precise picture of the
response shape. They are intentionally permissive (most fields optional) so
new fields can be added additively without breaking older clients.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SessionDocumentPathParts(BaseModel):
    bucket: str = ""
    folder: str = ""
    filename: str = ""


class SessionDocument(BaseModel):
    document_id: str
    session_id: str
    template_id: str = ""
    document_name: str = ""
    type: str = "custom"
    status: str = "in-progress"
    errors: List[Any] = Field(default_factory=list)
    warnings: List[Any] = Field(default_factory=list)
    usage_information: Dict[str, Any] = Field(default_factory=dict)
    publish: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[Any] = None
    commit_at: Optional[Any] = None
    processed_at: Optional[Any] = None
    document_path: SessionDocumentPathParts = Field(
        default_factory=SessionDocumentPathParts
    )
    download_url: Optional[str] = None
    download_url_expires_at: Optional[int] = None
    vault_doc_id: Optional[str] = None
    lang: Optional[str] = None


class SessionDetailsData(BaseModel):
    schema_version: str

    session_id: str
    uuid: str
    b_id: str

    created_at: Optional[Any] = None
    expires_at: Optional[Any] = None
    upload_url: Optional[str] = None
    committed_at: Optional[Any] = None
    processed_at: Optional[Any] = None

    status: Optional[str] = None
    transfer: Optional[str] = None
    flavour: Optional[str] = None

    session_details: Dict[str, Any] = Field(default_factory=dict)
    additional_data: Dict[str, Any] = Field(default_factory=dict)

    audio_matrix: Dict[str, Any] = Field(default_factory=dict)

    documents: List[SessionDocument] = Field(default_factory=list)


class SessionDetailsResponse(BaseModel):
    status: str = "success"
    data: SessionDetailsData

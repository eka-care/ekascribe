from typing import Dict, List, Optional, Any
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from scribe.core.choices import NON_TEMPLATE_DOCUMENT_ID, DocumentType


class DocumentPathResponse(BaseModel):
    bucket: str = ""
    folder: str = ""
    filename: str = ""


class DocumentResponse(BaseModel):
    document_id: str
    session_id: str
    template_id: str
    document_name: str = ""
    type: str  # DocumentType enum value
    status: str
    errors: List[Any] = Field(default_factory=list)
    warnings: List[Any] = Field(default_factory=list)
    usage_information: Dict[str, Any] = Field(default_factory=dict)
    document_path: Optional[DocumentPathResponse] = None
    presigned_url: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]


class DocumentUploadResponse(BaseModel):
    document_id: str
    presigned_url: str


class AttachmentUploadResponse(BaseModel):
    s3_url: str
    filename: str
    content_type: str


class CreateDocumentRequest(BaseModel):
    document_id: Optional[str] = None
    session_id: str
    template_id: str = NON_TEMPLATE_DOCUMENT_ID
    type: DocumentType = DocumentType.CUSTOM
    status: str = "in-progress"
    document_name: Optional[str] = None
    errors: List[Any] = Field(default_factory=list)
    warnings: List[Any] = Field(default_factory=list)
    usage_information: Dict[str, Any] = Field(default_factory=dict)
    prompt_path: Optional[str] = None
    init_doc: Optional[bool] = None
    created_at: Optional[int] = None
    commit_at: Optional[int] = None
    processed_at: Optional[int] = None
    updated_at: Optional[int] = None
    publish_status: Optional[Dict[str, Any]] = Field(
        default=None,
        validation_alias=AliasChoices("publish", "publish_status"),
    )
    tiptap_json: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(use_enum_values=True, validate_by_name=True)

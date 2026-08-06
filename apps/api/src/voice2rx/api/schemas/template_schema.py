# voice2rx-be/voice2rx/api/schemas/template_schema.py

from pydantic import BaseModel, Field, validator
from typing import List, Optional
from enum import Enum
from datetime import datetime


def _validate_available_tools_value(v):
    from voice2rx.services.templates.ag_ui.tools.generic_tools.catalog import (
        validate_available_tools,
    )

    return validate_available_tools(v)

class FormatEnum(str, Enum):
    PARAGRAPH = "P"
    BULLET = "B"

# Section Schemas
class SectionCreate(BaseModel):
    title: str
    desc: str = ""
    format: FormatEnum
    example: str = ""

class SectionUpdate(BaseModel):
    title: Optional[str] = None
    desc: Optional[str] = None
    format: Optional[FormatEnum] = None
    example: Optional[str] = None

class SectionResponse(BaseModel):
    id: str
    title: str
    desc: str
    format: str
    example: str
    default: bool

class SectionsListResponse(BaseModel):
    items: List[SectionResponse]

# available_tools semantics: None/absent or "all" → every AG-UI emit tool
# (legacy behavior); "" → narrative only; else comma-separated tool names.
_AVAILABLE_TOOLS_FIELD = Field(
    None,
    description=(
        "AG-UI emit tools enabled for this template: 'all' or absent = every "
        "tool, '' = narrative only, else comma-separated tool names "
        "(e.g. 'add_list,add_table'). Ignored by *_meeting_notes "
        "templates."
    ),
)


# Template Schemas
class TemplateCreate(BaseModel):
    title: str
    desc: str = ""
    section_ids: List[str]
    type: str = "" # template type: default/custom/integration
    available_tools: Optional[str] = _AVAILABLE_TOOLS_FIELD

    @validator("available_tools")
    def _validate_available_tools(cls, v):
        return _validate_available_tools_value(v)

class TemplateUpdate(BaseModel):
    title: Optional[str] = None
    desc: Optional[str] = None
    section_ids: Optional[List[str]] = None
    available_tools: Optional[str] = _AVAILABLE_TOOLS_FIELD

    @validator("available_tools")
    def _validate_available_tools(cls, v):
        return _validate_available_tools_value(v)

class TemplateResponse(BaseModel):
    id: str
    title: str
    desc: str
    section_ids: List[str]
    default: bool
    is_favorite: bool
    available_tools: Optional[str] = None

class TemplatesListResponse(BaseModel):
    items: List[TemplateResponse]

# Response Schemas
class MessageResponse(BaseModel):
    msg: str

class SectionCreateResponse(MessageResponse):
    section_id: str

class SectionUpdateResponse(MessageResponse):
    section_id: str
    action: str  # "updated" or "created_custom"

class TemplateCreateResponse(MessageResponse):
    template_id: str

class SectionUpdateModel(BaseModel):
    title: Optional[str] = None
    desc: Optional[str] = None
    format: Optional[str] = None
    example: Optional[str] = None
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class TemplateUpdateModel(BaseModel):
    title: Optional[str] = None
    desc: Optional[str] = None
    section_ids: Optional[List[str]] = None
    available_tools: Optional[str] = None
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
class AiCreateTemplateRequest(BaseModel):
    """Input for AI-authoring a reusable template.

    Supply `content` (pasted text) and/or `file_base64` (an uploaded file).
    The backend reads PDFs and images with a vision model and extracts text
    from other documents (docx, rtf, txt, csv, md, json, ...) server-side, so
    callers no longer need to extract text themselves.
    `instruction` is optional steering, e.g. "generate SOAP notes".
    """
    content: Optional[str] = Field(None, description="Pasted/extracted text")
    instruction: Optional[str] = Field(None, description="Optional steering, e.g. 'generate SOAP notes'")
    file_base64: Optional[str] = Field(None, description="Base64 of an uploaded file (PDF/image read directly; docx/rtf/txt/csv/... extracted server-side)")
    media_type: Optional[str] = Field(None, description="MIME type, e.g. image/jpeg, application/pdf, .docx, text/csv")
    file_name: Optional[str] = Field(None, description="Original filename")

    @validator("content")
    def _require_some_input(cls, v, values):
        # full cross-field check lives in the service; this just trims.
        return v.strip() if isinstance(v, str) else v

class AiCreateTemplateResponse(BaseModel):
    """AI-authored template draft. `template_instructions` is markdown the FE
    drops straight into the raw-template editor (no structured sections)."""
    title: str
    desc: str
    template_instructions: str

class TemplateRequestData(BaseModel):
    template_id: Optional[str] = Field(None, description="Template ID for generation")
    transcript: Optional[str] = Field(None, description="Direct transcript input")

    # this is used to convert the given transcript or stored transcript to any other langueage.
    target_language: Optional[str] = Field(None, description="Target language for translation")

    @validator("target_language")
    def validate_target_language(cls, v):
        if v is None:
            return v
        
        valid_languages = ["eng", "hi", "ta", "te", "bn", "mr", "gu", "kn", "ml", "pa", "as"]
        if v not in valid_languages:
            raise ValueError(
                f"Invalid target_language. Must be one of: {', '.join(valid_languages)}"
            )
        return v
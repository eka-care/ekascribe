"""
Session Protocol Models

Pydantic models for session lifecycle management according to
MedScribeAlliance Protocol Specification v0.1
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from scribe.core.choices import TransactionMode, UserStatus, VOICE2RX_PROCESSING_STATUS


class SessionStatus(str, Enum):
    """Session status enumeration"""
    CREATED = "created"
    INITIALIZED = "initialized"
    RECORDING = "recording"
    PROCESSING = "processing"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"
    EXPIRED = "expired"


class UploadType(str, Enum):
    """Audio upload type enumeration"""
    CHUNKED = "chunked"
    SINGLE = "single"
    STREAM = "stream"


class CommunicationProtocol(str, Enum):
    """Communication protocol enumeration"""
    WEBSOCKET = "websocket"
    HTTP = "http"
    RPC = "rpc"


class ModelType(str, Enum):
    """Model type enumeration"""
    PRO = "pro"
    LITE = "lite"


class CreateSessionRequest(BaseModel):
    """
    Request model for creating a new session

    POST /sessions
    """
    session_id: Optional[str] = Field(
        default=None,
        min_length=16,
        max_length=32,
        description="Optional client-supplied session id. If omitted, the server generates one.",
        examples=["ses_abc123def456"]
    )

    session_mode: Optional[TransactionMode] = Field(
        default=TransactionMode.CONSULTATION,
        description="Session mode: consultation, dictation"
    )

    templates: List[str] = Field(
        default_factory=list,
        max_length=2,
        description="Template IDs to extract (max 2). See /templates endpoint.",
        examples=[["soap", "medications"]]
    )
    
    model: Optional[ModelType] = Field(
        default=ModelType.PRO,
        description="Model ID from discovery. Default: lite"
    )

    language_hint : Optional[List[str]] = Field(
        default=None,
        description=(
            "Audio-input language hints. Use codes from the discovery document / "
            "config API supported_languages (ISO 639-1, plus BCP-47 regional "
            "variants such as en-IN, zh-CN). Unrecognised codes are ignored."
        ),
        examples=[["en", "hi"]]
    )

    transcript_language: Optional[str] = Field(
        default=None,
        description=(
            "Language code for transcript output. Use a code from the discovery "
            "document / config API supported_languages (ISO 639-1, plus BCP-47 "
            "regional variants such as en-IN, zh-CN)."
        ),
        examples=["en"]
    )
    
    upload_type: UploadType = Field(
        ...,
        description="Audio upload method: chunked, single, or stream"
    )

    communication_protocol: Optional[CommunicationProtocol] = Field(
        default=None,
        description=(
            "Derived from upload_type by the server: stream → websocket, "
            "chunked/single → http. A client-supplied value is ignored."
        )
    )
    
    additional_data: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Pass-through data returned in webhooks and responses (max 4KB recommended)"
    )

    patient_details: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Patient demographic / identifier metadata. 'oid' is promoted to patient_oid for indexing."
    )

    @model_validator(mode="after")
    def derive_communication_protocol(self):
        """The server drives the communication protocol from the upload type:
        stream → websocket, chunked/single → http."""
        if self.upload_type == UploadType.STREAM:
            self.communication_protocol = CommunicationProtocol.WEBSOCKET
        else:
            self.communication_protocol = CommunicationProtocol.HTTP
        return self

    @field_validator('templates')
    @classmethod
    def validate_templates(cls, v):
        if v and len(v) > 2:
            raise ValueError("Maximum 2 templates allowed")
        return v
    
    @field_validator('language_hint', 'transcript_language')
    @classmethod
    def validate_language_codes(cls, v):
        if v:
            for code in v:
                if len(code) > 20:
                    raise ValueError(f"Language code must be up to 20 characters, got: {code}")
        return v

    # upload type should be the supported upload types from discovery.
    @field_validator("upload_type")
    @classmethod
    def validate_upload_type(cls, v):
        if v not in [
            UploadType.CHUNKED.value,
            UploadType.SINGLE.value,
            UploadType.STREAM.value,
        ]:
            raise ValueError(
                f"Upload type must be one of: {UploadType.CHUNKED.value}, {UploadType.SINGLE.value}, {UploadType.STREAM.value}"
            )
        return v



class CreateSessionResponse(BaseModel):
    """
    Response model for session creation
    
    POST /sessions → 201 Created
    """
    session_id: str = Field(
        ...,
        min_length=16,
        max_length=32,
        description="Unique session identifier",
        examples=["ses_abc123def456"]
    )
    
    status: SessionStatus = Field(
        ...,
        description="Current session status",
        examples=["created"]
    )
    
    created_at: datetime = Field(
        ...,
        description="ISO 8601 timestamp when session was created",
        examples=["2025-01-19T10:30:00Z"]
    )
    
    expires_at: datetime = Field(
        ...,
        description="ISO 8601 timestamp when session will expire",
        examples=["2025-01-19T11:30:00Z"]
    )
    
    upload_url: str | dict = Field(
        ...,
        description="URL endpoint for uploading audio files to this session",
        examples=["https://api.scribe.example.com/v1/sessions/ses_abc123def456/audio"]
    )

    storage_provider: Optional[str] = Field(
        default=None,
        description=(
            "Cloud storage provider for the upload_url. Set to 'aws' when "
            "upload_url is an AWS S3 presigned POST form; absent otherwise."
        ),
        examples=["aws"]
    )

    patient_details: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Patient demographic / identifier metadata supplied at session creation"
    )

    model_config = ConfigDict(use_enum_values=True)


class SessionProcessingResponse(BaseModel):
    """
    Response model for session in processing state
    
    GET /sessions/{id} → 202 Accepted
    """
    session_id: str = Field(...)
    status: SessionStatus
    created_at: datetime
    expires_at: datetime
    audio_files_received: int = Field(..., ge=0)
    audio_files: List[str]
    additional_data: Dict[str, Any] = Field(default_factory=dict)
    upload_url: Optional[str | dict] = Field(
        default=None,
        description="URL/presigned form for uploading audio files to this session"
    )
    transcript: Optional[str] = Field(
        default=None,
        description="Partial or complete transcript if available"
    )
    patient_details: Optional[Dict[str, Any]] = Field(default=None)

    model_config = ConfigDict(use_enum_values=True)


class SessionCompletedResponse(BaseModel):
    """
    Response model for completed session

    GET /sessions/{id} → 200 OK
    """
    session_id: str = Field(...)
    status: SessionStatus
    created_at: datetime
    completed_at: Optional[datetime] = None
    model_used: Optional[ModelType] = None
    language_detected: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=2,
        description="ISO 639-1 language code detected from audio"
    )
    audio_files_received: int = Field(..., ge=0)
    audio_files: List[str]
    additional_data: Dict[str, Any] = Field(default_factory=dict)
    upload_url: Optional[str | dict] = Field(
        default=None,
        description="URL/presigned form for uploading audio files to this session"
    )
    templates: List[Dict[str, Any]] = Field(
        default_factory=list,
        description=(
            "Template processing results. Each entry is a single-key object "
            "keyed by template_id, whose value holds the document status, data, "
            "document_id, and (for ekascribe-web) presigned download URL."
        )
    )
    transcript: Optional[str] = Field(
        default=None,
        description="Full transcript of audio conversation"
    )
    patient_details: Optional[Dict[str, Any]] = Field(default=None)

    model_config = ConfigDict(use_enum_values=True)


class SessionPartialResponse(BaseModel):
    """
    Response model for partially completed session

    GET /sessions/{id} → 206 Partial Content
    """
    session_id: str = Field(...)
    status: SessionStatus
    created_at: datetime
    completed_at: Optional[datetime] = None
    model_used: Optional[ModelType] = None
    language_detected: Optional[str] = Field(default=None, min_length=2, max_length=5)
    audio_files_received: int = Field(..., ge=0)
    audio_files_processed: int = Field(..., ge=0)
    audio_files: List[str]
    additional_data: Dict[str, Any] = Field(default_factory=dict)
    upload_url: Optional[str | dict] = Field(
        default=None,
        description="URL/presigned form for uploading audio files to this session"
    )
    templates: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Template processing results, one entry per document keyed by template_id"
    )
    transcript: Optional[str] = None
    processing_errors: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Non-fatal processing issues"
    )
    patient_details: Optional[Dict[str, Any]] = Field(default=None)

    model_config = ConfigDict(use_enum_values=True)

class EndSessionRequest(BaseModel):
    """
    Request model for ending a session 
    POST /sessions/{id}/end
    """
    audio_files_sent: Optional[int] = Field(
        default=None,
        ge=0,
        description="Optional count of audio files the client uploaded, used for logging/reconciliation.",
    )

class EndSessionResponse(BaseModel):
    """
    Response model for ending a session
    
    POST /sessions/{id}/end → 202 Accepted
    """
    session_id: str = Field(...)
    status: SessionStatus = Field(
        ...,
        description="Session status after ending (should be 'processing')"
    )
    message: str = Field(
        ...,
        description="Human-readable status message",
        examples=["Session ended. Processing started."]
    )
    audio_files_received: int = Field(..., ge=0)
    audio_files: List[str]

    model_config = ConfigDict(use_enum_values=True)


class ExpiredSessionResponse(BaseModel):
    """
    Response model for expired session
    
    GET /sessions/{id} → 410 Gone
    """
    session_id: str = Field(...)
    status: SessionStatus = Field(
        default=SessionStatus.EXPIRED,
        description="Session status (always 'expired')"
    )
    created_at: datetime
    expired_at: datetime
    message: str = Field(
        ...,
        description="Human-readable expiry reason",
        examples=["Session expired before processing was initiated"]
    )
    audio_files_received: int = Field(..., ge=0)
    audio_files: List[str]
    additional_data: Optional[Dict[str, Any]] = Field(default_factory=dict)
    upload_url: Optional[str | dict] = Field(
        default=None,
        description="URL/presigned form for uploading audio files to this session"
    )
    templates: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Empty or partial extraction results"
    )
    transcript: Optional[str] = Field(
        default=None,
        description="Null or partial transcript"
    )
    model_used: Optional[ModelType] = None
    language_detected: Optional[str] = None
    audio_files_processed: Optional[int] = Field(default=None, ge=0)
    patient_details: Optional[Dict[str, Any]] = Field(default=None)

    model_config = ConfigDict(use_enum_values=True)


class ProcessingStatus(str, Enum):
    """Backend processing status — mirrors VOICE2RX_PROCESSING_STATUS values."""
    SUCCESS = VOICE2RX_PROCESSING_STATUS.SUCCESS.value
    IN_PROGRESS = VOICE2RX_PROCESSING_STATUS.IN_PROGRESS.value
    SYSTEM_FAILURE = VOICE2RX_PROCESSING_STATUS.SYSTEM_FAILURE.value
    REQUEST_FAILURE = VOICE2RX_PROCESSING_STATUS.REQUEST_FAILURE.value
    CANCELLED = VOICE2RX_PROCESSING_STATUS.CANCELLED.value


class PatchSessionRequest(BaseModel):
    """
    Request model for PATCH /sessions/{session_id}.

    Only allowed while user_status == 'init' (gate enforced in route).
    Unknown fields are rejected (extra=forbid) so clients can't bypass the gate
    by smuggling backend-only fields.
    """
    model_config = ConfigDict(extra="forbid")

    patient_details: Optional[Dict[str, Any]] = Field(default=None)
    user_status: Optional[UserStatus] = Field(default=None)
    processing_status: Optional[ProcessingStatus] = Field(default=None)
    additional_data: Optional[Dict[str, Any]] = Field(default=None)
    language_hint: Optional[List[str]] = Field(default=None)
    templates: Optional[List[str]] = Field(default=None)
    session_mode: Optional[TransactionMode] = Field(
        default=None,
        description="Session mode: consultation, dictation. Updatable only before the session is committed.",
    )
    model: Optional[ModelType] = Field(
        default=None,
        description="Model type: pro or lite. Updatable only before the session is committed.",
    )

class PatchSessionResponse(BaseModel):
    """Response for PATCH /sessions/{session_id}."""
    session_id: str = Field(...)
    status: str = Field(default="success")
    message: str = Field(default="Session updated successfully")


class ProcessTemplateResponse(BaseModel):
    """Response for POST /sessions/{session_id}/process/template/{template_id}."""
    session_id: str = Field(...)
    template_id: str
    document_id: Optional[str] = None
    status: str = Field(default="in-progress")
    message: str = Field(default="Template generation in progress")
    poll_url: Optional[str] = Field(
        default=None,
        description="Session-status URL to poll for the generated document",
    )


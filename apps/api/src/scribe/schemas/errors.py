"""
Error Protocol Models

Pydantic models for error responses according to
MedScribeAlliance Protocol Specification v0.1
"""

from enum import Enum
from typing import Any, Dict, Optional

from pydantic import ConfigDict, BaseModel, Field


class ErrorCode(str, Enum):
    """Standard error codes"""
    
    # Authentication Errors (401)
    AUTHENTICATION_FAILED = "authentication_failed"
    TOKEN_EXPIRED = "token_expired"
    INVALID_API_KEY = "invalid_api_key"
    
    # Authorization Errors (403, 429)
    FORBIDDEN = "forbidden"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    
    # Resource Errors (404, 410)
    SESSION_NOT_FOUND = "session_not_found"
    TEMPLATE_NOT_FOUND = "template_not_found"
    WEBHOOK_NOT_FOUND = "webhook_not_found"
    SESSION_EXPIRED = "session_expired"
    
    # Request Errors (400)
    INVALID_REQUEST = "invalid_request"
    INVALID_AUDIO_FORMAT = "invalid_audio_format"
    CHUNK_TOO_LARGE = "chunk_too_large"
    INVALID_TEMPLATE = "invalid_template"
    MISSING_REQUIRED_FIELD = "missing_required_field"
    
    # Processing Errors (500, 422)
    PROCESSING_FAILED = "processing_failed"
    AUDIO_QUALITY_POOR = "audio_quality_poor"
    AUDIO_TOO_SHORT = "audio_too_short"
    LANGUAGE_UNSUPPORTED = "language_unsupported"
    
    # Server Errors (500, 503)
    INTERNAL_ERROR = "internal_error"
    SERVICE_UNAVAILABLE = "service_unavailable"


class ErrorDetail(BaseModel):
    """
    Error detail information
    """
    code: str = Field(
        ...,
        description="Machine-readable error code",
        examples=["invalid_audio_format"]
    )
    message: str = Field(
        ...,
        description="Human-readable error message",
        examples=["Audio format 'audio/mp3' is not supported"]
    )
    details: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional error context"
    )

    model_config = ConfigDict(use_enum_values=True)


class ErrorResponse(BaseModel):
    """
    Standard error response format
    
    All error responses follow this structure
    """
    error: ErrorDetail = Field(
        ...,
        description="Error information"
    )

    model_config = ConfigDict(use_enum_values=True)

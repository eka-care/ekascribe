"""
Protocol Pydantic Models

This module exports all protocol request/response models.
"""

from .sessions import (
    CreateSessionRequest,
    CreateSessionResponse,
    SessionProcessingResponse,
    SessionCompletedResponse,
    SessionPartialResponse,
    EndSessionResponse,
    ExpiredSessionResponse,
    SessionStatus,
    UploadType,
    CommunicationProtocol,
    ModelType,
    PatchSessionRequest,
    PatchSessionResponse,
    ProcessTemplateResponse,
    ProcessingStatus,
)

from .templates import (
    TemplateResult,
    TemplateError,
    ProcessingError,
    TemplateInfo,
    TemplatesListResponse,
)

from .discovery import (
    DiscoveryResponse,
    ServiceInfo,
    Endpoints,
    AuthenticationConfig,
    Capabilities,
    ModelConfig,
    LanguageConfig,
    OIDCConfig,
    ModelFeatures,
)

from .errors import (
    ErrorResponse,
    ErrorDetail,
    ErrorCode,
)

__all__ = [
    # Sessions
    "CreateSessionRequest",
    "CreateSessionResponse",
    "SessionProcessingResponse",
    "SessionCompletedResponse",
    "SessionPartialResponse",
    "EndSessionResponse",
    "ExpiredSessionResponse",
    "SessionStatus",
    "UploadType",
    "CommunicationProtocol",
    "ModelType",
    "PatchSessionRequest",
    "PatchSessionResponse",
    "ProcessTemplateResponse",
    "ProcessingStatus",

    # Templates
    "TemplateResult",
    "TemplateError",
    "ProcessingError",
    "TemplateInfo",
    "TemplatesListResponse",
    
    # Discovery
    "DiscoveryResponse",
    "ServiceInfo",
    "Endpoints",
    "AuthenticationConfig",
    "Capabilities",
    "ModelConfig",
    "LanguageConfig",
    "OIDCConfig",
    "ModelFeatures",
    # Errors
    "ErrorResponse",
    "ErrorDetail",
    "ErrorCode",
]

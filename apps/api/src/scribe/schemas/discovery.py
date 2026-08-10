"""
Discovery Protocol Models

Pydantic models for discovery endpoint according to
MedScribeAlliance Protocol Specification v0.1
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ServiceInfo(BaseModel):
    """Service metadata"""
    name: str = Field(
        ...,
        description="Human-readable service name",
        examples=["Voice2Rx Scribe Service"]
    )
    documentation_url: Optional[str] = Field(
        default=None,
        description="Link to service documentation"
    )
    support_email: Optional[str] = Field(
        default=None,
        description="Support contact email"
    )

    class Config:
        use_enum_values = True


class Endpoints(BaseModel):
    """API endpoints configuration"""
    base_url: str = Field(
        ...,
        description="Base URL for API endpoints",
        examples=["https://api.scribe.example.com/v1"]
    )
    webhooks_url: Optional[str] = Field(
        default=None,
        description="Webhook registration endpoint"
    )
    templates_url: Optional[str] = Field(
        default=None,
        description="templates endpoint url"
    )

    class Config:
        use_enum_values = True


class OIDCConfig(BaseModel):
    """OIDC-specific configuration"""
    issuer: str = Field(..., description="OIDC issuer URL")
    authorization_endpoint: str = Field(..., description="Authorization endpoint")
    token_endpoint: str = Field(..., description="Token endpoint")
    scopes_supported: List[str] = Field(
        default=["openid", "profile"],
        description="Supported OAuth scopes"
    )

    class Config:
        use_enum_values = True


class AuthenticationConfig(BaseModel):
    """Authentication methods and configuration"""
    supported_methods: List[str] = Field(
        ...,
        description="Supported auth methods: ['api_key'], ['oidc'], or both",
        examples=[["api_key", "oidc"]]
    )
    oidc: Optional[OIDCConfig] = Field(
        default=None,
        description="OIDC configuration if OIDC is supported"
    )

    class Config:
        use_enum_values = True


class Capabilities(BaseModel):
    """Service capabilities and limits"""
    audio_formats: List[str] = Field(
        ...,
        description="Supported audio MIME types",
        examples=[
            ["audio/webm;codecs=opus", "audio/wav", "audio/ogg"]
        ]
    )
    max_chunk_duration_seconds: int = Field(
        ...,
        description="Maximum audio chunk duration (≤20 recommended)",
        examples=[20]
    )
    upload_methods: List[str] = Field(
        ...,
        description="Supported upload methods",
        examples=[["chunked", "single", "stream"]]
    )
    webhook_delivery: bool = Field(
        default=True,
        description="Whether webhook delivery is supported"
    )
    client_sdk_delivery: bool = Field(
        default=True,
        description="Whether client SDK delivery is supported"
    )
    storage_providers: List[str] = Field(
        default=["aws"],
        description=(
            "Cloud storage providers used for audio uploads. Clients should "
            "implement an uploader per provider (e.g. aws, gcp). Currently "
            "only 'aws' is supported."
        ),
        examples=[["aws"]]
    )

    class Config:
        use_enum_values = True


class ModelFeatures(BaseModel):
    """Model-specific features"""
    realtime_transcription: bool = Field(
        default=False,
        description="Live transcription during recording"
    )
    speaker_diarization: bool = Field(
        default=False,
        description="Automatic speaker identification"
    )
    custom_templates: bool = Field(
        default=False,
        description="Support for custom template creation"
    )

    class Config:
        use_enum_values = True


class ModelConfig(BaseModel):
    """Model configuration and capabilities"""
    id: str = Field(
        ...,
        description="Unique model identifier used in API calls",
        examples=["pro", "lite"]
    )
    display_name: str = Field(
        ...,
        description="Human-readable name",
        examples=["Professional", "Lite"]
    )
    languages: List[str] = Field(
        ...,
        description="ISO 639-1 language codes supported",
        examples=[["en", "hi", "ta", "te"]]
    )
    max_session_duration_seconds: int = Field(
        ...,
        description="Maximum session length allowed",
        examples=[3600]
    )
    response_speed: Optional[str] = Field(
        default="standard",
        description="Processing speed: fast, standard, or thorough"
    )
    features: Optional[ModelFeatures] = Field(
        default=None,
        description="Feature availability flags"
    )

    class Config:
        use_enum_values = True


class LanguageConfig(BaseModel):
    """Language support configuration"""
    supported: List[str] = Field(
        ...,
        description=(
            "List of supported language codes (ISO 639-1, with BCP-47 regional "
            "variants where applicable, e.g. en-IN, zh-CN). Matches the "
            "supported_languages exposed by the config API."
        ),
        examples=[["en", "en-IN", "hi", "ta", "te", "zh-CN", "es", "fr"]]
    )
    auto_detection: bool = Field(
        default=True,
        description="Whether automatic language detection is supported"
    )

    class Config:
        use_enum_values = True


class DiscoveryResponse(BaseModel):
    """
    Discovery document response
    
    GET /.well-known/medscribealliance → 200 OK
    """
    protocol: str = Field(
        default="medscribealliance",
        description="Protocol identifier (must be 'medscribealliance')"
    )
    protocol_version: str = Field(
        default="0.1",
        description="Current protocol version"
    )
    supported_versions: List[str] = Field(
        default=["0.1"],
        description="All supported protocol versions"
    )
    service: ServiceInfo = Field(
        ...,
        description="Service metadata"
    )
    endpoints: Endpoints = Field(
        ...,
        description="API endpoints configuration"
    )
    authentication: AuthenticationConfig = Field(
        ...,
        description="Authentication methods and configuration"
    )
    capabilities: Capabilities = Field(
        ...,
        description="Service capabilities and limits"
    )
    models: List[ModelConfig] = Field(
        ...,
        description="Available model configurations"
    )
    languages: LanguageConfig = Field(
        ...,
        description="Language support configuration"
    )

    class Config:
        use_enum_values = True

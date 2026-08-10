"""
Template Protocol Models

Pydantic models for template listing and extraction results
according to MedScribeAlliance Protocol Specification v0.1
"""

from enum import Enum
from typing import Any, Dict, List, Optional, Union

from pydantic import ConfigDict, BaseModel, Field


class TemplateStatus(str, Enum):
    """Template processing status"""
    SUCCESS = "success"
    FAILED = "failed"
    PROCESSING = "processing"


class TemplateError(BaseModel):
    """
    Error information for failed template extraction
    """
    code: str = Field(
        ...,
        description="Machine-readable error code",
        examples=["extraction_failed"]
    )
    message: str = Field(
        ...,
        description="Human-readable error description",
        examples=["Could not extract medication information from audio"]
    )

    model_config = ConfigDict(use_enum_values=True)


class ProcessingError(BaseModel):
    """
    Non-fatal processing error for partial results
    """
    type: str = Field(
        ...,
        description="Category of the processing error",
        examples=["audio_file_skipped"]
    )
    message: str = Field(
        ...,
        description="Description of the issue",
        examples=["Audio file audio_2.webm skipped due to poor quality"]
    )
    file: Optional[str] = Field(
        default=None,
        description="Associated file if applicable",
        examples=["audio_2.webm"]
    )

    model_config = ConfigDict(use_enum_values=True)


class TemplateResult(BaseModel):
    """
    Template extraction result
    
    Used in session responses to show per-template status and data
    """
    status: TemplateStatus = Field(
        ...,
        description="Template processing state"
    )
    data: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = Field(
        default=None,
        description="Extracted structured data if successful. "
                    "Can be object or array depending on template."
    )
    error: Optional[TemplateError] = Field(
        default=None,
        description="Error information if status is 'failed'"
    )

    model_config = ConfigDict(use_enum_values=True)


class TemplateInfo(BaseModel):
    """
    Template information for discovery
    
    GET /templates response item
    """
    id: str = Field(
        ...,
        description="Unique template identifier for API calls",
        examples=["soap", "medications", "discharge_summary"]
    )
    name: str = Field(
        ...,
        description="Human-readable template name",
        examples=["SOAP Note", "Medications List"]
    )
    description: str = Field(
        ...,
        description="Brief description of template purpose",
        examples=["Standard Subjective, Objective, Assessment, Plan format"]
    )

    model_config = ConfigDict(use_enum_values=True)


class TemplatesListResponse(BaseModel):
    """
    Response model for templates listing
    
    GET /templates → 200 OK
    """
    templates: List[TemplateInfo] = Field(
        ...,
        description="List of available templates for authenticated user/EMR"
    )

    model_config = ConfigDict(use_enum_values=True)

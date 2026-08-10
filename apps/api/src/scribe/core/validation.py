"""
Common validation utilities.
"""
from typing import List, Optional
from .exceptions import (
    BusinessIdRequiredException,
    ValidationException,
    S3UrlRequiredException,
)
from scribe.core.choices import Transfer


def validate_business_id(b_id: Optional[str]) -> str:
    if not b_id:
        raise BusinessIdRequiredException()
    return b_id


def validate_audio_files(audio_files: Optional[List[str]]) -> List[str]:
    if not audio_files:
        raise ValidationException(
            message="List of audio files are mandatory",
            field="audio_files",
        )
    return audio_files


def validate_s3_urls(transfer_type: str, s3_url: Optional[str], batch_s3_url: Optional[str]) -> None:
    if transfer_type == Transfer.VADED.value and not s3_url:
        raise S3UrlRequiredException("S3")

    if transfer_type == Transfer.NON_VADED.value and not batch_s3_url:
        raise S3UrlRequiredException("Batch S3")


def extract_business_id_from_token(token_data: dict) -> str:
    b_id = token_data.get("b-id")
    if not b_id:
        # Fallback to c-id if b-id is not present
        b_id = token_data.get("c-id")
    
    return validate_business_id(b_id)


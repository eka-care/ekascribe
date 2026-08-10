from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional, Dict, Any, Set
from scribe.core.choices import VOICE2RX_MODEL_TYPE, TransactionMode, InputLanguage
from scribe.schemas.transaction import OutputFormatTemplate

ALLOWED_IMAGE_CONTENT_TYPES: Set[str] = {"image/png", "image/jpg", "image/jpeg"}
ALLOWED_IMAGE_UNITS: Set[str] = {"cm", "mm"}
ALLOWED_HEADER_FOOTER_TYPES: Set[str] = {"image", "margin"}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


class ImageUploadInput(BaseModel):
    type: str                           # mandatory: "image" or "margin"
    data: Optional[str] = None          # required only when type == "image"
    content_type: Optional[str] = None  # required only when type == "image"
    width: Optional[int] = None
    height: Optional[int] = None
    unit: str = "cm"


class ImageMetadata(BaseModel):
    type: str = "image"
    url: Optional[str] = None           # present for image, absent for margin
    width: Optional[int] = None
    height: Optional[int] = None
    unit: str = "cm"

class EkascribeConfigBase(BaseModel):
    auto_download: Optional[bool] = None
    scribe_enabled: Optional[bool] = None
    my_templates: Optional[List[str]] = None
    input_language: Optional[List[InputLanguage]] = None 
    output_format_template: Optional[List[OutputFormatTemplate]] = Field(default_factory=list)
    model_type: Optional[VOICE2RX_MODEL_TYPE] = Field(default=VOICE2RX_MODEL_TYPE.PRO.value)
    mode: Optional[TransactionMode] = None
    
    # Echo SDK Agent Configuration
    use_echo_agent: Optional[bool] = Field(
        default=True,
        description="Use Echo SDK agent for template generation (default: True)"
    )
    echo_agent_config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Echo SDK agent configuration overrides (provider, model, temperature, etc.)"
    )

    # clinic_name?: string;
    # specialization?: string;
    # emr?: string;
    # microphone_permission_check?: boolean;
    # consult_language?: string[];

    model_config = ConfigDict(use_enum_values=True)

class EkascribeConfigCreate(EkascribeConfigBase):
    pass

class EkascribeConfig(EkascribeConfigBase):
    b_id: str
    user_uuid: Optional[str] = "_"
    model_config = ConfigDict(from_attributes=True)

# config requests validatings models.

class ConfigOuputFormatTemplate(BaseModel):
    id : str
    name: str

class NotesId(BaseModel):
    id: str
    name: str

def default_output_format():
    return []

class WorkspaceConfig(BaseModel):
    wid: str
    auto_download: Optional[bool] = None
    scribe_enabled: Optional[bool] = None
    my_templates: Optional[List[str]] = None
    input_languages: Optional[List[Dict]] = None
    output_format_template: Optional[List[ConfigOuputFormatTemplate]] = Field(default_factory=default_output_format)
    model_type: Optional[VOICE2RX_MODEL_TYPE] = Field(default=VOICE2RX_MODEL_TYPE.PRO)
    consultation_mode: Optional[TransactionMode] = None
    notes_ids: Optional[List[NotesId]] = None
    print_compact: Optional[bool] = None

    # Echo SDK Agent Configuration
    use_echo_agent: Optional[bool] = Field(
        default=True,
        description="Use Echo SDK agent for template generation"
    )
    echo_agent_config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Echo SDK agent configuration overrides"
    )

    model_config = ConfigDict(use_enum_values=True)

class UserConfig(BaseModel):
    user_uuid: str
    auto_download: Optional[bool] = None
    scribe_enabled: Optional[bool] = None
    my_templates: Optional[List[str]] = None  # list of dict with id and name of templates.
    input_languages: Optional[List[Dict]] = None 
    output_format_template: Optional[List[ConfigOuputFormatTemplate]] = Field(default_factory=default_output_format)
    model_type: Optional[VOICE2RX_MODEL_TYPE] = Field(default=VOICE2RX_MODEL_TYPE.PRO)
    consultation_mode: Optional[TransactionMode] = None
    notes_ids: Optional[List[NotesId]] = None
    print_compact: Optional[bool] = None

    clinic_name: Optional[str] = None
    specialization: Optional[str] = None
    emr_name: Optional[str] = None
    microphone_permission_check: Optional[bool] = None
    consult_language: Optional[List[InputLanguage]] = None
    auto_detect_language: Optional[bool] = None

    onboarding_step: Optional[str] = None
    scribe_signup: Optional[bool] = None
    contact_number: Optional[str] = None
    copy_overlay: Optional[bool] = None

    sys_info_s3_url: Optional[str] = None
    utm_details: Optional[Dict] = None

    header: Optional[ImageMetadata] = None
    footer: Optional[ImageMetadata] = None

    model_config = ConfigDict(use_enum_values=True)

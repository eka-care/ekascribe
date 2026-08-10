from typing import Any, Dict, Optional, List, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator
from scribe.core.choices import VOICE2RX_MODEL_TYPE, VOICE2RX_PROCESSING_STATUS, VOICE2RX_STATUS, VOICE2RX_TEMPLATE_STATUS, ASRService, InputLanguage, LanguageOutput, TransactionMode, Transfer, UserStatus


class TransactionResponse(BaseModel):
    status: str
    message: str
    txn_id: Optional[str] = None


class OutputFormatTemplate(BaseModel):
    template_id: str
    language_output: LanguageOutput = LanguageOutput.EN_IN.value
    post_proc_method_slug: Optional[List[str]] = None
    template_type: Optional[str] = "default"
    prompt: Optional[str] = None
    template_name: Optional[str] = None
    response_type: Optional[str] = None

    model_config = ConfigDict(use_enum_values=True)
    

class RequestTemplates(BaseModel):
    """New format for categorized templates."""
    visual: List[Dict[str, Any]] = Field(default_factory=list)
    integration: List[Dict[str, Any]] = Field(default_factory=list)

    model_config = ConfigDict(use_enum_values=True)


class AttachmentItem(BaseModel):
    id: str
    patient_id: Optional[str] = None
    patient_oid: Optional[str] = None


class PastSessionRef(BaseModel):
    session_id: str
    date_epoch: Optional[Any] = None


class TransactionContext(BaseModel):
    past_sessions: Optional[List[Union[str, PastSessionRef]]] = None
    documents: Optional[List[str]] = None
    attachments: Optional[List[AttachmentItem]] = None


class ContextPatchRequest(BaseModel):
    context: TransactionContext


class TransactionInitRequest(BaseModel):
    mode: TransactionMode
    transfer: Transfer
    additional_data: Optional[Dict[str, Any]] = Field(default_factory=dict)
    s3_url: Optional[str] = None
    batch_s3_url: Optional[str] = None
    asr_service: Optional[List[ASRService]] = None
    input_language: Optional[List[InputLanguage]] = None
    speciality: Optional[str] = None
    section: Optional[str] = None
    # Old format - kept for backward compatibility
    output_format_template: Optional[List[OutputFormatTemplate]] = Field(default_factory=list)
    # New format - categorized templates
    request_templates: Optional[RequestTemplates] = None
    client_generated_files: Optional[List[str]] = []
    model_training_consent: Optional[bool] = True
    model_type: Optional[VOICE2RX_MODEL_TYPE] = Field(default=VOICE2RX_MODEL_TYPE.PRO.value)
    patient_details: Optional[Dict[str, Any]] = None
    output_language: Optional[InputLanguage] = None
    context: Optional[TransactionContext] = None
    encounter_id: Optional[str] = None

    model_config = ConfigDict(use_enum_values=True)


class ErrorFormat(BaseModel):
    type: Optional[str] = None
    code: Optional[str] = None
    msg: Optional[str] = None

    model_config = ConfigDict(use_enum_values=True)

class ProcessingError(BaseModel):
    error: Optional[ErrorFormat] = None

    model_config = ConfigDict(use_enum_values=True)

class OutputTemplateResult(BaseModel):
    status: VOICE2RX_TEMPLATE_STATUS
    errors: Optional[ErrorFormat] = None
    warnings: Optional[ErrorFormat] = None


class TransactionUpdateData(BaseModel):
    status: Optional[VOICE2RX_STATUS] = None
    user_status: Optional[UserStatus] = None
    processing_status: Optional[VOICE2RX_PROCESSING_STATUS] = None
    processing_error: Optional[ProcessingError] = None
    additional_data: Optional[Dict[str, Any]] = None
    input_language: Optional[List[InputLanguage]] = None
    request_templates: Optional[RequestTemplates] = None
    sqs_files: Optional[List[str]] = None
    client_uploaded_files: Optional[List[str]] = None
    client_generated_files: Optional[List[str]] = None
    chunk_info: Optional[List[dict]] = None
    output_template_result: Optional[Dict[str, Any]] = None
    arc: Optional[bool] = None
    arc_at: Optional[int] = None
    context: Optional[TransactionContext] = None
    patient_details: Optional[Dict[str, Any]] = None
    patient_oid: Optional[str] = None
    transcript_status : Optional[str] = None
    model_type : Optional[VOICE2RX_MODEL_TYPE] = None
    mode : Optional[TransactionMode] = None

    # Timestamps for status updates
    commit_at: Optional[str] = None
    processed_at: Optional[str] = None

    model_config = ConfigDict(use_enum_values=True)

    @model_validator(mode="before")
    def before_validate(self, data: Dict[str, Any]) -> Dict[str, Any]:
        # if chunk_info exists make sure the value of st and et is string.
        if self.get("chunk_info"):
            for chunk_details in self.get("chunk_info"):
                for _, chunk in chunk_details.items():
                    if chunk.get("st") or chunk.get("et"):
                        chunk["st"] = str(chunk["st"])
                        chunk["et"] = str(chunk["et"])

        return self



class ResultUpdateResponse(BaseModel):
    status: str
    message: str
    txn_id: str
    b_id: str

class ResultUpdateBody(BaseModel):
    document_id: str = Field(..., alias="document-id")
    data: str
    
    model_config = ConfigDict(validate_by_name=True, use_enum_values=True)
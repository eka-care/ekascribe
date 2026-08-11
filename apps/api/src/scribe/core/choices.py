from enum import Enum

class TransactionMode(str, Enum):
    CONSULTATION = "consultation"
    DICTATION = "dictation"
    BDIC = "bdic_2025"

class ASRService(str, Enum):
    AWS = "AWS"
    AWS_CUSTOM = "AWS_CUSTOM"
    GROQ_WHISPER = "GROQ_WHISPER"
    EKA_WHISPER = "EKA_WHISPER"
    ELEVENLABS = "ELEVENLABS"
    GEMINI_2_FLASH = "GEMINI_2_FLASH"


class Transfer(str, Enum):
    STREAM = "stream"
    BATCH = "batch"
    VADED = "vaded"
    NON_VADED = "non-vaded"



class Status(str, Enum):
    CREATED = "created"
    INIT = "init"
    COMMIT = "commit"
    TRANSCRIPT = "transcript"
    COMPLETE = "complete"


class UserStatus(str, Enum):
    INIT = "init"
    RECORDING_STARTED = "recording_started"
    COMMIT = "commit"
    STOPPED = "stopped"
    CANCELLED = "cancelled"


class VadStatus(str, Enum):
    START = "START"
    FINISH = "FINISH"

class Action(str, Enum):
    TRANSCRIPTION = "TRANSCRIPTION"
    STRUCTURING = "STRUCTURING"
    CHUKING = "CHUNKING"

class InputLanguage(str, Enum):
    """STT languages exposed to clients — keep in sync with SUPPORTED_LANGUAGES."""

    EN = "en"
    HI = "hi"
    EN_HI = "en-hi"  # code-mixed English + Hindi
    EN_IN = "en-IN"
    EN_US = "en-US"
    GU = "gu"
    KN = "kn"
    ML = "ml"
    TA = "ta"
    TE = "te"
    BN = "bn"
    MR = "mr"
    PA = "pa"
    OR = "or"
    AS = "as"


SUPPORTED_LANGUAGES = [
    {"id": "en", "name": "English"},
    {"id": "hi", "name": "Hindi"},
    {"id": "gu", "name": "Gujarati"},
    {"id": "kn", "name": "Kannada"},
    {"id": "ml", "name": "Malayalam"},
    {"id": "ta", "name": "Tamil"},
    {"id": "te", "name": "Telugu"},
    {"id": "bn", "name": "Bengali"},
    {"id": "mr", "name": "Marathi"},
    {"id": "pa", "name": "Punjabi"},
    {"id": "or", "name": "Oriya"},
    {"id": "as", "name": "Assamese"},
]

# Case-insensitive lookup of any client-supplied language string to its
# canonical InputLanguage value.
_INPUT_LANGUAGE_BY_VALUE = {item.value.lower(): item.value for item in InputLanguage}


def resolve_input_language(value):
    """Resolve an arbitrary client language string to a canonical InputLanguage
    value, matching by enum value case-insensitively. Returns None if the
    language is not supported.
    """
    if value is None:
        return None
    return _INPUT_LANGUAGE_BY_VALUE.get(str(value).strip().lower())

class LanguageOutput(str, Enum):
    EN = "en"
    FR = "fr"
    EN_IN = "en-IN"



class VOICE2RX_STATUS(Enum):
    INIT = "init"
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    STOPPED = "stopped"
    FAILURE = "failure"
    IN_PROGRESS = "in-progress"
    REQUEST_FAILURE = "request_failure"


class VOICE2RX_MODEL_TYPE(Enum):
    PRO = "pro"
    LITE = "lite"



class VOICE2RX_TEMPLATE_STATUS(Enum):
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    FAILURE = "failure"


class VOICE2RX_PROCESSING_STATUS(Enum):
    SUCCESS = "success"
    IN_PROGRESS = "in-progress"
    SYSTEM_FAILURE = "system_failure"
    REQUEST_FAILURE = "request_failure"
    CANCELLED = "cancelled"



NON_TEMPLATE_DOCUMENT_ID = "__non_tmp_doc"


class DocumentType(str, Enum):
    CONTEXT = "context"
    TRANSCRIPT = "transcript"
    CUSTOM = "custom"
    NOTES = "notes"
    INTEGRATION = "integration"



def validate_enum_value(value, enum_class):
    """Check if a value is a valid enum member, else raise ValueError."""
    if value not in {item.value for item in enum_class}:
        raise ValueError(f"Invalid value: {value}. Allowed values: {[item.value for item in enum_class]}")
    return value
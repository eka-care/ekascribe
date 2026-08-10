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

    class Config:
        use_enum_values = True


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

    class Config:
        use_enum_values = True

class VadStatus(str, Enum):
    START = "START"
    FINISH = "FINISH"

class Action(str, Enum):
    TRANSCRIPTION = "TRANSCRIPTION"
    STRUCTURING = "STRUCTURING"
    CHUKING = "CHUNKING"

class InputLanguage(str, Enum):
    MIXED = "mixed"
    
    # Original values
    EN_IN = "en-IN"
    EN_US = "en-US"
    HI_IN = "hi-IN"
    GU_IN = "gu-IN"
    KN_IN = "kn-IN"
    
    # New values (aliases or added new IDs)
    EN = "en"
    HI = "hi"
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
    AUTO_DETECT = "auto_detect"

  
    EN_GB = "en-GB"
    ES = "es"
    AF = "af"
    SQ = "sq"
    AM = "am"
    AR = "ar"
    HY = "hy"
    AZ = "az"
    BA = "ba"
    EU = "eu"
    BE = "be"
    BS = "bs"
    BR = "br"
    BG = "bg"
    CA = "ca"
    ZH = "zh"
    ZH_CN = "zh-CN"
    ZH_TW = "zh-TW"
    HR = "hr"
    CS = "cs"
    DA = "da"
    NL = "nl"
    ET = "et"
    FO = "fo"
    FI = "fi"
    FR = "fr"
    GL = "gl"
    KA = "ka"
    DE = "de"
    DE_CH = "de-CH"
    EL = "el"
    HT = "ht"
    HA = "ha"
    HE = "he"
    HU = "hu"
    IS = "is"
    ID = "id"
    IT = "it"
    JA = "ja"
    JV = "jv"
    KK = "kk"
    KM = "km"
    KO = "ko"
    LO = "lo"
    LA = "la"
    LV = "lv"
    LN = "ln"
    LT = "lt"
    LB = "lb"
    MK = "mk"
    MG = "mg"
    MS = "ms"
    MT = "mt"
    MI = "mi"
    MN = "mn"
    MY = "my"
    NE = "ne"
    NO = "no"
    NN = "nn"
    OC = "oc"
    PS = "ps"
    FA = "fa"
    PL = "pl"
    PT = "pt"
    RO = "ro"
    RU = "ru"
    SA = "sa"
    SR = "sr"
    SN = "sn"
    SD = "sd"
    SI = "si"
    SK = "sk"
    SL = "sl"
    SO = "so"
    SU = "su"
    SW = "sw"
    SV = "sv"
    TL = "tl"
    TG = "tg"
    TT = "tt"
    TH = "th"
    BO = "bo"
    TR = "tr"
    TK = "tk"
    UK = "uk"
    UR = "ur"
    UZ = "uz"
    VI = "vi"
    CY = "cy"
    YI = "yi"
    YO = "yo"
    NY = "ny"
    ZU = "zu"
    XH = "xh"
    ST = "st"
    TN = "tn"
    TS = "ts"
    SS = "ss"
    VE = "ve"
    NR = "nr"

    class Config:
        use_enum_values = True

SUPPORTED_LANGUAGES = [
    # --- original contract (unchanged) ---
    {"id": "en-IN", "name": "English (India)"},
    {"id": "en-US", "name": "English (United States)"},
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
    {"id": "auto_detect", "name": "Auto Detect Language"},
    # --- newly added languages ---
    {"id": "en", "name": "English"},
    {"id": "en-GB", "name": "English (British)"},
    {"id": "es", "name": "Spanish"},
    {"id": "af", "name": "Afrikaans"},
    {"id": "sq", "name": "Albanian"},
    {"id": "am", "name": "Amharic"},
    {"id": "ar", "name": "Arabic"},
    {"id": "hy", "name": "Armenian"},
    {"id": "az", "name": "Azerbaijani"},
    {"id": "ba", "name": "Bashkir"},
    {"id": "eu", "name": "Basque"},
    {"id": "be", "name": "Belarusian"},
    {"id": "bs", "name": "Bosnian"},
    {"id": "br", "name": "Breton"},
    {"id": "bg", "name": "Bulgarian"},
    {"id": "ca", "name": "Catalan"},
    {"id": "zh", "name": "Chinese"},
    {"id": "zh-CN", "name": "Chinese (Simplified)"},
    {"id": "zh-TW", "name": "Chinese (Traditional)"},
    {"id": "hr", "name": "Croatian"},
    {"id": "cs", "name": "Czech"},
    {"id": "da", "name": "Danish"},
    {"id": "nl", "name": "Dutch"},
    {"id": "et", "name": "Estonian"},
    {"id": "fo", "name": "Faroese"},
    {"id": "fi", "name": "Finnish"},
    {"id": "fr", "name": "French"},
    {"id": "gl", "name": "Galician"},
    {"id": "ka", "name": "Georgian"},
    {"id": "de", "name": "German"},
    {"id": "de-CH", "name": "German (Swiss)"},
    {"id": "el", "name": "Greek"},
    {"id": "ht", "name": "Haitian Creole"},
    {"id": "ha", "name": "Hausa"},
    {"id": "he", "name": "Hebrew"},
    {"id": "hu", "name": "Hungarian"},
    {"id": "is", "name": "Icelandic"},
    {"id": "id", "name": "Indonesian"},
    {"id": "it", "name": "Italian"},
    {"id": "ja", "name": "Japanese"},
    {"id": "jv", "name": "Javanese"},
    {"id": "kk", "name": "Kazakh"},
    {"id": "km", "name": "Khmer"},
    {"id": "ko", "name": "Korean"},
    {"id": "lo", "name": "Lao"},
    {"id": "la", "name": "Latin"},
    {"id": "lv", "name": "Latvian"},
    {"id": "ln", "name": "Lingala"},
    {"id": "lt", "name": "Lithuanian"},
    {"id": "lb", "name": "Luxembourgish"},
    {"id": "mk", "name": "Macedonian"},
    {"id": "mg", "name": "Malagasy"},
    {"id": "ms", "name": "Malay"},
    {"id": "mt", "name": "Maltese"},
    {"id": "mi", "name": "Maori"},
    {"id": "mn", "name": "Mongolian"},
    {"id": "my", "name": "Myanmar (Burmese)"},
    {"id": "ne", "name": "Nepali"},
    {"id": "no", "name": "Norwegian"},
    {"id": "nn", "name": "Nynorsk"},
    {"id": "oc", "name": "Occitan"},
    {"id": "ps", "name": "Pashto"},
    {"id": "fa", "name": "Persian"},
    {"id": "pl", "name": "Polish"},
    {"id": "pt", "name": "Portuguese"},
    {"id": "ro", "name": "Romanian"},
    {"id": "ru", "name": "Russian"},
    {"id": "sa", "name": "Sanskrit"},
    {"id": "sr", "name": "Serbian"},
    {"id": "sn", "name": "Shona"},
    {"id": "sd", "name": "Sindhi"},
    {"id": "si", "name": "Sinhala"},
    {"id": "sk", "name": "Slovak"},
    {"id": "sl", "name": "Slovenian"},
    {"id": "so", "name": "Somali"},
    {"id": "su", "name": "Sundanese"},
    {"id": "sw", "name": "Swahili"},
    {"id": "sv", "name": "Swedish"},
    {"id": "tl", "name": "Tagalog"},
    {"id": "tg", "name": "Tajik"},
    {"id": "tt", "name": "Tatar"},
    {"id": "th", "name": "Thai"},
    {"id": "bo", "name": "Tibetan"},
    {"id": "tr", "name": "Turkish"},
    {"id": "tk", "name": "Turkmen"},
    {"id": "uk", "name": "Ukrainian"},
    {"id": "ur", "name": "Urdu"},
    {"id": "uz", "name": "Uzbek"},
    {"id": "vi", "name": "Vietnamese"},
    {"id": "cy", "name": "Welsh"},
    {"id": "yi", "name": "Yiddish"},
    {"id": "yo", "name": "Yoruba"},
    {"id": "ny", "name": "Chichewa / Nyanja"},
    {"id": "zu", "name": "Zulu"},
    {"id": "xh", "name": "Xhosa"},
    {"id": "st", "name": "Sotho (Southern)"},
    {"id": "tn", "name": "Tswana"},
    {"id": "ts", "name": "Tsonga"},
    {"id": "ss", "name": "Swati"},
    {"id": "ve", "name": "Venda"},
    {"id": "nr", "name": "Ndebele (Southern)"},
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

    class Config:
        use_enum_values = True


class VOICE2RX_STATUS(Enum):
    INIT = "init"
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    STOPPED = "stopped"
    FAILURE = "failure"
    IN_PROGRESS = "in-progress"
    REQUEST_FAILURE = "request_failure"

    class Config:
        use_enum_values = True

class VOICE2RX_MODEL_TYPE(Enum):
    PRO = "pro"
    LITE = "lite"

    class Config:
        use_enum_values = True


class VOICE2RX_TEMPLATE_STATUS(Enum):
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    FAILURE = "failure"

    class Config:
        use_enum_values = True

class VOICE2RX_PROCESSING_STATUS(Enum):
    SUCCESS = "success"
    IN_PROGRESS = "in-progress"
    SYSTEM_FAILURE = "system_failure"
    REQUEST_FAILURE = "request_failure"
    CANCELLED = "cancelled"

    class Config:
        use_enum_values = True


NON_TEMPLATE_DOCUMENT_ID = "__non_tmp_doc"


class DocumentType(str, Enum):
    CONTEXT = "context"
    TRANSCRIPT = "transcript"
    CUSTOM = "custom"
    NOTES = "notes"
    INTEGRATION = "integration"

    class Config:
        use_enum_values = True


def validate_enum_value(value, enum_class):
    """Check if a value is a valid enum member, else raise ValueError."""
    if value not in {item.value for item in enum_class}:
        raise ValueError(f"Invalid value: {value}. Allowed values: {[item.value for item in enum_class]}")
    return value
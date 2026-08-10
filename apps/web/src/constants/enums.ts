export enum CUSTOM_THEME {
  PATIENT_LIGHT = 'patient-light',
  PATIENT_DARK = 'patient-dark',
  DOCTOR_LIGHT = 'doctor-light',
  DOCTOR_DARK = 'doctor-dark',
  CLIENT = 'client',
}

export enum STRUCTURED_SUMMARY_KEYS {
  MEDICATIONS = 'medications',
  SYMPTOMS = 'symptoms',
  DIAGNOSIS = 'diagnosis',
  ADVICES = 'advices',
  FOLLOW_UP = 'followup',
  PRESCRIPTION_NOTES = 'prescriptionNotes',
  PRIVATE_NOTES = 'privateNotes',
  MEDICAL_HISTORY = 'medicalHistory',
  VITALS = 'vitals',
  EXAMINATIONS = 'examinations',
  PATIENT_HISTORY = 'patientHistory',
  LAB_TESTS = 'labTests',
  LAB_VITALS = 'labVitals',
  PROCEDURES = 'procedures',
  DENTAL_PROCEDURES = 'dentalProcedures',
  REFER = 'refer',
}

export enum RECORDING_SCREEN_STATE {
  RECORDING = 'recording',
  PROCESSING = 'processing',
  ENDED = 'ended',
  ERROR = 'error',
  NOT_RECORDING = 'not_recording',
}

export enum RECORDING_STATE {
  SPEAKING = 'speaking',
  NOT_SPEAKING = 'not_speaking',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  IDLE = 'idle',
}

export enum RECORDING_SCREEN_ERROR_CONFIG_STATE {
  END_RECORDING = 'end_recording',
  WAITING_FOR_NETWORK = 'waiting_for_network',
  UPLOAD_FAILED = 'upload_failed',
  FAILED_TO_FETCH = 'failed_to_fetch',
  SOMETHING_WENT_WRONG = 'something_went_wrong',
  TRANSACTION_COMMIT_FAILED = 'transaction_commit_failed',
  TRANSACTION_STOP_FAILED = 'transaction_stop_failed',
  NO_AUDIO_CAPTURE = 'no_audio_capture',
  IDLE = 'idle',
  UPLOAD_FULL_AUDIO = 'upload_full_audio',
  UPLOAD_TRANSCRIPTION = 'upload_transcription',
}

export enum ERROR_CONFIG_BUTTON_TITLE {
  NOT_YET = 'Not yet',
  YES_IM_DONE = "Yes, I'm done",
  TRY_AGAIN = 'Try again',
  RECORD_AGAIN = 'Record again',
  DELETE_RECORDING = 'Delete recording',
  RETRY_LOGIN = 'Retry login',
  IM_STILL_RECORDING = 'Still recording',
  IM_DONE_RECORDING = 'Done recording',
  CANCEL_RECORDING = 'Cancel recording',
}

export enum TEMPLATE_ID {
  EKA_EMR_TEMPLATE = 'eka_emr_template',
  CLINICAL_NOTE_TEMPLATE = 'clinical_notes_template',
  TRANSCRIPT_TEMPLATE = 'transcript_template',
  EKA_EMR_TO_FHIR_TEMPLATE = 'eka_emr_to_fhir_template',
  NIC_TEMPLATE = 'nic_template',
}

export enum TEMPLATE_WARNINGS_MSG {
  PARTIAL_OUTPUT = 'Some part of the recording could not be processed. Please review the output.',
  NO_MEDICAL_CONTEXT = 'No relevant content for this output type was generated from the processed recording for this template.',
}

export enum CLINICAL_NOTES_FORMAT {
  MARKDOWN = 'markdown',
  PLAIN_TEXT = 'plainText',
}

export enum ERROR_CODE {
  MICROPHONE = 'microphone',
  TXN_INIT_FAILED = 'txn_init_failed',
  TXN_LIMIT_EXCEEDED = 'txn_limit_exceeded',
  INTERNAL_SERVER_ERROR = 'internal_server_error',
  TXN_STOP_FAILED = 'txn_stop_failed',
  AUDIO_UPLOAD_FAILED = 'audio_upload_failed',
  INVALID_REQUEST = 'invalid_request',
  VAD_NOT_INITIALIZED = 'vad_not_initialized',
  NO_AUDIO_CAPTURE = 'no_audio_capture',
  SPEECH_DETECTED = 'speech_detected',
  TXN_STATUS_MISMATCH = 'txn_status_mismatch',
  LONG_SILENCE = 'long_silence',
}

export enum VOICE_API_STATUS {
  FAILURE = 'failure',
  SUCCESS = 'success',
  PARTIAL_SUCCESS = 'partial_success',
}

export enum TEMPLATE_ERROR_MSG {
  DEFAULT = 'We encountered an unexpected error while generating your output.',
}

export enum TEMPLATE_TYPE {
  EKA_EMR = 'eka_emr',
  JSON = 'json',
  MARKDOWN = 'markdown',
  CUSTOM = 'custom',
  TRANSCRIPT = 'transcript',
}

export enum PROCESSING_STATUS {
  SUCCESS = 'success',
  IN_PROGRESS = 'in-progress',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum MODEL_TYPE {
  PRO = 'pro',
  LITE = 'lite',
}

export enum TEMPLATE_TABS {
  MY_LIBRARY = 'my-library',
  EKA_TEMPLATE_DIRECTORY = 'eka-template-directory',
  CUSTOM_TEMPLATES = 'custom-templates',
  TEMPLATE_DIRECTORY = 'template-directory',
}

export enum MIXPANEL_EVENT_NAME {
  SCRIBEWEB_HOME = 'scribeweb_home',
  SCRIBEWEB_HOME_CLICKS = 'scribeweb_home_clicks',
  SCRIBEWEB_NEW_SESSION = 'scribeweb_new_session',
  SCRIBEWEB_SIDEBAR_CLICKS = 'scribeweb_sidebar_clicks',
  SCRIBEWEB_TEMPLATES_CLICKS = 'scribeweb_templates_clicks',
  SCRIBEWEB_API_WRAPPER = 'scribeweb_api_wrapper',
  SCRIBEWEB_ERRORS = 'scribeweb_errors',
  SCRIBEWEB_ONBOARD_PERSONALIZE = 'scribeweb_onboard_personalize',
  SCRIBEWEB_ONBOARD_PERSONALIZE_CLICKS = 'scribeweb_onboard_personalize_clicks',
  SCRIBEWEB_ONBOARD_WELCOME = 'scribeweb_onboard_welcome',
  SCRIBEWEB_ONBOARD_WELCOME_CLICKS = 'scribeweb_onboard_welcome_clicks',
  SCRIBEWEB_ONBOARD_SETUP = 'scribeweb_onboard_setup',
  SCRIBEWEB_ONBOARD_SETUP_CLICKS = 'scribeweb_onboard_setup_clicks',
  SCRIBEWEB_ONBOARD_COMPLETE = 'scribeweb_onboard_complete',
  SCRIBEWEB_ONBOARD_COMPLETE_CLICKS = 'scribeweb_onboard_complete_clicks',
  SCRIBEWEB_RESPONSE = 'scribeweb_response',
  SCRIBEWEB_SDK_CALLBACK = 'scribeweb_sdk_callback',
  SCRIBEWEB_FILE_UPLOAD_ERROR = 'scribeweb_file_upload_error',
  SCRIBEWEB_DESKTOP_INSTALL = 'scribeweb_desktop_install',
}

export enum MIXPANEL_EVENT_TYPE {
  START_RECORDING = 'start_recording',
  UPLOAD_RECORDING = 'upload_recording',
  NEW_SESSION = 'new_session',
  TEMPLATES = 'templates',
  PROFILE = 'profile',
  CREATE_TEMPLATE = 'create_template',
  GENERATE_TEMPLATE = 'generate_template',
  API_CALL = 'api_call',
  SDK_CALLBACK = 'sdk_callback',
  UNEXPECTED_ERROR = 'unexpected_error',
  SKIP = 'skip',
  SETUP = 'setup',
  SYSTEM_CHECKS = 'system_checks',
  START_NEW_SESSION = 'start_new_session',
  PAUSE_RECORDING = 'pause_recording',
  RESUME_RECORDING = 'resume_recording',
  END_RECORDING = 'end_recording',
  CANCEL_RECORDING = 'cancel_recording',
  ADD_NEW_PATIENT = 'add_new_patient',
  EDIT_PREFERENCES = 'edit_preferences',
  ADD_TRANSCRIPT = 'add_transcript',
  MICROPHONE_CLICKS = 'microphone_clicks',
  WHATS_NEW = 'whats_new',
}

export enum SESSION_PHASE {
  IDLE = 'idle',
  RECORDING = 'recording',
  PAUSED = 'paused',
  PROCESSING = 'processing',
  OUTPUT = 'output',
  ERROR = 'error',
}


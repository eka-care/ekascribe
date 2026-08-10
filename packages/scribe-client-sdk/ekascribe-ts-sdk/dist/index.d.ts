import { CallbackMap } from 'med-scribe-alliance-ts-sdk';
import { CreateSessionRequest } from 'med-scribe-alliance-ts-sdk';
import { CreateSessionResponse } from 'med-scribe-alliance-ts-sdk';
import { createWorkerBlobUrl } from 'med-scribe-alliance-ts-sdk';
import { DiscoveryDocument } from 'med-scribe-alliance-ts-sdk';
import { EndSessionRequest } from 'med-scribe-alliance-ts-sdk';
import { EndSessionResponse } from 'med-scribe-alliance-ts-sdk';
import { GetSessionStatusResponse } from 'med-scribe-alliance-ts-sdk';
import { getWorkerUrl } from 'med-scribe-alliance-ts-sdk';
import { IpcBridge as IpcBridge_2 } from 'med-scribe-alliance-ts-sdk';
import { PatchSessionRequest } from 'med-scribe-alliance-ts-sdk';
import { PatchSessionResponse } from 'med-scribe-alliance-ts-sdk';
import { PatientDetails } from 'med-scribe-alliance-ts-sdk';
import { PollOptions } from 'med-scribe-alliance-ts-sdk';
import { ProcessTemplateResponse } from 'med-scribe-alliance-ts-sdk';
import { RecordingOptions } from 'med-scribe-alliance-ts-sdk';
import { ResolvedConfig } from 'med-scribe-alliance-ts-sdk';
import { ScribeClient } from 'med-scribe-alliance-ts-sdk';
import { SDKResult } from 'med-scribe-alliance-ts-sdk';
import { SessionUploadInfo } from 'med-scribe-alliance-ts-sdk';

export declare enum API_STATUS {
    NOT_INITIALIZED = "na",
    INIT = "init",
    STOP = "stop",
    COMMIT = "commit"
}

export declare enum CALLBACK_TYPE {
    AWS_CONFIGURE_STATUS = "aws_configure_status",
    FILE_UPLOAD_STATUS = "file_upload_status",
    TRANSACTION_STATUS = "transaction_status",
    TEMPLATE_OPERATION_STATUS = "template_operation_status",
    AUTHENTICATION_STATUS = "authentication_status",
    NETWORK_STATUS = "network_status",
    STORAGE_STATUS = "storage_status"
}

export declare type CallbackName = 'onRecordingStateChange' | 'onAudioEvent' | 'onUploadEvent' | 'onSessionEvent' | 'onError' | 'onTokenRequired';

export declare enum COMPATIBILITY_TEST_STATUS {
    SUCCESS = "success",
    ERROR = "error",
    WARNING = "warning"
}

export declare enum COMPATIBILITY_TEST_TYPE {
    INTERNET_CONNECTIVITY = "INTERNET_CONNECTIVITY",
    SYSTEM_INFO = "SYSTEM_INFO",
    MICROPHONE = "MICROPHONE",
    SHARED_WORKER = "SHARED_WORKER",
    NETWORK_API = "NETWORK_API"
}

export { CreateSessionRequest }

export { CreateSessionResponse }

export { createWorkerBlobUrl }

export { DiscoveryDocument }

declare class DocumentManager {
    private transport;
    private hosts;
    private allianceClient;
    constructor(transport: ITransport, hosts: EkaHosts, allianceClient: ScribeClient);
    getAllTemplates(): Promise<TGetV1TemplatesResponse>;
    createTemplate({ title, desc, section_ids, }: TPostV1TemplateRequest): Promise<TPostV1TemplateResponse>;
    updateTemplate({ template_id, title, desc, section_ids, }: TPostV1TemplateRequest): Promise<TPostV1TemplateResponse>;
    deleteTemplate(templateId: string): Promise<TPostV1TemplateResponse>;
    aiGenerateTemplate({ file, instruction, }: TPostV1AiCreateTemplateRequest): Promise<TPostV1AiCreateTemplateResponse>;
    convertToTemplate({ txn_id, template_id, }: {
        txn_id: string;
        template_id: string;
    }): Promise<SDKResult<ProcessTemplateResponse>>;
    convertTranscriptionToTemplate({ txn_id, template_id, transcript, target_language, }: TPostV1ConvertToTemplateRequest): Promise<TPostV1ConvertToTemplateResponse>;
    getAllTemplateSections(): Promise<TGetV1TemplateSectionsResponse>;
    createTemplateSection({ title, desc, format, example, }: TPostV1TemplateSectionRequest): Promise<TPostV1TemplateSectionResponse>;
    updateTemplateSection({ section_id, title, desc, format, example, }: TPostV1TemplateSectionRequest): Promise<TPostV1TemplateSectionResponse>;
    deleteTemplateSection(sectionId: string): Promise<TPostV1TemplateSectionResponse>;
    getDocument({ documentId, params, }: {
        documentId: string;
        params?: string;
    }): Promise<TPostV1DocumentResponse>;
    createDocument({ session_id, document_name, type, document_id, publish, }: TPostV1DocumentRequest): Promise<TPostV1DocumentResponse>;
    updateDocument({ session_id, document_name, type, document_id, publish, tiptap_json, params, }: TPostV1DocumentRequest): Promise<TPostV1DocumentResponse>;
    deleteDocument(documentId: string): Promise<TDeleteV1DocumentResponse>;
    publishDocument({ session_id, document_id, }: TPostV1DocumentRequest): Promise<TPostV1DocumentResponse>;
}

/** Consumer-facing callback map: overrides onTokenRequired to expect a token return */
export declare interface EkaCallbackMap extends Omit<CallbackMap, 'onTokenRequired'> {
    onTokenRequired: () => Promise<string> | string;
}

export declare type EkaCallbackName = keyof EkaCallbackMap;

declare type EkaHosts = {
    voiceV1: string;
    voiceV2: string;
    voiceV3: string;
    cookV1: string;
    ekaHost: string;
    parchiHost: string;
};

declare class EkaScribe {
    private static instance;
    private transport;
    private hosts;
    private callbackRegistry;
    private tracker;
    private config;
    private allianceClient;
    private recording;
    private output;
    private widgetManager;
    readonly documents: DocumentManager;
    readonly sessions: SessionUtils;
    private constructor();
    static getInstance(config: EkaScribeConfig): EkaScribe;
    /** @deprecated Backward compatible */
    initTransaction(request: TPostTransactionInitRequest): Promise<TStartRecordingResponse>;
    /** @deprecated Backward compatible */
    startRecording(microphoneID?: string): Promise<TStartRecordingResponse>;
    /**
     * Creates a session and starts recording in one step.
     * This is the recommended method for new integrations.
     */
    startRecordingV2(options: RecordingOptions): Promise<TStartRecordingResponse>;
    startRecordingForExistingSession(request: TStartRecordingForExistingSessionRequest): Promise<TStartRecordingResponse>;
    pauseRecording(): TPauseRecordingResponse;
    resumeRecording(): TPauseRecordingResponse;
    /**
     * Lifts the maximum chunk limit so recording can continue uploading audio
     * chunks beyond the default cap.
     */
    forceAllowMoreChunks(): void;
    endRecording(): Promise<TEndRecordingResponse>;
    getSessionStatus(sessionId?: string, options?: {
        poll?: PollOptions;
        templateId?: string;
        version?: string;
    }): Promise<SDKResult<GetSessionStatusResponse>>;
    retryUploadRecording(): Promise<TEndRecordingResponse>;
    cancelSession(sessionId?: string): Promise<SDKResult<PatchSessionResponse>>;
    /**
     * Upload a pre-recorded audio file to an existing session's upload URL.
     *
     * Client flow:
     * 1. createSession() — via sessions.createSession()
     * 2. processPreRecordedAudio(upload, audioFile, audioFileName) — this method
     * 3. endSession — via sessions.endSession()
     */
    processPreRecordedAudio(request: {
        upload: SessionUploadInfo;
        audioFile: File | Blob;
        audioFileName?: string;
    }): Promise<TStartRecordingResponse>;
    /** @deprecated Backward compatible */
    commitTransactionCall(): Promise<TEndRecordingResponse>;
    /** @deprecated Backward compatible */
    stopTransactionCall(): Promise<TEndRecordingResponse>;
    startForPatient(config: StartForPatientConfig): Promise<void>;
    /** @deprecated Backward compatible */
    getTemplateOutput(request: {
        txn_id: string;
    }): Promise<TGetStatusResponse>;
    /** @deprecated Backward compatible */
    getOutputTranscription(request: {
        txn_id: string;
    }): Promise<TGetStatusResponse>;
    getChunkTranscript(txnId: string, chunkNumber: string): Promise<TFetchChunkTranscriptResult>;
    /** @deprecated Backward compatible */
    pollSessionOutput(request: {
        txn_id: string;
        max_polling_time?: number;
        template_id?: string;
        document_id?: string;
        dlp?: boolean;
        onPartialResultCb?: TPartialResultCallback;
    }): Promise<TPollingResponse>;
    registerCallback<K extends EkaCallbackName>(name: K, handler: EkaCallbackMap[K]): void;
    removeCallback<K extends EkaCallbackName>(name: K, handler: EkaCallbackMap[K]): void;
    /** @future Rename to setAccessToken(token: string) once existing clients migrate */
    updateAuthTokens({ access_token }: {
        access_token: string;
    }): void;
    runSystemCompatibilityTest(callback: TCompatibilityCallback): Promise<TCompatibilityTestSummary>;
    resetInstance(): Promise<void>;
    private handleUnauthorized;
}

export declare interface EkaScribeConfig {
    access_token?: string;
    env: 'PROD' | 'DEV';
    clientId?: string;
    mode?: 'http' | 'ipc';
    ipcBridge?: IpcBridge_2;
    enableTracking?: boolean;
    flavour?: string;
    sharedWorkerUrl?: string;
    allianceConfig?: {
        baseUrl?: string;
        useWorker?: boolean | 'auto';
        debug?: boolean;
    };
    widget?: WidgetConfig;
}

export { EndSessionRequest }

export { EndSessionResponse }

export declare enum ERROR_CODE {
    TXN_INIT_FAILED = "txn_init_failed",
    TXN_LIMIT_EXCEEDED = "txn_limit_exceeded",
    INTERNAL_SERVER_ERROR = "internal_server_error",
    END_RECORDING_FAILED = "end_recording_failed",
    AUDIO_UPLOAD_FAILED = "audio_upload_failed",
    TXN_COMMIT_FAILED = "txn_commit_failed",
    TXN_STATUS_MISMATCH = "txn_status_mismatch",
    NETWORK_ERROR = "network_error",
    UNKNOWN_ERROR = "unknown_error",
    UNAUTHORIZED = "unauthorized",
    FORBIDDEN = "forbidden",
    START_RECORDING_FAILED = "start_recording_failed",
    BAD_REQUEST = "bad_request",
    NOT_FOUND = "not_found"
}

declare type Gender = 'M' | 'F' | 'O';

export declare const getEkaScribeInstance: (config: EkaScribeConfig) => EkaScribe;

export { GetSessionStatusResponse }

export { getWorkerUrl }

export declare interface IpcBridge {
    send(message: unknown): void;
    onResponse(handler: (message: unknown) => void): void;
}

declare interface ITransport {
    request<T = unknown>(config: TransportRequest): Promise<TransportResponse<T>>;
    setAuthToken(token: string): void;
}

export { PatchSessionRequest }

export { PatchSessionResponse }

export { PatientDetails }

export { PollOptions }

export declare enum PROCESSING_STATUS {
    SUCCESS = "success",
    IN_PROGRESS = "in-progress",
    FAILED = "failed",
    CANCELLED = "cancelled"
}

export { ProcessTemplateResponse }

export { RecordingOptions }

export { ResolvedConfig }

export declare enum RESULT_STATUS {
    SUCCESS = "success",
    FAILURE = "failure",
    PARTIAL_COMPLETE = "partial_complete",
    IN_PROGRESS = "in-progress"
}

export { SDKResult }

declare class SessionUtils {
    private transport;
    private hosts;
    private allianceClient;
    constructor(transport: ITransport, hosts: EkaHosts, allianceClient: ScribeClient);
    getSessionHistory({ txn_count, oid, }: {
        txn_count: number;
        oid?: string;
    }): Promise<TGetTransactionHistoryResponse>;
    deleteSession({ txn_id }: {
        txn_id: string;
    }): Promise<TDeleteTransactionResponse>;
    patchSessionStatus(request: PatchSessionRequest, sessionId?: string): Promise<SDKResult<PatchSessionResponse>>;
    getSessionDetails({ session_id, presigned, version, }: TGetV1SessionDetailsRequest): Promise<TGetV1SessionDetailsResponse>;
    getSuggestedMedications(txnId: string): Promise<TSuggestedMedicationResponse>;
    addSessionContext({ txn_id, context, }: TPatchSessionContextRequest): Promise<TPatchSessionContextResponse>;
    removeSessionContext({ txn_id, context, }: TPatchSessionContextRequest): Promise<TPatchSessionContextResponse>;
    /** @deprecated Backward compatible */
    updateResultSummary({ txnId, data, }: TPatchVoiceApiV3StatusRequest): Promise<TPatchVoiceApiV3StatusResponse>;
    getConfig(): Promise<TGetConfigV2Response>;
    getConfigMyTemplates(): Promise<TGetConfigV2Response>;
    updateConfig(request: TPatchVoiceApiV2ConfigRequest): Promise<TPatchVoiceApiV2ConfigResponse>;
    getDoctorHeaderFooter({ doctor_oid, clinic_id, }: TGetDoctorHeaderFooterRequest): Promise<TGetDoctorHeaderFooterResponse>;
    getDoctorClinics({ doctor_id, }: TGetDoctorClinicsRequest): Promise<TGetDoctorClinicsResponse>;
    createSession(request: CreateSessionRequest, version?: string): Promise<SDKResult<CreateSessionResponse>>;
    endSession(request: EndSessionRequest, sessionId?: string): Promise<SDKResult<EndSessionResponse>>;
    getDiscoveryDocument(): DiscoveryDocument | null;
    getDiscoveryConfig(): SDKResult<ResolvedConfig>;
    refreshDiscovery(): Promise<SDKResult<ResolvedConfig>>;
    private getDefaultHeaderFooterInfo;
    private extractHeaderFooterInfo;
}

export declare interface StartForPatientConfig {
    txn_id: string;
    patient_details?: Omit<TPatientDetails, 'oid'>;
    additional_data?: Record<string, unknown>;
}

export declare type TChunkTranscriptResponse = {
    text: string;
    confidence: number;
    segments: unknown[];
    audio_length: number;
    audio_quality: string;
    metadata: {
        model_id: string;
        commit_id: string;
        context_used: unknown[];
        lang_input: string[];
        lang_output: string;
        task: string | null;
    };
};

declare type TClinicInfo = {
    clinic_id: string;
    name: string;
};

export declare type TCompatibilityCallback = (result: TCompatibilityTestResult) => void;

export declare type TCompatibilityTestResult = {
    test_type: string;
    status: COMPATIBILITY_TEST_STATUS;
    message: string;
    data?: Record<string, unknown>;
    timestamp: string;
    error?: string;
};

export declare type TCompatibilityTestSummary = {
    allPassed: boolean;
    results: TCompatibilityTestResult[];
    totalTests: number;
    passedTests: number;
    failedTests: number;
    warningTests: number;
};

declare type TConfigHeaderFooter = {
    type: 'image' | 'margin';
    data?: string;
    content_type?: string;
    width: number;
    height: number;
    unit: 'cm' | 'mm';
};

export declare type TConfigSettings = {
    model_training_consent: {
        value: boolean;
        editable: boolean;
    };
};

declare type TDeleteTransactionResponse = {
    error_code?: ERROR_CODE;
    status_code: number;
    message?: string;
    status?: string;
    txn_id?: string;
    error?: {
        code: string;
        message: string;
        display_message?: string;
    };
};

export declare type TDeleteV1DocumentResponse = {
    error_code?: ERROR_CODE;
    status_code: number;
    message?: string;
    [key: string]: unknown;
};

declare type TDoctorHeaderFooterInfo = {
    _id: string | null;
    clinic_id: string | null;
    doctor_id: string | null;
    type: string | null;
    header_img: string | null;
    header_height: string | null;
    header_top_margin: string | null;
    footer_img: string | null;
    footer_height: string | null;
    margin_left: string | null;
    margin_right: string | null;
    page_size: string | null;
    show_eka_logo: boolean | null;
    show_name_in_signature: boolean | null;
    show_not_valid_for_medical_legal_purpose_message: boolean | null;
    show_page_number: boolean | null;
    show_prescription_id: boolean | null;
    show_signature: boolean | null;
};

export declare type TDocumentError = {
    type: null | string;
    code: string;
    msg: string;
};

export declare enum TEMPLATE_ID {
    EKA_EMR_TEMPLATE = "eka_emr_template",
    CLINICAL_NOTE_TEMPLATE = "clinical_notes_template",
    TRANSCRIPT_TEMPLATE = "transcript_template",
    EKA_EMR_TO_FHIR_TEMPLATE = "eka_emr_to_fhir_template",
    NIC_TEMPLATE = "nic_template"
}

export declare enum TEMPLATE_TYPE {
    JSON = "json",
    TRANSCRIPT = "transcript",
    MARKDOWN = "markdown"
}

export declare type TEndRecordingResponse = {
    error_code?: ERROR_CODE;
    status_code: number;
    message: string;
    failed_files?: string[];
    total_audio_files?: string[];
};

export declare type TEventCallback = (args: {
    callback_type: CALLBACK_TYPE;
    status: 'success' | 'error' | 'progress' | 'info';
    message: string;
    error?: {
        code: number;
        msg: string;
        details?: unknown;
    };
    data?: TEventCallbackData;
    timestamp: string;
    metadata?: Record<string, unknown>;
}) => void;

export declare type TEventCallbackData = {
    success?: number;
    total?: number;
    is_uploaded?: boolean;
    fileName?: string;
    chunkData?: Uint8Array[];
    request?: unknown;
    response?: unknown;
    status_code?: number;
    error_code?: ERROR_CODE;
};

export declare type TFetchChunkTranscriptResult = {
    success: true;
    data: TChunkTranscriptResponse;
} | {
    success: false;
    error: string;
};

export declare type TGetConfigItem = {
    id: string;
    name: string;
    desc?: string;
};

export declare type TGetConfigV2Response = {
    error_code?: ERROR_CODE;
    data?: {
        supported_languages: TGetConfigItem[];
        supported_output_formats: TGetConfigItem[];
        consultation_modes: TGetConfigItem[];
        supported_integrations: TGetConfigItem[];
        integrations: TGetConfigItem[];
        max_selection: {
            supported_languages: number;
            supported_output_formats: number;
            consultation_modes: number;
        };
        settings: TConfigSettings;
        my_templates: [
            {
            id: string;
            name: string;
        }
        ];
        user_details: {
            uuid: string;
            fn: string;
            mn: string;
            ln: string;
            dob: string;
            gen: 'F' | 'M' | 'O';
            s: string;
            'w-id': string;
            'w-n': string;
            'b-id': string;
            is_paid_doc: boolean;
            is_eka_doc: boolean;
            oid: string;
        };
        selected_preferences?: TSelectedPreferences;
        clinic_name?: string;
        specialization?: string;
        emr_name?: string;
        microphone_permission_check?: boolean;
        consult_language?: string[];
        contact_number?: string;
        onboarding_step?: string;
        header?: TConfigHeaderFooter;
        footer?: TConfigHeaderFooter;
    };
    message?: string;
    status_code: number;
};

export declare type TGetConfigV2TimezoneResponse = {
    timezone: string;
    current_time_utc: string;
    timestamp: number;
    status_code: number;
    message?: string;
};

export declare type TGetDoctorClinicsRequest = {
    doctor_id: string;
};

export declare type TGetDoctorClinicsResponse = {
    error_code?: ERROR_CODE;
    data: TClinicInfo[] | null;
    status_code: number;
    message?: string;
};

export declare type TGetDoctorHeaderFooterRequest = {
    doctor_oid: string;
    clinic_id?: string;
};

export declare type TGetDoctorHeaderFooterResponse = {
    error_code?: ERROR_CODE;
    data: TDoctorHeaderFooterInfo;
    status_code: number;
    message?: string;
};

export declare type TGetStatusApiResponse = {
    data: {
        output: TOutputSummary[];
        audio_matrix?: {
            quality: string;
        };
        meta_data?: {
            total_resources?: number;
            total_parsed_resources?: number;
        };
        created_at?: string;
        template_results: {
            integration: TOutputSummary[];
            custom: TOutputSummary[];
            transcript: TOutputSummary[];
        };
        additional_data?: any;
    };
    error?: {
        code: string;
        message: string;
        display_message: string;
    };
    status: string;
};

export declare type TGetStatusResponse = {
    error_code?: ERROR_CODE;
    response?: TGetStatusApiResponse | null;
    status_code: number;
    message?: string;
};

export declare type TGetTransactionHistoryResponse = {
    error_code?: ERROR_CODE;
    data?: TSessionHistoryData[];
    status?: string;
    status_code: number;
    message: string;
    retrieved_count?: number;
};

export declare type TGetV1SessionDetailsData = {
    schema_version: string;
    session_id: string;
    uuid: string;
    wid: string;
    created_at: number;
    expires_at: number;
    upload_url: SessionUploadInfo;
    status: string;
    user_status: 'init' | 'recording_started' | 'commit' | string;
    transfer: string;
    flavour: string;
    patient_details: TPatientDetails | Record<string, unknown>;
    audio_matrix: Record<string, unknown>;
    additional_data: TSessionDetailsAdditionalData;
    documents: TSessionDocument[];
    context: {
        past_sessions?: Array<{
            date_epoch: number;
            session_id: string;
        }>;
        documents?: string[];
        attachments?: Array<{
            id: string;
            patient_oid?: string;
        }>;
    };
    input_language: string[];
    request_templates: Record<string, []>;
    consultation_mode: string;
    model_type: string;
};

export declare type TGetV1SessionDetailsRequest = {
    session_id: string;
    presigned?: boolean;
    version?: string;
};

export declare type TGetV1SessionDetailsResponse = {
    error_code?: ERROR_CODE;
    data?: TGetV1SessionDetailsData;
    status_code: number;
    message?: string;
    [key: string]: unknown;
};

export declare interface TGetV1TemplateSectionsResponse {
    error_code?: ERROR_CODE;
    items: TSection[];
    status_code: number;
    error?: {
        code: string;
        message: string;
    };
}

export declare interface TGetV1TemplatesResponse {
    error_code?: ERROR_CODE;
    items: TTemplate[];
    status_code: number;
    error?: {
        code: string;
        message: string;
    };
}

declare type TNetworkInfo = {
    effective_type: string;
    latency: number;
    download_speed: number;
    connection_type: string;
};

export declare type TOutputSummary = {
    template_id: string;
    value?: any;
    type: string;
    name: string;
    lang?: string;
    status: TTemplateStatus;
    errors?: TTemplateMessage[];
    warnings?: TTemplateMessage[];
    document_id: string;
    document_type: string;
    document_path: {
        bucket: string;
        folder: string;
        filename: string;
    };
};

export declare type TPartialResultCallback = (data: {
    txn_id: string;
    response: TGetStatusApiResponse | null;
    status_code: number;
    message: string;
    poll_status: 'in-progress' | 'success' | 'failed' | 'timeout';
}) => void;

export declare type TPatchSessionContextRequest = {
    txn_id: string;
    context: {
        past_sessions?: string[];
        attachments?: {
            id: string;
            patient_oid?: string;
        }[];
    };
};

export declare type TPatchSessionContextResponse = {
    error_code?: ERROR_CODE;
    status_code: number;
    message?: string;
    [key: string]: unknown;
};

declare type TPatchTransactionError = {
    error: {
        type: string;
        code: string;
        msg: string;
    };
};

export declare type TPatchTransactionRequest = {
    sessionId: string;
    processing_status?: string;
    processing_error?: TPatchTransactionError;
    patient_details?: TPatientDetails;
    user_status?: string;
};

export declare type TPatchVoiceApiV2ConfigRequest = {
    request_type: string;
    data: {
        auto_download?: boolean;
        auto_detect_language?: boolean;
        input_languages?: TGetConfigItem[];
        integrations?: TGetConfigItem[];
        consultation_mode?: string;
        model_type?: string;
        output_format_template?: TGetConfigItem[];
        my_templates?: string[];
        scribe_enabled?: boolean;
        clinic_name?: string;
        specialization?: string;
        emr_name?: string;
        microphone_permission_check?: boolean;
        consult_language?: string[];
        contact_number?: string;
        onboarding_step?: string;
        sys_info?: TSystemInfo;
        copy_overlay?: boolean;
        header?: TConfigHeaderFooter;
        footer?: TConfigHeaderFooter;
    };
    query_params?: string;
};

export declare interface TPatchVoiceApiV2ConfigResponse extends TPatchVoiceApiV2ConfigRequest {
    error_code?: ERROR_CODE;
    msg: string;
    status_code: number;
    error?: {
        code: string;
        message: string;
    };
}

export declare type TPatchVoiceApiV3StatusRequest = {
    txnId: string;
    data: {
        'document-id': string;
        data: string;
    }[];
};

export declare type TPatchVoiceApiV3StatusResponse = {
    error_code?: ERROR_CODE;
    status: string;
    message: string;
    txn_id: string;
    b_id: string;
    status_code: number;
    error?: {
        code: string;
        message: string;
        display_message: string;
    };
};

export declare type TPatientDetails = {
    username: string;
    oid?: string;
    age: number;
    biologicalSex: Gender;
    mobile?: string;
    email?: string;
};

export declare type TPauseRecordingResponse = {
    status_code: number;
    message: string;
    error_code?: ERROR_CODE;
    is_paused?: boolean;
};

export declare type TPollingResponse = {
    error_code?: ERROR_CODE;
    response?: TGetStatusApiResponse | null;
    status_code: number;
    errorMessage?: string;
    errorCode?: string;
};

export declare type TPostCogResponse = {
    credentials?: {
        AccessKeyId: string;
        SecretKey: string;
        SessionToken: string;
        Expiration: string;
    };
    message?: string;
    token?: string;
    identity_id?: string;
    is_session_expired?: boolean;
};

export declare type TPostTransactionInitRequest = {
    mode: string;
    s3Url?: string;
    txn_id: string;
    input_language: string[];
    output_language?: string;
    output_format_template: {
        template_id: string;
        template_name?: string;
        template_type?: string;
        codification_needed?: boolean;
    }[];
    transfer: string;
    auto_download?: boolean;
    model_training_consent?: boolean;
    system_info?: TSystemInfo;
    patient_details?: TPatientDetails;
    model_type: string;
    version?: string;
    api_version?: string;
    flavour?: string;
    batch_s3_url?: string;
    audio_file_names?: string[];
    additional_data?: Record<string, unknown>;
    encounter_id?: string;
};

export declare type TPostTransactionResponse = {
    status: string;
    message: string;
    txn_id: string;
    b_id: string;
    oid: string;
    uuid: string;
    data: unknown;
    status_code: number;
    error?: {
        code: string;
        message: string;
        display_message: string;
    };
};

declare interface TPostV1AiCreateTemplateRequest {
    file?: File;
    instruction?: string;
}

declare type TPostV1AiCreateTemplateResponse = {
    error_code?: ERROR_CODE;
    title: string;
    template_instructions: string;
    status_code: number;
    message: string;
};

export declare type TPostV1ConvertToTemplateRequest = {
    txn_id: string;
    template_id?: string;
    transcript?: string;
    target_language?: string;
};

export declare type TPostV1ConvertToTemplateResponse = {
    error_code?: ERROR_CODE;
    status: 'success' | 'failed';
    message: string;
    txn_id: string;
    template_id: string;
    document_id: string;
    b_id: string;
    status_code: number;
    msg: string;
    error?: {
        code: string;
        message: string;
        display_message: string;
    };
};

export declare type TPostV1DocumentRequest = {
    session_id: string;
    document_name?: string;
    type?: string;
    document_id?: string;
    publish?: Record<string, unknown>;
    tiptap_json?: Record<string, unknown>;
    params?: string;
};

export declare type TPostV1DocumentResponse = {
    error_code?: ERROR_CODE;
    status_code: number;
    status?: string;
    message?: string;
    data?: {
        document_id: string;
        session_id: string;
        template_id: string;
        document_name: string;
        type: string;
        status: string;
        errors: unknown[];
        warnings: unknown[];
        usage_information: Record<string, unknown>;
        document_path: {
            bucket: string;
            folder: string;
            filename: string;
        };
        presigned_url: string;
        created_at: string;
        updated_at: number;
        publish: Record<string, unknown>;
        tiptap_json?: Record<string, unknown>;
    };
};

export declare interface TPostV1TemplateRequest {
    title: string;
    desc?: string;
    section_ids: string[];
    template_id?: string;
}

export declare interface TPostV1TemplateResponse {
    error_code?: ERROR_CODE;
    status_code: number;
    msg: string;
    template_id?: string;
    message?: string;
    error?: {
        code: string;
        message: string;
    };
}

export declare interface TPostV1TemplateSectionRequest {
    title: string;
    desc?: string;
    format?: 'P' | 'B';
    example?: string;
    section_id?: string;
}

export declare interface TPostV1TemplateSectionResponse {
    error_code?: ERROR_CODE;
    msg: string;
    section_id: string;
    status_code: number;
    /** Absent when the call failed. */
    action?: 'updated' | 'created_custom';
    error?: {
        code: string;
        message: string;
    };
}

export declare interface TPostV1UploadAudioFilesRequest extends TPostTransactionInitRequest {
    audioFile: File | Blob;
    audioFileName: string;
}

declare interface TransportRequest {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
}

declare interface TransportResponse<T = unknown> {
    status: number;
    data: T;
    headers?: Record<string, string>;
}

export declare interface TSection {
    id: string;
    title: string;
    desc: string;
    format: 'P' | 'B';
    example: string;
    default?: boolean;
    parent_section_id?: string;
}

export declare type TSelectedPreferences = {
    languages?: TGetConfigItem[];
    output_formats?: TGetConfigItem[];
    consultation_mode?: string;
    use_audio_cues?: boolean;
    auto_download?: boolean;
    model_type?: string;
    copy_overlay?: boolean;
    auto_detect_language?: boolean;
};

export declare type TSessionDetailsAdditionalData = {
    input_languages?: {
        id: string;
        name: string;
    }[];
    output_format_template?: {
        id: string;
        name: string;
        template_type: string;
    }[];
    model_type?: string;
    consultation_mode?: string;
    [key: string]: unknown;
};

export declare type TSessionDocument = {
    document_id: string;
    session_id: string;
    template_id: string;
    document_name: string;
    document_type: 'notes' | 'context' | 'transcript' | 'integration';
    type: string;
    status: string;
    errors: TDocumentError[];
    warnings: TDocumentError[];
    publish: Record<string, unknown>;
    created_at: number;
    presigned_url: string | null;
    presigned_url_expires_at: number | null;
    vault_doc_id: string | null;
    lang?: string;
};

export declare type TSessionHistoryData = {
    created_at: string;
    b_id: string;
    user_status: string;
    processing_status: string;
    txn_id: string;
    mode: string;
    uuid: string;
    oid: string;
    patient_details?: TPatientDetails;
};

export declare type TSessionStatus = {
    [key: string]: {
        api?: {
            status: API_STATUS;
            error?: string;
            response?: string;
            code: number;
        };
        vad?: {
            status: VAD_STATUS;
        };
    };
};

export declare type TStartRecordingForExistingSessionRequest = {
    txn_id: string;
    created_at: number;
    expires_at: string;
    upload_url: SessionUploadInfo;
    business_id?: string;
    microphoneID?: string;
    version?: string;
};

export declare type TStartRecordingResponse = {
    error_code?: ERROR_CODE;
    status_code: number;
    message: string;
    business_id?: string;
    txn_id?: string;
    oid?: string;
    uuid?: string;
};

export declare type TSuggestedMedication = {
    extracted: {
        name: string;
        dose: string | null;
        frequency: string | null;
        duration: string | null;
        route: string | null;
    };
    suggestions: Array<{
        coded_name: string;
        coded_generic_name: string | null;
        coded_dose_unit: string | null;
        coded_form: string | null;
        eka_id: string;
        locale_id: string;
        uncoded_name: string;
        source: string;
        is_fhir_confidence: boolean;
        is_brandname_matched: boolean;
        [key: string]: unknown;
    }>;
};

declare type TSuggestedMedicationResponse = {
    error_code?: ERROR_CODE;
    status_code: number;
    message?: string;
    session_id?: string;
    medications?: TSuggestedMedication[];
};

export declare type TSystemInfo = {
    platform: string;
    language: string;
    hardware_concurrency?: number;
    device_memory?: number;
    time_zone: string;
    network_info?: TNetworkInfo;
};

export declare interface TTemplate {
    id: string;
    title: string;
    desc: string;
    section_ids: string[];
    is_editable: boolean;
    is_favorite?: boolean;
}

export declare type TTemplateMessage = {
    type: 'warning' | 'error';
    code?: string;
    msg: string;
};

export declare type TTemplateStatus = 'success' | 'partial_success' | 'failure';

export declare type TVadFrameProcessedCallback = (args: {
    probabilities: {
        notSpeech: number;
        isSpeech: number;
    };
    frame: Float32Array;
    duration: number;
}) => void;

export declare type TVadFramesCallback = (args: {
    error_code?: ERROR_CODE;
    status_code: number;
    message?: string;
    request?: string;
}) => void;

export declare enum VAD_STATUS {
    START = "start",
    PAUSE = "pause",
    RESUME = "resume",
    STOP = "stop"
}

export declare interface WidgetCallbacks {
    onRecordingStart?: (data: {
        txn_id: string;
    }) => void;
    onRecordingPause?: (data: {
        txn_id: string;
        duration: number;
    }) => void;
    onRecordingResume?: (data: {
        txn_id: string;
    }) => void;
    onRecordingStop?: (data: {
        txn_id: string;
        duration: number;
    }) => void;
    onProcessingStart?: (data: {
        txn_id: string;
    }) => void;
    onProcessingComplete?: (data: {
        txn_id: string;
        sessionData: unknown;
    }) => void;
    onError?: (data: {
        error_code: string;
        message: string;
    }) => void;
    onWidgetClose?: (data: {
        txn_id: string;
    }) => void;
}

export declare interface WidgetConfig {
    enabled: boolean;
    theme?: WidgetTheme;
    zIndex?: number;
    primaryColor?: string;
    position?: WidgetPosition;
    orientation?: 'horizontal' | 'vertical';
    callbacks?: WidgetCallbacks;
    sessionDefaults: {
        input_language: string[];
        output_format_template: {
            template_id: string;
            template_name?: string;
            template_type?: string;
        }[];
        model_type: string;
        mode: string;
    };
}

export declare interface WidgetPosition {
    bottom?: number;
    right?: number;
    top?: number;
    left?: number;
}

export declare enum WidgetState {
    COLLAPSED = "collapsed",
    RECORDING = "recording",
    PAUSED = "paused",
    PROCESSING = "processing",
    DONE = "done",
    ERROR = "error"
}

export declare type WidgetTheme = 'dark' | 'light';

export { }

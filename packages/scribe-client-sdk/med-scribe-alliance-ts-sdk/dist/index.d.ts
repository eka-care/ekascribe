export declare enum SessionStatus {
	CREATED = "created",
	RECORDING = "recording",
	INITIALIZED = "initialized",
	PROCESSING = "processing",
	COMPLETED = "completed",
	PARTIAL = "partial",
	FAILED = "failed",
	EXPIRED = "expired"
}
export declare enum TemplateStatus {
	SUCCESS = "success",
	PARTIAL_SUCCESS = "partial_success",
	FAILURE = "failure",
	IN_PROGRESS = "in-progress"
}
export declare enum UploadType {
	CHUNKED = "chunked",
	SINGLE = "single",
	STREAM = "stream"
}
export declare enum CommunicationProtocol {
	WEBSOCKET = "websocket",
	HTTP = "http",
	RPC = "rpc"
}
export declare enum TransportMode {
	DIRECT = "direct",
	IPC = "ipc"
}
declare enum RecordingState$1 {
	STARTED = "started",
	PAUSED = "paused",
	RESUMED = "resumed",
	ENDED = "ended"
}
export declare enum AudioEventType {
	USER_SPEECH = "user_speech",
	SILENCE_WARNING = "silence_warning",
	CHUNK_READY = "chunk_ready",
	FRAME_PROCESSED = "frame_processed"
}
export declare enum UploadEventType {
	PROGRESS = "progress",
	FAILED = "failed",
	RETRY = "retry"
}
export declare enum SessionEventType {
	CREATED = "created",
	ENDED = "ended",
	DISCARDED = "discarded",
	STATUS_UPDATE = "status_update",
	PARTIAL_RESULT = "partial_result"
}
export declare enum ErrorEventType {
	VAD_ERROR = "vad_error",
	WORKER_ERROR = "worker_error",
	TRANSPORT_ERROR = "transport_error",
	VALIDATION_ERROR = "validation_error"
}
export declare enum DiscardReason {
	CLEARED = "cleared",
	CANCELLED = "cancelled",
	RESET = "reset"
}
export declare enum ErrorCode {
	AUTHENTICATION_FAILED = "authentication_failed",
	TOKEN_EXPIRED = "token_expired",
	INVALID_API_KEY = "invalid_api_key",
	FORBIDDEN = "forbidden",
	RATE_LIMIT_EXCEEDED = "rate_limit_exceeded",
	SESSION_NOT_FOUND = "session_not_found",
	TEMPLATE_NOT_FOUND = "template_not_found",
	SESSION_EXPIRED = "session_expired",
	INVALID_REQUEST = "invalid_request",
	INVALID_AUDIO_FORMAT = "invalid_audio_format",
	CHUNK_TOO_LARGE = "chunk_too_large",
	INVALID_TEMPLATE = "invalid_template",
	MISSING_REQUIRED_FIELD = "missing_required_field",
	PROCESSING_FAILED = "processing_failed",
	AUDIO_QUALITY_POOR = "audio_quality_poor",
	AUDIO_TOO_SHORT = "audio_too_short",
	LANGUAGE_UNSUPPORTED = "language_unsupported",
	INTERNAL_ERROR = "internal_error",
	SERVICE_UNAVAILABLE = "service_unavailable",
	DISCOVERY_FAILED = "discovery_failed",
	TRANSPORT_ERROR = "transport_error",
	WORKER_ERROR = "worker_error",
	UPLOAD_FAILED = "upload_failed",
	VAD_ERROR = "vad_error",
	CHUNK_LENGTH_EXCEEDED = "chunk_length_exceeded",
	CHUNK_LIMIT_REACHED = "chunk_limit_reached",
	CHUNK_CREATION_FAILED = "chunk_creation_failed",
	WORKER_POST_FAILED = "worker_post_failed",
	SESSION_CREATION_FAILED = "session_creation_failed",
	RECORDER_INIT_FAILED = "recorder_init_failed",
	RECORDER_START_FAILED = "recorder_start_failed",
	VAD_START_FAILED = "vad_start_failed",
	STOP_FAILED = "stop_failed",
	INTERNAL_RETRY_FAILED = "internal_retry_failed",
	SESSION_END_FAILED = "session_end_failed",
	UNSUPPORTED_STORAGE_PROVIDER = "unsupported_storage_provider"
}
export declare enum HttpStatus {
	OK = 200,
	CREATED = 201,
	ACCEPTED = 202,
	BAD_REQUEST = 400,
	UNAUTHORIZED = 401,
	FORBIDDEN = 403,
	NOT_FOUND = 404,
	GONE = 410,
	PAYLOAD_TOO_LARGE = 413,
	UNPROCESSABLE_ENTITY = 422,
	TOO_MANY_REQUESTS = 429,
	INTERNAL_SERVER_ERROR = 500,
	SERVICE_UNAVAILABLE = 503
}
export declare class ScribeError extends Error {
	readonly code: ErrorCode | string;
	readonly httpStatus?: number;
	readonly details?: Record<string, any>;
	constructor(message: string, code?: ErrorCode | string, httpStatus?: number, details?: Record<string, any>);
	static fromApiError(apiError: ApiError, httpStatus?: number): ScribeError;
	toJSON(): Record<string, any>;
}
export declare class ValidationError extends ScribeError {
	constructor(message: string, details?: Record<string, any>);
}
export declare class DiscoveryError extends ScribeError {
	constructor(message: string, details?: Record<string, any>);
}
export declare class AuthenticationError extends ScribeError {
	constructor(message: string, details?: Record<string, any>);
}
export declare class ForbiddenError extends ScribeError {
	constructor(message: string, details?: Record<string, any>);
}
export declare class SessionNotFoundError extends ScribeError {
	constructor(sessionId: string);
}
export declare class SessionExpiredError extends ScribeError {
	constructor(sessionId: string, expiredAt?: string);
}
export declare class RateLimitError extends ScribeError {
	constructor(retryAfter?: number);
}
export declare class TransportError extends ScribeError {
	constructor(message: string, details?: Record<string, any>);
}
export declare class WorkerError extends ScribeError {
	constructor(message: string, details?: Record<string, any>);
}
export declare class UploadError extends ScribeError {
	readonly failedFiles: string[];
	constructor(message: string, failedFiles: string[], details?: Record<string, any>);
	toJSON(): Record<string, any>;
}
/** Thrown when discovery advertises a storage provider the SDK has no wrapper for. */
export declare class UnsupportedStorageProviderError extends ScribeError {
	readonly provider: string;
	constructor(provider: string);
}
export interface ApiError {
	code: ErrorCode | string;
	message: string;
	details?: Record<string, any>;
}
export interface ErrorResponse {
	error: ApiError;
}
/**
 * Result type for all public SDK methods.
 * Expected errors (API failures, auth, validation) are returned — not thrown.
 *
 * `httpStatus` is set when the result was produced by an HTTP call (success or error).
 * It will be undefined for purely local operations (e.g. cached discovery, no-op init).
 */
export type SDKResult<T = void> = {
	success: true;
	data: T;
	httpStatus?: number;
} | {
	success: false;
	error: ScribeError;
};
/**
 * Internal return shape for manager methods that wrap an HTTP call.
 * Carries the HTTP status alongside the parsed response data so the
 * ScribeClient boundary can surface it on SDKResult.
 *
 * For composed operations (e.g. recording start = createSession + recorder init),
 * httpStatus reflects the most relevant HTTP call. It is optional because some
 * code paths (cache hits, no-op flows) don't make a request.
 */
export type ApiCallResult<T> = {
	data: T;
	httpStatus?: number;
};
/**
 * Transport layer types
 */
export interface TransportRequest {
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	url: string;
	headers?: Record<string, string>;
	body?: any;
	isUpload?: boolean;
	uploadBlob?: Blob;
	uploadFileName?: string;
	/** Multipart form fields; when set, the request is multipart/form-data with uploadBlob as the file. */
	uploadFormFields?: Record<string, string>;
	/** Multipart field name for the file part. Defaults to 'file'. */
	uploadFileFieldName?: string;
	/** Attach the service Bearer + flavour header. Defaults to true; false for presigned uploads. */
	attachAuth?: boolean;
	/** Additional HTTP status codes to treat as success (not throw). */
	acceptStatuses?: number[];
	maxRetries?: number;
}
export interface TransportResponse<T = any> {
	status: number;
	headers: Record<string, string>;
	data: T;
}
export interface ITransport {
	request<T = any>(config: TransportRequest): Promise<TransportResponse<T>>;
	setAuthToken(token: string): void;
	/** Clean up pending requests and resources. */
	destroy?(): void;
}
/**
 * IPC bridge provided by the consumer (e.g. Electron host)
 */
export interface IpcBridge {
	send: (request: IpcRequest) => void;
	onResponse: (handler: (response: IpcResponse) => void) => void;
}
export interface IpcRequest {
	correlationId: string;
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: any;
	/** Base64-encoded file bytes for uploads. */
	blobData?: string;
	/** Multipart fields for presigned uploads — host builds multipart from these + blobData (no auth header). */
	uploadFormFields?: Record<string, string>;
	/** Multipart field name for the file part. Defaults to 'file'. */
	uploadFileFieldName?: string;
	/** File name for the multipart file part. */
	uploadFileName?: string;
}
export interface IpcResponse {
	correlationId: string;
	status: number;
	headers: Record<string, string>;
	body: any;
	error?: string;
}
export interface ScribeSDKConfig {
	/** Base URL of the scribe service (required) */
	baseUrl: string;
	/** Bearer token authentication */
	accessToken?: string;
	/** Transport mode: 'direct' (HTTP fetch) or 'ipc' (Electron IPC). Default: 'direct' */
	mode?: TransportMode;
	/** IPC bridge — required when mode is 'ipc' */
	ipcTransport?: IpcBridge;
	/** SharedWorker config: true (require), false (disable), 'auto' (detect). Default: 'auto' */
	useWorker?: boolean | "auto";
	/** URL to the worker.bundle.js file. Use getWorkerUrl() or createWorkerBlobUrl() to resolve. */
	workerScriptUrl?: string;
	/** Enable debug logging. Default: false */
	debug?: boolean;
	/** Auto-fetch discovery document on init. Default: true */
	autoDiscovery?: boolean;
	/**
	 * Optional `flavour` identifier. When set, the SDK sends it as the
	 * `flavour` header on every API request (including chunk uploads).
	 * Server uses this to route or tag requests per deployment variant.
	 */
	flavour?: string;
}
/**
 * Discovery document types (MedScribe Alliance Protocol)
 */
export interface DiscoveryDocument {
	protocol: string;
	protocol_version: string;
	supported_versions?: string[];
	service?: ServiceInfo;
	endpoints: EndpointsInfo;
	authentication: AuthenticationInfo;
	capabilities: CapabilitiesInfo;
	models?: ModelConfig[];
	languages: LanguagesInfo;
}
export interface ServiceInfo {
	name?: string;
	documentation_url?: string;
	support_email?: string;
}
export interface EndpointsInfo {
	base_url: string;
	webhooks_url?: string;
	authorization_endpoint?: string;
	token_endpoint?: string;
	templates_url?: string;
}
export interface AuthenticationInfo {
	supported_methods: string[];
	oidc?: {
		issuer: string;
		authorization_endpoint: string;
		token_endpoint: string;
		scopes_supported: string[];
	};
}
export interface CapabilitiesInfo {
	audio_formats: string[];
	max_chunk_duration_seconds: number;
	upload_methods?: string[];
	webhook_delivery?: boolean;
	client_sdk_delivery?: boolean;
	storage_provider?: string;
}
export interface ModelConfig {
	id: string;
	display_name?: string;
	languages?: string[];
	max_session_duration_seconds: number;
	response_speed?: string;
	features?: {
		realtime_transcription?: boolean;
		speaker_diarization?: boolean;
		custom_templates?: boolean;
	};
}
export interface LanguagesInfo {
	supported: string[];
	auto_detection?: boolean;
}
/**
 * Parsed runtime configuration derived from DiscoveryDocument.
 * Used by all layers at runtime for validation and configuration.
 */
export interface ResolvedConfig {
	baseUrl: string;
	webhooksUrl?: string;
	supportedLanguages: string[];
	autoDetectLanguage: boolean;
	supportedAudioFormats: string[];
	supportedUploadMethods: string[];
	storageProvider: string;
	maxChunkDurationSeconds: number;
	/** modelId -> max session duration in seconds */
	maxSessionDurationSeconds: Map<string, number>;
	supportedAuthMethods: string[];
	availableModels: ModelConfig[];
	webhookDelivery: boolean;
	clientSdkDelivery: boolean;
}
export interface PatientDetails {
	oid?: string;
	name?: string;
	age?: string;
	gender?: string;
	mobile?: number;
}
export interface CreateSessionRequest {
	templates: string[] | [
	];
	model?: string;
	language_hint?: string[];
	transcript_language?: string;
	upload_type: string;
	communication_protocol: string;
	additional_data?: Record<string, any>;
	session_mode?: string;
	patient_details?: PatientDetails;
	session_id?: string;
}
/** Provider-specific upload payload; validated/interpreted by the StorageProvider, not the session schema. */
export type SessionUploadInfo = Record<string, unknown>;
export interface CreateSessionResponse {
	session_id: string;
	status: SessionStatus;
	created_at: string;
	expires_at: string;
	upload_url: SessionUploadInfo;
	patient_details?: PatientDetails;
}
export interface EndSessionRequest {
	audio_files_sent: number;
	audio_files_uploaded: number;
}
export interface EndSessionResponse {
	session_id: string;
	status: SessionStatus;
	message: string;
	audio_files_received: number;
	audio_files: string[];
}
export interface GetSessionStatusResponse {
	session_id: string;
	status: SessionStatus;
	created_at: string;
	expires_at?: string | null;
	expired_at?: string | null;
	completed_at?: string | null;
	model_used?: string | null;
	language_detected?: string | null;
	audio_files_received: number;
	audio_files: string[];
	audio_files_processed?: number;
	additional_data: Record<string, any>;
	templates?: TemplateEntry[];
	transcript?: string;
	processing_errors?: ProcessingError[];
	error?: {
		code: string;
		message: string;
		details?: Record<string, any>;
	};
	patient_details?: PatientDetails;
	message?: string;
	upload_url?: SessionUploadInfo;
}
export interface TemplateEntry {
	[templateId: string]: TemplateEntryData;
}
export interface TemplateEntryData {
	status: TemplateStatus;
	data?: any;
	fhir?: any;
	error?: TemplateError;
	document_id?: string;
	document_type?: string;
	publish?: boolean;
	presigned_url?: string;
	presigned_url_expires_at?: string;
	errors?: any[];
	warnings?: any[];
}
export interface TemplateError {
	code: string;
	message: string;
}
export interface ProcessingError {
	type: string;
	message: string;
	file?: string;
}
export interface PollOptions {
	maxAttempts?: number;
	intervalMs?: number;
	timeoutMs?: number;
	onProgress?: (status: GetSessionStatusResponse) => void;
	/** AbortSignal to cancel polling early. */
	signal?: AbortSignal;
}
export interface PatchSessionRequest {
	user_status?: string;
	processing_status?: string;
	patient_details?: PatientDetails;
	additional_data?: Record<string, any>;
	language_hint?: string[];
	transcript_language?: string;
	templates?: string[];
}
export interface PatchSessionResponse {
	session_id: string;
	status: string;
	message: string;
}
export interface ProcessTemplateResponse {
	session_id: string;
	template_id: string;
	status: string;
	message: string;
}
export interface RecordingOptions {
	templates: string[] | [
	];
	model?: string;
	languageHint?: string[];
	transcriptLanguage?: string;
	uploadType?: string;
	communicationProtocol?: string;
	additionalData?: Record<string, any>;
	deviceId?: string;
	sessionMode?: string;
	patientDetails?: PatientDetails;
	sessionId?: string;
	/** Optional API version; sent as a `version` query param on the create-session request. */
	version?: string;
}
export interface RecorderConfig {
	accessToken?: string;
	/** Provider-specific upload payload from the create-session response. */
	upload: SessionUploadInfo;
	storageProvider: string;
	uploadHeaders: Record<string, string>;
	sessionId: string;
	refreshUploadUrl?: () => Promise<SessionUploadInfo | null>;
}
export interface IRecorder {
	initialize(session: CreateSessionResponse, config: RecorderConfig): void;
	start(deviceId?: string): Promise<void>;
	pause(): void;
	resume(): void;
	stop(): Promise<StopRecordingResult>;
	reset(): void;
	isPaused(): boolean;
}
export interface StopRecordingResult {
	failedUploads: string[];
	totalFiles: number;
}
/**
 * Result of ScribeClient.endRecording() / RecordingManager.stop().
 */
export interface EndRecordingResult extends StopRecordingResult {
	sessionEnded: boolean;
	endSessionResponse?: EndSessionResponse;
}
/**
 * Audio chunk metadata tracked by AudioFileManager
 */
export type AudioChunkInfo = {
	fileName: string;
	timestamp: {
		st: string;
		et: string;
	};
	response?: string;
} & ({
	status: "pending";
	audioFrames?: Float32Array;
	fileBlob?: Blob;
} | {
	status: "success";
	audioFrames?: undefined;
	fileBlob?: undefined;
} | {
	status: "failure";
	fileBlob: Blob;
	audioFrames?: undefined;
});
export interface RetryUploadResult {
	/** Number of files retried */
	retried: number;
	/** Number that succeeded on retry */
	succeeded: number;
	/** File names that still failed after retry */
	stillFailed: string[];
}
/** Result of ScribeClient.uploadAudioFile() — the storage backend's full response. */
export interface UploadAudioFileResult {
	/** The storage object name used. */
	fileName: string;
	/** HTTP status from the storage backend (e.g. 204 for an S3 presigned POST). */
	status: number;
	/** Response headers from the storage backend (e.g. ETag). */
	headers: Record<string, string>;
	/** Raw response body from the storage backend (often empty for S3). */
	response: unknown;
}
export interface RecordingStateChangeEvent {
	type: RecordingState$1;
	timestamp: string;
	data?: any;
}
export interface AudioEventUserSpeech {
	type: AudioEventType.USER_SPEECH;
	timestamp: string;
	data: {
		isSpeaking: boolean;
	};
}
export interface AudioEventSilenceWarning {
	type: AudioEventType.SILENCE_WARNING;
	timestamp: string;
	data: {
		durationMs: number;
	};
}
export interface AudioEventChunkReady {
	type: AudioEventType.CHUNK_READY;
	timestamp: string;
	data: {
		chunkIndex: number;
		fileName: string;
		chunkData: Uint8Array[];
	};
}
export interface AudioEventFrameProcessed {
	type: AudioEventType.FRAME_PROCESSED;
	timestamp: string;
	data: {
		isSpeech: number;
		notSpeech: number;
		frame: Float32Array;
		duration: number;
	};
}
export type AudioEvent = AudioEventUserSpeech | AudioEventSilenceWarning | AudioEventChunkReady | AudioEventFrameProcessed;
export interface UploadEventProgress {
	type: UploadEventType.PROGRESS;
	timestamp: string;
	data: {
		successCount: number;
		totalCount: number;
	};
}
export interface UploadEventFailed {
	type: UploadEventType.FAILED;
	timestamp: string;
	data: {
		fileName: string;
		error: string;
	};
}
export interface UploadEventRetry {
	type: UploadEventType.RETRY;
	timestamp: string;
	data: {
		fileName: string;
		attempt: number;
	};
}
export type UploadEvent = UploadEventProgress | UploadEventFailed | UploadEventRetry;
export interface SessionEventCreated {
	type: SessionEventType.CREATED;
	timestamp: string;
	data: CreateSessionResponse;
}
export interface SessionEventEnded {
	type: SessionEventType.ENDED;
	timestamp: string;
	data: EndSessionResponse;
}
export interface SessionEventDiscarded {
	type: SessionEventType.DISCARDED;
	timestamp: string;
	data: {
		sessionId: string | null;
		reason: DiscardReason;
	};
}
export interface SessionEventStatusUpdate {
	type: SessionEventType.STATUS_UPDATE;
	timestamp: string;
	data: GetSessionStatusResponse;
}
export interface SessionEventPartialResult {
	type: SessionEventType.PARTIAL_RESULT;
	timestamp: string;
	data: any;
}
export type SessionEvent = SessionEventCreated | SessionEventEnded | SessionEventDiscarded | SessionEventStatusUpdate | SessionEventPartialResult;
interface ErrorEvent$1 {
	type: ErrorEventType;
	timestamp: string;
	error: {
		code: ErrorCode;
		message: string;
		details?: any;
	};
}
export interface TokenRequiredEvent {
	resolve: (newToken: string) => void;
}
export interface CallbackMap {
	onRecordingStateChange: (event: RecordingStateChangeEvent) => void;
	onAudioEvent: (event: AudioEvent) => void;
	onUploadEvent: (event: UploadEvent) => void;
	onSessionEvent: (event: SessionEvent) => void;
	onError: (event: ErrorEvent$1) => void;
	onTokenRequired: (event: TokenRequiredEvent) => void;
}
export type CallbackName = keyof CallbackMap;
/**
 * SharedWorker message protocol types
 */
export interface WorkerCompressAndUploadMessage {
	type: "compress_and_upload";
	audioFrames: Float32Array;
	fileName: string;
	storageProvider: string;
	/** Provider-specific upload payload from the create-session response. */
	upload: unknown;
	headers: Record<string, string>;
}
export interface WorkerWaitForUploadsMessage {
	type: "wait_for_all_uploads";
}
export interface WorkerUpdateTokenMessage {
	type: "update_auth_token";
	token: string;
}
/** Fresh upload payload sent in response to an upload_url_required request. */
export interface WorkerUpdateUploadUrlMessage {
	type: "update_upload_url";
	/** Provider-specific upload payload from a fresh getSessionStatus call. Null = no refresh available. */
	upload: unknown | null;
}
export interface WorkerTerminateMessage {
	type: "terminate";
}
export type MainToWorkerMessage = WorkerCompressAndUploadMessage | WorkerWaitForUploadsMessage | WorkerUpdateTokenMessage | WorkerUpdateUploadUrlMessage | WorkerTerminateMessage;
export interface WorkerChunkEncodedMessage {
	type: "chunk_encoded";
	fileName: string;
	chunkData: Uint8Array[];
}
export interface WorkerUploadSuccessMessage {
	type: "upload_success";
	fileName: string;
}
export interface WorkerUploadFailedMessage {
	type: "upload_failed";
	fileName: string;
	error: string;
	chunkData?: Uint8Array[];
}
export interface WorkerAllUploadsCompleteMessage {
	type: "all_uploads_complete";
}
export interface WorkerTokenRequiredMessage {
	type: "token_required";
}
/** Worker hit an upload error and wants a fresh upload_url before retrying. */
export interface WorkerUploadUrlRequiredMessage {
	type: "upload_url_required";
	fileName: string;
}
export type WorkerToMainMessage = WorkerChunkEncodedMessage | WorkerUploadSuccessMessage | WorkerUploadFailedMessage | WorkerAllUploadsCompleteMessage | WorkerTokenRequiredMessage | WorkerUploadUrlRequiredMessage;
export declare class ScribeClient {
	private config;
	private transport;
	private callbackRegistry;
	private validator;
	private discoveryManager;
	private sessionManager;
	private recordingManager;
	private isInitialized;
	constructor(config: ScribeSDKConfig);
	/**
	 * Initialize the SDK — fetches the discovery document if autoDiscovery is enabled.
	 * Must be called before starting a recording.
	 */
	init(): Promise<SDKResult<void>>;
	/**
	 * Start a recording session.
	 * Calls init() automatically if not already initialized.
	 */
	startRecording(options: RecordingOptions): Promise<SDKResult<CreateSessionResponse>>;
	/**
	 * Start recording for an already-created session.
	 * Use this when the session was created via createSession() and you want
	 * to attach a recorder to it.
	 *
	 * @param session - The session response from createSession()
	 * @param options - Upload type ('chunked' | 'single') and optional deviceId
	 */
	startRecordingWithSession(session: CreateSessionResponse, options?: {
		uploadType?: string;
		deviceId?: string;
		version?: string;
	}): Promise<SDKResult<void>>;
	/**
	 * Pause the active recording.
	 */
	pauseRecording(): void;
	/**
	 * Resume a paused recording.
	 */
	resumeRecording(): void;
	/**
	 * End the active recording.
	 *
	 * Stops the recorder, flushes pending audio, waits for uploads, and — if
	 * everything uploaded — ends the session. If any chunks failed to upload,
	 * the SDK runs one internal retry pass; if files still fail, the session
	 * is NOT ended and the result reports `sessionEnded: false`.
	 */
	endRecording(): Promise<SDKResult<EndRecordingResult>>;
	/**
	 * Retry uploading audio files that failed during the last recording.
	 *
	 * Available after `endRecording()` returns `sessionEnded: false` (or any time
	 * `hasFailedUploads()` is true). After retrying, call `endSession()` to
	 * finalize. Retry context is cleared on `reset()` or the next `startRecording()`.
	 */
	retryFailedUploads(): Promise<SDKResult<RetryUploadResult>>;
	/**
	 * Check if there are failed uploads from the last recording that can be retried.
	 */
	hasFailedUploads(): boolean;
	/**
	 * Check if a recording is currently active.
	 */
	isRecording(): boolean;
	/**
	 * Check if the active recording is paused.
	 */
	isRecordingPaused(): boolean;
	/**
	 * Override the 500-chunk session limit, allowing unlimited chunks.
	 * Call this after receiving a 'chunk_limit_reached' error to resume chunk uploads.
	 */
	forceAllowMoreChunks(): void;
	/**
	 * Upload a single pre-recorded audio file to storage.
	 * @param file - The audio file/blob to upload.
	 * @param fileName - Storage object name, e.g. "1.mp3".
	 * @param upload - The `upload_url` payload from the create-session response.
	 */
	uploadAudioFile(file: Blob, fileName: string, upload: SessionUploadInfo): Promise<SDKResult<UploadAudioFileResult>>;
	/**
	 * Create a session directly (without starting a recording).
	 */
	createSession(sessionRequest: CreateSessionRequest, version?: string): Promise<SDKResult<CreateSessionResponse>>;
	/**
	 * End a session directly.
	 */
	endSession(request: EndSessionRequest, sessionId?: string): Promise<SDKResult<EndSessionResponse>>;
	/**
	 * Get the status of a session.
	 * Uses the current active session if no sessionId is provided.
	 *
	 * Pass `poll` options to keep checking until the session reaches a
	 * terminal state (completed, partial, failed, expired) or times out.
	 *
	 * Pass `templateId` to filter status for a specific template.
	 * Pass `version` to target a specific API version (attached as a query param).
	 */
	getSessionStatus(sessionId?: string, options?: {
		poll?: PollOptions;
		templateId?: string;
		version?: string;
	}): Promise<SDKResult<GetSessionStatusResponse>>;
	/**
	 * Get the current active session, if any.
	 */
	getCurrentSession(): CreateSessionResponse | null;
	/**
	 * Patch/update a session (e.g., update user_status or processing_status).
	 * Uses the current active session if no sessionId is provided.
	 */
	updateSession(request: PatchSessionRequest, sessionId?: string): Promise<SDKResult<PatchSessionResponse>>;
	/**
	 * Trigger processing for a specific template in a session.
	 * Uses the current active session if no sessionId is provided.
	 */
	processTemplate(templateId: string, sessionId?: string): Promise<SDKResult<ProcessTemplateResponse>>;
	/**
	 * Cancel a session by setting both user_status and processing_status to 'cancelled'.
	 * Uses the current active session if no sessionId is provided.
	 */
	cancelSession(sessionId?: string): Promise<SDKResult<PatchSessionResponse>>;
	/**
	 * Get the resolved discovery config.
	 * Returns error if discovery hasn't been fetched yet.
	 */
	getDiscoveryConfig(): SDKResult<ResolvedConfig>;
	/**
	 * Get the raw discovery document.
	 */
	getDiscoveryDocument(): DiscoveryDocument | null;
	/**
	 * Force refresh the discovery document.
	 */
	refreshDiscovery(): Promise<SDKResult<ResolvedConfig>>;
	/**
	 * Register a callback handler.
	 *
	 * @example
	 * client.registerCallback('onAudioEvent', (event) => {
	 *   if (event.type === 'user_speech') console.log('Speaking:', event.data.isSpeaking);
	 * });
	 */
	registerCallback<K extends CallbackName>(name: K, handler: CallbackMap[K]): void;
	/**
	 * Remove a previously registered callback handler.
	 */
	removeCallback<K extends CallbackName>(name: K, handler: CallbackMap[K]): void;
	/**
	 * Update the Bearer token. Propagates to transport, active recorder, and worker.
	 */
	setAccessToken(token: string): void;
	/**
	 * Lightweight cleanup between back-to-back sessions.
	 *
	 * Stops any active recording, resets the recording pipeline (VAD, mic,
	 * buffers, worker), and clears the current session reference. Does NOT
	 * touch callbacks, discovery cache, transport, or initialization state —
	 * use `reset()` for a full teardown.
	 */
	clearRecordingState(): void;
	/**
	 * Full reset — stops recording if active, clears all caches and state.
	 */
	reset(): Promise<void>;
	/**
	 * Wraps an async manager operation into SDKResult.
	 * Internal manager methods always return `ApiCallResult<T>` so the HTTP
	 * status from the underlying call (when present) is propagated to the
	 * SDKResult success variant. On error, status is preserved via
	 * `error.httpStatus`.
	 */
	private wrapResult;
	/**
	 * Ensures any error is a ScribeError instance.
	 */
	private toScribeError;
	/**
	 * Create the transport layer (HTTP or IPC) with 401 auto-retry wiring.
	 *
	 * How 401 auto-retry works:
	 * 1. Transport gets a 401 response → calls onUnauthorized()
	 * 2. onUnauthorized dispatches the 'onTokenRequired' callback to the consumer
	 * 3. Consumer calls resolve(newToken) → token is propagated via setAccessToken()
	 * 4. Promise resolves with the new token → transport retries the request once
	 *
	 * Deduplication: Transport holds a single tokenRefreshPromise — if multiple
	 * requests get 401 concurrently, they all await the same promise, so only
	 * ONE onTokenRequired callback fires regardless of how many requests failed.
	 *
	 * Timeout: If no handler is registered or the consumer never calls resolve(),
	 * the promise resolves with undefined after 10s → transport skips retry.
	 */
	private createTransport;
	private resolveWorkerConfig;
	/** Storage provider name from discovery; defaults to 'aws'. */
	private getStorageProviderName;
	/**
	 * Get the effective base URL — prefer discovery's base_url, fall back to config.
	 */
	private getEffectiveBaseUrl;
	private validateConfig;
}
/**
 * Storage provider abstraction — the only part of the upload flow that varies
 * between backends (AWS S3, GCP, ...). A provider is a pure, DOM-free request
 * builder so it runs on the main thread, in the SharedWorker, and over IPC.
 *
 * To add a provider: implement StorageProvider in `<name>-provider.ts` and
 * register it in `storage-provider-factory.ts`. No other changes needed.
 */
export interface UploadContext {
	fileName: string;
	blob: Blob;
	upload: unknown;
}
export interface PreparedUpload {
	url: string;
	method: "POST" | "PUT";
	bodyMode: "multipart" | "binary";
	formFields?: Record<string, string>;
	fileFieldName?: string;
	headers: Record<string, string>;
	attachAuth: boolean;
}
export interface StorageProvider {
	/** Matches discovery's `capabilities.storage_provider`. */
	readonly name: string;
	/** @throws UploadError if the upload payload is malformed. */
	prepareUpload(ctx: UploadContext): PreparedUpload;
}
export declare class AwsS3StorageProvider implements StorageProvider {
	readonly name = "aws";
	prepareUpload({ fileName, blob, upload }: UploadContext): PreparedUpload;
}
export declare function isStorageProviderSupported(name: string): boolean;
/** @throws UnsupportedStorageProviderError if no wrapper is registered. */
export declare function getStorageProvider(name: string): StorageProvider;
export declare class CallbackRegistry {
	private handlers;
	/**
	 * Register a handler for a callback name.
	 * The same handler reference won't be added twice.
	 */
	register<K extends CallbackName>(name: K, handler: CallbackMap[K]): void;
	/**
	 * Remove a previously registered handler.
	 */
	remove<K extends CallbackName>(name: K, handler: CallbackMap[K]): void;
	/**
	 * Remove all handlers for a specific callback name,
	 * or all handlers entirely if no name is provided.
	 */
	removeAll(name?: CallbackName): void;
	/**
	 * Dispatch an event to all registered handlers for the given callback name.
	 * Each handler is invoked in a try/catch — one failing handler does not
	 * prevent other handlers from executing.
	 */
	dispatch<K extends CallbackName>(name: K, event: Parameters<CallbackMap[K]>[0]): void;
	/**
	 * Check if any handlers are registered for a callback name.
	 */
	hasHandlers(name: CallbackName): boolean;
}
export declare class Validator {
	validateDiscoveryResponse(data: unknown): void;
	validateCreateSessionRequest(data: unknown): void;
	validateEndSessionRequest(data: unknown): void;
	validateCreateSessionResponse(data: unknown): void;
	validateEndSessionResponse(data: unknown): void;
	validateGetSessionStatusResponse(data: unknown): void;
	validateSessionId(sessionId: unknown): void;
	validateRecordingOptions(data: unknown): void;
	validatePatchSessionRequest(data: unknown): void;
	validatePatchSessionResponse(data: unknown): void;
	validateProcessTemplateResponse(data: unknown): void;
	/**
	 * Cross-validates recording options against the server's declared capabilities.
	 * Throws ValidationError with a descriptive message if any check fails.
	 */
	validateAgainstDiscovery(options: RecordingOptions, config: ResolvedConfig): void;
	/**
	 * Parses data against a Zod schema. On failure, converts ZodError
	 * into our ValidationError with a human-readable message.
	 */
	private parseWithValidationError;
	private formatZodIssues;
	private checkUploadType;
	private checkLanguageHint;
	private checkModel;
}
export declare class DiscoveryManager {
	private transport;
	private validator;
	private debug;
	private cachedDocument;
	private resolvedConfig;
	private cacheTimestamp;
	private cacheTtlMs;
	constructor(transport: ITransport, validator: Validator, debug?: boolean);
	/**
	 * Fetch and validate the discovery document from the well-known endpoint.
	 * Caches the result for 1 hour (configurable).
	 */
	fetchDiscovery(baseUrl: string, forceRefresh?: boolean): Promise<ApiCallResult<ResolvedConfig>>;
	/**
	 * Get the resolved runtime config. Throws if discovery hasn't been fetched.
	 */
	getResolvedConfig(): ResolvedConfig;
	/**
	 * Get the raw discovery document as received from the server.
	 */
	getDiscoveryDocument(): DiscoveryDocument | null;
	getSupportedLanguages(): string[];
	getSupportedAudioFormats(): string[];
	getSupportedUploadMethods(): string[];
	getAvailableModels(): ModelConfig[];
	getMaxChunkDuration(): number;
	getMaxSessionDuration(modelId?: string): number;
	getServiceInfo(): ServiceInfo | undefined;
	getCapabilities(): CapabilitiesInfo | undefined;
	isFeatureSupported(feature: "realtime_transcription" | "speaker_diarization" | "custom_templates"): boolean;
	clearCache(): void;
	private isCacheValid;
}
export declare class SessionManager {
	private transport;
	private validator;
	private debug;
	private currentSession;
	constructor(transport: ITransport, validator: Validator, debug?: boolean);
	/**
	 * Create a new scribe session.
	 * Validates the request structure, sends to server, validates response.
	 */
	createSession(baseUrl: string, request: CreateSessionRequest, version?: string): Promise<ApiCallResult<CreateSessionResponse>>;
	/**
	 * End an active session.
	 * If no sessionId is provided, ends the current session.
	 */
	endSession(baseUrl: string, request: EndSessionRequest, sessionId?: string): Promise<ApiCallResult<EndSessionResponse>>;
	/**
	 * Get the status of a session.
	 * If no sessionId is provided, queries the current session.
	 * Pass templateId to filter status for a specific template.
	 */
	getSessionStatus(baseUrl: string, sessionId?: string, templateId?: string, version?: string): Promise<ApiCallResult<GetSessionStatusResponse>>;
	/**
	 * Patch an existing session (e.g., update user_status or processing_status).
	 */
	patchSession(baseUrl: string, request: PatchSessionRequest, sessionId?: string): Promise<ApiCallResult<PatchSessionResponse>>;
	/**
	 * Trigger processing for a specific template in a session.
	 */
	processTemplate(baseUrl: string, templateId: string, sessionId?: string): Promise<ApiCallResult<ProcessTemplateResponse>>;
	/**
	 * Poll for session completion.
	 * Keeps checking getSessionStatus until the session reaches a terminal state
	 * (completed, partial, or failed) or the max attempts are exhausted.
	 * Pass templateId to filter the returned status for a specific template.
	 */
	pollForCompletion(baseUrl: string, sessionId?: string, options?: PollOptions, templateId?: string, version?: string): Promise<ApiCallResult<GetSessionStatusResponse>>;
	/**
	 * Get the current active session, if any.
	 */
	getCurrentSession(): CreateSessionResponse | null;
	/**
	 * Clear the current session reference.
	 * Used when recording is stopped or session is explicitly cleared.
	 */
	clearCurrentSession(): void;
	/**
	 * Check if a session status is terminal (no more processing will happen).
	 */
	private isTerminalStatus;
	private sleep;
	/**
	 * Sleep that can be interrupted by an AbortSignal.
	 */
	private sleepWithAbort;
}
export interface WorkerManagerConfig {
	/** Path to the compiled shared-worker.js bundle. Required for SharedWorker mode. */
	workerScriptUrl?: string;
	/** If true, skip SharedWorker and always run on main thread via ITransport. */
	forceMainThread?: boolean;
}
export interface RecordingManagerConfig {
	workerConfig?: WorkerManagerConfig;
	debug?: boolean;
	/** Optional `flavour` identifier — sent as a header on chunk upload requests. */
	flavour?: string;
}
export declare class RecordingManager {
	private callbackRegistry;
	private sessionManager;
	private discoveryManager;
	private transport;
	private config;
	private recorder;
	private activeSession;
	private activeBaseUrl;
	private activeUploadUrlRefresher;
	private _isRecording;
	private _isStarting;
	private _startGeneration;
	private retryContext;
	constructor(callbackRegistry: CallbackRegistry, sessionManager: SessionManager, discoveryManager: DiscoveryManager, transport: ITransport, config?: RecordingManagerConfig);
	/**
	 * Start a recording session:
	 * 1. Map RecordingOptions → CreateSessionRequest
	 * 2. Create session via SessionManager
	 * 3. Create and initialize the appropriate recorder
	 * 4. Start recording
	 * 5. Dispatch events
	 *
	 * Race-safety: Uses a generation counter (`_startGeneration`) so that if
	 * clearRecordingState() or reset() is called while this method is suspended
	 * at an `await`, the resumed call detects the mismatch and aborts instead
	 * of creating an orphaned recorder with a leaked mic/VAD.
	 *
	 * @param baseUrl - Server base URL (from discovery or SDK config)
	 * @param options - Recording options (templates, model, etc.)
	 * @param accessToken - Current Bearer token for upload auth headers
	 * @returns The created session response
	 */
	start(baseUrl: string, options: RecordingOptions, accessToken?: string): Promise<ApiCallResult<CreateSessionResponse>>;
	/**
	 * Start recording for an already-created session.
	 * Use this when the session was created externally (e.g. via createSession())
	 * and you want to attach a recorder to it.
	 *
	 * @param baseUrl - Server base URL for ending session later
	 * @param session - The existing session response (must have upload_url)
	 * @param options - Upload type and optional device ID
	 * @param accessToken - Current Bearer token for upload auth headers
	 */
	startWithExistingSession(baseUrl: string, session: CreateSessionResponse, options?: {
		uploadType?: string;
		deviceId?: string;
		version?: string;
	}, accessToken?: string): Promise<ApiCallResult<void>>;
	/**
	 * Pause the active recording.
	 */
	pause(): void;
	/**
	 * Resume a paused recording.
	 */
	resume(): void;
	stop(): Promise<ApiCallResult<EndRecordingResult>>;
	/**
	 * End the session, dispatch onSessionEvent, and return the response.
	 * Called from stop() (auto-finalize) and finalizeAfterExternalEndSession()
	 * (consumer-driven). Returns undefined and dispatches onError on failure.
	 * Caller is responsible for cleanup.
	 */
	private finalizeSession;
	/**
	 * Immediately stop the recorder without calling endSession or waiting for uploads.
	 * Used by cancelSession — we don't want the server to start processing
	 * and don't want to block on pending uploads.
	 */
	forceStop(): void;
	/**
	 * Override the session chunk limit, allowing unlimited chunks.
	 * Only applies to ChunkedRecorder.
	 */
	forceAllowMoreChunks(): void;
	/**
	 * Update the auth token for the active recording.
	 * Forwards to the active recorder (which updates WorkerManager/transport).
	 */
	updateAuthToken(token: string): void;
	/**
	 * Reset everything — force-stops if recording, clears state.
	 */
	reset(): void;
	isRecording(): boolean;
	isPaused(): boolean;
	getActiveSession(): CreateSessionResponse | null;
	/**
	 * Check if there are failed uploads from the last recording that can be retried.
	 */
	hasFailedUploads(): boolean;
	/**
	 * Called by ScribeClient.endSession() after a successful external endSession.
	 * Clears the preserved recording-manager state (activeSession, activeBaseUrl,
	 * retryContext) when the ended session matches our active one.
	 *
	 * If the consumer ended a different session, leaves our state alone.
	 */
	finalizeAfterExternalEndSession(sessionId: string): void;
	/**
	 * Retry uploading audio files that failed during the last recording.
	 * Uses the stored MP3 blobs and the same storage provider as the recording.
	 *
	 * Each file is re-uploaded via transport.request() with retry logic.
	 * Successfully retried files are removed from the retry context.
	 */
	retryFailedUploads(): Promise<ApiCallResult<RetryUploadResult>>;
	/**
	 * Create the appropriate recorder based on upload type.
	 */
	private createRecorder;
	/** Storage provider name from discovery; defaults to 'aws'. */
	private getStorageProviderName;
	/** Validate the provider has a wrapper (throws UnsupportedStorageProviderError) and return its name. */
	private resolveStorageProviderName;
	/**
	 * Build upload headers from the current auth state.
	 */
	private buildUploadHeaders;
	private buildUploadUrlRefresher;
	private fetchFreshUploadUrl;
	/**
	 * Apply discovery-driven overrides to ChunkedRecorder's VAD config.
	 * For example, max_chunk_duration_seconds from discovery overrides the default.
	 */
	private applyDiscoveryOverrides;
	/**
	 * Dispatch an error event for a specific start() step failure.
	 */
	private dispatchStartError;
	/**
	 * Extract failed chunks with their blobs from the recorder
	 * before cleanup destroys the recorder state.
	 * Supports both ChunkedRecorder and SingleRecorder.
	 */
	private preserveRetryContext;
	/**
	 * Clean up recording state after stop or error.
	 */
	private cleanupRecordingState;
	/**
	 * Release the recorder (mic, VAD, worker) but preserve session + retry context
	 * so the consumer can call retryFailedUploads() and endSession() explicitly.
	 *
	 * Used when stop() decides NOT to auto-end the session because uploads still
	 * failed after the internal retry pass.
	 */
	private partialCleanupAfterFailedFinalize;
}
export declare class HttpTransport implements ITransport {
	private accessToken?;
	private flavour?;
	private debug;
	private onUnauthorized?;
	private tokenRefreshPromise;
	constructor(options: {
		accessToken?: string;
		flavour?: string;
		debug?: boolean;
		onUnauthorized?: () => Promise<string | undefined>;
	});
	setAuthToken(token: string): void;
	request<T = any>(config: TransportRequest): Promise<TransportResponse<T>>;
	private executeRequest;
	/**
	 * Execute a single fetch call with current auth headers.
	 */
	private doFetch;
	/**
	 * Deduplicated token refresh.
	 * If multiple requests get 401 simultaneously, only one onTokenRequired
	 * callback fires — the rest await the same promise.
	 */
	private refreshToken;
	private buildHeaders;
	private buildRequestInit;
	private buildSuccessResponse;
	/**
	 * Maps HTTP error responses to typed SDK errors and throws.
	 * 401 is NOT handled here — it's handled in executeRequest with auto-retry.
	 */
	private handleErrorResponse;
	private extractHeaders;
	/**
	 * Cancel in-flight fetch requests by aborting (best-effort).
	 * HttpTransport has no pending-request map, so this is a no-op.
	 * Included for ITransport interface parity with IpcTransport.
	 */
	destroy(): void;
	private getRetryOptions;
}
export declare class IpcTransport implements ITransport {
	private bridge;
	private pendingRequests;
	private accessToken?;
	private flavour?;
	private debug;
	private correlationCounter;
	private onUnauthorized?;
	private tokenRefreshPromise;
	constructor(options: {
		bridge: IpcBridge;
		accessToken?: string;
		flavour?: string;
		debug?: boolean;
		onUnauthorized?: () => Promise<string | undefined>;
	});
	setAuthToken(token: string): void;
	request<T = any>(config: TransportRequest): Promise<TransportResponse<T>>;
	private executeRequest;
	/**
	 * Execute a single IPC request with current auth headers.
	 */
	private doIpcRequest;
	/**
	 * Deduplicated token refresh.
	 * If multiple requests get 401 simultaneously, only one onTokenRequired
	 * callback fires — the rest await the same promise.
	 */
	private refreshToken;
	private buildHeaders;
	private buildIpcRequest;
	private sendAndWait;
	private handleResponse;
	/**
	 * Maps IPC error responses to typed SDK errors and throws.
	 * 401 is NOT handled here — it's handled in executeRequest with auto-retry.
	 */
	private handleErrorResponse;
	private generateCorrelationId;
	private uint8ArrayToBase64;
	private getRetryOptions;
	/**
	 * Clean up pending requests (e.g. on SDK reset).
	 */
	destroy(): void;
}
/**
 * Returns the best-guess URL for the SharedWorker bundle.
 *
 * @example
 * ```ts
 * import { ScribeClient, getWorkerUrl } from 'med-scribe-alliance-ts-sdk';
 *
 * const client = new ScribeClient({
 *   baseUrl: 'https://api.example.com',
 *   workerScriptUrl: getWorkerUrl(),
 * });
 * ```
 *
 * @example
 * ```ts
 * // Global override (set before SDK loads)
 * window.__MEDSCRIBE_WORKER_URL__ = '/assets/worker.bundle.js';
 * ```
 *
 * @example
 * ```ts
 * // CDN blob URL (works around CORS restrictions on SharedWorker)
 * const workerUrl = await createWorkerBlobUrl();
 * ```
 */
export declare function getWorkerUrl(): string;
/**
 * Fetches the worker script from a URL and creates a blob URL.
 * Useful when the worker file is on a CDN (SharedWorker requires same-origin).
 *
 * @param url - URL to fetch the worker script from.
 *              Defaults to jsDelivr CDN for this package.
 * @returns A blob URL that can be used as workerScriptUrl
 *
 * @example
 * ```ts
 * const workerUrl = await createWorkerBlobUrl();
 * const client = new ScribeClient({
 *   baseUrl: 'https://api.example.com',
 *   workerScriptUrl: workerUrl,
 * });
 * ```
 */
export declare function createWorkerBlobUrl(url?: string): Promise<string>;

export {
	ErrorEvent$1 as ErrorEvent,
	RecordingState$1 as RecordingState,
};

export {};

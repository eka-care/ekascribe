import * as e from "zod";
import { MicVAD as t } from "@ricky0123/vad-web";
import * as n from "@breezystack/lamejs";
//#region src/constants/index.ts
var r = "/.well-known/medscribealliance", i = 3600 * 1e3, a = /* @__PURE__ */ function(e) {
	return e.CREATED = "created", e.RECORDING = "recording", e.INITIALIZED = "initialized", e.PROCESSING = "processing", e.COMPLETED = "completed", e.PARTIAL = "partial", e.FAILED = "failed", e.EXPIRED = "expired", e;
}({}), o = /* @__PURE__ */ function(e) {
	return e.SUCCESS = "success", e.PARTIAL_SUCCESS = "partial_success", e.FAILURE = "failure", e.IN_PROGRESS = "in-progress", e;
}({}), s = /* @__PURE__ */ function(e) {
	return e.CHUNKED = "chunked", e.SINGLE = "single", e.STREAM = "stream", e;
}({}), c = /* @__PURE__ */ function(e) {
	return e.WEBSOCKET = "websocket", e.HTTP = "http", e.RPC = "rpc", e;
}({}), l = /* @__PURE__ */ function(e) {
	return e.DIRECT = "direct", e.IPC = "ipc", e;
}({}), u = /* @__PURE__ */ function(e) {
	return e.STARTED = "started", e.PAUSED = "paused", e.RESUMED = "resumed", e.ENDED = "ended", e;
}({}), d = /* @__PURE__ */ function(e) {
	return e.USER_SPEECH = "user_speech", e.SILENCE_WARNING = "silence_warning", e.CHUNK_READY = "chunk_ready", e.FRAME_PROCESSED = "frame_processed", e;
}({}), f = /* @__PURE__ */ function(e) {
	return e.PROGRESS = "progress", e.FAILED = "failed", e.RETRY = "retry", e;
}({}), p = /* @__PURE__ */ function(e) {
	return e.CREATED = "created", e.ENDED = "ended", e.DISCARDED = "discarded", e.STATUS_UPDATE = "status_update", e.PARTIAL_RESULT = "partial_result", e;
}({}), m = /* @__PURE__ */ function(e) {
	return e.VAD_ERROR = "vad_error", e.WORKER_ERROR = "worker_error", e.TRANSPORT_ERROR = "transport_error", e.VALIDATION_ERROR = "validation_error", e;
}({}), h = /* @__PURE__ */ function(e) {
	return e.CLEARED = "cleared", e.CANCELLED = "cancelled", e.RESET = "reset", e;
}({}), g = /* @__PURE__ */ function(e) {
	return e.AUTHENTICATION_FAILED = "authentication_failed", e.TOKEN_EXPIRED = "token_expired", e.INVALID_API_KEY = "invalid_api_key", e.FORBIDDEN = "forbidden", e.RATE_LIMIT_EXCEEDED = "rate_limit_exceeded", e.SESSION_NOT_FOUND = "session_not_found", e.TEMPLATE_NOT_FOUND = "template_not_found", e.SESSION_EXPIRED = "session_expired", e.INVALID_REQUEST = "invalid_request", e.INVALID_AUDIO_FORMAT = "invalid_audio_format", e.CHUNK_TOO_LARGE = "chunk_too_large", e.INVALID_TEMPLATE = "invalid_template", e.MISSING_REQUIRED_FIELD = "missing_required_field", e.PROCESSING_FAILED = "processing_failed", e.AUDIO_QUALITY_POOR = "audio_quality_poor", e.AUDIO_TOO_SHORT = "audio_too_short", e.LANGUAGE_UNSUPPORTED = "language_unsupported", e.INTERNAL_ERROR = "internal_error", e.SERVICE_UNAVAILABLE = "service_unavailable", e.DISCOVERY_FAILED = "discovery_failed", e.TRANSPORT_ERROR = "transport_error", e.WORKER_ERROR = "worker_error", e.UPLOAD_FAILED = "upload_failed", e.VAD_ERROR = "vad_error", e.CHUNK_LENGTH_EXCEEDED = "chunk_length_exceeded", e.CHUNK_LIMIT_REACHED = "chunk_limit_reached", e.CHUNK_CREATION_FAILED = "chunk_creation_failed", e.WORKER_POST_FAILED = "worker_post_failed", e.SESSION_CREATION_FAILED = "session_creation_failed", e.RECORDER_INIT_FAILED = "recorder_init_failed", e.RECORDER_START_FAILED = "recorder_start_failed", e.VAD_START_FAILED = "vad_start_failed", e.STOP_FAILED = "stop_failed", e.INTERNAL_RETRY_FAILED = "internal_retry_failed", e.SESSION_END_FAILED = "session_end_failed", e.UNSUPPORTED_STORAGE_PROVIDER = "unsupported_storage_provider", e;
}({}), _ = /* @__PURE__ */ function(e) {
	return e[e.OK = 200] = "OK", e[e.CREATED = 201] = "CREATED", e[e.ACCEPTED = 202] = "ACCEPTED", e[e.BAD_REQUEST = 400] = "BAD_REQUEST", e[e.UNAUTHORIZED = 401] = "UNAUTHORIZED", e[e.FORBIDDEN = 403] = "FORBIDDEN", e[e.NOT_FOUND = 404] = "NOT_FOUND", e[e.GONE = 410] = "GONE", e[e.PAYLOAD_TOO_LARGE = 413] = "PAYLOAD_TOO_LARGE", e[e.UNPROCESSABLE_ENTITY = 422] = "UNPROCESSABLE_ENTITY", e[e.TOO_MANY_REQUESTS = 429] = "TOO_MANY_REQUESTS", e[e.INTERNAL_SERVER_ERROR = 500] = "INTERNAL_SERVER_ERROR", e[e.SERVICE_UNAVAILABLE = 503] = "SERVICE_UNAVAILABLE", e;
}({}), ee = 2e3, v = class e extends Error {
	constructor(t, n = g.INTERNAL_ERROR, r, i) {
		super(t), this.name = "ScribeError", this.code = n, this.httpStatus = r, this.details = i, Error.captureStackTrace && Error.captureStackTrace(this, e);
	}
	static fromApiError(t, n) {
		return new e(t.message, t.code, n, t.details);
	}
	toJSON() {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			httpStatus: this.httpStatus,
			details: this.details
		};
	}
}, y = class extends v {
	constructor(e, t) {
		super(e, g.INVALID_REQUEST, _.BAD_REQUEST, t), this.name = "ValidationError";
	}
}, b = class extends v {
	constructor(e, t) {
		super(e, g.DISCOVERY_FAILED, void 0, t), this.name = "DiscoveryError";
	}
}, x = class extends v {
	constructor(e, t) {
		super(e, g.AUTHENTICATION_FAILED, _.UNAUTHORIZED, t), this.name = "AuthenticationError";
	}
}, S = class extends v {
	constructor(e, t) {
		super(e, g.FORBIDDEN, _.FORBIDDEN, t), this.name = "ForbiddenError";
	}
}, C = class extends v {
	constructor(e) {
		super(`Session '${e}' does not exist`, g.SESSION_NOT_FOUND, _.NOT_FOUND, { session_id: e }), this.name = "SessionNotFoundError";
	}
}, te = class extends v {
	constructor(e, t) {
		super(`Session '${e}' has expired`, g.SESSION_EXPIRED, _.GONE, {
			session_id: e,
			expired_at: t
		}), this.name = "SessionExpiredError";
	}
}, w = class extends v {
	constructor(e) {
		super(`Rate limit exceeded${e ? `. Retry after ${e} seconds` : ""}`, g.RATE_LIMIT_EXCEEDED, _.TOO_MANY_REQUESTS, e ? { retry_after_seconds: e } : void 0), this.name = "RateLimitError";
	}
}, T = class extends v {
	constructor(e, t) {
		super(e, g.TRANSPORT_ERROR, void 0, t), this.name = "TransportError";
	}
}, ne = class extends v {
	constructor(e, t) {
		super(e, g.WORKER_ERROR, void 0, t), this.name = "WorkerError";
	}
}, E = class extends v {
	constructor(e, t, n) {
		super(e, g.UPLOAD_FAILED, void 0, n), this.name = "UploadError", this.failedFiles = t;
	}
	toJSON() {
		return {
			...super.toJSON(),
			failedFiles: this.failedFiles
		};
	}
}, D = class extends v {
	constructor(e) {
		super(`Storage provider '${e || "(none)"}' is not supported by this SDK build.`, g.UNSUPPORTED_STORAGE_PROVIDER, void 0, { provider: e }), this.name = "UnsupportedStorageProviderError", this.provider = e;
	}
}, O = class {
	constructor() {
		this.handlers = /* @__PURE__ */ new Map();
	}
	register(e, t) {
		this.handlers.has(e) || this.handlers.set(e, /* @__PURE__ */ new Set()), this.handlers.get(e).add(t);
	}
	remove(e, t) {
		let n = this.handlers.get(e);
		n && n.delete(t);
	}
	removeAll(e) {
		e ? this.handlers.delete(e) : this.handlers.clear();
	}
	dispatch(e, t) {
		let n = this.handlers.get(e);
		if (!(!n || n.size === 0)) for (let r of n) try {
			r(t);
		} catch (t) {
			console.error(`[ScribeSDK] Error in '${e}' callback handler:`, t);
		}
	}
	hasHandlers(e) {
		let t = this.handlers.get(e);
		return t !== void 0 && t.size > 0;
	}
}, re = e.object({
	id: e.string().min(1, "models[].id is required"),
	display_name: e.string().optional(),
	languages: e.array(e.string()).optional(),
	max_session_duration_seconds: e.number({ error: "models[].max_session_duration_seconds must be a number" }),
	response_speed: e.string().optional(),
	features: e.object({
		realtime_transcription: e.boolean().optional(),
		speaker_diarization: e.boolean().optional(),
		custom_templates: e.boolean().optional()
	}).optional()
}), ie = e.object({
	issuer: e.string(),
	authorization_endpoint: e.string(),
	token_endpoint: e.string(),
	scopes_supported: e.array(e.string())
}), ae = e.object({
	protocol: e.string().min(1, "protocol is required"),
	protocol_version: e.string().min(1, "protocol_version is required"),
	supported_versions: e.array(e.string()).optional(),
	service: e.object({
		name: e.string().optional(),
		documentation_url: e.string().optional(),
		support_email: e.string().optional()
	}).optional(),
	endpoints: e.object({
		base_url: e.string().min(1, "endpoints.base_url is required"),
		webhooks_url: e.string().optional(),
		authorization_endpoint: e.string().optional(),
		token_endpoint: e.string().optional()
	}),
	authentication: e.object({
		supported_methods: e.array(e.string()),
		oidc: ie.optional()
	}),
	capabilities: e.object({
		audio_formats: e.array(e.string()).min(1, "capabilities.audio_formats must have at least one format"),
		max_chunk_duration_seconds: e.number().positive("capabilities.max_chunk_duration_seconds must be positive"),
		upload_methods: e.array(e.string()).optional(),
		webhook_delivery: e.boolean().optional(),
		client_sdk_delivery: e.boolean().optional(),
		storage_provider: e.string().optional()
	}),
	models: e.array(re).optional().default([]),
	languages: e.object({
		supported: e.array(e.string()),
		auto_detection: e.boolean().optional()
	})
}), k = e.object({
	templates: e.array(e.string()).max(2, "templates cannot have more than 2 items"),
	upload_type: e.string().min(1, "upload_type is required"),
	communication_protocol: e.string().min(1, "communication_protocol is required"),
	model: e.string().optional(),
	language_hint: e.array(e.string()).optional(),
	transcript_language: e.string().optional(),
	additional_data: e.record(e.string(), e.any()).optional(),
	session_mode: e.string().optional(),
	patient_details: e.object({
		name: e.string().optional(),
		age: e.union([e.string(), e.number()]).optional(),
		gender: e.string().optional(),
		mobile: e.number().optional()
	}).optional(),
	session_id: e.string().optional()
}), A = e.object({
	audio_files_sent: e.number().int().min(0, "audio_files_sent must be a non-negative integer"),
	audio_files_uploaded: e.number().int().min(0, "audio_files_uploaded must be a non-negative integer")
}), j = e.object({
	user_status: e.string().optional(),
	processing_status: e.string().optional(),
	patient_details: e.object({
		name: e.string().optional(),
		age: e.union([e.string(), e.number()]).optional(),
		gender: e.string().optional(),
		mobile: e.number().optional()
	}).optional(),
	additional_data: e.record(e.string(), e.any()).optional(),
	language_hint: e.array(e.string()).optional(),
	transcript_language: e.string().optional(),
	templates: e.array(e.string()).optional()
}), M = e.object({
	session_id: e.string().min(1, "session_id is required"),
	status: e.string(),
	created_at: e.string(),
	expires_at: e.string(),
	upload_url: e.record(e.string(), e.unknown()),
	patient_details: e.object({
		name: e.string().optional(),
		age: e.union([e.string(), e.number()]).optional(),
		gender: e.string().optional(),
		mobile: e.number().optional()
	}).nullable().optional()
}), oe = e.object({
	session_id: e.string().min(1, "session_id is required"),
	status: e.string(),
	message: e.string(),
	audio_files_received: e.number().int(),
	audio_files: e.array(e.string())
}), se = e.object({
	session_id: e.string().min(1, "session_id is required"),
	status: e.string(),
	created_at: e.string(),
	expires_at: e.string().nullish(),
	completed_at: e.string().nullish(),
	model_used: e.string().nullish(),
	language_detected: e.string().nullish(),
	audio_files_received: e.number().int(),
	audio_files: e.array(e.string()),
	audio_files_processed: e.number().int().optional(),
	additional_data: e.record(e.string(), e.any()).optional(),
	templates: e.array(e.record(e.string(), e.any())).optional(),
	transcript: e.string().nullable().optional(),
	processing_errors: e.array(e.object({
		type: e.string(),
		message: e.string(),
		file: e.string().optional()
	})).optional(),
	error: e.object({
		code: e.string(),
		message: e.string(),
		details: e.record(e.string(), e.any()).optional()
	}).optional(),
	patient_details: e.object({
		name: e.string().optional(),
		age: e.union([e.string(), e.number()]).optional(),
		gender: e.string().optional(),
		mobile: e.number().optional()
	}).nullable().optional(),
	message: e.string().optional()
}), ce = e.object({
	session_id: e.string().min(1, "session_id is required"),
	status: e.string(),
	message: e.string()
}), le = e.object({
	session_id: e.string().min(1, "session_id is required"),
	template_id: e.string(),
	status: e.string(),
	message: e.string()
}), ue = e.string().min(1, "Session ID is required"), de = e.object({
	templates: e.array(e.string()).min(1, "templates must contain at least one item").max(2, "templates cannot have more than 2 items"),
	uploadType: e.string().optional(),
	communicationProtocol: e.string().optional(),
	model: e.string().optional(),
	languageHint: e.array(e.string()).optional(),
	transcriptLanguage: e.string().optional(),
	deviceId: e.string().optional(),
	additionalData: e.record(e.string(), e.any()).optional(),
	sessionMode: e.string().optional(),
	patientDetails: e.object({
		name: e.string().optional(),
		age: e.string().optional(),
		gender: e.string().optional(),
		mobile: e.number().optional()
	}).optional(),
	sessionId: e.string().optional(),
	version: e.string().optional()
}), N = class {
	validateDiscoveryResponse(e) {
		this.parseWithValidationError(ae, e, "Invalid discovery response");
	}
	validateCreateSessionRequest(e) {
		this.parseWithValidationError(k, e, "Invalid CreateSessionRequest");
	}
	validateEndSessionRequest(e) {
		this.parseWithValidationError(A, e, "Invalid EndSessionRequest");
	}
	validateCreateSessionResponse(e) {
		this.parseWithValidationError(M, e, "Invalid CreateSessionResponse");
	}
	validateEndSessionResponse(e) {
		this.parseWithValidationError(oe, e, "Invalid EndSessionResponse");
	}
	validateGetSessionStatusResponse(e) {
		this.parseWithValidationError(se, e, "Invalid GetSessionStatusResponse");
	}
	validateSessionId(e) {
		this.parseWithValidationError(ue, e, "Invalid session ID");
	}
	validateRecordingOptions(e) {
		this.parseWithValidationError(de, e, "Invalid RecordingOptions");
	}
	validatePatchSessionRequest(e) {
		this.parseWithValidationError(j, e, "Invalid PatchSessionRequest");
	}
	validatePatchSessionResponse(e) {
		this.parseWithValidationError(ce, e, "Invalid PatchSessionResponse");
	}
	validateProcessTemplateResponse(e) {
		this.parseWithValidationError(le, e, "Invalid ProcessTemplateResponse");
	}
	validateAgainstDiscovery(e, t) {
		try {
			this.checkUploadType(e, t), this.checkLanguageHint(e, t), this.checkModel(e, t);
		} catch (e) {
			throw e;
		}
	}
	parseWithValidationError(e, t, n) {
		let r = e.safeParse(t);
		if (!r.success) throw new y(`${n}:\n${this.formatZodIssues(r.error)}`, { zodErrors: r.error.issues });
	}
	formatZodIssues(e) {
		return e.issues.map((e) => `  - ${e.path.length > 0 ? e.path.join(".") + ": " : ""}${e.message}`).join("\n");
	}
	checkUploadType(e, t) {
		if (!e.uploadType || t.supportedUploadMethods.length === 0) return;
		let n = t.supportedUploadMethods;
		if (!n.includes(e.uploadType)) throw new y(`Upload type '${e.uploadType}' is not supported by the server. Supported: [${n.join(", ")}]`, {
			requested: e.uploadType,
			supported: n
		});
	}
	checkLanguageHint(e, t) {
		if (!e.languageHint || e.languageHint.length === 0 || t.supportedLanguages.length === 0) return;
		let n = t.supportedLanguages;
		for (let t of e.languageHint) if (!n.includes(t)) throw new y(`Language '${t}' is not supported by the server. Supported: [${n.join(", ")}]`, {
			requested: t,
			supported: n
		});
	}
	checkModel(e, t) {
		if (!e.model || t.availableModels.length === 0) return;
		let n = t.availableModels.map((e) => e.id);
		if (!n.includes(e.model)) throw new y(`Model '${e.model}' is not available. Available: [${n.join(", ")}]`, {
			requested: e.model,
			available: n
		});
	}
};
//#endregion
//#region src/utils/retry.ts
async function P(e, t = {}) {
	let { maxRetries: n = 2, delayMs: r = ee, onRetry: i } = t, a = null;
	for (let t = 0; t <= n; t++) try {
		return await e();
	} catch (e) {
		if (a = e instanceof Error ? e : Error(String(e)), fe(e?.httpStatus ?? e?.statusCode ?? e?.status)) throw a;
		if (t >= n || i && i(t + 1, a) === !1) break;
		await F(r);
	}
	throw a ?? /* @__PURE__ */ Error("Retry failed: unknown error");
}
function fe(e) {
	return typeof e == "number" ? e >= 400 && e < 500 && e !== 408 && e !== 429 : !1;
}
function F(e) {
	return new Promise((t) => setTimeout(t, e));
}
//#endregion
//#region src/transport/http-transport.ts
var I = class {
	constructor(e) {
		this.tokenRefreshPromise = null, this.accessToken = e.accessToken, this.flavour = e.flavour, this.debug = e.debug ?? !1, this.onUnauthorized = e.onUnauthorized;
	}
	setAuthToken(e) {
		this.accessToken = e;
	}
	async request(e) {
		try {
			return e.isUpload ? await P(() => this.executeRequest(e), this.getRetryOptions(e)) : await this.executeRequest(e);
		} catch (t) {
			throw t instanceof v ? t : new T(`Network error: ${t instanceof Error ? t.message : "Unknown error"}`, {
				url: e.url,
				method: e.method
			});
		}
	}
	async executeRequest(e) {
		let t = await this.doFetch(e);
		if (t.ok || e.acceptStatuses?.includes(t.status)) return this.buildSuccessResponse(t);
		if (t.status === _.UNAUTHORIZED && await this.refreshToken()) {
			let t = await this.doFetch(e);
			return t.ok || e.acceptStatuses?.includes(t.status) ? this.buildSuccessResponse(t) : this.handleErrorResponse(t, e);
		}
		return this.handleErrorResponse(t, e);
	}
	async doFetch(e) {
		let t = this.buildHeaders(e), n = this.buildRequestInit(e, t);
		this.debug && console.log("[ScribeSDK] HTTP Request:", {
			url: e.url,
			method: e.method,
			isUpload: e.isUpload ?? !1
		});
		try {
			let t = await fetch(e.url, n);
			return this.debug && console.log("[ScribeSDK] HTTP Response:", {
				status: t.status,
				statusText: t.statusText
			}), t;
		} catch (t) {
			throw new T(`Fetch failed: ${t instanceof Error ? t.message : "Unknown error"}`, {
				url: e.url,
				method: e.method
			});
		}
	}
	async refreshToken() {
		if (this.tokenRefreshPromise) return this.tokenRefreshPromise;
		if (this.onUnauthorized) {
			this.tokenRefreshPromise = this.onUnauthorized();
			try {
				return await this.tokenRefreshPromise;
			} finally {
				this.tokenRefreshPromise = null;
			}
		}
	}
	buildHeaders(e) {
		let t = {}, n = e.isUpload === !0 && e.attachAuth === !1;
		return e.isUpload ? e.uploadFormFields || (t["Content-Type"] = "audio/mp3") : (t["Content-Type"] = "application/json", t.Accept = "application/json"), n || (this.accessToken && (t.Authorization = `Bearer ${this.accessToken}`), this.flavour && (t.flavour = this.flavour)), e.headers && Object.assign(t, e.headers), t;
	}
	buildRequestInit(e, t) {
		let n = e.isUpload === !0 && e.attachAuth === !1, r = {
			method: e.method,
			headers: t,
			credentials: n ? "omit" : "include"
		};
		if (e.isUpload && e.uploadFormFields) {
			let t = new FormData();
			for (let [n, r] of Object.entries(e.uploadFormFields)) t.append(n, r);
			e.uploadBlob && t.append(e.uploadFileFieldName ?? "file", e.uploadBlob, e.uploadFileName), r.body = t;
		} else e.isUpload && e.uploadBlob ? r.body = e.uploadBlob : e.body !== void 0 && (r.body = JSON.stringify(e.body));
		return r;
	}
	async buildSuccessResponse(e) {
		let t = this.extractHeaders(e), n;
		return n = (e.headers.get("content-type") ?? "").includes("application/json") ? await e.json() : { success: e.headers.get("ETag") ?? "OK" }, {
			status: e.status,
			headers: t,
			data: n
		};
	}
	async handleErrorResponse(e, t) {
		let n = e.status, r = null;
		try {
			r = await e.json();
		} catch {}
		let i = r?.error?.message ?? r?.message ?? e.statusText ?? "Request failed", a = r?.error?.code ?? "http_error";
		if (n === _.UNAUTHORIZED) throw new x(i, {
			url: t.url,
			...r?.error?.details
		});
		if (n === _.FORBIDDEN) throw new S(i, {
			url: t.url,
			...r?.error?.details
		});
		if (n === _.NOT_FOUND) throw new C(r?.error?.details?.session_id ?? t.url);
		if (n === _.PAYLOAD_TOO_LARGE) throw new v(i, g.CHUNK_TOO_LARGE, n, {
			url: t.url,
			...r?.error?.details
		});
		if (n === _.TOO_MANY_REQUESTS) {
			let t = parseInt(e.headers.get("Retry-After") ?? "", 10);
			throw new w(isNaN(t) ? void 0 : t);
		}
		throw new v(i, a, n, r?.error?.details);
	}
	extractHeaders(e) {
		let t = {};
		return e.headers.forEach((e, n) => {
			t[n] = e;
		}), t;
	}
	destroy() {}
	getRetryOptions(e) {
		return {
			maxRetries: e.maxRetries,
			onRetry: (e, t) => {
				this.debug && console.log(`[ScribeSDK] Retry attempt ${e}:`, t.message);
			}
		};
	}
}, L = class {
	constructor(e) {
		this.pendingRequests = /* @__PURE__ */ new Map(), this.correlationCounter = 0, this.tokenRefreshPromise = null, this.bridge = e.bridge, this.accessToken = e.accessToken, this.flavour = e.flavour, this.debug = e.debug ?? !1, this.onUnauthorized = e.onUnauthorized, this.bridge.onResponse((e) => {
			this.handleResponse(e);
		});
	}
	setAuthToken(e) {
		this.accessToken = e;
	}
	async request(e) {
		try {
			return e.isUpload ? await P(() => this.executeRequest(e), this.getRetryOptions(e)) : await this.executeRequest(e);
		} catch (t) {
			throw t instanceof v ? t : new T(`IPC error: ${t instanceof Error ? t.message : "Unknown error"}`, {
				url: e.url,
				method: e.method
			});
		}
	}
	async executeRequest(e) {
		let t = await this.doIpcRequest(e);
		if (t.error) throw new T(t.error, {
			url: e.url,
			method: e.method
		});
		if (t.status < 400 || e.acceptStatuses?.includes(t.status)) return {
			status: t.status,
			headers: t.headers ?? {},
			data: t.body
		};
		if (t.status === _.UNAUTHORIZED && await this.refreshToken()) {
			let t = await this.doIpcRequest(e);
			return !t.error && (t.status < 400 || e.acceptStatuses?.includes(t.status)) ? {
				status: t.status,
				headers: t.headers ?? {},
				data: t.body
			} : this.handleErrorResponse(t, e);
		}
		return this.handleErrorResponse(t, e);
	}
	async doIpcRequest(e) {
		let t = this.generateCorrelationId(), n = this.buildHeaders(e), r = await this.buildIpcRequest(t, e, n);
		this.debug && console.log("[ScribeSDK] IPC Request:", {
			correlationId: t,
			url: e.url,
			method: e.method,
			isUpload: e.isUpload ?? !1
		});
		let i = await this.sendAndWait(t, r);
		return this.debug && console.log("[ScribeSDK] IPC Response:", {
			correlationId: t,
			status: i.status
		}), i;
	}
	async refreshToken() {
		if (this.tokenRefreshPromise) return this.tokenRefreshPromise;
		if (this.onUnauthorized) {
			this.tokenRefreshPromise = this.onUnauthorized();
			try {
				return await this.tokenRefreshPromise;
			} finally {
				this.tokenRefreshPromise = null;
			}
		}
	}
	buildHeaders(e) {
		let t = {}, n = e.isUpload === !0 && e.attachAuth === !1;
		return e.isUpload ? e.uploadFormFields || (t["Content-Type"] = "audio/mp3") : (t["Content-Type"] = "application/json", t.Accept = "application/json"), n || (this.accessToken && (t.Authorization = `Bearer ${this.accessToken}`), this.flavour && (t.flavour = this.flavour)), e.headers && Object.assign(t, e.headers), t;
	}
	async buildIpcRequest(e, t, n) {
		let r = {
			correlationId: e,
			method: t.method,
			url: t.url,
			headers: n
		};
		if (t.isUpload && t.uploadBlob) {
			let e = await t.uploadBlob.arrayBuffer(), n = new Uint8Array(e);
			r.blobData = this.uint8ArrayToBase64(n), t.uploadFormFields && (r.uploadFormFields = t.uploadFormFields, r.uploadFileFieldName = t.uploadFileFieldName ?? "file", r.uploadFileName = t.uploadFileName);
		} else t.body !== void 0 && (r.body = t.body);
		return r;
	}
	sendAndWait(e, t) {
		return new Promise((n, r) => {
			let i = setTimeout(() => {
				this.pendingRequests.delete(e), r(new T("IPC request timed out after 15s", {
					correlationId: e,
					url: t.url
				}));
			}, 15e3);
			this.pendingRequests.set(e, {
				resolve: (e) => {
					clearTimeout(i), n(e);
				},
				reject: (e) => {
					clearTimeout(i), r(e);
				}
			});
			try {
				this.bridge.send(t);
			} catch (n) {
				clearTimeout(i), this.pendingRequests.delete(e), r(new T(`Failed to send IPC request: ${n instanceof Error ? n.message : "Unknown error"}`, {
					correlationId: e,
					url: t.url
				}));
			}
		});
	}
	handleResponse(e) {
		let t = this.pendingRequests.get(e.correlationId);
		t && (this.pendingRequests.delete(e.correlationId), t.resolve(e));
	}
	handleErrorResponse(e, t) {
		let n = e.status, r = e.body, i = r?.error?.message ?? r?.message ?? "Request failed", a = r?.error?.code ?? "http_error";
		if (n === _.UNAUTHORIZED) throw new x(i, {
			url: t.url,
			...r?.error?.details
		});
		if (n === _.FORBIDDEN) throw new S(i, {
			url: t.url,
			...r?.error?.details
		});
		if (n === _.NOT_FOUND) throw new C(r?.error?.details?.session_id ?? t.url);
		if (n === _.PAYLOAD_TOO_LARGE) throw new v(i, g.CHUNK_TOO_LARGE, n, {
			url: t.url,
			...r?.error?.details
		});
		if (n === _.TOO_MANY_REQUESTS) {
			let t = parseInt(e.headers?.["retry-after"] ?? "", 10);
			throw new w(isNaN(t) ? void 0 : t);
		}
		throw new v(i, a, n, r?.error?.details);
	}
	generateCorrelationId() {
		return this.correlationCounter += 1, `ipc_${Date.now()}_${this.correlationCounter}`;
	}
	uint8ArrayToBase64(e) {
		let t = "";
		for (let n = 0; n < e.length; n++) t += String.fromCharCode(e[n]);
		return btoa(t);
	}
	getRetryOptions(e) {
		return {
			maxRetries: e.maxRetries,
			onRetry: (e, t) => {
				this.debug && console.log(`[ScribeSDK] IPC Retry attempt ${e}:`, t.message);
			}
		};
	}
	destroy() {
		for (let [e, t] of this.pendingRequests) t.reject(new T("IPC transport destroyed")), this.pendingRequests.delete(e);
	}
};
//#endregion
//#region src/discovery/resolved-config.ts
function R(e) {
	try {
		let t = /* @__PURE__ */ new Map(), n = e.models ?? [];
		for (let e of n) e.id && typeof e.max_session_duration_seconds == "number" && t.set(e.id, e.max_session_duration_seconds);
		return {
			baseUrl: e.endpoints.base_url,
			webhooksUrl: e.endpoints.webhooks_url,
			supportedLanguages: e.languages?.supported ?? [],
			autoDetectLanguage: e.languages?.auto_detection ?? !1,
			supportedAudioFormats: e.capabilities.audio_formats,
			supportedUploadMethods: e.capabilities.upload_methods ?? [],
			storageProvider: e.capabilities.storage_provider ?? "aws",
			maxChunkDurationSeconds: e.capabilities.max_chunk_duration_seconds,
			maxSessionDurationSeconds: t,
			supportedAuthMethods: e.authentication.supported_methods,
			availableModels: n,
			webhookDelivery: e.capabilities.webhook_delivery ?? !1,
			clientSdkDelivery: e.capabilities.client_sdk_delivery ?? !1
		};
	} catch (e) {
		throw e instanceof b ? e : new b(`Failed to resolve discovery config: ${e instanceof Error ? e.message : "Unknown error"}`);
	}
}
//#endregion
//#region src/discovery/discovery-manager.ts
var z = class {
	constructor(e, t, n = !1) {
		this.cachedDocument = null, this.resolvedConfig = null, this.cacheTimestamp = 0, this.cacheTtlMs = i, this.transport = e, this.validator = t, this.debug = n;
	}
	async fetchDiscovery(e, t = !1) {
		try {
			if (!t && this.resolvedConfig && this.isCacheValid()) return this.debug && console.log("[ScribeSDK] Using cached discovery document"), {
				data: this.resolvedConfig,
				httpStatus: void 0
			};
			let n = e + r;
			this.debug && console.log("[ScribeSDK] Fetching discovery from:", n);
			let i = await this.transport.request({
				method: "GET",
				url: n
			});
			this.validator.validateDiscoveryResponse(i.data);
			let a = i.data, o = R(a);
			return this.cachedDocument = a, this.resolvedConfig = o, this.cacheTimestamp = Date.now(), this.debug && console.log("[ScribeSDK] Discovery complete:", a.service?.name ?? a.protocol), {
				data: o,
				httpStatus: i.status
			};
		} catch (t) {
			throw t instanceof b ? t : new b(`Failed to fetch discovery document: ${t instanceof Error ? t.message : "Unknown error"}`, { baseUrl: e });
		}
	}
	getResolvedConfig() {
		if (!this.resolvedConfig) throw new b("Discovery has not been fetched yet. Call init() first.");
		return this.resolvedConfig;
	}
	getDiscoveryDocument() {
		return this.cachedDocument;
	}
	getSupportedLanguages() {
		return this.getResolvedConfig().supportedLanguages;
	}
	getSupportedAudioFormats() {
		return this.getResolvedConfig().supportedAudioFormats;
	}
	getSupportedUploadMethods() {
		return this.getResolvedConfig().supportedUploadMethods;
	}
	getAvailableModels() {
		return this.getResolvedConfig().availableModels;
	}
	getMaxChunkDuration() {
		return this.getResolvedConfig().maxChunkDurationSeconds;
	}
	getMaxSessionDuration(e) {
		let t = this.getResolvedConfig();
		if (e && t.maxSessionDurationSeconds.has(e)) return t.maxSessionDurationSeconds.get(e);
		let n = 0;
		for (let e of t.maxSessionDurationSeconds.values()) e > n && (n = e);
		return n;
	}
	getServiceInfo() {
		return this.cachedDocument?.service;
	}
	getCapabilities() {
		return this.cachedDocument?.capabilities;
	}
	isFeatureSupported(e) {
		return this.getResolvedConfig().availableModels.some((t) => t.features?.[e] === !0);
	}
	clearCache() {
		this.cachedDocument = null, this.resolvedConfig = null, this.cacheTimestamp = 0;
	}
	isCacheValid() {
		return Date.now() - this.cacheTimestamp < this.cacheTtlMs;
	}
}, B = class {
	constructor(e, t, n = !1) {
		this.currentSession = null, this.transport = e, this.validator = t, this.debug = n;
	}
	async createSession(e, t, n) {
		try {
			this.validator.validateCreateSessionRequest(t);
			let r = `${e}/sessions`;
			n && (r += `?version=${encodeURIComponent(n)}`), this.debug && console.log("[ScribeSDK] Creating session:", r);
			let i = await this.transport.request({
				method: "POST",
				url: r,
				body: t
			});
			return this.validator.validateCreateSessionResponse(i.data), this.currentSession = i.data, this.debug && console.log("[ScribeSDK] Session created:", i.data.session_id), {
				data: i.data,
				httpStatus: i.status
			};
		} catch (e) {
			throw e instanceof v ? e : new v(`Failed to create session: ${e instanceof Error ? e.message : "Unknown error"}`);
		}
	}
	async endSession(e, t, n) {
		try {
			let r = n ?? this.currentSession?.session_id;
			if (!r) throw new v("No active session to end. Provide a sessionId or start a session first.");
			this.validator.validateSessionId(r), this.validator.validateEndSessionRequest(t);
			let i = `${e}/sessions/${r}/end`;
			this.debug && console.log("[ScribeSDK] Ending session:", r);
			let a = await this.transport.request({
				method: "POST",
				url: i,
				body: t
			});
			return this.validator.validateEndSessionResponse(a.data), this.currentSession?.session_id === r && (this.currentSession = null), this.debug && console.log("[ScribeSDK] Session ended:", r, a.data.status), {
				data: a.data,
				httpStatus: a.status
			};
		} catch (e) {
			throw e instanceof v ? e : new v(`Failed to end session: ${e instanceof Error ? e.message : "Unknown error"}`);
		}
	}
	async getSessionStatus(e, t, n, r) {
		try {
			let i = t ?? this.currentSession?.session_id;
			if (!i) throw new v("No active session. Provide a sessionId or start a session first.");
			this.validator.validateSessionId(i);
			let a = new URLSearchParams();
			n && a.set("template_id", n), r && a.set("version", r);
			let o = a.toString(), s = o ? `${e}/sessions/${i}?${o}` : `${e}/sessions/${i}`;
			this.debug && console.log("[ScribeSDK] Getting session status:", i);
			let c = await this.transport.request({
				method: "GET",
				url: s,
				acceptStatuses: [410]
			});
			return this.validator.validateGetSessionStatusResponse(c.data), this.debug && console.log("[ScribeSDK] Session status:", i, c.data.status), {
				data: c.data,
				httpStatus: c.status
			};
		} catch (e) {
			throw e instanceof v ? e : new v(`Failed to get session status: ${e instanceof Error ? e.message : "Unknown error"}`);
		}
	}
	async patchSession(e, t, n) {
		try {
			let r = n ?? this.currentSession?.session_id;
			if (!r) throw new v("No active session. Provide a sessionId or start a session first.");
			this.validator.validateSessionId(r), this.validator.validatePatchSessionRequest(t);
			let i = `${e}/sessions/${r}`;
			this.debug && console.log("[ScribeSDK] Patching session:", r, t);
			let a = await this.transport.request({
				method: "PATCH",
				url: i,
				body: t
			});
			return this.validator.validatePatchSessionResponse(a.data), this.debug && console.log("[ScribeSDK] Session patched:", r, a.data.status), {
				data: a.data,
				httpStatus: a.status
			};
		} catch (e) {
			throw e instanceof v ? e : new v(`Failed to patch session: ${e instanceof Error ? e.message : "Unknown error"}`);
		}
	}
	async processTemplate(e, t, n) {
		try {
			let r = n ?? this.currentSession?.session_id;
			if (!r) throw new v("No active session. Provide a sessionId or start a session first.");
			this.validator.validateSessionId(r);
			let i = `${e}/sessions/${r}/process/template/${encodeURIComponent(t)}`;
			this.debug && console.log("[ScribeSDK] Processing template:", t, "for session:", r);
			let a = await this.transport.request({
				method: "POST",
				url: i
			});
			return this.validator.validateProcessTemplateResponse(a.data), this.debug && console.log("[ScribeSDK] Template processing triggered:", t, a.data.status), {
				data: a.data,
				httpStatus: a.status
			};
		} catch (e) {
			throw e instanceof v ? e : new v(`Failed to process template: ${e instanceof Error ? e.message : "Unknown error"}`);
		}
	}
	async pollForCompletion(e, t, n, r, i) {
		try {
			let a = t ?? this.currentSession?.session_id;
			if (!a) throw new v("No active session. Provide a sessionId or start a session first.");
			let o = n?.maxAttempts ?? 60, s = n?.intervalMs ?? 2e3, c = n?.timeoutMs, l = c !== void 0 && c > 0 ? Date.now() + c : void 0;
			this.debug && console.log("[ScribeSDK] Polling for completion:", a, {
				maxAttempts: o,
				intervalMs: s,
				timeoutMs: c
			});
			for (let t = 1; t <= o; t++) {
				if (n?.signal?.aborted) throw new v("Polling was aborted", "polling_aborted", void 0, { session_id: a });
				if (l !== void 0 && Date.now() >= l) throw new v(`Polling timed out after ${c}ms for session '${a}'`, "polling_timeout", void 0, {
					session_id: a,
					timeout_ms: c
				});
				let u = await this.getSessionStatus(e, a, r, i), d = u.data;
				if (n?.onProgress) try {
					n.onProgress(d);
				} catch (e) {
					console.error("[ScribeSDK] Error in poll onProgress callback:", e);
				}
				if (this.isTerminalStatus(d.status)) return this.debug && console.log("[ScribeSDK] Poll complete:", a, d.status, `(attempt ${t})`), u;
				if (t < o) {
					let e = s;
					if (l !== void 0) {
						let t = l - Date.now();
						if (t <= 0) continue;
						e = Math.min(s, t);
					}
					await this.sleepWithAbort(e, n?.signal);
				}
			}
			throw new v(`Polling timed out after ${o} attempts for session '${a}'`, "polling_timeout", void 0, {
				session_id: a,
				max_attempts: o
			});
		} catch (e) {
			throw e instanceof v ? e : new v(`Failed to poll session: ${e instanceof Error ? e.message : "Unknown error"}`);
		}
	}
	getCurrentSession() {
		return this.currentSession;
	}
	clearCurrentSession() {
		this.currentSession = null;
	}
	isTerminalStatus(e) {
		return e === a.COMPLETED || e === a.PARTIAL || e === a.FAILED || e === a.EXPIRED;
	}
	sleep(e) {
		return new Promise((t) => setTimeout(t, e));
	}
	sleepWithAbort(e, t) {
		return t ? new Promise((n, r) => {
			if (t.aborted) {
				r(new v("Polling was aborted", "polling_aborted"));
				return;
			}
			let i = setTimeout(n, e);
			t.addEventListener("abort", () => {
				clearTimeout(i), r(new v("Polling was aborted", "polling_aborted"));
			}, { once: !0 });
		}) : this.sleep(e);
	}
}, V = 1024, H = 16e3;
V / H, H / V;
var pe = {
	m4a: "audio/m4a",
	wav: "audio/wav",
	mp3: "audio/mpeg"
}, me = class {
	constructor(e, t) {
		this.vadPast = [], this.lastClipIndex = 0, this.silDurationAcc = 0, this.micVad = null, this.micStream = null, this.isLoading = !0, this.isRecording = !1, this.noSpeechStartTime = null, this.lastWarningTime = null;
		let n = e.samplingRate;
		this.samplingRate = n, this.prefLengthSamples = e.prefChunkLength * n, this.despLengthSamples = e.despChunkLength * n, this.maxLengthSamples = e.maxChunkLength * n, this.shortThreshold = (e.shortSilenceThreshold ?? .1) * n, this.longThreshold = (e.longSilenceThreshold ?? .5) * n, this.frameSize = e.frameSize ?? 1024, this.speechPadFrames = e.preSpeechPadFrames ?? 20, this.callbackRegistry = t;
	}
	setOnClipPoint(e) {
		this.onClipPoint = e;
	}
	setOnRawFrame(e) {
		this.onRawFrame = e;
	}
	async init(e) {
		this.isLoading = !0, this.stopMicStream();
		try {
			let n = await this.getMicrophoneStream(e);
			this.micStream = n;
			let r = await t.new({
				stream: n,
				frameSamples: this.frameSize,
				preSpeechPadFrames: this.speechPadFrames,
				onFrameProcessed: (e, t) => {
					this.handleFrameProcessed(e, t);
				},
				onSpeechStart: () => {
					this.callbackRegistry.dispatch("onAudioEvent", {
						type: d.USER_SPEECH,
						timestamp: (/* @__PURE__ */ new Date()).toISOString(),
						data: { isSpeaking: !0 }
					});
				},
				onSpeechEnd: () => {
					this.callbackRegistry.dispatch("onAudioEvent", {
						type: d.USER_SPEECH,
						timestamp: (/* @__PURE__ */ new Date()).toISOString(),
						data: { isSpeaking: !1 }
					});
				}
			});
			this.micVad = r, this.isLoading = !1;
		} catch (e) {
			throw this.stopMicStream(), this.isLoading = !1, e;
		}
	}
	start() {
		try {
			this.micVad && typeof this.micVad.start == "function" && this.micVad.start(), this.isRecording = !0;
		} catch (e) {
			throw console.error("[ScribeSDK] Error starting VAD:", e), e;
		}
	}
	pause() {
		try {
			this.micVad && typeof this.micVad.pause == "function" && this.micVad.pause(), this.isRecording = !1;
		} catch (e) {
			console.error("[ScribeSDK] Error pausing VAD:", e);
		}
	}
	destroy() {
		this.stopMicStream();
		try {
			this.micVad && typeof this.micVad.destroy == "function" && this.micVad.destroy();
		} catch (e) {
			console.error("[ScribeSDK] Error destroying VAD:", e);
		}
		this.micVad = null, this.isRecording = !1;
	}
	reset() {
		this.destroy(), this.vadPast = [], this.lastClipIndex = 0, this.silDurationAcc = 0, this.noSpeechStartTime = null, this.lastWarningTime = null, this.isLoading = !0, this.micVad = null;
	}
	updateChunkLengths(e) {
		let t = e.samplingRate ?? this.samplingRate;
		e.prefChunkLength !== void 0 && (this.prefLengthSamples = e.prefChunkLength * t), e.despChunkLength !== void 0 && (this.despLengthSamples = e.despChunkLength * t), e.maxChunkLength !== void 0 && (this.maxLengthSamples = e.maxChunkLength * t);
	}
	isVadLoading() {
		return this.isLoading;
	}
	isVadRecording() {
		return this.isRecording;
	}
	handleFrameProcessed(e, t) {
		try {
			if (this.callbackRegistry.dispatch("onAudioEvent", {
				type: d.FRAME_PROCESSED,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: {
					isSpeech: e.isSpeech,
					notSpeech: e.notSpeech,
					frame: t,
					duration: t.length / this.samplingRate
				}
			}), !this.isRecording) return;
			this.onRawFrame?.(t);
			let n = +(e.isSpeech >= .5);
			this.checkSilence(n), this.processVadFrame(n) && this.onClipPoint?.();
		} catch (e) {
			console.error("[ScribeSDK] Error in frame processing:", e);
		}
	}
	processVadFrame(e) {
		let t = !1;
		this.vadPast.length > 0 && (e === 0 && (this.silDurationAcc += 1), e === 1 && (this.silDurationAcc = 0));
		let n = (this.vadPast.length - this.lastClipIndex) * this.frameSize, r = this.silDurationAcc * this.frameSize;
		return n > this.prefLengthSamples && r > this.longThreshold || n > this.despLengthSamples && r > this.shortThreshold ? (this.lastClipIndex = this.vadPast.length - Math.min(Math.floor(this.silDurationAcc / 2), 5), this.silDurationAcc = 0, t = !0) : n >= this.maxLengthSamples && (this.lastClipIndex = this.vadPast.length, this.silDurationAcc = 0, t = !0), this.vadPast.push(e), t && (this.vadPast = this.vadPast.slice(this.lastClipIndex), this.lastClipIndex = 0), t;
	}
	checkSilence(e) {
		let t = Date.now();
		if (e === 0) if (this.noSpeechStartTime === null) this.noSpeechStartTime = t;
		else {
			let e = t - this.noSpeechStartTime;
			e >= 1e4 && (this.lastWarningTime === null || t - this.lastWarningTime >= 2e3) && (this.callbackRegistry.dispatch("onAudioEvent", {
				type: d.SILENCE_WARNING,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: { durationMs: e }
			}), this.lastWarningTime = t, this.noSpeechStartTime = t);
		}
		else this.noSpeechStartTime = null, this.lastWarningTime = null;
	}
	async getMicrophoneStream(e) {
		try {
			return await navigator.mediaDevices.getUserMedia({ audio: e ? { deviceId: { exact: e } } : !0 });
		} catch (e) {
			if (e?.name === "OverconstrainedError" || e?.name === "NotFoundError") return await navigator.mediaDevices.getUserMedia({ audio: !0 });
			throw e;
		}
	}
	stopMicStream() {
		try {
			this.micStream?.getTracks().forEach((e) => e.stop());
		} catch {}
		this.micStream = null;
	}
}, he = class {
	constructor(e, t) {
		this.currentSampleLength = 0, this.currentFrameLength = 0, this.samplingRate = e, this.incrementalAllocationSize = Math.floor(e * t), this.buffer = new Float32Array(this.incrementalAllocationSize);
	}
	append(e) {
		try {
			return this.currentSampleLength + e.length > this.buffer.length && this.expandBuffer(), this.buffer.set(e, this.currentSampleLength), this.currentSampleLength += e.length, this.currentFrameLength += 1, this.currentSampleLength;
		} catch (e) {
			return console.error("[ScribeSDK] Error appending audio frame:", e), this.currentSampleLength;
		}
	}
	getAudioData() {
		return this.buffer.slice(0, this.currentSampleLength);
	}
	getCurrentSampleLength() {
		return this.currentSampleLength;
	}
	getCurrentFrameLength() {
		return this.currentFrameLength;
	}
	getDurationInSeconds() {
		return this.currentSampleLength / this.samplingRate;
	}
	calculateChunkTimestamps(e) {
		try {
			let t = this.getDurationInSeconds(), n = e / this.samplingRate, r = n - t;
			return {
				start: this.formatTimestamp(Math.max(0, r)),
				end: this.formatTimestamp(n)
			};
		} catch (e) {
			return console.error("[ScribeSDK] Error calculating chunk timestamps:", e), {
				start: "00:00.000000",
				end: "00:00.000000"
			};
		}
	}
	resetBufferState() {
		this.currentSampleLength = 0, this.currentFrameLength = 0;
	}
	resetInstance() {
		this.buffer = new Float32Array(this.incrementalAllocationSize), this.currentSampleLength = 0, this.currentFrameLength = 0;
	}
	expandBuffer() {
		let e = this.buffer.length + this.incrementalAllocationSize, t = new Float32Array(e);
		t.set(this.buffer, 0), this.buffer = t;
	}
	formatTimestamp(e) {
		return `${Math.floor(e / 60).toString().padStart(2, "0")}:${(e % 60).toFixed(6).padStart(9, "0")}`;
	}
}, ge = class {
	constructor() {
		this.chunks = [], this.successfulUploads = [], this.totalRawSamples = 0, this.totalRawFrames = 0, this.totalInsertedSamples = 0, this.totalInsertedFrames = 0;
	}
	incrementRawSamples(e) {
		this.totalRawSamples += e.length, this.totalRawFrames += 1;
	}
	incrementInsertedSamples(e, t) {
		this.totalInsertedSamples += e, this.totalInsertedFrames += t;
	}
	getRawSampleDetails() {
		return {
			totalRawSamples: this.totalRawSamples,
			totalRawFrames: this.totalRawFrames
		};
	}
	getInsertedSampleDetails() {
		return {
			totalInsertedSamples: this.totalInsertedSamples,
			totalInsertedFrames: this.totalInsertedFrames
		};
	}
	getNextFileName() {
		return `${this.chunks.length + 1}.mp3`;
	}
	addChunk(e) {
		return this.chunks.push(e), this.chunks.length - 1;
	}
	markSuccess(e, t) {
		try {
			if (e < 0 || e >= this.chunks.length) return;
			let n = this.chunks[e];
			this.chunks[e] = {
				fileName: n.fileName,
				timestamp: n.timestamp,
				response: t,
				status: "success"
			}, this.successfulUploads.includes(n.fileName) || this.successfulUploads.push(n.fileName);
		} catch (e) {
			console.error("[ScribeSDK] Error marking chunk success:", e);
		}
	}
	markFailure(e, t, n) {
		try {
			if (e < 0 || e >= this.chunks.length) return;
			let r = this.chunks[e];
			this.chunks[e] = {
				fileName: r.fileName,
				timestamp: r.timestamp,
				response: n,
				status: "failure",
				fileBlob: t
			};
		} catch (e) {
			console.error("[ScribeSDK] Error marking chunk failure:", e);
		}
	}
	getChunks() {
		return this.chunks;
	}
	getChunkCount() {
		return this.chunks.length;
	}
	getSuccessfulUploads() {
		return [...this.successfulUploads];
	}
	getFailedUploads() {
		return this.chunks.filter((e) => e.status === "failure").map((e) => e.fileName);
	}
	getFailedChunksWithBlobs() {
		let e = [];
		return this.chunks.forEach((t, n) => {
			t.status === "failure" && t.fileBlob && e.push({
				chunkIndex: n,
				fileName: t.fileName,
				fileBlob: t.fileBlob
			});
		}), e;
	}
	storeEncodedBlob(e, t) {
		if (e < 0 || e >= this.chunks.length) return;
		let n = this.chunks[e];
		n.status === "pending" && (n.fileBlob = t, n.audioFrames = void 0);
	}
	markPendingAsFailed() {
		for (let e = 0; e < this.chunks.length; e++) this.chunks[e].status === "pending" && (this.chunks[e] = {
			fileName: this.chunks[e].fileName,
			timestamp: this.chunks[e].timestamp,
			response: "Upload did not complete (timed out or worker unresponsive)",
			status: "failure",
			fileBlob: this.chunks[e].fileBlob ?? new Blob()
		});
	}
	resetInstance() {
		this.chunks = [], this.successfulUploads = [], this.totalRawSamples = 0, this.totalRawFrames = 0, this.totalInsertedSamples = 0, this.totalInsertedFrames = 0;
	}
};
//#endregion
//#region src/audio/mp3-encoder.ts
function _e(e, t = H, r = 128) {
	try {
		let i = new n.Mp3Encoder(1, t, r), a = new Int16Array(e.length);
		for (let t = 0; t < e.length; t++) {
			let n = Math.max(-1, Math.min(1, e[t]));
			a[t] = n < 0 ? n * 32768 : n * 32767;
		}
		let o = [], s = i.encodeBuffer(a);
		s && s.length > 0 && o.push(s);
		let c = i.flush();
		return c && c.length > 0 && o.push(c), o.length === 0 ? null : {
			blob: new Blob(o, { type: pe.mp3 }),
			chunks: o
		};
	} catch (e) {
		return console.error("[ScribeSDK] MP3 encoding failed:", e), null;
	}
}
//#endregion
//#region src/storage/aws-s3-provider.ts
var ve = e.object({
	uploadData: e.object({
		url: e.string().min(1, "uploadData.url is required"),
		fields: e.record(e.string(), e.string())
	}),
	folderPath: e.string().optional(),
	txn_id: e.string().optional()
}), ye = "key", U = "${filename}", W = "Content-Type", be = "audio/mp3", G = class {
	constructor() {
		this.name = "aws";
	}
	prepareUpload({ fileName: e, blob: t, upload: n }) {
		let r = ve.safeParse(n);
		if (!r.success) throw new E(`Invalid AWS upload payload in session response: ${r.error.message}`, [e]);
		let { uploadData: i } = r.data, a = {};
		for (let [t, n] of Object.entries(i.fields)) a[t] = t === ye ? n.split(U).join(e) : n;
		if (!(W in a)) {
			let e = t?.type;
			a[W] = e && e.startsWith("audio/") ? e : be;
		}
		return {
			url: i.url,
			method: "POST",
			bodyMode: "multipart",
			formFields: a,
			fileFieldName: "file",
			headers: {},
			attachAuth: !1
		};
	}
}, K = { aws: () => new G() };
function q(e) {
	return typeof e == "string" ? e.trim().toLowerCase() : "";
}
function xe(e) {
	return q(e) in K;
}
function J(e) {
	let t = K[q(e)];
	if (!t) throw new D(e);
	return t();
}
//#endregion
//#region src/storage/upload-file.ts
async function Y(e, t) {
	let n = J(t.storageProvider).prepareUpload({
		fileName: t.fileName,
		blob: t.blob,
		upload: t.upload
	});
	return await e.request({
		method: n.method,
		url: n.url,
		headers: n.headers,
		isUpload: !0,
		uploadBlob: t.blob,
		uploadFormFields: n.formFields,
		uploadFileFieldName: n.fileFieldName,
		uploadFileName: t.fileName,
		attachAuth: n.attachAuth,
		maxRetries: t.maxRetries
	});
}
//#endregion
//#region src/worker/worker-manager.ts
var Se = class {
	constructor(e, t, n, r) {
		if (this.worker = null, this.port = null, this.useWorker = !1, this.uploadPayload = {}, this.storageProviderName = "", this.uploadHeaders = {}, this.refreshUploadUrl = null, this.inFlightRefresh = null, this.pendingUploads = /* @__PURE__ */ new Set(), this.allUploadsResolver = null, this.callbackRegistry = e, this.fileManager = t, this.transport = n, !r?.forceMainThread && typeof SharedWorker < "u" && r?.workerScriptUrl) try {
			this.worker = new SharedWorker(r.workerScriptUrl, { name: "scribe-sdk-worker" }), this.port = this.worker.port, this.port.onmessage = (e) => {
				this.handleWorkerMessage(e.data);
			}, this.port.start(), this.useWorker = !0;
		} catch (e) {
			console.warn("[ScribeSDK] SharedWorker failed to initialize, falling back to main thread:", e), this.worker = null, this.port = null, this.useWorker = !1;
		}
	}
	setUploadConfig(e, t, n, r) {
		this.uploadPayload = e, this.storageProviderName = t, this.uploadHeaders = n, this.refreshUploadUrl = r ?? null, J(t);
	}
	compressAndUpload(e, t, n) {
		let r = e.length / H;
		if (r > 27) {
			this.fileManager.markFailure(n, new Blob(), `Chunk exceeds maximum length: ${r.toFixed(1)}s > 25s`), this.callbackRegistry.dispatch("onError", {
				type: m.VALIDATION_ERROR,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				error: {
					code: g.CHUNK_LENGTH_EXCEEDED,
					message: `Audio chunk "${t}" exceeds maximum length of 25s (actual: ${r.toFixed(1)}s). Upload skipped.`
				}
			});
			return;
		}
		this.useWorker && this.port ? this.compressAndUploadViaWorker(e, t) : this.compressAndUploadOnMainThread(e, t, n);
	}
	waitForAllUploads() {
		return this.useWorker && this.port ? new Promise((e) => {
			this.allUploadsResolver = e, this.postToWorker({ type: "wait_for_all_uploads" }), setTimeout(() => {
				this.allUploadsResolver &&= (console.warn("[ScribeSDK] waitForAllUploads timed out after 30s"), this.allUploadsResolver(), null);
			}, 3e4);
		}) : Promise.all(this.pendingUploads).then(() => {});
	}
	updateAuthToken(e) {
		this.useWorker && this.port && this.postToWorker({
			type: "update_auth_token",
			token: e
		}), this.transport.setAuthToken(e), this.uploadHeaders.Authorization = `Bearer ${e}`;
	}
	destroy() {
		try {
			this.useWorker && this.port && (this.postToWorker({ type: "terminate" }), this.port.close());
		} catch (e) {
			console.error("[ScribeSDK] Error destroying worker:", e);
		}
		this.worker = null, this.port = null, this.useWorker = !1, this.pendingUploads.clear(), this.allUploadsResolver = null;
	}
	compressAndUploadViaWorker(e, t) {
		this.postToWorker({
			type: "compress_and_upload",
			audioFrames: e,
			fileName: t,
			storageProvider: this.storageProviderName,
			upload: this.uploadPayload,
			headers: { ...this.uploadHeaders }
		});
	}
	postToWorker(e) {
		try {
			this.port.postMessage(e);
		} catch (e) {
			console.error("[ScribeSDK] Failed to post message to worker:", e), this.callbackRegistry.dispatch("onError", {
				type: m.WORKER_ERROR,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				error: {
					code: g.WORKER_POST_FAILED,
					message: `Failed to send message to worker: ${e instanceof Error ? e.message : "Unknown"}`
				}
			});
		}
	}
	handleWorkerMessage(e) {
		switch (e.type) {
			case "chunk_encoded": {
				let t = this.findChunkIndex(e.fileName);
				if (t >= 0 && e.chunkData && e.chunkData.length > 0) {
					let n = new Blob(e.chunkData, { type: "audio/mp3" });
					this.fileManager.storeEncodedBlob(t, n);
				}
				this.callbackRegistry.dispatch("onAudioEvent", {
					type: d.CHUNK_READY,
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					data: {
						chunkIndex: t,
						fileName: e.fileName,
						chunkData: e.chunkData
					}
				});
				break;
			}
			case "upload_success": {
				let t = this.findChunkIndex(e.fileName);
				t >= 0 && this.fileManager.markSuccess(t), this.dispatchUploadProgress();
				break;
			}
			case "upload_failed": {
				let t = this.findChunkIndex(e.fileName);
				if (t >= 0) {
					let n = e.chunkData && e.chunkData.length > 0 ? new Blob(e.chunkData, { type: "audio/mp3" }) : this.fileManager.getChunks()[t]?.fileBlob ?? new Blob();
					this.fileManager.markFailure(t, n, e.error);
				}
				this.callbackRegistry.dispatch("onUploadEvent", {
					type: f.FAILED,
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					data: {
						fileName: e.fileName,
						error: e.error
					}
				}), this.dispatchUploadProgress();
				break;
			}
			case "all_uploads_complete":
				this.allUploadsResolver &&= (this.allUploadsResolver(), null);
				break;
			case "token_required":
				this.callbackRegistry.dispatch("onTokenRequired", { resolve: (e) => {
					this.updateAuthToken(e);
				} });
				break;
			case "upload_url_required":
				this.handleUploadUrlRequired();
				break;
		}
	}
	async handleUploadUrlRequired() {
		let e = await this.refreshUploadPayload();
		this.postToWorker({
			type: "update_upload_url",
			upload: e
		});
	}
	async refreshUploadPayload() {
		if (!this.refreshUploadUrl) return null;
		try {
			this.inFlightRefresh ||= this.refreshUploadUrl();
			let e = await this.inFlightRefresh;
			return e && (this.uploadPayload = e), e;
		} catch (e) {
			return console.error("[ScribeSDK] Failed to refresh upload_url:", e), null;
		} finally {
			this.inFlightRefresh = null;
		}
	}
	compressAndUploadOnMainThread(e, t, n) {
		let r = this.doMainThreadUpload(e, t, n);
		this.pendingUploads.add(r), r.finally(() => this.pendingUploads.delete(r));
	}
	async doMainThreadUpload(e, t, n) {
		let r = null;
		try {
			let i = _e(e);
			if (!i) {
				this.fileManager.markFailure(n, new Blob(), "MP3 encoding failed"), this.callbackRegistry.dispatch("onUploadEvent", {
					type: f.FAILED,
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					data: {
						fileName: t,
						error: "MP3 encoding failed"
					}
				});
				return;
			}
			r = i.blob, this.callbackRegistry.dispatch("onAudioEvent", {
				type: d.CHUNK_READY,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: {
					chunkIndex: n,
					fileName: t,
					chunkData: i.chunks
				}
			});
			try {
				await Y(this.transport, {
					fileName: t,
					blob: r,
					upload: this.uploadPayload,
					storageProvider: this.storageProviderName
				});
			} catch (e) {
				let n = await this.refreshUploadPayload();
				if (!n) throw e;
				await Y(this.transport, {
					fileName: t,
					blob: r,
					upload: n,
					storageProvider: this.storageProviderName
				});
			}
			this.fileManager.markSuccess(n), this.dispatchUploadProgress();
		} catch (e) {
			this.fileManager.markFailure(n, r ?? new Blob(), e?.message ?? "Upload failed"), this.callbackRegistry.dispatch("onUploadEvent", {
				type: f.FAILED,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: {
					fileName: t,
					error: e?.message ?? "Upload failed"
				}
			}), this.dispatchUploadProgress();
		}
	}
	findChunkIndex(e) {
		return this.fileManager.getChunks().findIndex((t) => t.fileName === e);
	}
	dispatchUploadProgress() {
		let e = this.fileManager.getSuccessfulUploads().length, t = this.fileManager.getChunkCount();
		this.callbackRegistry.dispatch("onUploadEvent", {
			type: f.PROGRESS,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			data: {
				successCount: e,
				totalCount: t
			}
		});
	}
}, X = class {
	constructor(e, t, n, r) {
		this._isPaused = !1, this.initialized = !1, this.chunkLimitReached = !1, this.chunkLimitOverridden = !1, this.callbackRegistry = e, this.bufferManager = new he(H, 25), this.fileManager = new ge();
		let i = {
			prefChunkLength: n?.prefChunkLength ?? 10,
			despChunkLength: n?.despChunkLength ?? 20,
			maxChunkLength: n?.maxChunkLength ?? 25,
			samplingRate: n?.samplingRate ?? 16e3,
			frameSize: n?.frameSize,
			preSpeechPadFrames: n?.preSpeechPadFrames,
			shortSilenceThreshold: n?.shortSilenceThreshold,
			longSilenceThreshold: n?.longSilenceThreshold
		};
		this.vadClient = new me(i, e), this.workerManager = new Se(e, this.fileManager, t, r), this.wireVadCallbacks();
	}
	initialize(e, t) {
		if (!t.upload || typeof t.upload != "object") throw Error("Upload payload is required for chunked recording");
		if (!t.storageProvider) throw Error("Storage provider is required for chunked recording");
		this.workerManager.setUploadConfig(t.upload, t.storageProvider, t.uploadHeaders, t.refreshUploadUrl), this.initialized = !0;
	}
	async start(e) {
		if (await this.vadClient.init(e), this.vadClient.isVadLoading() && (await this.vadClient.init(e), this.vadClient.isVadLoading())) throw Error("VAD instance failed to initialize after retry");
		this.vadClient.start(), this._isPaused = !1;
	}
	pause() {
		this._isPaused ||= (this.vadClient.pause(), !0);
	}
	resume() {
		this._isPaused &&= (this.vadClient.start(), !1);
	}
	isPaused() {
		return this._isPaused;
	}
	async stop() {
		try {
			return this._isPaused = !1, this.vadClient.destroy(), this.flushRemainingAudio(), await this.workerManager.waitForAllUploads(), this.fileManager.markPendingAsFailed(), {
				failedUploads: this.fileManager.getFailedUploads(),
				totalFiles: this.fileManager.getChunkCount()
			};
		} catch (e) {
			return console.error("[ScribeSDK] Error stopping chunked recorder:", e), this.fileManager.markPendingAsFailed(), {
				failedUploads: this.fileManager.getFailedUploads(),
				totalFiles: this.fileManager.getChunkCount()
			};
		}
	}
	reset() {
		this._isPaused = !1, this.chunkLimitReached = !1, this.chunkLimitOverridden = !1, this.vadClient.reset(), this.fileManager.resetInstance(), this.bufferManager.resetInstance(), this.workerManager.destroy(), this.initialized = !1;
	}
	forceAllowMoreChunks() {
		this.chunkLimitOverridden = !0, this.chunkLimitReached = !1;
	}
	updateChunkLengths(e) {
		this.vadClient.updateChunkLengths(e);
	}
	updateAuthToken(e) {
		this.workerManager.updateAuthToken(e);
	}
	getFileManager() {
		return this.fileManager;
	}
	wireVadCallbacks() {
		this.vadClient.setOnRawFrame((e) => {
			this.fileManager.incrementRawSamples(e), this.bufferManager.append(e);
		}), this.vadClient.setOnClipPoint(() => {
			this.handleClipPoint();
		});
	}
	handleClipPoint() {
		try {
			if (!this.chunkLimitOverridden && this.fileManager.getChunkCount() >= 500) {
				this.bufferManager.resetBufferState(), this.chunkLimitReached || (this.chunkLimitReached = !0, this.callbackRegistry.dispatch("onError", {
					type: m.VALIDATION_ERROR,
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					error: {
						code: g.CHUNK_LIMIT_REACHED,
						message: "Maximum chunk limit of 500 reached. Call forceAllowMoreChunks() to continue uploading."
					}
				}));
				return;
			}
			let e = this.bufferManager.getAudioData();
			if (e.length === 0) return;
			let t = this.fileManager.getNextFileName(), n = this.fileManager.getRawSampleDetails(), r = this.bufferManager.calculateChunkTimestamps(n.totalRawSamples), i = {
				fileName: t,
				timestamp: {
					st: r.start,
					et: r.end
				},
				status: "pending",
				audioFrames: e
			}, a = this.fileManager.addChunk(i);
			this.fileManager.incrementInsertedSamples(this.bufferManager.getCurrentSampleLength(), this.bufferManager.getCurrentFrameLength()), this.bufferManager.resetBufferState(), this.workerManager.compressAndUpload(e, t, a);
		} catch (e) {
			console.error("[ScribeSDK] Error handling clip point:", e), this.callbackRegistry.dispatch("onError", {
				type: m.WORKER_ERROR,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				error: {
					code: g.CHUNK_CREATION_FAILED,
					message: e instanceof Error ? e.message : "Failed to create audio chunk"
				}
			});
		}
	}
	flushRemainingAudio() {
		this.bufferManager.getCurrentSampleLength() > 0 && this.handleClipPoint();
	}
}, Z = class {
	constructor(e, t) {
		this.mediaRecorder = null, this.audioChunks = [], this.micStream = null, this._isPaused = !1, this.uploadPayload = {}, this.storageProviderName = "", this.failedUploadData = null, this.callbackRegistry = e, this.transport = t;
	}
	initialize(e, t) {
		if (!t.upload || typeof t.upload != "object") throw Error("Upload payload is required for single recording");
		if (!t.storageProvider) throw Error("Storage provider is required for single recording");
		this.uploadPayload = t.upload, this.storageProviderName = t.storageProvider, J(t.storageProvider), this.failedUploadData = null;
	}
	async start(e) {
		try {
			this.audioChunks = [];
			let t = await this.getMicrophoneStream(e);
			this.micStream = t, this.mediaRecorder = new MediaRecorder(t), this.mediaRecorder.ondataavailable = (e) => {
				e.data.size > 0 && this.audioChunks.push(e.data);
			}, this.mediaRecorder.start(), this._isPaused = !1;
		} catch (e) {
			throw this.callbackRegistry.dispatch("onError", {
				type: m.VAD_ERROR,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				error: {
					code: g.RECORDER_START_FAILED,
					message: e instanceof Error ? e.message : "Failed to start MediaRecorder"
				}
			}), e;
		}
	}
	pause() {
		this.mediaRecorder && this.mediaRecorder.state === "recording" && (this.mediaRecorder.pause(), this._isPaused = !0);
	}
	resume() {
		this.mediaRecorder && this.mediaRecorder.state === "paused" && (this.mediaRecorder.resume(), this._isPaused = !1);
	}
	isPaused() {
		return this._isPaused;
	}
	async stop() {
		if (this._isPaused = !1, !this.mediaRecorder) return {
			failedUploads: [],
			totalFiles: 0
		};
		try {
			let e = await this.stopMediaRecorder(), t = `1.${this.getFileExtension()}`;
			try {
				return await Y(this.transport, {
					fileName: t,
					blob: e,
					upload: this.uploadPayload,
					storageProvider: this.storageProviderName
				}), this.callbackRegistry.dispatch("onUploadEvent", {
					type: f.PROGRESS,
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					data: {
						successCount: 1,
						totalCount: 1
					}
				}), {
					failedUploads: [],
					totalFiles: 1
				};
			} catch (n) {
				return this.failedUploadData = {
					fileName: t,
					blob: e
				}, this.callbackRegistry.dispatch("onUploadEvent", {
					type: f.FAILED,
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					data: {
						fileName: t,
						error: n?.message ?? "Upload failed"
					}
				}), {
					failedUploads: [t],
					totalFiles: 1
				};
			}
		} catch (e) {
			return console.error("[ScribeSDK] Error stopping single recorder:", e), {
				failedUploads: [],
				totalFiles: 0
			};
		} finally {
			this.releaseMicStream();
		}
	}
	reset() {
		this._isPaused = !1;
		try {
			this.mediaRecorder && this.mediaRecorder.state !== "inactive" && this.mediaRecorder.stop();
		} catch {}
		this.releaseMicStream(), this.mediaRecorder = null, this.audioChunks = [], this.failedUploadData = null;
	}
	getFailedBlobData() {
		return this.failedUploadData ? [this.failedUploadData] : [];
	}
	stopMediaRecorder() {
		return new Promise((e, t) => {
			if (!this.mediaRecorder) {
				t(/* @__PURE__ */ Error("MediaRecorder is not initialized"));
				return;
			}
			this.mediaRecorder.onstop = () => {
				try {
					let t = this.mediaRecorder?.mimeType || "audio/webm";
					e(new Blob(this.audioChunks, { type: t }));
				} catch (e) {
					t(e);
				}
			}, this.mediaRecorder.onerror = (e) => {
				t(/* @__PURE__ */ Error(`MediaRecorder error: ${e?.error?.message ?? "Unknown"}`));
			}, this.mediaRecorder.stop();
		});
	}
	async getMicrophoneStream(e) {
		try {
			return await navigator.mediaDevices.getUserMedia({ audio: e ? { deviceId: { exact: e } } : !0 });
		} catch (e) {
			if (e?.name === "OverconstrainedError" || e?.name === "NotFoundError") return await navigator.mediaDevices.getUserMedia({ audio: !0 });
			throw e;
		}
	}
	releaseMicStream() {
		try {
			this.micStream?.getTracks().forEach((e) => e.stop());
		} catch {}
		this.micStream = null;
	}
	getFileExtension() {
		let e = this.mediaRecorder?.mimeType || "";
		return e.includes("mp4") ? "mp4" : e.includes("ogg") ? "ogg" : "webm";
	}
}, Q = class {
	constructor(e, t, n, r, i) {
		this.recorder = null, this.activeSession = null, this.activeBaseUrl = "", this.activeUploadUrlRefresher = null, this._isRecording = !1, this._isStarting = !1, this._startGeneration = 0, this.retryContext = null, this.callbackRegistry = e, this.sessionManager = t, this.discoveryManager = n, this.transport = r, this.config = i ?? {};
	}
	async start(e, t, n) {
		if (this._isRecording || this._isStarting) throw new v("Recording is already in progress. Stop the current recording first.");
		this._isStarting = !0;
		let r = ++this._startGeneration;
		this.retryContext = null, this.activeBaseUrl = e;
		let i = t.uploadType ?? "chunked", a = t.communicationProtocol ?? "http", o = {
			templates: t.templates,
			upload_type: i,
			communication_protocol: a,
			model: t.model,
			language_hint: t.languageHint,
			transcript_language: t.transcriptLanguage,
			additional_data: t.additionalData,
			session_mode: t.sessionMode,
			patient_details: t.patientDetails,
			session_id: t.sessionId
		};
		try {
			let a, s;
			try {
				let n = await this.sessionManager.createSession(e, o, t.version);
				a = n.data, s = n.httpStatus;
			} catch (e) {
				throw r === this._startGeneration && this.dispatchStartError(m.TRANSPORT_ERROR, g.SESSION_CREATION_FAILED, e), e;
			}
			if (r !== this._startGeneration) throw new v("Recording start was superseded by a concurrent operation.");
			this.activeSession = a;
			let c;
			try {
				c = this.resolveStorageProviderName();
			} catch (e) {
				throw r === this._startGeneration && (this.cleanupRecordingState(), this.dispatchStartError(m.VALIDATION_ERROR, g.UNSUPPORTED_STORAGE_PROVIDER, e)), e;
			}
			this.callbackRegistry.dispatch("onSessionEvent", {
				type: p.CREATED,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: a
			});
			let l = this.createRecorder(i);
			this.recorder = l, this.activeUploadUrlRefresher = this.buildUploadUrlRefresher(e, a.session_id, t.version);
			let d = {
				accessToken: n,
				upload: a.upload_url,
				storageProvider: c,
				uploadHeaders: this.buildUploadHeaders(n),
				sessionId: a.session_id,
				refreshUploadUrl: this.activeUploadUrlRefresher
			};
			try {
				l.initialize(a, d);
			} catch (e) {
				try {
					l.reset();
				} catch {}
				throw r === this._startGeneration && (this.cleanupRecordingState(), this.dispatchStartError(m.VALIDATION_ERROR, g.RECORDER_INIT_FAILED, e)), e;
			}
			l instanceof X && this.applyDiscoveryOverrides(l);
			try {
				await l.start(t.deviceId);
			} catch (e) {
				try {
					l.reset();
				} catch {}
				throw r === this._startGeneration && (this.cleanupRecordingState(), this.dispatchStartError(m.VAD_ERROR, g.VAD_START_FAILED, e)), e;
			}
			if (r !== this._startGeneration) {
				try {
					l.reset();
				} catch {}
				throw new v("Recording start was superseded by a concurrent operation.");
			}
			return this._isRecording = !0, this.callbackRegistry.dispatch("onRecordingStateChange", {
				type: u.STARTED,
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			}), this.config.debug && console.log("[ScribeSDK] Recording started:", a.session_id), {
				data: a,
				httpStatus: s
			};
		} finally {
			r === this._startGeneration && (this._isStarting = !1);
		}
	}
	async startWithExistingSession(e, t, n, r) {
		if (this._isRecording || this._isStarting) throw new v("Recording is already in progress. Stop the current recording first.");
		this._isStarting = !0;
		let i = ++this._startGeneration;
		this.retryContext = null, this.activeBaseUrl = e;
		let a = n?.uploadType ?? "chunked";
		this.activeSession = t;
		try {
			let o;
			try {
				o = this.resolveStorageProviderName();
			} catch (e) {
				throw i === this._startGeneration && (this.cleanupRecordingState(), this.dispatchStartError(m.VALIDATION_ERROR, g.UNSUPPORTED_STORAGE_PROVIDER, e)), e;
			}
			let s = this.createRecorder(a);
			this.recorder = s, this.activeUploadUrlRefresher = this.buildUploadUrlRefresher(e, t.session_id, n?.version);
			let c = {
				accessToken: r,
				upload: t.upload_url,
				storageProvider: o,
				uploadHeaders: this.buildUploadHeaders(r),
				sessionId: t.session_id,
				refreshUploadUrl: this.activeUploadUrlRefresher
			};
			try {
				s.initialize(t, c);
			} catch (e) {
				try {
					s.reset();
				} catch {}
				throw i === this._startGeneration && (this.cleanupRecordingState(), this.dispatchStartError(m.VALIDATION_ERROR, g.RECORDER_INIT_FAILED, e)), e;
			}
			s instanceof X && this.applyDiscoveryOverrides(s);
			try {
				await s.start(n?.deviceId);
			} catch (e) {
				try {
					s.reset();
				} catch {}
				throw i === this._startGeneration && (this.cleanupRecordingState(), this.dispatchStartError(m.VAD_ERROR, g.VAD_START_FAILED, e)), e;
			}
			if (i !== this._startGeneration) {
				try {
					s.reset();
				} catch {}
				throw new v("Recording start was superseded by a concurrent operation.");
			}
			return this._isRecording = !0, this.callbackRegistry.dispatch("onRecordingStateChange", {
				type: u.STARTED,
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			}), this.config.debug && console.log("[ScribeSDK] Recording started with existing session:", t.session_id), {
				data: void 0,
				httpStatus: void 0
			};
		} finally {
			i === this._startGeneration && (this._isStarting = !1);
		}
	}
	pause() {
		!this.recorder || !this._isRecording || this.recorder.isPaused() || (this.recorder.pause(), this.callbackRegistry.dispatch("onRecordingStateChange", {
			type: u.PAUSED,
			timestamp: (/* @__PURE__ */ new Date()).toISOString()
		}), this.config.debug && console.log("[ScribeSDK] Recording paused"));
	}
	resume() {
		!this.recorder || !this._isRecording || this.recorder.isPaused() && (this.recorder.resume(), this.callbackRegistry.dispatch("onRecordingStateChange", {
			type: u.RESUMED,
			timestamp: (/* @__PURE__ */ new Date()).toISOString()
		}), this.config.debug && console.log("[ScribeSDK] Recording resumed"));
	}
	async stop() {
		if (!this.recorder || !this._isRecording) return {
			data: {
				failedUploads: [],
				totalFiles: 0,
				sessionEnded: !1
			},
			httpStatus: void 0
		};
		let e = !1, t;
		try {
			let n = await this.recorder.stop();
			this.preserveRetryContext(), this._isRecording = !1;
			let r = n.failedUploads;
			if (r.length > 0) try {
				r = (await this.retryFailedUploads()).data.stillFailed;
			} catch (e) {
				console.error("[ScribeSDK] Internal retry pass failed:", e), this.callbackRegistry.dispatch("onError", {
					type: m.TRANSPORT_ERROR,
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					error: {
						code: g.INTERNAL_RETRY_FAILED,
						message: e instanceof Error ? e.message : "Retry pass failed"
					}
				});
			}
			let i = {
				failedUploads: r,
				totalFiles: n.totalFiles,
				sessionEnded: !1
			};
			if (r.length === 0 && this.activeSession) {
				let r = await this.finalizeSession(n.totalFiles, n.totalFiles);
				r && (i.sessionEnded = !0, i.endSessionResponse = r.data, t = r.httpStatus, e = !0);
			}
			return this.callbackRegistry.dispatch("onRecordingStateChange", {
				type: u.ENDED,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: i
			}), this.config.debug && console.log("[ScribeSDK] Recording stopped:", {
				totalFiles: i.totalFiles,
				failedUploads: i.failedUploads.length,
				sessionEnded: i.sessionEnded
			}), {
				data: i,
				httpStatus: t
			};
		} catch (e) {
			return console.error("[ScribeSDK] Error stopping recording:", e), this.callbackRegistry.dispatch("onError", {
				type: m.TRANSPORT_ERROR,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				error: {
					code: g.STOP_FAILED,
					message: e instanceof Error ? e.message : "Failed to stop recording"
				}
			}), {
				data: {
					failedUploads: [],
					totalFiles: 0,
					sessionEnded: !1
				},
				httpStatus: void 0
			};
		} finally {
			e ? this.cleanupRecordingState() : this.partialCleanupAfterFailedFinalize();
		}
	}
	async finalizeSession(e, t) {
		if (this.activeSession) try {
			let n = await this.sessionManager.endSession(this.activeBaseUrl, {
				audio_files_sent: e,
				audio_files_uploaded: t
			}, this.activeSession.session_id);
			return this.callbackRegistry.dispatch("onSessionEvent", {
				type: p.ENDED,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: n.data
			}), n;
		} catch (e) {
			console.error("[ScribeSDK] Failed to end session:", e), this.callbackRegistry.dispatch("onError", {
				type: m.TRANSPORT_ERROR,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				error: {
					code: g.SESSION_END_FAILED,
					message: e instanceof Error ? e.message : "Failed to end session"
				}
			});
			return;
		}
	}
	forceStop() {
		if (++this._startGeneration, !(!this.recorder || !this._isRecording)) try {
			this.recorder.reset();
		} catch (e) {
			console.error("[ScribeSDK] Error in forceStop:", e);
		} finally {
			this.callbackRegistry.dispatch("onRecordingStateChange", {
				type: u.ENDED,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: {
					failedUploads: [],
					totalFiles: 0
				}
			}), this.cleanupRecordingState();
		}
	}
	forceAllowMoreChunks() {
		this.recorder && this.recorder instanceof X && this.recorder.forceAllowMoreChunks();
	}
	updateAuthToken(e) {
		this.recorder && this.recorder instanceof X && this.recorder.updateAuthToken(e), this.transport.setAuthToken(e);
	}
	reset() {
		++this._startGeneration, this.recorder && this.recorder.reset(), this.retryContext = null, this.cleanupRecordingState();
	}
	isRecording() {
		return this._isRecording;
	}
	isPaused() {
		return this.recorder?.isPaused() ?? !1;
	}
	getActiveSession() {
		return this.activeSession;
	}
	hasFailedUploads() {
		return (this.retryContext?.failedChunks.length ?? 0) > 0;
	}
	finalizeAfterExternalEndSession(e) {
		this.activeSession && this.activeSession.session_id === e && (this.activeSession = null, this.activeBaseUrl = "", this.activeUploadUrlRefresher = null, this.retryContext = null);
	}
	async retryFailedUploads() {
		if (this._isRecording) throw new v("Cannot retry uploads while recording is active.");
		if (!this.retryContext || this.retryContext.failedChunks.length === 0) return {
			data: {
				retried: 0,
				succeeded: 0,
				stillFailed: []
			},
			httpStatus: void 0
		};
		let { storageProvider: e, failedChunks: t } = this.retryContext, n = t.length, r = [], i = 0, a = this.retryContext.upload;
		try {
			let e = await this.activeUploadUrlRefresher?.();
			e && (a = e, this.retryContext.upload = e);
		} catch (e) {
			this.config.debug && console.log("[ScribeSDK] Failed to refresh upload_url, using existing:", e);
		}
		this.config.debug && console.log(`[ScribeSDK] Retrying ${n} failed uploads`);
		for (let o of t) try {
			await Y(this.transport, {
				fileName: o.fileName,
				blob: o.blob,
				upload: a,
				storageProvider: e,
				maxRetries: 0
			}), i++, this.callbackRegistry.dispatch("onUploadEvent", {
				type: f.PROGRESS,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: {
					successCount: i,
					totalCount: n
				}
			}), this.config.debug && console.log(`[ScribeSDK] Retry succeeded: ${o.fileName}`);
		} catch (e) {
			r.push(o.fileName), this.callbackRegistry.dispatch("onUploadEvent", {
				type: f.FAILED,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: {
					fileName: o.fileName,
					error: e instanceof Error ? e.message : "Retry failed"
				}
			}), this.config.debug && console.log(`[ScribeSDK] Retry failed: ${o.fileName}`, e);
		}
		return r.length === 0 ? this.retryContext = null : this.retryContext.failedChunks = t.filter((e) => r.includes(e.fileName)), this.config.debug && console.log(`[ScribeSDK] Retry complete: ${i}/${n} succeeded`), {
			data: {
				retried: n,
				succeeded: i,
				stillFailed: r
			},
			httpStatus: void 0
		};
	}
	createRecorder(e) {
		return e === "single" ? new Z(this.callbackRegistry, this.transport) : new X(this.callbackRegistry, this.transport, void 0, this.config.workerConfig);
	}
	getStorageProviderName() {
		try {
			return this.discoveryManager.getResolvedConfig().storageProvider || "aws";
		} catch {
			return "aws";
		}
	}
	resolveStorageProviderName() {
		let e = this.getStorageProviderName();
		return J(e), e;
	}
	buildUploadHeaders(e) {
		let t = {};
		return e && (t.Authorization = `Bearer ${e}`), this.config.flavour && (t.flavour = this.config.flavour), t;
	}
	buildUploadUrlRefresher(e, t, n) {
		return () => this.fetchFreshUploadUrl(e, t, n);
	}
	async fetchFreshUploadUrl(e, t, n) {
		return (await this.sessionManager.getSessionStatus(e, t, void 0, n)).data.upload_url ?? null;
	}
	applyDiscoveryOverrides(e) {
		try {
			let t = this.discoveryManager.getResolvedConfig();
			t.maxChunkDurationSeconds && e.updateChunkLengths({ maxChunkLength: t.maxChunkDurationSeconds });
		} catch {}
	}
	dispatchStartError(e, t, n) {
		this.callbackRegistry.dispatch("onError", {
			type: e,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			error: {
				code: t,
				message: n instanceof Error ? n.message : "Unknown error"
			}
		});
	}
	preserveRetryContext() {
		if (!this.activeSession?.upload_url) {
			this.retryContext = null;
			return;
		}
		let e = [];
		if (this.recorder instanceof X ? e = this.recorder.getFileManager().getFailedChunksWithBlobs().map((e) => ({
			fileName: e.fileName,
			blob: e.fileBlob
		})) : this.recorder instanceof Z && (e = this.recorder.getFailedBlobData()), e.length === 0) {
			this.retryContext = null;
			return;
		}
		this.retryContext = {
			upload: this.activeSession.upload_url,
			storageProvider: this.getStorageProviderName(),
			failedChunks: e
		}, this.config.debug && console.log(`[ScribeSDK] Preserved ${e.length} failed uploads for retry`);
	}
	cleanupRecordingState() {
		this.recorder = null, this.activeSession = null, this.activeBaseUrl = "", this.activeUploadUrlRefresher = null, this._isRecording = !1, this._isStarting = !1;
	}
	partialCleanupAfterFailedFinalize() {
		this.recorder = null, this._isRecording = !1, this._isStarting = !1;
	}
}, Ce = class {
	constructor(e) {
		this.isInitialized = !1, this.validateConfig(e), this.config = {
			debug: !1,
			autoDiscovery: !0,
			mode: l.DIRECT,
			...e
		}, this.callbackRegistry = new O(), this.validator = new N(), this.transport = this.createTransport(), this.discoveryManager = new z(this.transport, this.validator, this.config.debug), this.sessionManager = new B(this.transport, this.validator, this.config.debug), this.recordingManager = new Q(this.callbackRegistry, this.sessionManager, this.discoveryManager, this.transport, {
			debug: this.config.debug,
			flavour: this.config.flavour,
			workerConfig: this.resolveWorkerConfig()
		});
	}
	async init() {
		return this.isInitialized ? {
			success: !0,
			data: void 0
		} : this.wrapResult(async () => {
			let e;
			return this.config.autoDiscovery !== !1 && (e = (await this.discoveryManager.fetchDiscovery(this.config.baseUrl)).httpStatus), this.isInitialized = !0, {
				data: void 0,
				httpStatus: e
			};
		});
	}
	async startRecording(e) {
		if (!this.isInitialized) {
			let e = await this.init();
			if (!e.success) return e;
		}
		let t = this.getEffectiveBaseUrl();
		return this.wrapResult(() => {
			try {
				this.discoveryManager.getResolvedConfig();
			} catch (e) {
				if (e instanceof y) throw e;
			}
			return this.recordingManager.start(t, e, this.config.accessToken);
		});
	}
	async startRecordingWithSession(e, t) {
		if (!this.isInitialized) {
			let e = await this.init();
			if (!e.success) return e;
		}
		let n = this.getEffectiveBaseUrl();
		return this.wrapResult(() => this.recordingManager.startWithExistingSession(n, e, t, this.config.accessToken));
	}
	pauseRecording() {
		this.recordingManager.pause();
	}
	resumeRecording() {
		this.recordingManager.resume();
	}
	async endRecording() {
		return this.wrapResult(() => this.recordingManager.stop());
	}
	async retryFailedUploads() {
		return this.wrapResult(() => this.recordingManager.retryFailedUploads());
	}
	hasFailedUploads() {
		return this.recordingManager.hasFailedUploads();
	}
	isRecording() {
		return this.recordingManager.isRecording();
	}
	isRecordingPaused() {
		return this.recordingManager.isPaused();
	}
	forceAllowMoreChunks() {
		this.recordingManager.forceAllowMoreChunks();
	}
	async uploadAudioFile(e, t, n) {
		return this.wrapResult(async () => {
			if (!e || e.size === 0) throw new y("A non-empty audio file is required");
			if (!t || !t.trim()) throw new y("fileName is required");
			if (!n || typeof n != "object") throw new y("upload (upload_url payload) is required");
			let r = await Y(this.transport, {
				fileName: t,
				blob: e,
				upload: n,
				storageProvider: this.getStorageProviderName()
			});
			return {
				data: {
					fileName: t,
					status: r.status,
					headers: r.headers,
					response: r.data
				},
				httpStatus: r.status
			};
		});
	}
	async createSession(e, t) {
		let n = this.getEffectiveBaseUrl();
		return this.wrapResult(() => this.sessionManager.createSession(n, e, t));
	}
	async endSession(e, t) {
		let n = this.getEffectiveBaseUrl();
		return this.wrapResult(async () => {
			let r = t ?? this.recordingManager.getActiveSession()?.session_id, i = await this.sessionManager.endSession(n, e, t);
			return r && this.recordingManager.finalizeAfterExternalEndSession(r), this.callbackRegistry.dispatch("onSessionEvent", {
				type: p.ENDED,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: i.data
			}), i;
		});
	}
	async getSessionStatus(e, t) {
		let n = this.getEffectiveBaseUrl();
		return t?.poll ? this.wrapResult(() => this.sessionManager.pollForCompletion(n, e, t.poll, t.templateId, t.version)) : this.wrapResult(() => this.sessionManager.getSessionStatus(n, e, t?.templateId, t?.version));
	}
	getCurrentSession() {
		return this.recordingManager.getActiveSession() ?? this.sessionManager.getCurrentSession();
	}
	async updateSession(e, t) {
		let n = this.getEffectiveBaseUrl();
		return this.wrapResult(() => this.sessionManager.patchSession(n, e, t));
	}
	async processTemplate(e, t) {
		let n = this.getEffectiveBaseUrl();
		return this.wrapResult(() => this.sessionManager.processTemplate(n, e, t));
	}
	async cancelSession(e) {
		let t = e ?? this.recordingManager.getActiveSession()?.session_id ?? this.sessionManager.getCurrentSession()?.session_id;
		return this.recordingManager.isRecording() && this.recordingManager.forceStop(), this.recordingManager.reset(), this.sessionManager.clearCurrentSession(), this.callbackRegistry.dispatch("onSessionEvent", {
			type: p.DISCARDED,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			data: {
				sessionId: t ?? null,
				reason: h.CANCELLED
			}
		}), this.updateSession({
			user_status: "cancelled",
			processing_status: "cancelled"
		}, t);
	}
	getDiscoveryConfig() {
		try {
			return {
				success: !0,
				data: this.discoveryManager.getResolvedConfig()
			};
		} catch (e) {
			return {
				success: !1,
				error: this.toScribeError(e)
			};
		}
	}
	getDiscoveryDocument() {
		return this.discoveryManager.getDiscoveryDocument();
	}
	async refreshDiscovery() {
		return this.wrapResult(() => this.discoveryManager.fetchDiscovery(this.config.baseUrl, !0));
	}
	registerCallback(e, t) {
		this.callbackRegistry.register(e, t);
	}
	removeCallback(e, t) {
		this.callbackRegistry.remove(e, t);
	}
	setAccessToken(e) {
		this.config.accessToken = e, this.transport.setAuthToken(e), this.recordingManager.updateAuthToken(e);
	}
	clearRecordingState() {
		this.recordingManager.isRecording() && this.recordingManager.forceStop(), this.recordingManager.reset(), this.sessionManager.clearCurrentSession();
	}
	async reset() {
		try {
			this.recordingManager.isRecording() && await this.recordingManager.stop();
		} catch {}
		this.recordingManager.reset(), this.sessionManager.clearCurrentSession(), this.discoveryManager.clearCache(), this.callbackRegistry.removeAll(), this.transport.destroy?.(), this.isInitialized = !1;
	}
	async wrapResult(e) {
		try {
			let t = await e();
			return {
				success: !0,
				data: t.data,
				httpStatus: t.httpStatus
			};
		} catch (e) {
			return {
				success: !1,
				error: this.toScribeError(e)
			};
		}
	}
	toScribeError(e) {
		return e instanceof v ? e : new v(e instanceof Error ? e.message : "Unknown error");
	}
	createTransport() {
		let e = () => this.callbackRegistry.hasHandlers("onTokenRequired") ? new Promise((e) => {
			let t = !1, n = setTimeout(() => {
				t || (t = !0, e(void 0));
			}, 1e4);
			this.callbackRegistry.dispatch("onTokenRequired", { resolve: (r) => {
				t || (t = !0, clearTimeout(n), this.setAccessToken(r), e(r));
			} });
		}) : Promise.resolve(void 0);
		if (this.config.mode === l.IPC) {
			if (!this.config.ipcTransport) throw new y("ipcTransport (IpcBridge) is required when mode is \"ipc\"");
			return new L({
				bridge: this.config.ipcTransport,
				accessToken: this.config.accessToken,
				flavour: this.config.flavour,
				debug: this.config.debug,
				onUnauthorized: e
			});
		}
		return new I({
			accessToken: this.config.accessToken,
			flavour: this.config.flavour,
			debug: this.config.debug,
			onUnauthorized: e
		});
	}
	resolveWorkerConfig() {
		let e = this.config.useWorker ?? "auto";
		return this.config.mode === l.IPC || e === !1 ? { forceMainThread: !0 } : {
			forceMainThread: !1,
			workerScriptUrl: this.config.workerScriptUrl
		};
	}
	getStorageProviderName() {
		try {
			return this.discoveryManager.getResolvedConfig().storageProvider || "aws";
		} catch {
			return "aws";
		}
	}
	getEffectiveBaseUrl() {
		try {
			return this.discoveryManager.getResolvedConfig().baseUrl;
		} catch {
			return this.config.baseUrl;
		}
	}
	validateConfig(e) {
		if (!e.baseUrl) throw new y("baseUrl is required");
	}
}, $ = "worker.bundle.js";
function we() {
	if (typeof window < "u" && window.__MEDSCRIBE_WORKER_URL__) return window.__MEDSCRIBE_WORKER_URL__;
	if (typeof document < "u" && document.currentScript) {
		let e = document.currentScript.src;
		if (e) return e.substring(0, e.lastIndexOf("/") + 1) + $;
	}
	return `/${$}`;
}
async function Te(e) {
	let t = e ?? `https://cdn.jsdelivr.net/npm/med-scribe-alliance-ts-sdk/dist/${$}`, n = await fetch(t);
	if (!n.ok) throw Error(`Failed to fetch worker script: ${n.status} ${n.statusText}`);
	let r = await n.text(), i = new Blob([r], { type: "application/javascript" });
	return URL.createObjectURL(i);
}
//#endregion
export { d as AudioEventType, x as AuthenticationError, G as AwsS3StorageProvider, O as CallbackRegistry, c as CommunicationProtocol, h as DiscardReason, b as DiscoveryError, z as DiscoveryManager, g as ErrorCode, m as ErrorEventType, S as ForbiddenError, _ as HttpStatus, I as HttpTransport, L as IpcTransport, w as RateLimitError, Q as RecordingManager, u as RecordingState, Ce as ScribeClient, v as ScribeError, p as SessionEventType, te as SessionExpiredError, B as SessionManager, C as SessionNotFoundError, a as SessionStatus, o as TemplateStatus, T as TransportError, l as TransportMode, D as UnsupportedStorageProviderError, E as UploadError, f as UploadEventType, s as UploadType, y as ValidationError, N as Validator, ne as WorkerError, Te as createWorkerBlobUrl, J as getStorageProvider, we as getWorkerUrl, xe as isStorageProviderSupported };

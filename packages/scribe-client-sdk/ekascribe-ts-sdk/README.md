# EkaScribe TypeScript SDK

Browser SDK for capturing audio and generating structured medical documentation using Eka Care's voice transcription API.

## Prerequisites

- Node 14+
- `npm` or `yarn`
- Microphone access via browser permissions
- Stable network connectivity
- Access token from Eka Care

## Installation

```bash
npm install @eka-care/ekascribe-ts-sdk
# or
yarn add @eka-care/ekascribe-ts-sdk
```

## Bundler Setup

The SDK uses a SharedWorker for background audio uploads. Modern bundlers handle this automatically.

### Vite

Works out of the box.

```ts
import { getEkaScribeInstance } from '@eka-care/ekascribe-ts-sdk';
```

### Webpack 5

Works out of the box. The `new URL(..., import.meta.url)` pattern is natively supported.

```ts
import { getEkaScribeInstance } from '@eka-care/ekascribe-ts-sdk';
```

### Next.js

Ensure the SDK is only used on the client side:

```tsx
'use client';

import { getEkaScribeInstance } from '@eka-care/ekascribe-ts-sdk';
```

### Browser (Script Tag)

```html
<script type="module">
  import { getEkaScribeInstance } from 'https://cdn.jsdelivr.net/npm/@eka-care/ekascribe-ts-sdk/dist/index.mjs';
</script>
```

---

## Instance Management

The SDK uses a **singleton pattern**. `getEkaScribeInstance()` always returns the same instance for a given `env` + `clientId` combination.

```ts
const ekascribe = getEkaScribeInstance(config);
```

- Calling `getEkaScribeInstance()` multiple times with the same config returns the same instance.
- If `env` or `clientId` changes, the old instance is automatically reset.
- If only `access_token` changes, the token is updated on the existing instance without resetting.
- The SDK supports **one active recording at a time**. Always call `endRecording()` or `cancelSession()` before starting a new recording. If you call `startRecordingV2()` while a recording is active, the SDK cleans up the old recording locally but does **not** end the session on the server — the old session will be left abandoned until it expires.

---

## Integration Guide

### Step 1: Initialize the SDK

```ts
import { getEkaScribeInstance } from '@eka-care/ekascribe-ts-sdk';
import type { EkaScribeConfig } from '@eka-care/ekascribe-ts-sdk';

const config: EkaScribeConfig = {
  access_token: '<your_access_token>',
  env: 'PROD',                             // 'PROD' | 'DEV'
  clientId: '<your_client_id>',            // optional
  allianceConfig: {
    baseUrl: 'https://api.eka.care/voice/v1',  // required
    useWorker: 'auto',                              // optional: true | false | 'auto'
    debug: false,                                   // optional
  },
  sharedWorkerUrl: workerUrl,              // optional — see SharedWorker section
};

const ekascribe = getEkaScribeInstance(config);
```

#### `EkaScribeConfig`

```ts
interface EkaScribeConfig {
  access_token?: string;          // Bearer token for authentication
  env: 'PROD' | 'DEV';           // Environment
  clientId?: string;              // Your client identifier
  mode?: 'http' | 'ipc';         // Transport mode (default: 'http')
  ipcBridge?: IpcBridge;          // Required when mode is 'ipc' (Electron apps)
  enableTracking?: boolean;       // Enable internal analytics tracking
  flavour?: string;               // Client flavour identifier
  sharedWorkerUrl?: string;       // URL to worker.bundle.js for background uploads
  allianceConfig?: {
    baseUrl?: string;             // Scribe service URL (required)
    useWorker?: boolean | 'auto'; // SharedWorker: true | false | 'auto' (default: 'auto')
    debug?: boolean;              // Enable debug logging (default: false)
  };
  widget?: WidgetConfig;          // Widget configuration — see Widget section
}
```

### Step 2: Register Callbacks

Register callbacks **before** starting a recording. Events fire immediately once recording starts.

```ts
import type { EkaCallbackMap } from '@eka-care/ekascribe-ts-sdk';

// Token refresh — SDK calls this automatically on 401
ekascribe.registerCallback('onTokenRequired', async () => {
  const newToken = await fetchFreshToken(); // your token refresh logic
  return newToken; // must return the new token string
});

// Recording state changes
ekascribe.registerCallback('onRecordingStateChange', (event) => {
  console.log('State:', event.type); // 'started' | 'paused' | 'resumed' | 'ended'
});

// Upload progress
ekascribe.registerCallback('onUploadEvent', (event) => {
  if (event.type === 'progress') {
    console.log(`Uploaded ${event.data.successCount}/${event.data.totalCount}`);
  }
});

// Errors
ekascribe.registerCallback('onError', (event) => {
  console.error(`[${event.error.code}] ${event.error.message}`);
});
```

See [Callbacks Reference](#callbacks-reference) for all callback types and payloads.

### Step 3: Start Recording

Creates a session and starts the microphone in one call.

```ts
import type { RecordingOptions } from '@eka-care/ekascribe-ts-sdk';

const options: RecordingOptions = {
  templates: ['template-id'],             // required: template IDs for output
  sessionMode: 'consultation',            // optional: 'consultation' | 'dictation'
  languageHint: ['en', 'hi'],            // optional: input audio language hints
  transcriptLanguage: 'en',              // optional: output transcript language
  model: 'pro',                          // optional: 'pro' | 'lite'
  uploadType: 'chunked',                 // optional: 'chunked' (default) | 'single'
  deviceId: microphoneId,                // optional: specific microphone device ID
  patientDetails: {                      // optional
    name: 'John Doe',
    age: '45',
    gender: 'male',
  },
  additionalData: {},                    // optional: any extra data for the session
};

const result = await ekascribe.startRecordingV2(options);

if (result.error_code) {
  console.error(result.error_code, result.message);
  return;
}

const sessionId = result.txn_id;
console.log('Recording started:', sessionId);
```

#### `RecordingOptions`

```ts
interface RecordingOptions {
  templates: string[];                   // Template IDs for extraction (required)
  model?: string;                        // Model ID ('pro' | 'lite')
  languageHint?: string[];               // Language codes for audio input
  transcriptLanguage?: string;           // Language code for transcript output
  uploadType?: string;                   // 'chunked' | 'single' (default: 'chunked')
  communicationProtocol?: string;        // 'http' (default)
  additionalData?: Record<string, any>;  // Extra data for the session
  deviceId?: string;                     // Specific microphone device ID
  sessionMode?: string;                  // 'consultation' | 'dictation'
  patientDetails?: PatientDetails;       // Patient info
  sessionId?: string;                    // External session/transaction ID
}

interface PatientDetails {
  oid?: string;
  name?: string;
  age?: string;
  gender?: string;
  mobile?: number;
}
```

#### Response: `TStartRecordingResponse`

```ts
type TStartRecordingResponse = {
  error_code?: ERROR_CODE;  // present only on error
  status_code: number;
  message: string;
  txn_id?: string;          // session ID — present on success
  business_id?: string;
  oid?: string;
  uuid?: string;
};
```

### Step 4: Pause / Resume

```ts
const pauseResult = ekascribe.pauseRecording();
// later...
const resumeResult = ekascribe.resumeRecording();
```

#### Response: `TPauseRecordingResponse`

```ts
type TPauseRecordingResponse = {
  status_code: number;
  message: string;
  error_code?: ERROR_CODE;
  is_paused?: boolean;
};
```

### Step 5: End Recording

Stops the microphone, flushes pending audio, waits for all uploads, and ends the session on the server (triggers processing).

```ts
const endResult = await ekascribe.endRecording();

if (endResult.error_code) {
  switch (endResult.error_code) {
    case 'audio_upload_failed':
      // Some audio files failed to upload — retry
      await ekascribe.retryUploadRecording();
      break;
    case 'end_recording_failed':
    case 'internal_server_error':
      console.error(endResult.error_code, endResult.message);
      break;
  }
}
```

#### Response: `TEndRecordingResponse`

```ts
type TEndRecordingResponse = {
  error_code?: ERROR_CODE;
  status_code: number;
  message: string;
  failed_files?: string[];       // files that failed to upload
  total_audio_files?: string[];  // all audio files generated
};
```

### Step 6: Get Output

Use `getSessionStatus()` to poll for results after ending the recording.

```ts
const status = await ekascribe.getSessionStatus(sessionId, {
  poll: {
    maxAttempts: 60,
    intervalMs: 2000,
    signal: abortController.signal,   // optional: cancel polling early
    onProgress: (sessionData) => {
      console.log('Status:', sessionData.status);
      // Display partial results as they come in
      if (sessionData.templates) {
        console.log('Templates:', sessionData.templates);
      }
    },
  },
});

if (status.success) {
  console.log('Final status:', status.data.status);
  console.log('Templates:', status.data.templates);
  console.log('Transcript:', status.data.transcript);
}
```

#### Response: `SDKResult<GetSessionStatusResponse>`

```ts
// All async Alliance methods return SDKResult — check result.success
type SDKResult<T> =
  | { success: true; data: T; httpStatus?: number }
  | { success: false; error: ScribeError };

type GetSessionStatusResponse = {
  session_id: string;
  status: SessionStatus;
  created_at: string;
  expires_at?: string | null;
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
  error?: { code: string; message: string };
};
```

### Step 7: Clean Up

```ts
// Reset the singleton — clears all state, destroys widget, removes callbacks
await ekascribe.resetInstance();
```

After calling `resetInstance()`, you must call `getEkaScribeInstance()` again to get a new instance.

### Flow Diagram

```
  getEkaScribeInstance(config)
         |
         v
  registerCallback()  ──  Set up event handlers before recording
         |
         v
  startRecordingV2()  ──  Creates session + starts mic + begins upload
         |
    pause / resume    ──  Optional during recording
         |
         v
  endRecording()      ──  Stops mic + flushes audio + ends session
         |
         v
  getSessionStatus()  ──  Poll until completed/failed
         |
         v
  Read results        ──  templates, transcript, errors
```

---

## Callbacks Reference

Register with `registerCallback(name, handler)`. Remove with `removeCallback(name, handler)`.

### `onTokenRequired`

Called automatically when the SDK receives a 401 from any API call. Your handler must return a fresh access token. The SDK will update its internal token and retry the failed request.

```ts
ekascribe.registerCallback('onTokenRequired', async () => {
  // Call your auth service to get a fresh token
  const newToken = await myAuthService.refreshToken();
  return newToken; // return the token string
});
```

**Important:**
- The handler must return `Promise<string>` or `string`
- The SDK times out after 10 seconds — if your refresh takes longer, the request fails
- Once the token is returned, the SDK calls `updateAuthTokens()` internally — you don't need to call it yourself
- This replaces the old pattern of manually checking `status_code: 401` in every response

#### Type

```ts
// Consumer-facing type (EkaScribe SDK)
onTokenRequired: () => Promise<string> | string;
```

### `onRecordingStateChange`

Fired when recording state transitions.

```ts
ekascribe.registerCallback('onRecordingStateChange', (event) => {
  console.log(event.type); // 'started' | 'paused' | 'resumed' | 'ended'
});
```

#### Type

```ts
interface RecordingStateChangeEvent {
  type: 'started' | 'paused' | 'resumed' | 'ended';
  timestamp: string;
  data?: any;
}
```

### `onAudioEvent`

Fired for speech detection, silence warnings, chunk creation, and frame processing.

```ts
ekascribe.registerCallback('onAudioEvent', (event) => {
  switch (event.type) {
    case 'user_speech':
      console.log('Speaking:', event.data.isSpeaking);
      break;
    case 'silence_warning':
      console.log('Silence duration:', event.data.durationMs, 'ms');
      break;
    case 'chunk_ready':
      console.log('Chunk:', event.data.fileName);
      break;
    case 'frame_processed':
      // Raw audio frame data
      break;
  }
});
```

#### Type

```ts
type AudioEvent =
  | { type: 'user_speech'; timestamp: string; data: { isSpeaking: boolean } }
  | { type: 'silence_warning'; timestamp: string; data: { durationMs: number } }
  | { type: 'chunk_ready'; timestamp: string; data: { chunkIndex: number; fileName: string; chunkData: Uint8Array[] } }
  | { type: 'frame_processed'; timestamp: string; data: { isSpeech: number; notSpeech: number; frame: Float32Array; duration: number } };
```

### `onUploadEvent`

Fired for upload progress, failures, and retries.

```ts
ekascribe.registerCallback('onUploadEvent', (event) => {
  switch (event.type) {
    case 'progress':
      console.log(`${event.data.successCount}/${event.data.totalCount} uploaded`);
      break;
    case 'failed':
      console.error(`Upload failed: ${event.data.fileName}`, event.data.error);
      break;
    case 'retry':
      console.log(`Retrying ${event.data.fileName}, attempt ${event.data.attempt}`);
      break;
  }
});
```

#### Type

```ts
type UploadEvent =
  | { type: 'progress'; timestamp: string; data: { successCount: number; totalCount: number } }
  | { type: 'failed'; timestamp: string; data: { fileName: string; error: string } }
  | { type: 'retry'; timestamp: string; data: { fileName: string; attempt: number } };
```

### `onSessionEvent`

Fired on session lifecycle events.

```ts
ekascribe.registerCallback('onSessionEvent', (event) => {
  switch (event.type) {
    case 'created':
      console.log('Session created:', event.data.session_id);
      break;
    case 'ended':
      console.log('Session ended:', event.data.session_id);
      break;
    case 'status_update':
      console.log('Status update:', event.data.status);
      break;
    case 'partial_result':
      console.log('Partial result:', event.data);
      break;
  }
});
```

#### Type

```ts
type SessionEvent =
  | { type: 'created'; timestamp: string; data: CreateSessionResponse }
  | { type: 'ended'; timestamp: string; data: EndSessionResponse }
  | { type: 'status_update'; timestamp: string; data: GetSessionStatusResponse }
  | { type: 'partial_result'; timestamp: string; data: any };
```

### `onError`

Fired on SDK errors — VAD failures, worker errors, network issues, validation errors.

```ts
ekascribe.registerCallback('onError', (event) => {
  console.error(`[${event.type}] ${event.error.code}: ${event.error.message}`);
});
```

#### Type

```ts
interface ErrorEvent {
  type: 'vad_error' | 'worker_error' | 'transport_error' | 'validation_error';
  timestamp: string;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
```

### Removing Callbacks

```ts
const handler = (event) => { /* ... */ };

ekascribe.registerCallback('onUploadEvent', handler);
// later...
ekascribe.removeCallback('onUploadEvent', handler);
```

### Retry Failed Uploads

If `endRecording()` returns `audio_upload_failed`, retry the failed uploads:

```ts
const result = await ekascribe.retryUploadRecording();
```

#### Response: `TEndRecordingResponse`

```ts
{
  status_code: number;
  message: string;
  error_code?: ERROR_CODE;
  failed_files?: string[];       // files still failing after retry
  total_audio_files?: string[];
}
```

### Cancel a Session

Cancel a session **without** triggering server-side processing.

```ts
// Cancel current active session
await ekascribe.cancelSession();

// Or cancel a specific session by ID
await ekascribe.cancelSession('session-id');
```

#### Response: `SDKResult<PatchSessionResponse>`

```ts
const result = await ekascribe.cancelSession();
if (result.success) {
  console.log('Session cancelled');
}
```

### Pre-Recorded Audio Upload

Upload a pre-recorded audio file instead of live recording. Use this for non-real-time flows.

**Flow:**

1. Create session via `ekascribe.sessions.createSession()`
2. Upload audio via `processPreRecordedAudio()`
3. End session via `ekascribe.sessions.endSession()`

```ts
const result = await ekascribe.processPreRecordedAudio({
  uploadUrl: session.upload_url,       // from createSession response
  audioFile: audioBlob,                // File or Blob
});
```

#### Request

```ts
{
  uploadUrl: string;        // S3 upload URL from session
  audioFile: File | Blob;   // the audio file
}
```

#### Response: `TStartRecordingResponse`

```ts
{
  status_code: number;
  message: string;
  error_code?: ERROR_CODE;
}
```

---

## Session Utils

### `getSessionHistory(request)`

Fetch previous sessions.

```ts
const sessions = await ekascribe.sessions.getSessionHistory({
  txn_count: 10,        // number of sessions to fetch
  oid: 'patient-oid',        // optional: filter by patient oid
});
```

#### Response: `TGetTransactionHistoryResponse`

```ts
{
  data: Array<{
    txn_id: string;
    b_id: string;
    created_at: string;
    mode: string;
    oid: string;
    patient_details?: TPatientDetails;
    processing_status: 'success' | 'system_failure' | 'request_failure' | 'cancelled' | 'in-progress';
    user_status: 'init' | 'commit';
    uuid: string;
  }>;
  status: string;
  code: number;
  message: string;
  retrieved_count: number;
}
```

### `getSessionDetails(request)`

Get detailed information about a specific session, including documents, context, and presigned URLs.

```ts
const details = await ekascribe.sessions.getSessionDetails({
  session_id: 'session-id',
  presigned: true,         // include presigned URLs for documents
});
```

Each document in the response contains a `presigned_url`. To get the actual document content (notes, transcript, etc.), you need to fetch it from this URL:

```ts
const doc = details.data?.documents[0];
if (doc?.presigned_url) {
  const response = await fetch(doc.presigned_url);
  const content = await response.json();
}
```

> Presigned URLs are temporary — check `presigned_url_expires_at` (epoch timestamp) before using. Call `getDocument(documentId)` to get a fresh presigned URL if expired.

#### Request

```ts
type TGetV1SessionDetailsRequest = {
  session_id: string;
  presigned?: boolean;   // default: false
};
```

#### Response: `TGetV1SessionDetailsResponse`

```ts
type TGetV1SessionDetailsResponse = {
  data?: {
    schema_version: string;
    session_id: string;
    uuid: string;
    wid: string;
    created_at: number;
    expires_at: number;
    upload_url: string;
    status: string;
    user_status: 'init' | 'recording_started' | 'commit' | string;
    transfer: string;
    flavour: string;
    patient_details: TPatientDetails | Record<string, unknown>;
    audio_matrix: Record<string, unknown>;
    additional_data: {
      input_languages?: { id: string; name: string }[];
      output_format_template?: {
        template_id: string;
        template_name?: string;
        template_type?: string;
      }[];
      [key: string]: unknown;
    };
    documents: Array<{
      document_id: string;
      session_id: string;
      template_id: string;
      document_name: string;
      document_type: 'notes' | 'context' | 'transcript' | 'integration';
      type: string;
      status: string;
      errors: Array<{ type: string | null; code: string; msg: string }>;
      warnings: Array<{ type: string | null; code: string; msg: string }>;
      publish: Record<string, unknown>;
      created_at: number;
      presigned_url: string | null;
      presigned_url_expires_at: number | null;
      vault_doc_id: string | null;
      lang?: string;
    }>;
    context: {
      past_sessions?: Array<{ date_epoch: number; session_id: string }>;
      documents?: string[];
      attachments?: Array<{ id: string; patient_oid?: string }>;
    };
  };
  status_code: number;
  message?: string;
};
```

### `getDocument(documentId)`

Fetch a single document by ID. Use this to get a fresh presigned URL if the previous one has expired.

```ts
const doc = await ekascribe.documents.getDocument('document-id');
if (doc.data?.presigned_url) {
  const response = await fetch(doc.data.presigned_url);
  const content = await response.json();
}
```

#### Response: `TPostV1DocumentResponse`

```ts
type TPostV1DocumentResponse = {
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
  };
};
```

### `patchSessionStatus(request, sessionId?)`

Update session properties (patient details, status, templates).

```ts
await ekascribe.sessions.patchSessionStatus({
  patient_details: { name: 'Jane Doe', age: '30', gender: 'female' },
  additional_data: { notes: 'Follow-up visit' },
  templates: ['soap', 'prescription'],
}, sessionId);
```

---

## Discovery

### `getDiscoveryDocument()`

Get the raw discovery document fetched during initialization. Contains server capabilities (supported models, languages, upload methods, audio formats).

```ts
const discovery = ekascribe.sessions.getDiscoveryDocument();
```

Returns `DiscoveryDocument | null`.

### `getDiscoveryConfig()`

Get the resolved configuration derived from the discovery document.

```ts
const config = ekascribe.sessions.getDiscoveryConfig();

if (config.success) {
  console.log('Resolved config:', config.data);
}
```

Returns `SDKResult<ResolvedConfig>`.

---

## Widget

The SDK provides an optional pre-built recording UI. When enabled, the SDK injects a floating widget into your page via Shadow DOM — you write zero UI code.

### Integration

**Step 1:** Enable the widget in SDK config with session defaults and callbacks:

```ts
const ekascribe = getEkaScribeInstance({
  access_token: token,
  env: 'PROD',
  allianceConfig: { baseUrl: '...' },
  widget: {
    enabled: true,
    orientation: 'horizontal',          // 'horizontal' | 'vertical'
    zIndex: 9999,                       // optional
    position: { bottom: 20, right: 20 }, // optional
    sessionDefaults: {
      input_language: ['en'],
      output_format_template: [{ template_id: 'soap' }],
      model_type: 'pro',
      mode: 'consultation',
    },
    callbacks: {
      onRecordingStart: ({ txn_id }) => {},
      onRecordingStop: ({ txn_id, duration }) => {},
      onProcessingComplete: ({ txn_id, sessionData }) => {
        // sessionData contains templates, transcript, etc.
      },
      onError: ({ error_code, message }) => {},
    },
  },
});
```

**Step 2:** Call `startForPatient()` for each patient — the widget appears and the user interacts with it directly (pause, resume, stop). You receive results via callbacks.

```ts
await ekascribe.startForPatient({
  txn_id: 'unique-session-id',
  patient_details: {                  // optional
    username: 'John Doe',
    age: 45,
    biologicalSex: 'M',
  },
  additional_data: {},                // optional
});
```

That's it. The widget handles `startRecordingV2()`, `pauseRecording()`, `resumeRecording()`, `endRecording()`, and `getSessionStatus()` internally.

### Behavior

- **Draggable** — the widget can be repositioned anywhere on screen.
- **One recording at a time** — calling `startForPatient()` while a recording is active returns an error. If the widget is in DONE or ERROR state, it auto-resets and starts the new session.
- **Done state** — after processing, the widget expands to show transcript and rendered markdown notes. If both are available, they appear in separate tabs.

### Widget State Flow

```
COLLAPSED ──> RECORDING ──> PAUSED ──> RECORDING ──> PROCESSING ──> DONE
     ^             │                                       │           │
     │             └──── (user clicks stop) ───────────────┘           │
     │                                                                 │
     └──────────── (user clicks close) ────────────────────────────────┘
                                                   │
                                               ERROR
```

### Types

```ts
interface WidgetConfig {
  enabled: boolean;
  theme?: 'light' | 'dark';
  zIndex?: number;
  primaryColor?: string;
  position?: { bottom?: number; right?: number; top?: number; left?: number };
  orientation?: 'horizontal' | 'vertical';
  callbacks?: WidgetCallbacks;
  sessionDefaults: {
    input_language: string[];
    output_format_template: { template_id: string; template_name?: string; template_type?: string }[];
    model_type: string;
    mode: string;
  };
}

interface StartForPatientConfig {
  txn_id: string;
  patient_details?: {
    username?: string;
    age?: number;
    biologicalSex?: string;
    mobile?: string;
  };
  additional_data?: Record<string, unknown>;
}

interface WidgetCallbacks {
  onRecordingStart?: (data: { txn_id: string }) => void;
  onRecordingPause?: (data: { txn_id: string; duration: number }) => void;
  onRecordingResume?: (data: { txn_id: string }) => void;
  onRecordingStop?: (data: { txn_id: string; duration: number }) => void;
  onProcessingStart?: (data: { txn_id: string }) => void;
  onProcessingComplete?: (data: { txn_id: string; sessionData: unknown }) => void;
  onError?: (data: { error_code: string; message: string }) => void;
  onWidgetClose?: (data: { txn_id: string }) => void;
}
```

---

## Authentication

### `updateAuthTokens(token)`

Manually update the access token. This propagates the token to all internal transports and the worker.

```ts
ekascribe.updateAuthTokens({ access_token: 'new-token' });
```

> If you have `onTokenRequired` registered, the SDK handles 401s automatically. You only need `updateAuthTokens()` for proactive token rotation (e.g., before expiry).

---

## SharedWorker Configuration

The SDK offloads audio compression and upload to a SharedWorker for better main-thread performance. If SharedWorker is unavailable or fails, the SDK silently falls back to main-thread processing.

### Setup

```ts
import { createWorkerBlobUrl } from '@eka-care/ekascribe-ts-sdk';

// Option 1: Use the built-in helper (recommended)
const workerUrl = await createWorkerBlobUrl();

// Option 2: Fetch from CDN
async function getWorkerUrl() {
  const res = await fetch(
    'https://cdn.jsdelivr.net/npm/@eka-care/ekascribe-ts-sdk@latest/dist/worker.bundle.js'
  );
  const script = await res.text();
  const blob = new Blob([script], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}
const workerUrl = await getWorkerUrl();

// Option 3: Copy to public directory
// cp node_modules/@eka-care/ekascribe-ts-sdk/dist/worker.bundle.js public/
const workerUrl = '/worker.bundle.js';
```

Pass the URL in config:

```ts
const ekascribe = getEkaScribeInstance({
  // ...
  sharedWorkerUrl: workerUrl,
});
```

**Notes:**

- The worker URL must be accessible from the same origin or have proper CORS headers
- Remember to revoke blob URLs when done: `URL.revokeObjectURL(workerUrl)`
- If `sharedWorkerUrl` is not provided, the SDK uses the main thread (no SharedWorker)

---

## Error Codes

| Error Code | Description |
|---|---|
| `microphone` | Microphone access error (permission denied or unavailable) |
| `txn_init_failed` | Failed to initialize session |
| `txn_limit_exceeded` | Maximum concurrent sessions exceeded |
| `internal_server_error` | Unexpected server-side error |
| `end_recording_failed` | Failed to end recording |
| `audio_upload_failed` | Audio file upload to server failed |
| `txn_commit_failed` | Commit call failed |
| `txn_status_mismatch` | Invalid operation for current session state |
| `network_error` | Network connectivity issue |
| `unknown_error` | Unclassified error |
| `unauthorized` | Authentication failed (invalid or expired token) |
| `forbidden` | Insufficient permissions |

---

## Deprecated Methods

These methods are from the older SDK version. They still work but are not recommended for new integrations.

| Deprecated Method | Use Instead |
|---|---|
| `initTransaction()` + `startRecording()` | `startRecordingV2()` |
| `getTemplateOutput()` | `getSessionStatus()` with polling |
| `getOutputTranscription()` | `getSessionStatus()` with polling |
| `commitTransactionCall()` | Handled automatically by `endRecording()` |
| `stopTransactionCall()` | Handled automatically by `endRecording()` |

### `initTransaction(request)`

Creates a session on the server. Must be followed by `startRecording()`.

```ts
const result = await ekascribe.initTransaction({
  mode: 'consultation',
  input_language: ['en-IN'],
  output_format_template: [{ template_id: 'template-id' }],
  txn_id: 'unique-id',
  transfer: 'chunked',
  model_type: 'pro',
  patient_details: {                // optional
    username: 'John Doe',
    age: 45,
    biologicalSex: 'M',
  },
});
// result: { status_code, message, txn_id?, error_code? }
```

### `startRecording(microphoneID?)`

Starts recording for an already initialized session.

```ts
const result = await ekascribe.startRecording();
// result: { status_code, message, txn_id?, error_code? }
```

### `getTemplateOutput(request)`

Fetches processed template output for a session.

```ts
const result = await ekascribe.getTemplateOutput({ txn_id: 'session-id' });
// result: { status_code, message?, response? }
```

### `getOutputTranscription(request)`

Fetches the transcription output for a session.

```ts
const result = await ekascribe.getOutputTranscription({ txn_id: 'session-id' });
// result: { status_code, message?, response? }
```

### `commitTransactionCall()`

Commits the current transaction on the server.

```ts
const result = await ekascribe.commitTransactionCall();
// result: { status_code, message, error_code?, failed_files? }
```

### `stopTransactionCall()`

Stops the current transaction on the server.

```ts
const result = await ekascribe.stopTransactionCall();
// result: { status_code, message, error_code? }
```

---

## Full Example

```ts
import {
  getEkaScribeInstance,
  type EkaScribeConfig,
  type RecordingOptions,
} from '@eka-care/ekascribe-ts-sdk';

// 1. Initialize
const config: EkaScribeConfig = {
  access_token: token,
  env: 'PROD',
  allianceConfig: {
    baseUrl: 'https://api.eka.care/voice/v1',
  },
};

const ekascribe = getEkaScribeInstance(config);

// 2. Register callbacks
ekascribe.registerCallback('onTokenRequired', async () => {
  return await refreshToken();
});

ekascribe.registerCallback('onUploadEvent', (event) => {
  if (event.type === 'progress') {
    updateProgressUI(event.data.successCount, event.data.totalCount);
  }
});

ekascribe.registerCallback('onError', (event) => {
  showErrorToast(event.error.message);
});

// 3. Start recording
const startResult = await ekascribe.startRecordingV2({
  templates: ['soap'],
  sessionMode: 'consultation',
  languageHint: ['en'],
  patientDetails: { name: 'John Doe', age: '45', gender: 'male' },
});

if (startResult.error_code) {
  showError(startResult.message);
  return;
}

const sessionId = startResult.txn_id!;

// 4. User interacts...
// pauseBtn.onclick = () => ekascribe.pauseRecording();
// resumeBtn.onclick = () => ekascribe.resumeRecording();

// 5. End recording
const endResult = await ekascribe.endRecording();

if (endResult.error_code === 'audio_upload_failed') {
  await ekascribe.retryUploadRecording();
}

// 6. Get results
const status = await ekascribe.getSessionStatus(sessionId, {
  poll: {
    maxAttempts: 60,
    intervalMs: 2000,
    onProgress: (s) => updateStatusUI(s.status),
  },
});

if (status.success) {
  displayResults(status.data.templates, status.data.transcript);
}

// 7. Cleanup on unmount
await ekascribe.resetInstance();
```

---

## Contribution Guidelines

This is a continually updated, open source project. Contributions are welcome!

Refer [EkaScribe TS SDK](https://github.com/eka-care/eka-js-sdk) for SDK implementation.

# Session V2 - Architecture Document

## Overview

Session V2 is a clean-room rewrite of the session feature under `features/session-v2/`. Zero imports from `features/session/`. Same UI, new internals: unified session screen, SDK v3.0.2 callback system, 3-slice Zustand store, 4-layer architecture.

---

## 1. Folder Structure

```
src/features/session-v2/
├── components/
│   ├── session-header.tsx              # Header with patient, preferences, recording controls
│   ├── session-body.tsx                # Unified body: tabs + content (recording + output)
│   ├── session-tab-row.tsx             # Tab navigation: Context | Transcript | Documents
│   ├── session-alert.tsx               # Warning/error alert banner within session
│   ├── save-status-indicator.tsx        # "Saving..." / "Saved" / "Error" indicator
│   │
│   ├── recording/
│   │   ├── audio-waveform-timer.tsx    # Waveform visualization + timer
│   │   ├── chunk-transcript-display.tsx # Real-time transcript lines during recording
│   │   ├── transcript-idle-state.tsx   # "Listening..." placeholder
│   │   ├── microphone-selector.tsx     # Microphone dropdown
│   │   └── audio-quality-summary.tsx   # Post-recording audio quality badge
│   │
│   ├── tabs/
│   │   ├── context-tab-content.tsx     # Context editor + linked sessions/attachments
│   │   ├── transcript-tab-content.tsx  # Transcript output with language selector
│   │   ├── document-tab-content.tsx    # Notes + custom template content (type: markdown)
│   │   └── tab-footer.tsx             # Footer: copy/print/publish buttons + save status
│   │
│   ├── output/
│   │   ├── analysing-component.tsx     # Processing/analysing spinner state
│   │   ├── error-component.tsx         # Error state with retry/record-again buttons
│   │   └── no-output-component.tsx     # Empty output state
│   │
│   ├── dialogs/
│   │   ├── edit-preferences-dialog.tsx # Edit session preferences
│   │   ├── tertiary-session-dialog.tsx # Upload audio / paste transcript dialog
│   │   ├── publish-modal.tsx           # Publish confirmation modal
│   │   ├── link-past-sessions-dialog.tsx # Link past sessions as context
│   │   └── add-attachments-dialog.tsx  # Add attachments as context
│   │
│   ├── editor/
│   │   ├── tiptap-wysiwyg-editor.tsx   # Full TipTap editor (shared by context, notes, markdown)
│   │   ├── editor-toolbar.tsx          # Formatting toolbar for TipTap
│   │   ├── editor-bubble-menu.tsx      # Bubble menu for text selection
│   │   └── slash-command.ts            # Slash command extension
│   │
│   └── context-items-list.tsx          # Linked sessions + attachments list
│
├── hooks/
│   ├── use-session-lifecycle.ts        # createSession, startRecording, end, pause, resume, discard
│   ├── use-recording-callbacks.ts      # Register/remove onAudioEvent + onUploadEvent
│   ├── use-chunk-transcription.ts      # Poll chunk transcripts on chunk_ready
│   ├── use-session-output.ts           # getSessionStatus(poll) + getSessionDetails + normalize
│   ├── use-document-actions.ts         # CRUD operations on documents (create, update, delete, fetch content)
│   ├── use-context-tab.ts             # Context document creation + content management
│   ├── use-save-status.ts             # markTyping, markSynced, markError state machine
│   ├── use-session-context.ts         # Link/unlink past sessions + attachments
│   ├── use-before-unload.ts           # beforeunload warning during recording
│   └── use-error-handlers.ts          # Error state → retry/record-again/cancel handlers
│
├── services/
│   ├── sdk-provider.tsx               # React context: SDK singleton + provider-level callbacks
│   ├── sdk-service.ts                 # Thin wrapper: SDK method calls, returns SDKResult<T>
│   └── document-service.ts            # Document operations: fetch content, upload to S3, copy, print
│
├── config/
│   ├── tab-footer-config.tsx          # Footer config builders per tab type
│   └── error-config.ts               # Error state configs (messages, buttons, icons)
│
├── document-renderers/
│   ├── markdown-renderer.tsx          # TipTap-based markdown editor/viewer (all documents)
│   └── text-renderer.tsx             # Plain text renderer (transcript)
│
├── screens/
│   ├── session-screen.tsx             # UNIFIED screen for new + past sessions
│   └── mic-permission-screen.tsx      # Microphone permission request screen
│
├── utils/
│   ├── normalize-documents.ts         # Massage getSessionDetails → normalized shape
│   ├── copy-output-utils.ts           # Copy formatting with doctor header/footer
│   ├── export-to-pdf.ts              # PDF export utility
│   ├── calculate-amplitude.ts         # Audio frame → amplitude number
│   └── create-sharedworker.ts        # SharedWorker blob URL creation
│
└── types.ts                           # All V2 types (no imports from V1)
```

---

## 2. Store Architecture (3 Slices)

All V2 state lives in the existing `useVoice2RxStore` Zustand store as new fields. No old V1 fields are used.

### Slice 1: `sessionV2Ongoing`

Ephemeral recording state. Reset on session switch or clearStore.

```typescript
type SessionV2Phase = 'idle' | 'recording' | 'paused' | 'processing' | 'output' | 'error';

type SessionV2Ongoing = {
  session_id: string;
  phase: SessionV2Phase;
  upload_url: string;
  created_at: number;
  business_id: string;

  // Recording state
  session_duration: number;
  audio_amplitudes: number[];      // max 500, trim to last 300
  is_speaking: boolean;

  // Chunk transcription
  chunk_transcripts: Record<string, string>;  // chunkIndex → text
  uploaded_chunks: string[];                   // chunk fileNames

  // Upload progress
  upload_progress: { success: number; total: number };

  // Error
  error: {
    type: string;
    code: string;
    message: string;
  } | null;
};
```

**Store actions:**
- `setSessionV2Ongoing(data | updater)` — partial update or updater function
- `clearSessionV2Ongoing()` — reset to initial state

### Slice 2: `sessionV2ContentById`

Per-session document data keyed by session_id. Persisted to localStorage (survives refresh for past sessions).

```typescript
type NormalizedDocument = {
  document_id: string;
  template_id: string;
  document_name: string;
  document_type: 'notes' | 'context' | 'transcript' | 'integration' | 'custom';
  type: string;                    // 'markdown' | 'json' | 'transcript'
  status: string;
  errors: unknown[];
  warnings: unknown[];
  publish: Record<string, unknown>;
  presigned_url: string | null;    // GET URL (read)
  edit_url: string | null;         // EDIT URL (write via S3 PUT)
  content: string | null;          // Lazily loaded from presigned_url
};

type SessionV2Content = {
  patient_details: TSelectedPatientDetails | null;
  audio_matrix: { quality: string } | null;
  created_at: string;
  additional_data: Record<string, unknown>;
  user_status: string;

  // Normalized documents — 3 buckets
  context: NormalizedDocument[];       // document_type = 'context'
  transcript: NormalizedDocument[];    // document_type = 'transcript'
  documents: NormalizedDocument[];     // document_type = 'notes' OR 'custom' OR 'integration'

  // UI state for this session
  ui: {
    loading: boolean;
    poll_status: 'idle' | 'polling' | 'success' | 'failed' | 'timeout';
    selected_tab: 'context' | 'transcript' | 'documents';
    selected_document_id: string;
    selected_transcript_lang: string;
    save_status: 'idle' | 'typing' | 'synced' | 'error';
    last_synced_at: number;
    is_template_processing: boolean;
  };
};

// Store shape: Record<string, SessionV2Content>
```

**Store actions:**
- `setSessionV2Content(sessionId, data | updater)` — set/update session content
- `setSessionV2Document(sessionId, documentId, data)` — update specific document
- `addSessionV2Document(sessionId, document)` — add document to correct bucket
- `removeSessionV2Document(sessionId, documentId)` — remove from bucket
- `setSessionV2Ui(sessionId, data)` — update UI state for session
- `clearSessionV2Content(sessionId)` — remove session from map

### Slice 3: `sessionV2Config`

App-level config that applies across sessions. Already partially exists as `appConfig`, `userLevelPreferences`, `sessionLevelPreferences`, `loggedInUserDetails` in the existing store. V2 reads from these existing fields — no duplication.

---

## 3. SDK Integration

### 3.1 SDK Provider (`sdk-provider.tsx`)

React context that initializes and holds the SDK singleton. Mounts once at app root (or session-v2 layout).

```typescript
// Creates EkaScribe instance with config from ekascribeSDKConfig
// Registers provider-level callbacks:
//   - onTokenRequired: refreshes access token, calls event.resolve(newToken)
//   - onError: maps to store error state or warning banner
// Exposes sdk instance via context
```

**Provider-level callbacks** (always registered):
- `onTokenRequired` — token refresh flow
- `onError` — global error handling

**Recording-scoped callbacks** (registered on start, removed on end):
- `onAudioEvent` — waveform, transcripts, silence
- `onUploadEvent` — upload progress tracking

### 3.2 SDK Service (`sdk-service.ts`)

Thin stateless wrapper around SDK instance methods. No React dependencies. Returns raw SDK responses.

```typescript
// Session lifecycle
createSession(sdk, request: CreateSessionRequest): Promise<SDKResult<CreateSessionResponse>>
startRecordingForExistingSession(sdk, request): Promise<TStartRecordingResponse>
pauseRecording(sdk): TPauseRecordingResponse
resumeRecording(sdk): TPauseRecordingResponse
endRecording(sdk): Promise<TEndRecordingResponse>
cancelSession(sdk, sessionId): Promise<SDKResult<PatchSessionResponse>>

// Session queries
getSessionStatus(sdk, sessionId, pollOptions?): Promise<SDKResult<GetSessionStatusResponse>>
getSessionDetails(sdk, sessionId, presigned): Promise<TGetV1SessionDetailsResponse>

// Document operations (delegated to sdk.documents)
createDocument(sdk, request): Promise<TPostV1DocumentResponse>
updateDocument(sdk, request): Promise<TPostV1DocumentResponse>
deleteDocument(sdk, documentId): Promise<TDeleteV1DocumentResponse>
getDocument(sdk, documentId): Promise<TPostV1DocumentResponse>
publishDocument(sdk, request): Promise<TPostV1DocumentResponse>
convertToTemplate(sdk, request): Promise<SDKResult<ProcessTemplateResponse>>
convertTranscriptionToTemplate(sdk, request): Promise<TPostV1ConvertToTemplateResponse>
getChunkTranscript(sdk, txnId, chunkNumber): Promise<TFetchChunkTranscriptResult>
```

### 3.3 Document Service (`document-service.ts`)

Handles presigned URL operations (fetch content, upload to S3) + formatting for copy/print.

```typescript
// Content I/O
fetchDocumentContent(getUrl: string): Promise<string>           // GET presigned URL → decode → string
uploadDocumentContent(editUrl: string, content: string): Promise<void>  // base64 encode → PUT to S3

// Formatting
formatForCopy(content: string, doctorInfo): string    // Add header/footer for clipboard
formatForPrint(content: string, doctorInfo): string   // Format for print dialog
```

---

## 4. Layer Architecture

```
┌─────────────────────────────────────────┐
│           UI Components                  │  React components, TipTap editors
│  (screens, components, template-renderers)│  Read from store, call hook methods
├─────────────────────────────────────────┤
│           Business Hooks                 │  useSessionLifecycle, useRecordingCallbacks,
│  (hooks/)                                │  useSessionOutput, useDocumentActions, etc.
│                                          │  Orchestrate flows, manage side effects
├─────────────────────────────────────────┤
│           Services                       │  sdk-service.ts, document-service.ts
│  (services/)                             │  Stateless SDK calls, S3 operations
│                                          │  No React, no store access
├─────────────────────────────────────────┤
│           Store                          │  sessionV2Ongoing, sessionV2ContentById
│  (Zustand slices in store/store.ts)      │  Source of truth for all session state
└─────────────────────────────────────────┘
```

**Data flow:** UI → Hooks → Services → SDK/API → Services → Hooks → Store → UI

**Rules:**
- Components never call services directly
- Services never access the store
- Hooks are the bridge between services and store
- Store is the single source of truth

---

## 5. Unified Session Screen

V1 has two separate screens: `NewSessionScreen` (recording) and `OutputScreen` (output). V2 merges them into one `SessionScreen`.

### Screen routing:
- `/new-session` → `SessionScreen` with no sessionId (creates new session)
- `/session/[id]` → `SessionScreen` with sessionId (loads existing session)

### SessionScreen behavior:

```typescript
const SessionScreen = ({ sessionId?: string }) => {
  // If no sessionId → create new session on mount
  // If sessionId → load from getSessionDetails

  // Derive phase from user_status (for existing sessions):
  //   'init'              → phase = 'idle' (can start recording)
  //   'recording_started' → phase = 'output' (abandoned session, show whatever output exists)
  //   'commit'            → phase = 'output'

  // Derive everything from sessionV2Ongoing.phase:
  //   idle       → show Start Recording button, editable context/notes
  //   recording  → show waveform, chunk transcripts, pause/end buttons
  //   paused     → show paused indicator, resume/end buttons
  //   processing → show analysing spinner
  //   output     → show document tabs with content
  //   error      → show error component with retry/record-again
};
```

### Unified SessionBody:

One component that renders different content based on phase. No separate "recording body" and "output body".

```
SessionBody
  ├── Tab row: [Context] [Transcript] [Doc1] [Doc2] [Doc3] ...
  │            ↑ fixed tabs            ↑ one tab per document from getSessionDetails
  │
  ├── If phase = idle/recording/paused:
  │     Context tab    → TipTap editor (editable)
  │     Transcript tab → ChunkTranscriptDisplay (recording) or IdleState (idle)
  │     Document tabs  → Each renders its content with MarkdownRenderer (editable)
  │
  ├── If phase = processing:
  │     Show AnalysingComponent overlay
  │
  ├── If phase = output:
  │     Context tab    → TipTap editor (editable, content from presigned URL)
  │     Transcript tab → TranscriptOutput with language selector
  │                      (all transcript-type documents rendered here)
  │     Document tabs  → Each document is its own tab
  │                      Each tab → MarkdownRenderer (TipTap, editable)
  │
  └── If phase = error:
        Show ErrorComponent (retry, record again, cancel)
```

---

## 6. Document Normalization

`getSessionDetails` returns `documents: TSessionDocument[]` as a flat array. V2 normalizes them into 3 buckets.

### normalize-documents.ts

```typescript
function normalizeDocuments(
  documents: TSessionDocument[]
): {
  context: NormalizedDocument[];
  transcript: NormalizedDocument[];
  documents: NormalizedDocument[];    // notes + custom + integration
}
```

Mapping:
- `document_type === 'context'` → `context[]`
- `document_type === 'transcript'` → `transcript[]`
- `document_type === 'notes'` OR `document_type === 'integration'` OR any other → `documents[]`

Each `TSessionDocument` maps to `NormalizedDocument`:
- `presigned_url` from API → stored as `presigned_url` (GET URL for reading)
- `edit_url` → starts as `null`, populated when `createDocument` or `updateDocument` is called
- `content` → starts as `null`, lazily fetched from `presigned_url` at render time

---

## 7. Document Renderers

V1 has 4 renderers. V2 simplifies to 2:

1. **`markdown-renderer.tsx`** — TipTap-based editor for markdown content. Used by all documents (notes, custom). This is the primary renderer.

2. **`text-renderer.tsx`** — Read-only plain text renderer for transcript content.

### Tab structure

Each document from `getSessionDetails` becomes an **individual tab**:
- `context` documents → shown in the Context tab
- `transcript` documents → all shown in the Transcript tab (with language selector to switch between them)
- `documents` (notes + custom) → each document is its own tab, rendered with `MarkdownRenderer`

```
Tab row example:
[Context] [Transcript] [Clinical Notes] [My Custom Template] [New Note]
                         ↑ each document = its own tab
```

---

## 8. Tab Footer Configuration

Each tab type has a footer with different buttons and behaviors.

### Context tab footer:
- Save status indicator
- Session UUID display
- Copy button (context content)

### Transcript tab footer:
- Language selector dropdown
- Copy button
- Print button
- Session UUID display

### Document tab footer:
- Save status indicator
- Copy button
- Print button
- "Review & Publish" button (if publishable)
- Session UUID display

### During recording:
- Footer shows minimal controls (save status for context/notes, timer info)

### Error state:
- Footer shows error-specific buttons (Try Again, Record Again, Cancel)

---

## 9. Recording Flow Details

### Audio Waveform + Timer

`onAudioEvent` with `type: 'frame_processed'` provides:
- `frame: Float32Array` → calculate amplitude → push to `audio_amplitudes`
- `duration: number` → set `session_duration`

Amplitude management: max 500 entries, when full trim to last 300.

### Chunk Transcription

`onAudioEvent` with `type: 'chunk_ready'` provides `{ chunkIndex, fileName }`:
1. Add fileName to `uploaded_chunks`
2. Start polling `sdk.getChunkTranscript(txnId, chunkIndex)` — 2s interval, max 5 attempts
3. On success: store text in `chunk_transcripts[chunkIndex]`

### Upload Progress

`onUploadEvent` with `type: 'progress'` provides `{ successCount, totalCount }`:
- Update `upload_progress` in store
- Display in UI during recording

### Silence Warning

`onAudioEvent` with `type: 'silence_warning'` provides `{ durationMs }`:
- Show visual indicator that no speech detected

### User Speech

`onAudioEvent` with `type: 'user_speech'` provides `{ isSpeaking }`:
- Update `is_speaking` in store
- Toggle speaking/listening indicator in UI

---

## 10. Error Handling

### Error sources:
1. **SDK onError callback** — vad_error, worker_error, transport_error, validation_error
2. **SDK method failures** — SDKResult with `success: false`
3. **API errors** — HTTP 4xx/5xx from session/document operations
4. **Upload failures** — onUploadEvent with `type: 'failed'`

### Error mapping:
```typescript
const errorConfigs = {
  waiting_for_network:        { message, buttons: [Try Again, Cancel] },
  upload_failed:              { message, buttons: [Try Again, Record Again] },
  something_went_wrong:       { message, buttons: [Record Again] },
  transaction_commit_failed:  { message, buttons: [Try Again, Record Again] },
  no_audio_capture:           { message, buttons: [Record Again] },
  session_limit_exceeded:     { message, buttons: [Upgrade Plan] },
};
```

### Error state in store:
- `sessionV2Ongoing.error` — current error info
- `sessionV2Ongoing.phase = 'error'` — triggers error UI

---

## 11. beforeunload Behavior

During recording (`phase === 'recording' | 'paused'`):
- Register `beforeunload` event listener
- Show browser default "Leave page?" dialog
- If user leaves: session stays on server with current status (NOT cancelled)
- On rehydrate: `sessionV2Ongoing` is reset (ephemeral), session appears in past sessions

---

## 12. Sidebar Integration

V2 reuses the existing sidebar. Integration points:

### "Current Session" card:
- Shown when `sessionV2Ongoing.session_id` is non-empty
- Click navigates to `/session/{id}` or `/new-session`

### "Start New Session" button:
- Guard: if recording active, block
- `refreshSessions()` → old session moves to past sessions list
- `clearSessionV2Ongoing()` → reset ongoing state
- Navigate to `/new-session` → creates fresh session

### Session history refresh:
- Called after: endRecording, discardSession, startNewSession
- Uses existing `refreshPastSessionsCallback` pattern

---

## 13. What V2 Does NOT Change

- Sidebar component (`features/sidebar/`) — reused as-is
- Settings/preferences loading (`use-settings.tsx`) — reused as-is
- Patient directory (`features/patient/`) — reused as-is
- App config (`constants/constant.ts`) — reused as-is
- Shared components (`shared-components/`) — reused as-is
- Analytics/Mixpanel — reused as-is
- Auth/token refresh (`fetch-client/`) — reused as-is
- Store persistence mechanism — same Zustand persist middleware

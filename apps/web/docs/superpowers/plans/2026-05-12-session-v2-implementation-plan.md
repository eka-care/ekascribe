# Session V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean-room rewrite of the session feature under `features/session-v2/` with unified session screen, SDK v3.0.2 callback system, 3-slice store, and 4-layer architecture. Same UI, new internals.

**Architecture:** Unified session screen replaces separate new-session and output screens. SDK v3.0.2 with 4 callbacks (onAudioEvent, onUploadEvent, onError, onTokenRequired). 3 Zustand store slices (ongoing, contentById, existing config). 4-layer separation: UI Components > Business Hooks > Services > Store.

**Tech Stack:** Next.js 14 (App Router), React 19, Zustand, @eka-care/ekascribe-ts-sdk v3.0.2, TipTap, Tailwind CSS, TypeScript

**Reference docs:**
- [Flow Diagram](./2026-05-12-session-v2-flow-diagram.md)
- [Architecture](./2026-05-12-session-v2-architecture.md)

**Future scope:**
- Replace all direct `getEkaScribeInstance()` calls across the codebase with the `useSDK()` singleton from `sdk-provider.tsx`. After this revamp, migrate the rest of the app to use the V2 SDK provider pattern instead of creating instances ad-hoc.

---

## File Structure

### New files to create:
```
src/features/session-v2/
├── types.ts
├── services/
│   ├── sdk-provider.tsx
│   ├── sdk-service.ts
│   └── document-service.ts
├── hooks/
│   ├── use-session-lifecycle.ts
│   ├── use-recording-callbacks.ts
│   ├── use-chunk-transcription.ts
│   ├── use-session-output.ts
│   ├── use-document-actions.ts
│   ├── use-context-tab.ts
│   ├── use-save-status.ts
│   ├── use-session-context.ts
│   ├── use-before-unload.ts
│   └── use-error-handlers.ts
├── utils/
│   ├── normalize-documents.ts
│   ├── copy-output-utils.ts
│   ├── export-to-pdf.ts
│   ├── calculate-amplitude.ts
│   └── create-sharedworker.ts
├── config/
│   ├── tab-footer-config.tsx
│   └── error-config.ts
├── components/
│   ├── session-header.tsx
│   ├── session-body.tsx
│   ├── session-tab-row.tsx
│   ├── session-alert.tsx
│   ├── save-status-indicator.tsx
│   ├── context-items-list.tsx
│   ├── recording/
│   │   ├── audio-waveform-timer.tsx
│   │   ├── chunk-transcript-display.tsx
│   │   ├── transcript-idle-state.tsx
│   │   ├── microphone-selector.tsx
│   │   └── audio-quality-summary.tsx
│   ├── tabs/
│   │   ├── context-tab-content.tsx
│   │   ├── transcript-tab-content.tsx
│   │   ├── document-tab-content.tsx
│   │   └── tab-footer.tsx
│   ├── output/
│   │   ├── analysing-component.tsx
│   │   ├── error-component.tsx
│   │   └── no-output-component.tsx
│   ├── dialogs/
│   │   ├── edit-preferences-dialog.tsx
│   │   ├── tertiary-session-dialog.tsx
│   │   ├── publish-modal.tsx
│   │   ├── link-past-sessions-dialog.tsx
│   │   └── add-attachments-dialog.tsx
│   └── editor/
│       ├── tiptap-wysiwyg-editor.tsx
│       ├── editor-toolbar.tsx
│       ├── editor-bubble-menu.tsx
│       └── slash-command.ts
├── document-renderers/
│   ├── markdown-renderer.tsx
│   └── text-renderer.tsx
└── screens/
    ├── session-screen.tsx
    └── mic-permission-screen.tsx
```

### Files to modify:
```
src/store/store.ts        → Add V2 slices (sessionV2Ongoing, sessionV2ContentById)
src/store/types.ts        → Add V2 type definitions to store type
src/app/                  → Add /session/[id] route, update /new-session route
```

---

## Task 1: V2 Types + Store Slices

**Goal:** Define all V2 types and add the 2 new store slices to Zustand.

**Files:**
- Create: `src/features/session-v2/types.ts`
- Modify: `src/store/store.ts`
- Modify: `src/store/types.ts`

- [ ] **Step 1: Create V2 types file**

Create `src/features/session-v2/types.ts` with all types needed by V2. Reference SDK types from `@eka-care/ekascribe-ts-sdk` and `med-scribe-alliance-ts-sdk`. Key types:

```typescript
import type { TSelectedPatientDetails } from '@/constants/types';

// --- Session Phase ---
export type SessionV2Phase = 'idle' | 'recording' | 'paused' | 'processing' | 'output' | 'error';

// --- Store Slice 1: Ongoing ---
export type SessionV2Ongoing = {
  session_id: string;
  phase: SessionV2Phase;
  upload_url: string;
  created_at: number;
  business_id: string;
  session_duration: number;
  audio_amplitudes: number[];
  is_speaking: boolean;
  chunk_transcripts: Record<string, string>;
  uploaded_chunks: string[];
  upload_progress: { success: number; total: number };
  error: SessionV2Error | null;
};

export type SessionV2Error = {
  type: string;
  code: string;
  message: string;
};

// --- Store Slice 2: Content By ID ---
export type NormalizedDocument = {
  document_id: string;
  template_id: string;
  document_name: string;
  document_type: 'notes' | 'context' | 'transcript' | 'integration' | 'custom';
  type: string;
  status: string;
  errors: unknown[];
  warnings: unknown[];
  publish: Record<string, unknown>;
  presigned_url: string | null;
  edit_url: string | null;
  content: string | null;
};

export type SessionV2UiState = {
  loading: boolean;
  poll_status: 'idle' | 'polling' | 'success' | 'failed' | 'timeout';
  selected_tab: 'context' | 'transcript' | 'documents';
  selected_document_id: string;
  selected_transcript_lang: string;
  save_status: 'idle' | 'typing' | 'synced' | 'error';
  last_synced_at: number;
  is_template_processing: boolean;
};

export type SessionV2Content = {
  patient_details: TSelectedPatientDetails | null;
  audio_matrix: { quality: string } | null;
  created_at: string;
  additional_data: Record<string, unknown>;
  user_status: string;
  context: NormalizedDocument[];
  transcript: NormalizedDocument[];
  documents: NormalizedDocument[];
  ui: SessionV2UiState;
};
```

- [ ] **Step 2: Read current store types**

Read `src/store/types.ts` to understand the current TStore shape.

- [ ] **Step 3: Add V2 slices to store types**

Add to TStore in `src/store/types.ts`:

```typescript
// V2 Session State
sessionV2Ongoing: SessionV2Ongoing;
setSessionV2Ongoing: (data: Partial<SessionV2Ongoing> | ((prev: SessionV2Ongoing) => SessionV2Ongoing)) => void;
clearSessionV2Ongoing: () => void;

sessionV2ContentById: Record<string, SessionV2Content>;
setSessionV2Content: (sessionId: string, data: Partial<SessionV2Content> | ((prev: SessionV2Content) => SessionV2Content)) => void;
setSessionV2Document: (sessionId: string, documentId: string, data: Partial<NormalizedDocument>) => void;
addSessionV2Document: (sessionId: string, document: NormalizedDocument) => void;
removeSessionV2Document: (sessionId: string, documentId: string) => void;
setSessionV2Ui: (sessionId: string, data: Partial<SessionV2UiState>) => void;
clearSessionV2Content: (sessionId: string) => void;
```

- [ ] **Step 4: Implement V2 slices in store**

Add to `src/store/store.ts` — the actual Zustand implementations. Initial state for `sessionV2Ongoing`:

```typescript
export const emptySessionV2Ongoing: SessionV2Ongoing = {
  session_id: '',
  phase: 'idle',
  upload_url: '',
  created_at: 0,
  business_id: '',
  session_duration: 0,
  audio_amplitudes: [],
  is_speaking: false,
  chunk_transcripts: {},
  uploaded_chunks: [],
  upload_progress: { success: 0, total: 0 },
  error: null,
};
```

Implement all actions. For `setSessionV2Ongoing`, support both partial update and updater function (same pattern as existing `setUserOngoingSessionData`). For `sessionV2ContentById`, follow the same nested-update pattern as existing `outputSessionDataById`.

- [ ] **Step 5: Add V2 slices to partialize**

In the `partialize` config of the persist middleware, exclude `sessionV2Ongoing` from persistence (it's ephemeral). Include `sessionV2ContentById` (survives refresh for past sessions).

- [ ] **Step 6: Verify build compiles**

Run: `npx next build --no-lint 2>&1 | head -20`

Expected: No type errors from the new store additions.

- [ ] **Step 7: Commit**

```
feat(session-v2): add V2 types and store slices

Add SessionV2Ongoing and SessionV2ContentById Zustand slices
with all actions for the session V2 architecture.
```

---

## Task 2: Utility Functions

**Goal:** Pure utility functions with no React or store dependencies.

**Files:**
- Create: `src/features/session-v2/utils/normalize-documents.ts`
- Create: `src/features/session-v2/utils/calculate-amplitude.ts`
- Create: `src/features/session-v2/utils/create-sharedworker.ts`
- Create: `src/features/session-v2/utils/copy-output-utils.ts`

- [ ] **Step 1: Create normalize-documents.ts**

Converts `TSessionDocument[]` from `getSessionDetails` into the 3-bucket shape. Reference `TSessionDocument` type from SDK (`@eka-care/ekascribe-ts-sdk`).

```typescript
import type { TSessionDocument } from '@eka-care/ekascribe-ts-sdk';
import type { NormalizedDocument } from '../types';

export function normalizeDocuments(documents: TSessionDocument[]): {
  context: NormalizedDocument[];
  transcript: NormalizedDocument[];
  documents: NormalizedDocument[];
} {
  const context: NormalizedDocument[] = [];
  const transcript: NormalizedDocument[] = [];
  const docs: NormalizedDocument[] = [];

  for (const doc of documents) {
    const normalized: NormalizedDocument = {
      document_id: doc.document_id,
      template_id: doc.template_id,
      document_name: doc.document_name,
      document_type: doc.document_type,
      type: doc.type,
      status: doc.status,
      errors: doc.errors,
      warnings: doc.warnings,
      publish: doc.publish,
      presigned_url: doc.presigned_url,
      edit_url: null,
      content: null,
    };

    switch (doc.document_type) {
      case 'context':
        context.push(normalized);
        break;
      case 'transcript':
        transcript.push(normalized);
        break;
      default:
        docs.push(normalized);
        break;
    }
  }

  return { context, transcript, documents: docs };
}
```

- [ ] **Step 2: Create calculate-amplitude.ts**

Reference V1: `src/features/session/utils/calculate-audio-amplitude-in-audioframe.ts`. Rewrite with same logic.

```typescript
export function calculateAmplitude(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    sum += Math.abs(frame[i]);
  }
  const average = sum / frame.length;
  return Math.min(1, average * 10);
}
```

- [ ] **Step 3: Create create-sharedworker.ts**

Reference V1: `src/features/session/utils/create-sharedworker-instance.ts`. Rewrite using SDK v3.0.2's `createWorkerBlobUrl`.

```typescript
import { createWorkerBlobUrl } from '@eka-care/ekascribe-ts-sdk';

let cachedWorkerUrl: string | null = null;

export async function createSharedWorkerUrl(): Promise<string | undefined> {
  if (cachedWorkerUrl) return cachedWorkerUrl;
  try {
    cachedWorkerUrl = await createWorkerBlobUrl();
    return cachedWorkerUrl;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Create copy-output-utils.ts**

Reference V1: `src/features/session/utils/copy-output-summary-util-methods.ts`. Rewrite the copy/print formatting logic that adds doctor header/footer.

- [ ] **Step 5: Verify build compiles**

Run: `npx next build --no-lint 2>&1 | head -20`

- [ ] **Step 6: Commit**

```
feat(session-v2): add utility functions

Add normalize-documents, calculate-amplitude, create-sharedworker,
and copy-output-utils utilities for session V2.
```

---

## Task 3: Services Layer (SDK Provider + SDK Service + Document Service)

**Goal:** SDK singleton provider, stateless SDK wrapper, and document I/O service.

**Files:**
- Create: `src/features/session-v2/services/sdk-provider.tsx`
- Create: `src/features/session-v2/services/sdk-service.ts`
- Create: `src/features/session-v2/services/document-service.ts`

- [ ] **Step 1: Create sdk-provider.tsx**

React context that creates and holds the EkaScribe SDK singleton. Registers provider-level callbacks.

```typescript
'use client';

import { createContext, useContext, useEffect, useRef } from 'react';
import { getEkaScribeInstance, type EkaScribeConfig } from '@eka-care/ekascribe-ts-sdk';
import type { ErrorEvent, TokenRequiredEvent } from 'med-scribe-alliance-ts-sdk';
import { ekascribeSDKConfig } from '@/constants/constant';
import useVoice2RxStore from '@/store/store';

type EkaScribeSDK = ReturnType<typeof getEkaScribeInstance>;

const SDKContext = createContext<EkaScribeSDK | null>(null);

export function useSDK(): EkaScribeSDK {
  const sdk = useContext(SDKContext);
  if (!sdk) throw new Error('useSDK must be used within SDKProvider');
  return sdk;
}

export function SDKProvider({ children }: { children: React.ReactNode }) {
  const sdkRef = useRef<EkaScribeSDK | null>(null);

  if (!sdkRef.current) {
    sdkRef.current = getEkaScribeInstance(ekascribeSDKConfig as EkaScribeConfig);
  }

  const sdk = sdkRef.current;

  useEffect(() => {
    const handleTokenRequired = (event: TokenRequiredEvent) => {
      const token = ekascribeSDKConfig.access_token;
      if (token) {
        event.resolve(token);
      }
    };

    const handleError = (event: ErrorEvent) => {
      console.error('[SDK Error]', event.type, event.error);
      const store = useVoice2RxStore.getState();
      store.setSessionV2Ongoing({
        phase: 'error',
        error: {
          type: event.type,
          code: event.error.code,
          message: event.error.message,
        },
      });
    };

    sdk.registerCallback('onTokenRequired', handleTokenRequired);
    sdk.registerCallback('onError', handleError);

    return () => {
      sdk.removeCallback('onTokenRequired', handleTokenRequired);
      sdk.removeCallback('onError', handleError);
    };
  }, [sdk]);

  return <SDKContext.Provider value={sdk}>{children}</SDKContext.Provider>;
}
```

- [ ] **Step 2: Create sdk-service.ts**

Stateless functions that wrap SDK method calls. No React, no store. Each function takes the SDK instance as first argument.

```typescript
import type { EkaScribe } from '@eka-care/ekascribe-ts-sdk';
// ... type imports

export async function createSession(
  sdk: EkaScribe,
  request: CreateSessionRequest
) {
  return sdk.sessions.createSession(request);
}

export async function startRecordingForExistingSession(
  sdk: EkaScribe,
  request: TStartRecordingForExistingSessionRequest
) {
  return sdk.startRecordingForExistingSession(request);
}

export function pauseRecording(sdk: EkaScribe) {
  return sdk.pauseRecording();
}

export function resumeRecording(sdk: EkaScribe) {
  return sdk.resumeRecording();
}

export async function endRecording(sdk: EkaScribe) {
  return sdk.endRecording();
}

export async function cancelSession(sdk: EkaScribe, sessionId?: string) {
  return sdk.cancelSession(sessionId);
}

export async function getSessionStatus(
  sdk: EkaScribe,
  sessionId?: string,
  options?: { poll?: PollOptions }
) {
  return sdk.getSessionStatus(sessionId, options);
}

export async function getSessionDetails(
  sdk: EkaScribe,
  sessionId: string,
  presigned: boolean = true
) {
  return sdk.sessions.getSessionDetails({ session_id: sessionId, presigned });
}

export async function getChunkTranscript(
  sdk: EkaScribe,
  txnId: string,
  chunkNumber: string
) {
  return sdk.getChunkTranscript(txnId, chunkNumber);
}

// Document operations
export async function createDocument(sdk: EkaScribe, request: TPostV1DocumentRequest) {
  return sdk.documents.createDocument(request);
}

export async function updateDocument(sdk: EkaScribe, request: TPostV1DocumentRequest) {
  return sdk.documents.updateDocument(request);
}

export async function deleteDocument(sdk: EkaScribe, documentId: string) {
  return sdk.documents.deleteDocument(documentId);
}

export async function getDocument(sdk: EkaScribe, documentId: string) {
  return sdk.documents.getDocument(documentId);
}

export async function publishDocument(sdk: EkaScribe, request: TPostV1DocumentRequest) {
  return sdk.documents.publishDocument(request);
}

export async function convertToTemplate(
  sdk: EkaScribe,
  request: { txn_id: string; template_id: string }
) {
  return sdk.documents.convertToTemplate(request);
}

export async function convertTranscriptionToTemplate(
  sdk: EkaScribe,
  request: TPostV1ConvertToTemplateRequest
) {
  return sdk.documents.convertTranscriptionToTemplate(request);
}
```

- [ ] **Step 3: Create document-service.ts**

Handles presigned URL read/write and content formatting.

```typescript
export async function fetchDocumentContent(getUrl: string): Promise<string> {
  const response = await fetch(getUrl);
  if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
  const text = await response.text();
  return text;
}

export async function uploadDocumentContent(editUrl: string, content: string): Promise<void> {
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const blob = new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], {
    type: 'application/octet-stream',
  });
  const response = await fetch(editUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  if (!response.ok) throw new Error(`Failed to upload document: ${response.status}`);
}
```

- [ ] **Step 4: Verify build compiles**

Run: `npx next build --no-lint 2>&1 | head -20`

- [ ] **Step 5: Commit**

```
feat(session-v2): add services layer

Add SDK provider with provider-level callbacks, SDK service wrapper,
and document service for presigned URL operations.
```

---

## Task 4: Config Files (Error Config + Tab Footer Config)

**Goal:** Error state configs and tab footer configuration builders.

**Files:**
- Create: `src/features/session-v2/config/error-config.ts`
- Create: `src/features/session-v2/config/tab-footer-config.tsx`

- [ ] **Step 1: Create error-config.ts**

Reference V1: `src/features/session/config/error-config.ts`. Rewrite with same error states and UI config.

Define error configs for: `waiting_for_network`, `upload_failed`, `something_went_wrong`, `transaction_commit_failed`, `no_audio_capture`, `session_limit_exceeded`. Each config has: `title`, `subtitle`, `icon`, `buttons[]` with `{ label, action }`.

- [ ] **Step 2: Create tab-footer-config.tsx**

Reference V1: `src/features/session/config/tab-footer-config.tsx`. Rewrite footer configs for each tab type.

Define builders: `getContextFooterConfig`, `getTranscriptFooterConfig`, `getDocumentFooterConfig`, `getErrorFooterConfig`. Each returns a `TabFooterConfig` object with: `buttons[]`, `saveStatus`, `sessionUuid`, `reviewPublish?`.

- [ ] **Step 3: Commit**

```
feat(session-v2): add config files

Add error config and tab footer config for session V2.
```

---

## Task 5: Core Business Hooks (Part 1 — Lifecycle + Callbacks)

**Goal:** Session lifecycle hook and recording callbacks hook.

**Files:**
- Create: `src/features/session-v2/hooks/use-session-lifecycle.ts`
- Create: `src/features/session-v2/hooks/use-recording-callbacks.ts`

- [ ] **Step 1: Create use-session-lifecycle.ts**

The central orchestration hook. Handles: createSession on mount, startRecording, pauseRecording, resumeRecording, endRecording, discardSession.

Reference V1: `src/features/session/hooks/use-init-transaction.tsx`, `src/features/session/screens/new-session-screen.tsx` (handlers), `src/features/session/hooks/use-existing-session-recording.ts`.

Key differences from V1:
- Uses `sdk.sessions.createSession()` (new SDK) instead of `sdk.initTransaction()` (deprecated)
- Uses `sdk.startRecordingForExistingSession()` always (session pre-created)
- Uses `sdk.endRecording()` which internally handles endSession
- Phase-based state machine instead of multiple boolean flags
- Module-level dedup for createSession (same pattern as V1's `activeInitPromise`)

```typescript
export function useSessionLifecycle(sessionId?: string) {
  const sdk = useSDK();

  // createSession — called on mount for new sessions
  // loadSession — called on mount for existing sessions (getSessionDetails)
  // startRecording — mic check → sharedWorker → startRecordingForExistingSession
  // pauseRecording
  // resumeRecording
  // endRecording — sdk.endRecording() → poll status → getSessionDetails → normalize
  // discardSession — sdk.cancelSession() → clearStore → navigate

  return {
    createSession,
    loadSession,
    startRecording,
    pauseRecording,
    resumeRecording,
    endRecording,
    discardSession,
    isStartSessionLoading,
  };
}
```

- [ ] **Step 2: Create use-recording-callbacks.ts**

Registers/removes recording-scoped callbacks (`onAudioEvent`, `onUploadEvent`). Called by `useSessionLifecycle` on start/end recording.

```typescript
export function useRecordingCallbacks() {
  const sdk = useSDK();
  const callbacksRef = useRef<{ audio: any; upload: any } | null>(null);

  const register = useCallback(() => {
    const handleAudioEvent = (event: AudioEvent) => {
      const store = useVoice2RxStore.getState();
      switch (event.type) {
        case 'frame_processed':
          // Calculate amplitude, update duration
          const amplitude = calculateAmplitude(event.data.frame);
          store.setSessionV2Ongoing((prev) => ({
            ...prev,
            session_duration: event.data.duration,
            audio_amplitudes: [...prev.audio_amplitudes.slice(-299), amplitude],
          }));
          break;
        case 'user_speech':
          store.setSessionV2Ongoing({ is_speaking: event.data.isSpeaking });
          break;
        case 'silence_warning':
          // Show silence warning (could set a flag in store)
          break;
        case 'chunk_ready':
          store.setSessionV2Ongoing((prev) => ({
            ...prev,
            uploaded_chunks: [...prev.uploaded_chunks, event.data.fileName],
          }));
          // Trigger chunk transcript polling (handled by use-chunk-transcription)
          break;
      }
    };

    const handleUploadEvent = (event: UploadEvent) => {
      const store = useVoice2RxStore.getState();
      switch (event.type) {
        case 'progress':
          store.setSessionV2Ongoing({
            upload_progress: { success: event.data.successCount, total: event.data.totalCount },
          });
          break;
        case 'failed':
          console.error('Upload failed:', event.data.fileName, event.data.error);
          break;
        case 'retry':
          console.warn('Upload retry:', event.data.fileName, 'attempt:', event.data.attempt);
          break;
      }
    };

    sdk.registerCallback('onAudioEvent', handleAudioEvent);
    sdk.registerCallback('onUploadEvent', handleUploadEvent);
    callbacksRef.current = { audio: handleAudioEvent, upload: handleUploadEvent };
  }, [sdk]);

  const unregister = useCallback(() => {
    if (callbacksRef.current) {
      sdk.removeCallback('onAudioEvent', callbacksRef.current.audio);
      sdk.removeCallback('onUploadEvent', callbacksRef.current.upload);
      callbacksRef.current = null;
    }
  }, [sdk]);

  // Cleanup on unmount
  useEffect(() => () => unregister(), [unregister]);

  return { register, unregister };
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx next build --no-lint 2>&1 | head -20`

- [ ] **Step 4: Commit**

```
feat(session-v2): add session lifecycle and recording callbacks hooks

Core orchestration: createSession, startRecording, endRecording,
and recording-scoped callback registration.
```

---

## Task 6: Core Business Hooks (Part 2 — Output + Documents)

**Goal:** Session output polling/loading and document CRUD hooks.

**Files:**
- Create: `src/features/session-v2/hooks/use-session-output.ts`
- Create: `src/features/session-v2/hooks/use-document-actions.ts`
- Create: `src/features/session-v2/hooks/use-save-status.ts`

- [ ] **Step 1: Create use-session-output.ts**

Handles: `getSessionStatus` with polling → `getSessionDetails` → normalize documents → store in `sessionV2ContentById`.

Reference V1: `src/features/session/utils/get-output-summary.ts` and `src/features/session/utils/get-ongoing-session-processing-status.tsx`.

```typescript
export function useSessionOutput(sessionId: string) {
  const sdk = useSDK();

  // pollForOutput — called after endRecording or processTranscription
  //   getSessionStatus(poll: true) → terminal state
  //   getSessionDetails(presigned: true) → normalize → store
  //   set phase = 'output' or 'error'

  // loadSessionOutput — called for past sessions
  //   getSessionDetails(presigned: true) → normalize → store
  //   derive phase from user_status

  return { pollForOutput, loadSessionOutput, isPolling };
}
```

- [ ] **Step 2: Create use-document-actions.ts**

CRUD operations on documents within a session.

Reference V1: `src/features/session/utils/document-actions.ts` and `src/features/session/utils/template-actions.ts`.

```typescript
export function useDocumentActions(sessionId: string) {
  const sdk = useSDK();

  // fetchContent(doc) — fetch from presigned_url GET URL → update doc.content in store
  // saveContent(doc, content) — updateDocument → get EDIT URL → upload to S3
  // addNote(name) — createDocument(type: 'notes') → add to store
  // deleteNote(docId) — deleteDocument → remove from store
  // publishDoc(docId) — publishDocument
  // unpublishDoc(docId) — updateDocument with publish: {}
  // convertToTemplate(templateId) — convertToTemplate → poll → refresh

  return {
    fetchContent,
    saveContent,
    addNote,
    deleteNote,
    publishDoc,
    unpublishDoc,
    convertToTemplate,
  };
}
```

- [ ] **Step 3: Create use-save-status.ts**

Simple state machine for document save status. Reference V1: `src/features/session/hooks/use-save-status.ts`.

```typescript
export function useSaveStatus(sessionId: string) {
  // markTyping — set save_status = 'typing' in UI state
  // markSynced — set save_status = 'synced', update last_synced_at
  // markError — set save_status = 'error'

  return { markTyping, markSynced, markError };
}
```

- [ ] **Step 4: Commit**

```
feat(session-v2): add output, document actions, and save status hooks

Session output polling/loading, document CRUD, and save status
state machine for session V2.
```

---

## Task 7: Supporting Hooks (Chunk Transcription + Context + Before Unload + Errors)

**Goal:** Remaining business hooks.

**Files:**
- Create: `src/features/session-v2/hooks/use-chunk-transcription.ts`
- Create: `src/features/session-v2/hooks/use-context-tab.ts`
- Create: `src/features/session-v2/hooks/use-session-context.ts`
- Create: `src/features/session-v2/hooks/use-before-unload.ts`
- Create: `src/features/session-v2/hooks/use-error-handlers.ts`

- [ ] **Step 1: Create use-chunk-transcription.ts**

Watches `uploaded_chunks` in store. When new chunk appears, polls `getChunkTranscript` (2s interval, max 5 attempts). On success, stores text in `chunk_transcripts`.

Reference V1: `src/features/session/hooks/use-chunk-transcription.ts`.

- [ ] **Step 2: Create use-context-tab.ts**

Manages the context document: creates it on first edit, stores content, manages TipTap editor ref.

Reference V1: `src/features/session/hooks/use-context-tab.ts`.

- [ ] **Step 3: Create use-session-context.ts**

Manages linked past sessions and attachments. API calls: `addSessionContext`, `removeSessionContext`.

Reference V1: `src/features/session/hooks/use-session-context.ts`.

- [ ] **Step 4: Create use-before-unload.ts**

Registers `beforeunload` when `phase === 'recording' || phase === 'paused'`.

Reference V1: `src/features/session/hooks/use-before-unload.ts`.

- [ ] **Step 5: Create use-error-handlers.ts**

Maps error states to actions: retry (re-trigger endRecording), record again (cancel + new session), cancel session.

Reference V1: `src/features/session/hooks/use-error-handlers.ts`.

- [ ] **Step 6: Commit**

```
feat(session-v2): add supporting hooks

Chunk transcription polling, context tab, session context,
beforeunload, and error handlers.
```

---

## Task 8: TipTap Editor + Document Renderers

**Goal:** Rewrite the TipTap WYSIWYG editor and document renderers.

**Files:**
- Create: `src/features/session-v2/components/editor/tiptap-wysiwyg-editor.tsx`
- Create: `src/features/session-v2/components/editor/editor-toolbar.tsx`
- Create: `src/features/session-v2/components/editor/editor-bubble-menu.tsx`
- Create: `src/features/session-v2/components/editor/slash-command.ts`
- Create: `src/features/session-v2/document-renderers/markdown-renderer.tsx`
- Create: `src/features/session-v2/document-renderers/text-renderer.tsx`

- [ ] **Step 1: Create tiptap-wysiwyg-editor.tsx**

Full TipTap editor with StarterKit + tables + highlighting + slash commands. Exposes `TiptapEditorHandle` ref with `getMarkdown()`, `setMarkdown()`, `blur()`. Uses Showdown (markdown→HTML) and Turndown (HTML→markdown).

Reference V1: `src/features/session/template-renderers/tiptap-wysiwyg-editor.tsx`. Rewrite with same extensions and behavior.

- [ ] **Step 2: Create editor-toolbar.tsx, editor-bubble-menu.tsx, slash-command.ts**

Reference V1 editor components. Rewrite with same UI.

- [ ] **Step 3: Create markdown-renderer.tsx**

TipTap-based renderer for markdown documents. Wraps `TiptapWysiwygEditor`. Syncs content from store, debounced onChange, saves on blur.

Reference V1: `src/features/session/template-renderers/markdown-renderer.tsx`.

This is the ONE markdown renderer used by all documents (notes, custom).

- [ ] **Step 5: Create text-renderer.tsx**

Simple plain text renderer for transcript content.

Reference V1: `src/features/session/template-renderers/text-renderer.tsx`.

- [ ] **Step 6: Commit**

```
feat(session-v2): add TipTap editor and document renderers

Rewrite WYSIWYG editor with extensions, markdown renderer,
and text renderer.
```

---

## Task 9: Recording Components (Waveform, Transcript, Microphone)

**Goal:** Recording-phase UI components.

**Files:**
- Create: `src/features/session-v2/components/recording/audio-waveform-timer.tsx`
- Create: `src/features/session-v2/components/recording/chunk-transcript-display.tsx`
- Create: `src/features/session-v2/components/recording/transcript-idle-state.tsx`
- Create: `src/features/session-v2/components/recording/microphone-selector.tsx`
- Create: `src/features/session-v2/components/recording/audio-quality-summary.tsx`

- [ ] **Step 1: Create audio-waveform-timer.tsx**

Reads `audio_amplitudes` and `session_duration` from `sessionV2Ongoing`. Renders waveform bars + timer display.

Reference V1: `src/features/session/components/recording/audio-waveform-timer-container.tsx`. Same UI.

V2 difference: Reads from `sessionV2Ongoing` store slice instead of V1's `userOngoingSessionData`.

- [ ] **Step 2: Create chunk-transcript-display.tsx**

Reads `chunk_transcripts` from `sessionV2Ongoing`. Sorts by chunk index, renders transcript lines with auto-scroll.

Reference V1: `src/features/session/components/recording/chunk-transcript-display.tsx`. Same UI.

- [ ] **Step 3: Create transcript-idle-state.tsx, microphone-selector.tsx, audio-quality-summary.tsx**

Reference V1 counterparts. Same UI. Different store reads.

- [ ] **Step 4: Commit**

```
feat(session-v2): add recording UI components

Waveform timer, chunk transcript display, mic selector,
and supporting recording components.
```

---

## Task 10: Tab Content Components

**Goal:** The 3 tab content components + tab footer.

**Files:**
- Create: `src/features/session-v2/components/tabs/context-tab-content.tsx`
- Create: `src/features/session-v2/components/tabs/transcript-tab-content.tsx`
- Create: `src/features/session-v2/components/tabs/document-tab-content.tsx`
- Create: `src/features/session-v2/components/tabs/tab-footer.tsx`

- [ ] **Step 1: Create context-tab-content.tsx**

TipTap editor for context + `ContextItemsList` for linked sessions/attachments. Uses `useContextTab` hook.

Reference V1: `src/features/session/components/tabs/context-tab-content.tsx`. Same UI.

- [ ] **Step 2: Create transcript-tab-content.tsx**

Transcript output with language selector dropdown. During recording: shows `ChunkTranscriptDisplay`. After output: shows content from transcript document with language switch.

Reference V1: `src/features/session/components/output/transcription-output-content.tsx`. Same UI.

- [ ] **Step 3: Create document-tab-content.tsx**

Renders a single document's content using `MarkdownRenderer`. Each document from `getSessionDetails` (notes, custom) becomes its own tab in the tab row — this component renders the content for whichever document tab is active. Receives `documentId` as prop, fetches content from presigned URL on mount, renders in TipTap editor.

**NOTE:** Handle `document.errors` and `document.warnings` here — check before rendering. If errors/warnings exist and no content, show an error/warning state.

Transcript documents are the exception — all transcript-type documents render in the Transcript tab (handled by `transcript-tab-content.tsx`).

Reference V1: `src/features/session/components/output/template-output-component.tsx`. Same UI.

- [ ] **Step 4: Create tab-footer.tsx**

Renders footer from `TabFooterConfig`. Shows buttons (copy, print, link, attach), save status indicator, "Review & publish" button, session UUID.

Reference V1: `src/features/session/components/tabs/tab-footer.tsx`. Same UI.

- [ ] **Step 5: Commit**

```
feat(session-v2): add tab content components

Context, transcript, and document tab contents with tab footer.
```

---

## Task 11: Output + Dialog Components

**Goal:** Output state components and dialog components.

**Files:**
- Create: `src/features/session-v2/components/output/analysing-component.tsx`
- Create: `src/features/session-v2/components/output/error-component.tsx`
- Create: `src/features/session-v2/components/output/no-output-component.tsx`
- Create: `src/features/session-v2/components/dialogs/edit-preferences-dialog.tsx`
- Create: `src/features/session-v2/components/dialogs/tertiary-session-dialog.tsx`
- Create: `src/features/session-v2/components/dialogs/publish-modal.tsx`
- Create: `src/features/session-v2/components/dialogs/link-past-sessions-dialog.tsx`
- Create: `src/features/session-v2/components/dialogs/add-attachments-dialog.tsx`

- [ ] **Step 1: Create output state components**

Reference V1 counterparts. Same UI. `error-component.tsx` uses `useErrorHandlers` hook and `error-config.ts`.

- [ ] **Step 2: Create dialog components**

Reference V1 counterparts. Same UI. Each dialog is self-contained.

`tertiary-session-dialog.tsx` is the upload audio / paste transcript dialog. In V2 it uses `useSessionLifecycle` for session creation and `sdk-service` for the upload/transcription calls.

- [ ] **Step 3: Commit**

```
feat(session-v2): add output state and dialog components

Analysing, error, no-output states and all dialog components.
```

---

## Task 12: Session Header + Body + Tab Row + Alert

**Goal:** The main structural components.

**Files:**
- Create: `src/features/session-v2/components/session-header.tsx`
- Create: `src/features/session-v2/components/session-body.tsx`
- Create: `src/features/session-v2/components/session-tab-row.tsx`
- Create: `src/features/session-v2/components/session-alert.tsx`
- Create: `src/features/session-v2/components/save-status-indicator.tsx`
- Create: `src/features/session-v2/components/context-items-list.tsx`

- [ ] **Step 1: Create session-header.tsx**

Shows: patient selector, preferences info, recording controls (start/pause/resume/end/discard), microphone selector. Behavior adapts based on `phase`.

Reference V1: `src/features/session/components/session-header.tsx`. Same UI.

V2 difference: Receives phase from store instead of derived `sessionState` string. All recording handlers come from `useSessionLifecycle` hook.

- [ ] **Step 2: Create session-body.tsx (UNIFIED)**

The single body component that replaces V1's `SessionBody` + `OutputSessionBody`. Renders based on `phase`:

```typescript
// Simplified structure
const SessionBody = ({ sessionId }: { sessionId: string }) => {
  const phase = useVoice2RxStore((s) => s.sessionV2Ongoing.phase);

  if (phase === 'processing') return <AnalysingComponent />;
  if (phase === 'error') return <ErrorComponent />;

  // All other phases show the tab layout
  return (
    <div>
      <SessionTabRow />
      <ActiveTabContent /> {/* ContextTab | TranscriptTab | DocumentTab */}
      <TabFooter />
    </div>
  );
};
```

- [ ] **Step 3: Create session-tab-row.tsx, session-alert.tsx, save-status-indicator.tsx, context-items-list.tsx**

Reference V1 counterparts. Same UI.

- [ ] **Step 4: Commit**

```
feat(session-v2): add main structural components

Session header, unified body, tab row, alert, save status,
and context items list.
```

---

## Task 13: Unified Session Screen + Routing

**Goal:** The unified screen component and Next.js routing.

**Files:**
- Create: `src/features/session-v2/screens/session-screen.tsx`
- Create: `src/features/session-v2/screens/mic-permission-screen.tsx`
- Create: `src/app/session/[id]/page.tsx` (new route)
- Modify: `src/app/session/page.tsx` (update to use V2)

- [ ] **Step 1: Create session-screen.tsx**

Unified screen for both new and past sessions. Wraps with `SDKProvider`.

```typescript
'use client';

import { SDKProvider } from '../services/sdk-provider';
import SessionHeader from '../components/session-header';
import SessionBody from '../components/session-body';
import { useSessionLifecycle } from '../hooks/use-session-lifecycle';
import { useBeforeUnload } from '../hooks/use-before-unload';

const SessionScreen = ({ sessionId }: { sessionId?: string }) => {
  return (
    <SDKProvider>
      <SessionScreenInner sessionId={sessionId} />
    </SDKProvider>
  );
};

const SessionScreenInner = ({ sessionId }: { sessionId?: string }) => {
  const lifecycle = useSessionLifecycle(sessionId);
  useBeforeUnload();

  return (
    <div className="relative h-full w-full">
      <SessionHeader {...lifecycle} />
      <SessionBody sessionId={lifecycle.activeSessionId} />
    </div>
  );
};
```

- [ ] **Step 2: Create mic-permission-screen.tsx**

Reference V1: `src/features/session/screens/mic-permission-screen.tsx`. Same UI.

- [ ] **Step 3: Create /session/[id] route**

Create `src/app/session/[id]/page.tsx`:

```typescript
import SessionScreen from '@/features/session-v2/screens/session-screen';

export default function SessionPage({ params }: { params: { id: string } }) {
  return <SessionScreen sessionId={params.id} />;
}
```

- [ ] **Step 4: Update /new-session route**

Modify `src/app/new-session/page.tsx` to render `SessionScreen` without a sessionId (creates new session on mount).

- [ ] **Step 5: Verify navigation works**

Test both routes: `/new-session` and `/session/{some-id}`. Both should render the unified screen. New session should call `createSession` on mount.

- [ ] **Step 6: Commit**

```
feat(session-v2): add unified session screen and routing

Single SessionScreen for new and past sessions. Add /session/[id]
route and update /new-session to use V2.
```

---

## Task 14: Sidebar Integration

**Goal:** Wire V2 store to existing sidebar for current session card and start new session flow.

**Files:**
- Modify: Sidebar files that read from V1 store (update to read V2 slices)

- [ ] **Step 1: Identify sidebar integration points**

Read `src/features/sidebar/components/sidebar.tsx` to find all places that reference V1 session state (`isNewSessionInitialized`, `sessionUuid`, `userOngoingSessionData`).

- [ ] **Step 2: Update "Current Session" card**

Change from reading `isNewSessionInitialized` to reading `sessionV2Ongoing.session_id !== ''`.

- [ ] **Step 3: Update "Start New Session" handler**

Ensure it clears V2 store (`clearSessionV2Ongoing`) and navigates to `/new-session`.

- [ ] **Step 4: Update session navigation**

Past session clicks should navigate to `/session/{id}` (new route) instead of `/ongoing-session/output-result/{id}`.

- [ ] **Step 5: Verify sidebar behavior**

Test: Current session card appears when session exists, Start New Session creates fresh session, past session clicks navigate to unified screen.

- [ ] **Step 6: Commit**

```
feat(session-v2): integrate sidebar with V2 store

Update sidebar to read from V2 store slices and navigate
to unified session routes.
```

---

## Task 15: End-to-End Wiring + Smoke Test

**Goal:** Wire everything together and verify all flows work.

**Files:**
- May need minor fixes across V2 files

- [ ] **Step 1: Test Flow 1 — Page load new session**

Navigate to `/new-session`. Verify:
- `createSession` is called
- Session ID appears in store
- Idle screen with empty tabs
- Current Session card in sidebar

- [ ] **Step 2: Test Flow 2 — Start + End recording**

Click Start Recording. Verify:
- Mic permission check
- Waveform + timer running
- Chunk transcripts appearing
- Click End → processing → output with document tabs

- [ ] **Step 3: Test Flow 3 — Past session view**

Click a past session in sidebar. Verify:
- Navigates to `/session/{id}`
- `getSessionDetails` loads data
- Documents render in tabs
- Content loads from presigned URLs

- [ ] **Step 4: Test Flow 4 — Start new session while current exists**

With a session in idle, click Start in sidebar. Verify:
- Old session moves to past sessions
- New session created
- Fresh idle screen

- [ ] **Step 5: Fix any issues found**

Address bugs, type errors, missing props, etc.

- [ ] **Step 6: Commit**

```
feat(session-v2): end-to-end wiring and fixes

Wire all components, hooks, and services. Fix integration issues
found during smoke testing.
```

---

## Task 16: Cleanup + Export to PDF Utility

**Goal:** Add remaining utilities and clean up.

**Files:**
- Create: `src/features/session-v2/utils/export-to-pdf.ts`
- Any remaining cleanup

- [ ] **Step 1: Create export-to-pdf.ts**

Reference V1: `src/features/session/utils/export-template-to-pdf.tsx`. Rewrite PDF export using same approach.

- [ ] **Step 2: Final code review**

Review all V2 files for:
- No imports from `features/session/` (V1)
- No usage of V1 store fields (`userOngoingSessionData`, `outputSessionDataById`, etc.)
- Consistent type usage
- No dead code

- [ ] **Step 3: Commit**

```
feat(session-v2): add PDF export and final cleanup

Add export-to-pdf utility. Verify zero V1 imports and
clean architecture boundaries.
```

---

## Summary

| Task | Description | Files | Estimate |
|------|-------------|-------|----------|
| 1 | V2 Types + Store Slices | 3 | Foundation |
| 2 | Utility Functions | 4 | Foundation |
| 3 | Services Layer | 3 | Foundation |
| 4 | Config Files | 2 | Foundation |
| 5 | Core Hooks Part 1 (Lifecycle + Callbacks) | 2 | Core |
| 6 | Core Hooks Part 2 (Output + Documents) | 3 | Core |
| 7 | Supporting Hooks | 5 | Core |
| 8 | TipTap Editor + Document Renderers | 6 | UI |
| 9 | Recording Components | 5 | UI |
| 10 | Tab Content Components | 4 | UI |
| 11 | Output + Dialog Components | 8 | UI |
| 12 | Main Structural Components | 6 | UI |
| 13 | Unified Screen + Routing | 4 | Integration |
| 14 | Sidebar Integration | 1+ | Integration |
| 15 | End-to-End Wiring | varies | Integration |
| 16 | Cleanup + PDF Export | 2 | Polish |

**Total: ~60+ files, 16 tasks**

Tasks 1-4 are foundation (can be done in any order). Tasks 5-7 are core business logic (sequential). Tasks 8-12 are UI (can be parallelized). Tasks 13-16 are integration (sequential).

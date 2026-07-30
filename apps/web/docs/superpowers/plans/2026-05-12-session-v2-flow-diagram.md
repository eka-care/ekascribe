# Session V2 - Flow Diagram

## Entry Points

There are 4 ways a session begins:

```
1. Page Load (new-session)          → createSession → idle screen
2. Sidebar "Start New Session"      → refreshSessions → clearStore → navigate /new-session → createSession
3. Sidebar Queue Recording          → refreshSessions → clearStore → set patient → navigate /new-session → createSession → auto-start recording
4. Past Session Click               → navigate /session/{id} → getSessionDetails → unified screen
```

---

## Flow 1: Page Load (New Session)

```
User lands on /new-session
  │
  ├── useSettings loads config + preferences (existing shared hook)
  │
  ├── createSession(SDK) → returns { session_id, upload_url, created_at }
  │     ├── Success → store session_id, upload_url, created_at in sessionV2Ongoing
  │     │             set phase = 'idle'
  │     │             show "Current Session" card in sidebar
  │     └── Failure → show warning banner, stay on idle
  │
  └── User sees idle screen:
        - Context tab (empty TipTap editor)
        - Transcript tab (empty "Listening..." state)
        - Notes tab (empty, can add notes)
        - Header: patient selector, preferences, Start Recording button
```

---

## Flow 2: Start Recording

```
User clicks "Start Recording"
  │
  ├── Check mic permission
  │     └── Denied → show mic permission screen, STOP
  │
  ├── Guard: session already recording? → STOP
  │
  ├── createSharedWorkerInstance()
  │
  ├── startRecordingForExistingSession(SDK) with:
  │     { txn_id, business_id, created_at, microphoneID }
  │     ├── Success → register onAudioEvent + onUploadEvent callbacks
  │     │             set phase = 'recording'
  │     │             patchSession({ user_status: 'recording_started' })
  │     └── Failure → show error warning, stay on idle
  │
  └── Recording active:
        - Waveform + timer running (from onAudioEvent frame_processed)
        - Chunk transcripts polling (from onAudioEvent chunk_ready)
        - Upload progress tracking (from onUploadEvent progress)
        - Silence warnings (from onAudioEvent silence_warning)
```

---

## Flow 3: Recording Controls

```
Pause Recording:
  User clicks Pause → sdk.pauseRecording() → phase = 'paused'

Resume Recording:
  User clicks Resume → sdk.resumeRecording() → phase = 'recording'

End Recording:
  User clicks End → sdk.endRecording()
    │
    ├── SDK internally: stops recorder, waits for uploads, calls endSession
    │
    ├── On success:
    │     ├── Remove onAudioEvent + onUploadEvent callbacks
    │     ├── Set phase = 'processing'
    │     ├── getSessionStatus(poll: true) → wait for completed/partial/failed
    │     │     ├── completed/partial → getSessionDetails(presigned: true)
    │     │     │     ├── Normalize documents into: context[], transcript[], documents[]
    │     │     │     ├── Store in sessionV2ContentById
    │     │     │     ├── Set phase = 'output'
    │     │     │     └── refreshSessions() to move session to past
    │     │     └── failed → set phase = 'error', show error UI
    │     └── On error → set phase = 'error', show retry/record-again UI
    │
    └── On failure (endRecording fails):
          └── Set phase = 'error', show upload-failed/retry UI

Discard Session:
  User clicks Discard (during recording)
    ├── sdk.cancelSession()
    ├── Remove callbacks
    ├── clearStore
    ├── refreshSessions
    └── Navigate to /new-session (creates fresh session)
```

---

## Flow 4: Past Session View

```
User clicks past session in sidebar
  │
  ├── Navigate to /session/{sessionId}
  │
  ├── getSessionDetails(sessionId, presigned: true)
  │     ├── Success → normalize documents → store in sessionV2ContentById
  │     │             derive phase from user_status:
  │     │               'init' → phase = 'idle' (can record)
  │     │               'recording_started' → phase = 'output' (abandoned, show whatever output exists)
  │     │               'commit' → phase = 'output'
  │     └── Failure → show error state
  │
  ├── If phase = 'idle' (user_status = 'init'):
  │     User can start recording on this session (same as Flow 2)
  │     Uses startRecordingForExistingSession
  │
  └── If phase = 'output':
        Show output tabs: Context | Transcript | Documents (notes + custom)
        Each tab's content loaded lazily from presigned GET URLs
```

---

## Flow 5: Process Transcription (no recording)

```
User pastes transcript text → clicks "Generate"
  │
  ├── createSession(templates: []) — empty templates array
  │
  ├── sdk.documents.convertTranscriptionToTemplate({
  │     txn_id, template_id, transcript, target_language
  │   })
  │
  ├── getSessionStatus(poll: true) → wait for completed
  │
  ├── getSessionDetails(presigned: true) → normalize documents
  │
  └── Set phase = 'output', navigate to /session/{id}
```

---

## Flow 6: Upload Pre-recorded Audio

```
User selects audio file → clicks "Generate"
  │
  ├── Ensure session exists (createSession if not yet)
  │
  ├── sdk.processPreRecordedAudio({ uploadUrl, audioFile })
  │
  ├── sdk.sessions.endSession({ audio_files_sent: 1, audio_files_uploaded: 1 })
  │
  ├── getSessionStatus(poll: true) → wait for completed
  │
  ├── getSessionDetails(presigned: true) → normalize documents
  │
  └── Set phase = 'output', navigate to /session/{id}
```

---

## Flow 7: Queue Recording

```
User clicks "Start" on a queue appointment in sidebar
  │
  ├── Guard: any session busy (recording/paused/analysing)? → block, STOP
  ├── Guard: debounce rapid clicks
  │
  ├── Check mic permission
  │     └── Denied → STOP
  │
  ├── Set queueRecordingPatientOid (preserved across clearStore)
  │
  ├── clearStore() → resets ongoing state
  ├── Set sidebar tab to 'my_queue'
  │
  ├── Set patient details from queue item (oid, name, age, gender)
  │
  ├── createSession(SDK) with templates from preferences, encounter_id from queue item
  │     └── Failure → clear queueRecordingPatientOid, STOP
  │
  ├── createSharedWorkerInstance()
  │
  ├── startRecordingForExistingSession(SDK)
  │     └── Failure → clear queueRecordingPatientOid, STOP
  │
  ├── Register onAudioEvent + onUploadEvent callbacks
  ├── Set phase = 'recording'
  ├── patchSession({ user_status: 'recording_started' })
  │
  └── Navigate to /new-session (recording is already active)

End Visit (queue action):
  User clicks "End Visit" on queue appointment
    │
    ├── If recording active for this patient:
    │     sdk.endRecording() → same as Flow 3 end recording
    │
    ├── Clear queueRecordingPatientOid
    │
    └── Update Firebase appointment status to 'CMNP'
```

---

## Flow 8: Document Operations (Output Phase)

```
Tab Actions (Context/Notes/Custom templates):

  View content:
    Read presigned GET URL from sessionV2ContentById[sessionId].documents[docId]
    fetch(GET URL) → decode → render in TipTap editor

  Edit content:
    User types in TipTap → debounced onChange stores in local state
    On blur/save:
      sdk.documents.updateDocument({ session_id, document_id, type })
        → returns EDIT presigned URL
      base64 encode content → fetch(PUT, EDIT URL) → S3

  Add new note:
    sdk.documents.createDocument({ session_id, document_name: 'New Note', type: 'notes' })
      → returns { document_id, presigned_url (EDIT URL) }
    Upload initial content to S3 via EDIT URL
    Add to sessionV2ContentById[sessionId].documents[]

  Delete note:
    sdk.documents.deleteDocument(documentId)
    Remove from sessionV2ContentById[sessionId].documents[]

  Copy content:
    Read markdown from TipTap → format with doctor header/footer → clipboard

  Print content:
    Read markdown from TipTap → format → window.print()

  Publish/Unpublish:
    sdk.documents.publishDocument({ session_id, document_id })
    sdk.documents.updateDocument({ session_id, document_id, publish: {} })

  Convert to template:
    sdk.documents.convertToTemplate({ txn_id, template_id })
    getSessionStatus(poll: true) → getSessionDetails → refresh documents
```

---

## Flow 9: Transcript Language Switch

```
User selects different language from dropdown
  │
  ├── sdk.documents.convertTranscriptionToTemplate({
  │     txn_id, template_id, target_language
  │   })
  │
  ├── getSessionStatus(poll: true, templateId) → wait for new transcript
  │
  ├── getSessionDetails(presigned: true) → update transcript document
  │
  └── Fetch new content from presigned GET URL → render
```

---

## Flow 10: Page Refresh During Recording

```
User refreshes page while recording
  │
  ├── beforeunload handler shows browser default "Leave page?" dialog
  │
  ├── If user stays → nothing happens, recording continues
  │
  └── If user leaves:
        - SDK in-memory state (VAD, SharedWorker) is lost
        - On rehydrate: store detects isNewSessionInitialized but no active SDK
        - Session remains in 'init' or 'recording_started' status on server
        - Appears in past sessions list
        - User can navigate to it and start recording again (Flow 4)
        - Session is NOT cancelled (user might want to continue later)
```

---

## Flow 11: Sidebar "Start New Session" While Session Exists

```
User clicks "Start" in sidebar
  │
  ├── Guard: recording active? → block with warning, STOP
  │
  ├── refreshSessions() → moves current session to past sessions list
  │
  ├── clearStore() → resets sessionV2Ongoing
  │
  ├── Navigate to /new-session
  │
  └── createSession(SDK) → new session created (Flow 1)
      Previous session stays in past sessions (not cancelled)
```

---

## Session Phases (V2 state machine)

```
                    ┌─────────┐
     Page Load ────►│  idle   │◄──── Past session (user_status = init)
                    └────┬────┘
                         │ startRecordingForExistingSession
                         ▼
                    ┌──────────┐
              ┌────►│recording │◄────┐
              │     └────┬─────┘     │
              │          │           │
         resume     pause/end    resume
              │          │           │
              │     ┌────▼─────┐     │
              └─────│  paused  │─────┘
                    └────┬─────┘
                         │ endRecording
                         ▼
                   ┌───────────┐
                   │processing │
                   └─────┬─────┘
                         │ getSessionStatus (poll) + getSessionDetails
                    ┌────┴────┐
                    ▼         ▼
              ┌──────┐  ┌───────┐
              │output │  │ error │
              └──────┘  └───────┘
```

---

## Callback Flow

```
SDK Callbacks (4 only):

  onTokenRequired (provider-level, always registered):
    SDK fires when 401 → event.resolve(newToken) → SDK retries request

  onError (provider-level, always registered):
    SDK fires on vad_error, worker_error, transport_error, validation_error
    → Map to error phase or warning banner

  onAudioEvent (recording-scoped, register on start, remove on end):
    frame_processed → update waveform amplitudes + session_duration
    user_speech     → update speaking/silence indicator
    silence_warning → show silence warning UI
    chunk_ready     → trigger chunk transcript polling

  onUploadEvent (recording-scoped, register on start, remove on end):
    progress → update upload progress in store
    failed   → track failed uploads
    retry    → log retry attempt
```

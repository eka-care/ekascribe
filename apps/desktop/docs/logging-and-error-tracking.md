# Logging & Error Tracking

## Overview

Sentry is the single debugging tool. Mixpanel is only for product analytics.

- **Renderer** (ekascribe-web): `@sentry/browser` via `SentryProvider` in `src/analytics/providers/sentry-provider.ts`
- **Electron main process**: `@sentry/electron/main` via `src/main/managers/sentryManager.ts`
- Both share the same DSN and Sentry project, but maintain **separate breadcrumb buffers** (breadcrumbs from main process don't appear in renderer events and vice versa).

## How it works

### Renderer (ekascribe-web)

`tracker.log()` → SentryProvider.track():
- Every call adds a **breadcrumb** (trail attached to the next event)
- If the event name/type is in the milestone set, also fires `captureMessage` (searchable event)

`tracker.error()` → SentryProvider.error():
- Fires `captureException` (searchable error with stack trace)
- `session_id` extracted from `context.extra` and promoted to tags
- Critical errors (matching `CRITICAL_ERROR_CODES`) are tagged `critical: true` with `level: fatal`

`tracker.track()` → MixpanelProvider only (not Sentry)

### Electron main process

- `captureLog()` → `captureMessage` (searchable milestone event)
- `captureError()` → `captureException` (searchable error)
- `addBreadcrumb()` → trail attached to the next captureMessage/captureException
- Critical errors (`native_helper`, `uncaught_exception`, `crash` domain) are tagged `critical: true` with `level: fatal`

### Auto-breadcrumb filtering

Both Sentry instances filter out noisy auto-captured breadcrumbs via `beforeBreadcrumb`:
- **Renderer**: drops `fetch`, `xhr`, `console`, `ui.click`, `ui.input`
- **Main process**: drops `console`, `electron.net`, `http`, `child_process`, `electron`

### session_id tagging

- Passed per-event in `properties` / `tags`, NOT via Sentry scope
- Multiple sessions can coexist — scope tag would point to wrong session
- Main process uses `setSessionId()` / `clearSessionId()` for its scope tag (single active session)

### Critical error tagging

Certain errors are automatically tagged `critical: true` and sent with `level: fatal` so they can be filtered in Sentry alerts (e.g., Slack notifications).

**Renderer critical error codes** (defined in `sentry-provider.ts`):
- `processing_failed`
- `create_session_failed`
- `session_end_failed`
- `chunk_limit_reached`

**Desktop critical components** (defined in `sentryManager.ts`):
- `native_helper`
- `uncaught_exception`
- Any error with `domain: crash`

## Performance Tracking

### App Startup & Window Load (Desktop)
- `app_launched` includes `startup_duration_ms` — time from process start to app ready
- `window_load_completed` includes `duration_ms` — time from loadURL to content loaded

### UI Freezing (Desktop)
- Event loop lag detector runs every 2s in the main process
- If lag exceeds 2s, a `perf/event_loop_blocked` breadcrumb is added with `lag_ms`
- These appear in the breadcrumb trail when errors fire, helping explain UI freezes

### Session Creation Latency (Web)
- `session_created` milestone includes `duration_ms` — API call time on success
- `create_session_failed` milestone includes `duration_ms` — API call time on failure

### Memory Tracking (Web)
- `memory_snapshot` breadcrumb fires at every `end_recording` with `heap_used_mb`
- `high_memory_usage` milestone fires if heap > 500MB at end of recording
- `long_session_ended` milestone fires if recording > 30 minutes, with `heap_used_mb` and `total_chunks`

### Processing Latency (Web)
- `processing_completed` includes `duration_ms` — time from end_recording to output ready
- `processing_failed` includes `duration_ms` — time from end_recording to failure
- `processing_timeout` milestone fires when polling exceeds 60s with `poll_duration_ms`

### AG-UI Streaming (Web)
- `agui_streaming_completed` includes `duration_ms` — total stream time
- `agui_streaming` errors include `duration_ms` — time until failure

### Slow APIs (Web)
- Successful API calls taking >5s emit a `slow_api_call` breadcrumb with `endpoint`, `method`, `duration_ms`, `service`

## Searching in Sentry

- Search `session_id:sc-xxxxx` to find all milestone events and errors for a session
- Renderer events (session lifecycle) and main process events (app/helper lifecycle) appear in the same project
- Click any event to see its breadcrumb trail
- Search `critical:true` or filter by `level:fatal` to see only critical errors

---

## Renderer — Searchable Events

### Milestones (captureMessage)

| Event | Source | When | Properties |
|---|---|---|---|
| `start_recording` | use-session-lifecycle.ts | User starts recording | |
| `pause_recording` | use-session-lifecycle.ts | User pauses | |
| `resume_recording` | use-session-lifecycle.ts | User resumes | |
| `end_recording` | use-session-lifecycle.ts | User ends recording | |
| `upload_recording` | use-session-lifecycle.ts | Upload flow triggered | |
| `processing_started` | use-session-lifecycle.ts | Backend processing begins | `recording_duration_ms`, `total_chunks` |
| `processing_completed` | use-session-lifecycle.ts | Backend returns output | `duration_ms`, `recording_duration_ms` |
| `processing_failed` | use-session-lifecycle.ts | Backend processing failed | `duration_ms`, `recording_duration_ms`, `total_chunks`, `failed_chunks`, `network_online` |
| `processing_timeout` | session-loader.ts | Polling timed out (60s) | `poll_duration_ms`, `network_online` |
| `discard_session` | use-session-lifecycle.ts, use-error-handlers.ts | User discards session | |
| `stop_processing` | use-session-lifecycle.ts | User cancels processing | |
| `upload_audio_to_notes` | use-process-audio.ts | Audio file upload begins | |
| `upload_transcript_to_notes` | use-process-transcript.ts | Transcript upload begins | |
| `agui_streaming_started` | use-stream-template-run.ts | AG-UI streaming begins | |
| `agui_streaming_completed` | use-stream-template-run.ts | AG-UI streaming finished | `duration_ms` |
| `retry_attempted` | use-error-handlers.ts | User clicks Try Again | `failed_files_count`, `total_chunks`, `network_online` |
| `mic_permission_denied` | use-session-lifecycle.ts | User denied mic access | |
| `create_session_failed` | use-session-lifecycle.ts | Session creation API failed | `network_online`, `api_code` |
| `session_end_failed` | use-session-lifecycle.ts | End recording failed | `total_chunks`, `failed_chunks`, `recording_duration_ms`, `network_online` |
| `chunk_upload_summary` | use-session-lifecycle.ts | Summary at end of recording | `total_chunks`, `successful_uploads`, `failed_uploads`, `recording_duration_ms` |
| `session_created` | use-session-lifecycle.ts | Session creation API succeeded | `duration_ms` |
| `high_memory_usage` | use-session-lifecycle.ts | Heap > 500MB at end of recording | `heap_used_mb`, `recording_duration_ms` |
| `long_session_ended` | use-session-lifecycle.ts | Recording > 30 minutes ended | `recording_duration_ms`, `heap_used_mb`, `total_chunks` |

### Errors (captureException)

| Domain | Component | Source | Extra context |
|---|---|---|---|
| `recording` | `voice_api` | use-session-lifecycle.ts | `network_online`, `total_chunks`, `recording_duration_ms` |
| `recording` | `upload_audio` | use-process-audio.ts | `network_online` |
| `recording` | `retry_upload` | use-error-handlers.ts | `total_chunks`, `network_online` |
| `recording` | `SDKProvider` | sdk-provider.ts | `network_online`, `session_id` |
| `processing` | `polling` | use-session-lifecycle.ts | `duration_ms`, `recording_duration_ms`, `total_chunks`, `network_online` |
| `processing` | `upload_transcript` | use-process-transcript.ts | `network_online` |
| `processing` | `agui_streaming` | use-stream-template-run.ts | `duration_ms` |
| `patient` | `add_patient` | patient-directory-component.tsx | |
| `patient` | `edit_patient` | patient-directory-component.tsx | |
| `patient` | `select_patient` | patient-directory-component.tsx | |
| `patient` | `remove_patient` | patient-directory-component.tsx | |
| `api` | *(varies)* | fetch-client/index.ts | `duration_ms`, `status_code`, `endpoint` |

### Breadcrumbs (trail only)

| Breadcrumb | Source | Properties |
|---|---|---|
| `patient_added` | patient-directory-component.tsx | |
| `patient_selected` | patient-directory-component.tsx | |
| `patient_removed` | patient-directory-component.tsx | |
| `chunk_upload_failed` | use-recording-callbacks.ts | `network_online`, `error_message` |
| `chunk_upload_retry` | use-recording-callbacks.ts | `attempt` |
| `mic_access_failed` | use-session-lifecycle.ts | `error_message` |
| `slow_api_call` | fetch-client/index.ts | `endpoint`, `method`, `duration_ms`, `service` (fires when API call >5s succeeds) |
| `network_status_change` | use-online-status.ts | `status` (`online`/`offline`) |
| `page_visibility_change` | use-recording-callbacks.ts | `hidden` (true/false, logged during active recording) |
| `memory_snapshot` | use-session-lifecycle.ts | `heap_used_mb`, `recording_duration_ms` (logged at every end_recording) |
| All non-milestone `tracker.log()` calls | SentryProvider.track() | |

---

## Electron Main Process — Searchable Events

### Milestones (captureMessage)

| Event | Source | When |
|---|---|---|
| `app_launched` | main.ts | App ready (`startup_duration_ms`) |
| `window_load_started` | main.ts | Window creation begins (tags: `isAuthenticated`, `loadTarget`) |
| `window_load_completed` | main.ts | Content URL loaded successfully (`loadTarget`, `url`, `duration_ms`) |
| `window_load_failed` | main.ts | `did-fail-load` fired (tags: `errorCode`, `errorDescription`, `url`) |
| `login_completed` | authManager.ts | User logs in |
| `native_helper_connected` | main.ts | NativeBridge connects |
| `native_helper_crashed` | nativeHelperManager.ts | Helper process errors |

### Errors (captureException)

| Domain | Component | Source | Critical |
|---|---|---|---|
| `auth` | `oidc` | authManager.ts | No |
| `auth` | `ekascribe_web_start` | authManager.ts | No |
| `infra` | `native_helper` | nativeHelperManager.ts | **Yes** |
| `crash` | `uncaught_exception` | main.ts | **Yes** |
| `crash` | `unhandled_rejection` | main.ts | **Yes** |

### Breadcrumbs (trail only)

| Category | Breadcrumb | Source |
|---|---|---|
| `overlay` | `overlay_recording`, `overlay_paused`, `overlay_processing`, `overlay_processed`, `overlay_error`, `overlay_discarded` | main.ts |
| `scribe` | statusUpdate, appointment_selected, output_viewed | main.ts |
| `navigation` | `ekascribe_web_server_started` | main.ts |
| `navigation` | `did_finish_load` | main.ts |
| `navigation` | `load_url_aborted` | main.ts |
| `navigation` | `app_deep_link` | main.ts |
| `native` | native_helper_connected | main.ts |
| `auth` | login_initiated, logout | authManager.ts |
| `auth` | token refresh messages | connectAuthRefresh.ts |
| `overlay` | overlay helper messages | nativeHelperManager.ts |
| `updater` | update check/download messages | updatesHandler.ts |
| `perf` | `event_loop_blocked` (`lag_ms`) | main.ts — fires when main process event loop blocked >2s |


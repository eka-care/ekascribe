# Desktop Migration Gaps

Comparison of PR #189 (`divyesh/electron_app`) and DeskDocEka preload against our current platform architecture branch.

PR #189 is unmerged but DeskDocEka loads ekascribe-web as a git submodule pointing to the `electron-app` branch, so all this code is live in the desktop app.

---

## 1. Bridge Contract Mismatches — ✅ Done

All contract signatures and electron adapters aligned to DeskDocEka's `preload.ts`. Bridge version bumped to v5.

| Bridge | Fix applied |
|---|---|
| `fileApi.openFile` | ✅ Contract + adapter aligned to `(type?: 'document' \| 'audio') => single \| null` |
| `clipboardApi.write` | ✅ Contract + adapter aligned to `{ htmlContent?, markdownContent }` |
| `storageApi` | Contract aligned to `saveAudio/fetchAudio/listFiles/deleteAll`; blob-store adapter remapped |
| `notificationApi.show` | Contract + adapter aligned to single-object `{ title, body, silent? }` — 🕥 TEST AFTER AUTO SEND RX MISSING FEATURE |
| `notificationApi.onClick` | Added to contract + adapter | 🕥
| `recordingApi` | Contract + adapter aligned to `startRecording()` — 🕥 TEST AFTER SECTION 3 IS COMPLETED |
| `systemApi.getDotnetRuntimeStatus` | Contract + adapter call `getDotnetRuntimeStatus()` — 🕥 TEST ON WINDOWS |
| `systemApi.onOpenUserDefaults` | ✅ Added to contract + adapter |
| `systemApi.onLogout` | ✅ Added to contract + adapter |

---

## 2. Missing Bridges (not in contract.d.ts at all) — ✅ Done

| Bridge | What DeskDocEka exposes | Status |
|---|---|---|
| `logApi.log(message)` | Debug logging to main process | ✅ Added to contract — actively used in `desktop-auth-bootstrap.tsx` |
| `deepLinkApi.onDeepLink(callback)` | URL deep link handling | Skipped — not consumed by ekascribe-web |
| `desktopSettingsApi.getAutoLaunchPref()` | Get auto-launch on startup setting | Skipped — not consumed by ekascribe-web |
| `desktopSettingsApi.setAutoLaunchPref(enabled)` | Set auto-launch on startup | Skipped — not consumed by ekascribe-web |
| `loginPipApi` | `onEnter`, `onExit`, `onState`, `cancelLogin` | Skipped — host-internal (consumed by Electron renderer, not ekascribe-web) |
| `ekascribeWebApi` | `start`, `stop`, `getUrl` | Skipped — host-internal (consumed by Electron renderer, not ekascribe-web) |

---

## 3. Missing Feature Code (from PR #189)

Feature-level code that exists on the electron branch, is actively used in the desktop app, but hasn't been ported. Most are renderless or edge-case UI.

### Tray Sync (renderless) — ✅ Done

Sends enriched appointment list to Electron tray widget. The bridge method (`hostBridge.sendAppointments`) exists in our contract but the component that calls it is not ported.

| File | What it does |
|---|---|
| `tray-appointment-sender.tsx` | Sends appointment list to tray via `scribeApi.sendAppointments`. Mounted in `layout.tsx`. |
| `use-tray-appointments.ts` | Builds enriched list (3 ongoing + 3 booked, with patient info) |

### Prescription Auto-Send Pipeline (renderless) — ✅ Done

Firestore listener detects completed visits -> fetches prescription PDF -> sends via WhatsApp -> updates Firestore state -> shows desktop notification. Gated on `whatsappConnected`. The settings UI for this (rate limit, toggle) is already ported in `desktop-widget-settings.tsx`.

| File | What it does | Status |
|---|---|---|
| `use-rx-auto-send.ts` | Firestore `onSnapshot` listener for today's completed appointments. Triggers auto-send. | ✅ Ported — mounted in `sidebar.tsx` inside `<Capability id="whatsapp-linked-device">` |
| `prescription-whatsapp/types.ts` | Types: `WhatsAppPrescriptionState`, `SendPrescriptionResult`, `AppointmentDoc` | ✅ Ported |
| `prescription-whatsapp/utils/send-prescription.ts` | Orchestrator: fetch appointment -> check status -> get patient mobile -> download PDF -> send via WhatsApp -> update state | ✅ Ported |
| `prescription-whatsapp/utils/fetch-prescription-pdf.ts` | Downloads prescription PDF from URL as `ArrayBuffer` | ✅ Ported |
| `prescription-whatsapp/utils/appointment-firestore.ts` | Read/update appointment Firestore docs (`prescription_whatsapp_status` field) | ✅ Ported |
| `prescription-whatsapp/dev/console-bindings.tsx` | Dev tool: exposes `window.__sendPrescription()` for testing. Mounted in `layout.tsx`. | ✅ Ported |
| `fetch-patients-by-oids.ts` | Bulk patient lookup (name, mobile, age, gender) — used by send-prescription | ✅ Ported |
| `rx-auto-send-listener.tsx` | Renderless wrapper for `useRxAutoSend()` hook | ✅ Ported |

### Offline Handling (edge-case UI) — ✅ Done

| File | What it does | Status |
|---|---|---|
| `offline-indicator.tsx` | Persistent Sonner toast "You're offline". Mounted in `layout.tsx`. | ✅ Ported |
| `offline-screen.tsx` | Full-screen block with retry + logout buttons | ✅ Ported |
| `use-online-status.ts` | Reactive `navigator.onLine` hook | ✅ Ported |

### Audio / Mic (no UI — runtime patches) — ✅ Done

| File | What it does | Status |
|---|---|---|
| `install-mixed-audio-capture.ts` | Patches `getUserMedia` to mix mic + system audio via AudioContext + `getDisplayMedia` | ✅ Ported — wired in `use-session-lifecycle.ts` |
| `open-mac-microphone-settings.ts` | Opens macOS mic privacy settings via platform system capability | ✅ Ported — wired in `use-microphone-permission.tsx` |

### Settings — ✅ Done

| File | What it does | Status |
|---|---|---|
| `download-desktop-app.tsx` | Web-only CTA card with OS-specific download links | ✅ Ported — shown in settings when `!capabilities.has('desktop-settings')` |

---

## 4. Layout Mounts

PR #189 mounts these in `layout.tsx`:

| Component | Status |
|---|---|
| `ElectronScribeIpcListener` | Absorbed into `platform/electron/host-bridge.ts` |
| `ElectronScribeWindowBridge` | Absorbed into `platform/electron/host-bridge.ts` |
| `TrayAppointmentSender` | ✅ Ported |
| `PrescriptionConsoleBindings` | ✅ Ported |
| `OfflineIndicator` | ✅ Ported |

---

## 5. Already Ported (no action needed)

| PR #189 item | How it's handled in our architecture |
|---|---|
| `electron-bridge.d.ts` | Replaced by `platform/bridge/contract.d.ts` |
| `electron-scribe-ipc-listener.tsx` | Absorbed into `platform/electron/host-bridge.ts` |
| `electron-scribe-window-bridge.tsx` | Absorbed into `platform/electron/host-bridge.ts` |
| `scribe-recording-controls.d.ts` | Absorbed into host bridge contract |
| `whatsapp-setup-dialog.tsx` | Ported — `features/integrations/components/whatsapp-setup-dialog.tsx`, uses `useWhatsApp()` |
| `whatsapp-send-dialog.tsx` | Ported — `features/session/components/dialogs/whatsapp-send-dialog.tsx`, uses `useWhatsApp()` |
| `desktop-widget-settings.tsx` | Ported — `features/settings/components/desktop-widget-settings.tsx`, uses `useDesktopSettings()` |
| Sidebar WhatsApp status buttons | Ported — in `sidebar.tsx`, gated on `<Capability id="whatsapp-linked-device">` |
| Sidebar update banner | Ported — in `sidebar.tsx`, uses `useAppUpdates()` |
| Sidebar WhatsApp promo banner | Ported — in `sidebar.tsx`, uses `SidebarPromoBanner` |
| `sidebar-promo-banner.tsx` | Ported |
| `network-error.ts` | Ported |
| `whatsapp-icon.tsx` | Ported — `features/integrations/components/whatsapp-icon.tsx` |
| `phone-input-field.tsx` | Ported — `shared-components/input/phone-input.tsx` |
| `buildDocumentPdfBuffer` | Ported — `features/session/services/document-service.ts` |
| `IWhatsApp` contract + electron adapter | Ported — `platform/contracts/whatsapp.ts` + `platform/electron/whatsapp.ts` |
| `IAppUpdates` contract + electron adapter | Ported — `platform/contracts/app-updates.ts` + `platform/electron/app-updates.ts` |
| `IDesktopSettings` contract + electron adapter | Ported — `platform/contracts/desktop-settings.ts` + `platform/electron/desktop-settings.ts` |
| `sendAppointments` bridge method | Present in `IHostBridge` contract + both adapters (but tray-appointment-sender component not ported) |
| `whatsapp-connect-strip.tsx` | Dead code in PR #189 — not imported anywhere. Skipped. |

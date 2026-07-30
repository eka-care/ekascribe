# Platform Capability Layer — Migration Tracker

Living plan for migrating EkaScribe-Web's platform-divergent behaviour under
`src/platform/`, capability by capability. Design: `.claude/docs/architecture/`.

**Workflow (per phase):** complete the phase's tasks → check each box → flip the phase
**Status** to `Done (YYYY-MM-DD)` → pick the next phase and set it `In progress`. Never
start a later phase before the current one is `Done`. Each capability follows the
"Definition of done" in the implementation guide.

**Legend:** Status = `Not started` | `In progress` | `Done (date)`.

---

## Phase 0 — Foundation (docs, skill, scaffold)

**Status:** Done (2026-06-22)
**Goal:** Documentation + enforcement + a compiling, unused `src/platform/` scaffold. No
capability migrated, no feature code touched.

- [x] Architecture doc — `.claude/docs/architecture/platform-capability-layer.md`
- [x] Implementation guide — `.claude/docs/architecture/implementation-guide.md`
- [x] Skill — `.claude/skills/platform-capability/SKILL.md`
- [x] This tracker
- [x] `src/platform/` scaffold: contracts (11 interfaces + `Platform` map + `CapabilityId`),
      `bridge/contract.d.ts` + `version.ts`, empty `web/` & `electron/` families,
      `registry.ts`, `provider.tsx`, `hooks.ts`, `index.ts`, `README.md`
- [x] Scaffold type-checks and `npm run build` unaffected (scaffold imported by nothing)

---

## Phase 1 — Foundation wiring + Key-Value Storage

**Status:** Done (2026-06-22)
**Goal:** Make families swap at build time, then migrate the first capability end-to-end
as the proven vertical slice (architecture doc §15.1).

> Storage was split into two scopes (`IStorage { local; session }`) to preserve the
> session-vs-persistent distinction the app relies on (Zustand store + most sites use
> `sessionStorage`; only the pro-strip flag uses `localStorage`). Electron impl is a
> graceful stub: renderer browser-storage fallback + feature-detect `window.storageApi`
> for the persistent scope.

- [x] **T1 — Build-time selection.** `NEXT_PUBLIC_APP_SOURCE` + `@platform-impl` alias in
      `next.config.ts` & `tsconfig.json`; `registry.ts` imports `@platform-impl`; both family
      `index.ts` export `implementations`.
- [x] **T2 — Contract + impls.** `contracts/storage.ts` adds `IStorage`; `web/storage.ts`
      (`KeyValueWebImpl` × local/session, SSR-guarded); `electron/storage.ts`
      (`KeyValueElectronImpl`, feature-detects `window.storageApi`). Registered in both indexes.
- [x] **T3 — Consumption.** `useStorage()` hook + non-React `getStorage()` accessor;
      `persistent-kv` descriptor wired in registry.
- [x] **T4 — Migrate call sites:**
  - [x] `src/store/store.ts` — `createJSONStorage` → `sessionStateStorage` adapter (session)
  - [x] `src/provider/protected-route-provider.tsx` (session)
  - [x] `src/shared-components/banner/pro-access-strip.tsx` (local)
  - [x] `src/shared-hooks/use-sidebar-drag.ts` (session)
  - [x] `src/shared-components/screen-container.tsx` (session)
  - [x] `src/features/settings/hooks/use-settings.tsx` (session)
  - [x] `src/features/sidebar/components/sidebar.tsx` (session)
  - [x] `src/utils/user-auth-logout-utility-methods.ts` (logout clears both)
- [x] **T5 — Validate.** `tsc --noEmit` clean in migrated areas; `npm run build` exit 0;
      web bundle has **0** references to the electron storage impl (tree-shaken). No direct
      `localStorage`/`sessionStorage` outside `src/platform/`.

---

## Phase 2 — Pure-browser capabilities (low desktop coupling)

**Status:** Done (2026-06-23)
**Goal:** Migrate the self-contained, mostly-browser capabilities.

> Exploration refined the original assumptions: **notifications has zero OS-Notification
> call sites** (only Sonner in-app toasts, which are UI) — per decision it was **scaffolded
> for desktop-readiness** with no consumer to route. The exported `printHtml` in
> `copy-output-utils.ts` turned out to head an **entire dead duplicate** of
> `document-service.ts` (only `copyMarkdownToClipboard` was live), so that file was reduced
> to the clipboard wrapper. The bridge contract already declared every needed `*Api` member
> in Phase 0, so **no additive change / version bump** was required.

- [x] **Clipboard (6).** `IClipboard` → `web/clipboard.ts` (`navigator.clipboard` +
      `ClipboardItem`), `electron/clipboard.ts` (feature-detects `window.clipboardApi.write`,
      browser fallback). Routed `copyMarkdownToClipboard` (`copy-output-utils.ts`) through
      `getPlatform().clipboard`; deleted `src/utils/copy-text-to-clipboard-method.ts`.
      Descriptor `rich-clipboard`. `useClipboard()` added.
- [x] **System / shell (9).** `ISystem.openExternal` → `web/system.ts` (`window.open`),
      `electron/system.ts` (feature-detects `window.systemApi.openExternal`). Routed the **7**
      external `window.open('_blank')` sites (sidebar ×3, pricing-page ×2,
      use-session-lifecycle, pro-access-strip). Internal navigation / logout redirects left
      as-is. Descriptor `shell-open`. `useSystem()` added.
- [x] **Notifications (8).** `INotifier` → `web/notifier.ts` (Web Notification API,
      permission-gated, degrades to no-op), `electron/notifier.ts` (feature-detects
      `window.notificationApi.show`). **Scaffolded, no consumer** (decision). Descriptor
      `os-notifications`. `useNotifier()` added.
- [x] **Printer / PDF (7).** `IPrinter` → `web/printer.ts` (Blob → hidden iframe →
      `window.print()`), `electron/printer.ts` (feature-detects `window.printApi.*`, iframe
      fallback). `document-service.ts` `printHtml` now builds the HTML then calls
      `getPlatform().printer?.printHtml(html)`; the dead duplicate in `copy-output-utils.ts`
      was removed. **`htmlToPdf` made optional** (electron-only; web omits it). Descriptor
      `native-pdf-export`. `usePrinter()` added.
- [x] Validate: `tsc --noEmit` clean in touched areas (only the pre-existing
      `src/lib/firebase.ts` unused-import error remains — a local dev edit, not Phase 2);
      `next build` **compiles successfully**; web bundle has **0** electron `*Api` refs
      (family tree-shaken); no `navigator.clipboard` / `window.print(` / external
      `window.open` left outside `src/platform/`.

> **Known wrinkle (deferred to Phase 4 UI-gating cleanup):** descriptors derive from
> capability **key** presence, so registering `printer` on web also activates
> `native-pdf-export` even though web only prints (no native PDF). Inert today — no UI gates
> on it. When a native-PDF-only UI appears, split universal printing from native export
> (per-method detection or a separate descriptor).

---

## Phase 3 — Large data + native file I/O

**Status:** Done (2026-06-23)
**Goal:** The storage-heavy, desktop-exploiting capabilities.

- [x] **Blob store (2).** `web/blob-store.ts` wraps existing IDB util functions behind
      `IBlobStore` (DB handle managed internally). `electron/blob-store.ts` feature-detects
      `window.blobApi.*`, falls back to web. Registered in both families. `getBlobStore()` +
      `useBlobStore()` added. Migrated consumers:
  - [x] `use-recording-callbacks.ts` — `openIndexedDB` + `saveChunkToIndexedDB` → `getBlobStore().put()`
  - [x] `download-audio-button.tsx` — `checkAudioChunksExist` + `getChunksFromIndexedDB` → `.has()` + `.get()`
  - [x] `use-queue-recording.ts` — `openIndexedDB` + `deleteChunksFromIDB` → `.delete()`
  - [x] `user-auth-logout-utility-methods.ts` — kept raw `indexedDB.deleteDatabase()` (full DB nuke)
- [x] **File picker (3).** `web/file-picker.ts` (dynamic `<input type="file">`),
      `electron/file-picker.ts` (feature-detects `window.fileApi.openFile()`, falls back to
      web). Registered in both families. `useFilePicker()` added. Migrated
      `add-attachments-dialog.tsx` — removed `fileInputRef`, hidden input, `handleInputChange`;
      replaced with `filePicker.pickFiles()`. Drag-drop unchanged.
- [x] Validate: `tsc --noEmit` clean; no direct IDB imports outside `src/platform/`; no
      `<input type="file">` or `window.fileApi` outside `src/platform/`.

---

## Phase 4 — Audio, host control & fold-in

**Status:** Done (2026-06-23)
**Goal:** The most platform-coupled capabilities, plus bringing the existing seams under
the layer and cleaning up UI gating. **Completes the layer** (all capabilities now registered;
only Phase 3 remains).

> Scope per decisions: audio migrates the **app-owned** surfaces only (the core recording
> `getUserMedia` is SDK-internal); host bridge is **scaffold + lifecycle integration** with a
> web console-logging no-op and a real electron `scribeApi`/`postMessage` adapter; network +
> auth are **light wrappers** delegating to the existing `src/transport/` + fetch-client (no
> rewrite). The pre-mapped descriptors needed no `capabilities.ts` change.

- [x] **Audio capture (4).** `IAudioCapture` (extended with `enumerateInputs`,
      `onDevicesChanged`, `onPermissionChange`, `'unsupported'`). `web/audio-capture.ts`
      (`getUserMedia`/`enumerateDevices`/permissions) + `electron/audio-capture.ts` (extends web,
      feature-detects `recordingApi` system audio). Migrated 6 consumers: session +
      onboarding permission hooks, visualizer (AudioContext math stays), both mic selectors, and
      `use-audio-input-devices.ts`. `useAudioCapture()`. Descriptors `mic-permission-prompt`,
      `system-audio-capture`.
- [x] **Host command bridge (11).** `web/host-bridge.ts` (no-op + console-logged status),
      `electron/host-bridge.ts` (feature-detects `window.scribeApi`, falls back to `postMessage`,
      mirrors status to `window.parent`). `useHostBridge()`. Lifecycle wired in
      `use-host-recording-bridge.ts` (mounted in `screen-container.tsx`): host `onStart/onStop`
      drive `startRecording/endRecording`, `reportStatus` on phase changes. Descriptor
      `host-recording-control`.
- [x] **Fold network (5) + auth (10).** `web|electron/network.ts` delegate to `getTransport()`;
      `web|electron/auth-tokens.ts` implement `IAuthTokens` (web cookie refresh via lazy
      `@/fetch-client` import to avoid a load cycle; electron feature-detects `window.authApi`,
      else transport tokens). Registered in both families; `useAuthTokens()` +
      `getNetwork()`/`getAuthTokens()`. Transport/fetch-client left intact. Descriptors
      `ipc-network`, `host-managed-auth`.
- [x] **UI-gating cleanup.** No `isElectronApp` / `window.*Api` / raw `getUserMedia` /
      `enumerateDevices` / `permissions.query` outside `src/platform/` (only the intentional
      AudioContext analysis in the visualizer remains).
- [x] Validate: `tsc --noEmit` clean (only the pre-existing `firebase.ts` error); `next build`
      compiles; web bundle has **0** `recordingApi`/`scribeApi`/`authApi` refs (electron tree-shaken).

> **Descriptor wrinkles (documented, deferred):** registering on web also lights
> `system-audio-capture`, `ipc-network`, `host-managed-auth`, and (web no-op) `host-recording-control`
> even though web can't do those — all inert (no UI gates them), same pattern as `native-pdf-export`.

---

## Phase 5 — Platform-visibility primitives (`<DesktopOnly>` / `<WebOnly>` / `<Capability>`)

**Status:** Done (2026-06-23)
**Goal:** Tag-based UI gating — declarative show/hide by platform and branch by capability.
**Independent of Phases 3 & 4** (no blob/audio dependency); pulled forward per requirement.

> Reference repo DeskDocEka has no such components (single-platform Electron, direct
> `window.*Api`), so these are net-new on the existing capability layer. Host identity is
> **build-time only**: each family declares its own `host` and `@platform-impl` bundles one
> family per build, so `getHost()` is a constant (SSR-safe). Render-only (children still
> bundled, just not shown). `<DesktopOnly>`/`<WebOnly>` are the AP-4 sanctioned host-identity
> exception for *pure show/hide*; `<Capability>` stays preferred for behaviour.

- [x] **T1 — Host identity.** `contracts/host.ts` (`HostId = 'web' | 'desktop'`); `web/index.ts`
      + `electron/index.ts` `export const host`; `registry.ts` `getHost()`; `provider.tsx`
      `host` on context; `hooks.ts` `useHost()`.
- [x] **T2 — Components** (`src/platform/components/`, one per file, `'use client'`, optional
      `fallback`): `desktop-only.tsx`, `web-only.tsx`, `capability.tsx`. Exported from
      `src/platform/index.ts` (+ `useHost`, `getHost`, `HostId`).
- [x] **T3 — Docs.** Architecture §11 rewritten (rule-of-thumb table, §11.1–11.3, AP-4
      reconciliation); implementation-guide §3.5 + Playbook B (`export const host`); SKILL rule 5
      + trigger updated.
- [x] **T4 — Tracker** (this entry).
- [x] **T5 — Validate.** `tsc --noEmit` clean in `src/platform/` + `src/app/`; web build
      compiles; electron family resolves `host==='desktop'`; tree-shaking unaffected.

---

## Phase 6 — WhatsApp capability + desktop-only UI

**Status:** Done (2026-06-23)
**Goal:** Port the desktop fork's WhatsApp "send via linked device" UI into the app, wired as a
platform capability with no web impl. First real `<Capability>` consumer; **first additive bridge
change** (v1 → v2).

> Ported from `DeskDocEka/external/ekascribe-web` (a fork of this app). Scope: interactive UI only
> (no auto-send / Firestore pipeline). Gated on the `whatsapp-linked-device` descriptor via
> `<Capability>` (precise: hides on web AND on desktop without the bridge). PDF reuses the printer
> capability's electron `htmlToPdf`. Added `qrcode.react`; reused existing `PhoneInputField` +
> `libphonenumber-js`; Mixpanel tracking dropped (target enums lack the WhatsApp ids).

- [x] **Capability.** `contracts/whatsapp.ts` (`IWhatsApp` + status/payload types); `whatsapp` key in
      the `Platform` map; `electron/whatsapp.ts` (feature-detecting pass-through) registered
      **conditionally** on `window.whatsappApi`; **no web impl**. Descriptor `whatsapp-linked-device`;
      `useWhatsApp()` hook. Bridge `contract.d.ts` gains optional `whatsappApi`; `BRIDGE_CONTRACT_VERSION`
      bumped to **2**.
- [x] **PDF buffer.** `buildDocumentPdfBuffer()` in `document-service.ts` → `printer.htmlToPdf` →
      `ArrayBuffer` (returns `null` where unavailable).
- [x] **UI ported.** `whatsapp-icon.tsx`, `whatsapp-setup-dialog.tsx` (QR connect),
      `whatsapp-send-dialog.tsx` (send) + `whatsapp-integration-card.tsx`; all consume `useWhatsApp()`.
- [x] **Surfaces (gated on `whatsapp-linked-device`):** integrations card + setup dialog; sidebar
      "WhatsApp" entry; session document-footer "WhatsApp" button + send dialog
      (`tab-footer-config.tsx` gains optional `onSendWhatsApp`).
- [x] **Validate.** `tsc --noEmit` clean (only the pre-existing `firebase.ts` error remains); build
      compiles; no `whatsapp` impl or `window.whatsappApi` in the web bundle; UI hidden on web.

---

## Notes / decisions log

- 2026-06-22 — Injection model: **build-time** per design doc (`NEXT_PUBLIC_APP_SOURCE` +
  `@platform-impl`). Electron adapters built as feature-detecting **stubs** until DeskDocEka
  exposes `window.*Api`. Docs/skill/tracker in `.claude/`; code in `src/platform/`.
- Network (capability 5) already done via `src/transport/` — the reference seam; formally
  folded in Phase 4.
- 2026-06-23 — Phase 2 done (clipboard, system/shell, printer, notifications). Notifications
  **scaffolded without a consumer** (no OS-Notification call sites exist; decision: build for
  desktop-readiness). `copy-output-utils.ts` was an entire dead duplicate of
  `document-service.ts` except `copyMarkdownToClipboard` — reduced to the clipboard wrapper.
  `IPrinter.htmlToPdf` made **optional** (electron-only). Bridge contract already complete
  from Phase 0 → no version bump. `native-pdf-export` descriptor over-activates on web
  (inert); precise gating deferred to Phase 4.
- 2026-06-23 — Phase 5 done (platform-visibility primitives). Host identity is **build-time
  only** (`NEXT_PUBLIC_APP_SOURCE` → per-family `host`). **Cross-repo dependency:** DeskDocEka
  must build/serve the embedded web app with `NEXT_PUBLIC_APP_SOURCE=electron-*`, else host
  resolves to `web` and `<DesktopOnly>` never shows on desktop. `<DesktopOnly>`/`<WebOnly>` are
  the AP-4 sanctioned host-identity exception (pure show/hide); `<Capability>` for behaviour.
- 2026-06-23 — Phase 6 done (WhatsApp capability + desktop-only UI), ported from the desktop fork.
  First additive bridge change (`whatsappApi`, version → 2) and first real `<Capability>` consumer.
  No web impl by design; capability registered on electron only when `window.whatsappApi` exists.
  **Cross-repo dependency:** DeskDocEka must expose `window.whatsappApi`; until then the descriptor
  is inactive and all WhatsApp UI hides (no crash). PDF reuses `printer.htmlToPdf`.
- 2026-06-23 — Phase 4 done (audio, host control, network/auth fold-in). **Layer complete except
  Phase 3.** Audio migrates only app-owned surfaces (core recording is SDK-internal). Host bridge:
  web no-op logs to console, electron uses real `scribeApi`/`postMessage`; wired into the recording
  lifecycle via `use-host-recording-bridge`. Network/auth are **light wrappers** over the existing
  `src/transport/` + fetch-client (intentionally not rewritten); web auth-tokens lazy-imports
  `@/fetch-client` to avoid a module-load cycle. Descriptor over-activation wrinkles documented.

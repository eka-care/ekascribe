# EkaScribe Desktop — Developer Guide

A codebase orientation for engineers who have the app running and want to understand how it's structured.

---

## What EkaScribe Does

EkaScribe is an AI-powered medical scribing desktop app by Eka Care. It listens to doctor-patient consultations and generates structured clinical notes. The desktop shell is Electron; the main UI is a Next.js web app embedded at runtime.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 40 + electron-forge 7 + electron-builder |
| Main process | TypeScript 5, Node.js |
| Renderer | React 19, TypeScript, Vite 5 |
| Embedded web app | Next.js (git submodule at `external/ekascribe-web`) |
| macOS native helper | Swift 5 / SwiftUI / AppKit |
| Windows native helper | C# .NET 10 / WPF / XAML |
| Persistent storage | electron-store 11 |
| Error tracking | Sentry (`@sentry/electron`) |
| Global hotkeys | uiohook-napi |
| Push notifications | @eneris/push-receiver |
| WhatsApp | @whiskeysockets/baileys |

---

## Repository Layout

```
ekascribe-desktop/
├── src/
│   ├── main/                        # Electron main process
│   │   ├── main.ts                  # Entry point — window creation, manager registration
│   │   ├── managers/                # One file per feature domain
│   │   │   ├── authManager.ts
│   │   │   ├── recordingManager.ts
│   │   │   ├── nativeHelperManager.ts
│   │   │   ├── ekascribeWebManager.ts
│   │   │   ├── whatsappManager.ts
│   │   │   ├── storageManager.ts
│   │   │   ├── pushManager.ts
│   │   │   ├── notificationManager.ts
│   │   │   ├── proxyManager.ts
│   │   │   ├── networkManager.ts
│   │   │   ├── pdfManager.ts
│   │   │   └── sentryManager.ts
│   │   ├── nativeCommunication/
│   │   │   └── NativeBridge.ts      # Socket server — talks to native helpers
│   │   ├── focusTracker.ts
│   │   ├── permissionsHandler.ts
│   │   └── updatesHandler.ts
│   ├── preload/
│   │   └── preload.ts               # contextBridge — safe IPC surface for renderer
│   └── renderer/
│       ├── main.tsx
│       └── src/
│           ├── screens/             # auth/, home/
│           ├── hooks/
│           └── services/
├── mac/
│   └── EkaCareDesktopHelper/        # macOS native helper (Swift/SwiftUI)
│       └── EkaCareDesktopHelper/
│           ├── Overlay/             # OverlayWindowController + 5 overlay views
│           └── Services/            # NativeBridgeClient, state stores, monitors
├── windows/
│   └── EkaDeskDocHelper/            # Windows native helper (C#/WPF)
│       └── EkaDeskDocHelper/
│           ├── *OverlayWindow.xaml(.cs)
│           ├── Services/            # ElectronBridgeClient, monitors, stores
│           └── ViewModels/          # MVVM view models for each overlay
├── external/
│   └── ekascribe-web/               # Git submodule — embedded Next.js app
├── build/
│   └── icons/                       # .icns, .ico, tray icons
├── scripts/
│   ├── prepare-ekascribe-runtime.cjs
│   └── windows/                     # Code-signing scripts
├── forge.config.ts
├── electron.env                     # Runtime environment variables (not committed)
└── package.json
```

---

## Architecture

### Process Model

```
┌──────────────────────────────────────────────┐
│  Electron Main Process  (src/main/main.ts)   │
│  • Window management                         │
│  • IPC handlers (ipcMain)                    │
│  • Feature managers (auth, recording, etc.)  │
│  • Spawns / talks to native helpers          │
│  • Serves ekascribe-web (Next.js standalone) │
└──────────┬──────────────────────┬────────────┘
           │ contextBridge IPC    │ local socket IPC
           ▼                      ▼
   ┌───────────────┐    ┌──────────────────────┐
   │   Renderer    │    │   Native Helper       │
   │  (React app)  │    │  macOS: Swift         │
   │  via preload  │    │  Windows: C#          │
   └───────────────┘    └──────────────────────┘
```

The embedded Next.js app (`ekascribe-web`) runs as a standalone Node.js server inside the main process. In dev mode it starts a Next.js dev server; in production the pre-built standalone output is bundled into app resources.

### IPC Layers

| Layer | Mechanism | Files |
|---|---|---|
| Renderer ↔ Main | `contextBridge` / `ipcRenderer` / `ipcMain` | `preload.ts`, each manager |
| Main ↔ Native helper | Local Unix/TCP socket, JSON messages | `NativeBridge.ts`, `NativeBridgeClient.swift`, `ElectronBridgeClient.cs` |

---

## Manager Pattern

Every feature domain has its own file in `src/main/managers/`. Each manager:

- Owns all `ipcMain.handle` / `ipcMain.on` handlers for its domain
- Is registered once in `main.ts` (a single `registerXxxManager()` call)
- Does not import other managers directly — communicate via events or IPC

**Never add inline feature logic to `main.ts`.** Create a new manager file instead.

| Manager | Domain |
|---|---|
| `authManager` | OIDC login, token storage, refresh |
| `recordingManager` | Audio capture, session lifecycle |
| `nativeHelperManager` | Native helper process launch and lifecycle |
| `ekascribeWebManager` | Next.js server start, BrowserView loading |
| `networkManager` | All HTTP requests from renderer (auto-injects auth token) |
| `whatsappManager` | WhatsApp Web API via Baileys |
| `storageManager` | Unified access to electron-store |
| `pushManager` | FCM push notifications via @eneris/push-receiver |
| `notificationManager` | OS-level notification dispatch |
| `proxyManager` | System proxy configuration |
| `pdfManager` | PDF generation and serving |
| `sentryManager` | Sentry initialization, `captureMainEvent`, `captureMainException` |

---

## Native Bridge IPC

`NativeBridge.ts` runs a local socket server. The native helpers connect as clients.

**Rule: When adding or changing any IPC message, update all three files together:**

1. `src/main/nativeCommunication/NativeBridge.ts` — handler/sender
2. `mac/EkaCareDesktopHelper/EkaCareDesktopHelper/Services/NativeBridgeClient.swift` — sender/receiver
3. `windows/EkaDeskDocHelper/EkaDeskDocHelper/Services/ElectronBridgeClient.cs` — sender/receiver

All messages are JSON. IPC message names and payload shapes must match exactly across all three files.

---

## Overlay State Machine

The native helpers display a floating overlay that follows 5 states. Both platforms implement the same state machine.

| State | macOS View | Windows Window |
|---|---|---|
| Recording | `RecordingOverlayView.swift` | `RecordingOverlayWindow.xaml` |
| Processing | `ProcessingOverlayView.swift` | `ProcessingOverlayWindow.xaml` |
| Processed | `ProcessedOverlayView.swift` | `ProcessedOverlayWindow.xaml` |
| Prompt | `PromptOverlayView.swift` | `PromptOverlayViewModel.cs` |
| Error | `ErrorOverlayView.swift` | `ErrorOverlayWindow.xaml` |

**State is owned by `OverlayStateStore` on both platforms.** Views observe it; they never hold their own state. When changing the state machine, update all 5 states on both platforms.

---

## ekascribe-web Submodule

`external/ekascribe-web` is a git submodule pinned to the `electron-app` branch of [`eka-care/ekascribe-web`](https://github.com/eka-care/ekascribe-web).

- In development: `ekascribeWebManager` starts the Next.js dev server in-process
- In production: `scripts/prepare-ekascribe-runtime.cjs` copies the Next.js standalone build into `external/ekascribe-web/runtime/`, which is bundled into the packaged app

When you need to change the web UI, work in the submodule and commit there first. The desktop repo tracks a specific submodule commit — update the pointer with `git submodule update --remote external/ekascribe-web` after the web-side commit is merged.

---

## Key Coding Rules

### TypeScript / Electron

- `contextBridge.exposeInMainWorld` exposes only typed, narrow APIs — never the raw `ipcRenderer`
- `ipcMain.handle` handlers validate their inputs before acting
- Remove all event listeners on window `close`/`destroyed` to avoid memory leaks
- `electron-store` access only through `storageManager` — no direct store imports elsewhere
- Use `sentryManager.captureMainException` for error reporting — do not `console.error` silently in production paths
- All async main-process code must have error handling

### Swift / macOS

- All UI updates on `@MainActor` or `DispatchQueue.main`
- Use `[weak self]` in all closures that outlive their call site
- Overlay state is owned by `OverlayStateStore` — views observe it, never duplicate it
- Entitlements in `*.entitlements` must be as narrow as possible

### C# / Windows

- ViewModels implement `INotifyPropertyChanged`
- No logic in XAML code-behind that belongs in a ViewModel
- UI updates via `Application.Current.Dispatcher.Invoke` when called from a background thread
- Services with resources implement `IDisposable` and are disposed on app shutdown
- Avoid `async void` except in event handlers

---

## Adding a New Feature

1. **Create a new manager** at `src/main/managers/yourFeatureManager.ts`
2. **Register it** in `src/main/main.ts` with a single `registerYourFeatureManager()` call
3. **Expose IPC** in `src/preload/preload.ts` via `contextBridge` — narrow, typed surface only
4. **If the feature needs native UI**, add it to both `NativeBridgeClient.swift` and `ElectronBridgeClient.cs` and handle in `NativeBridge.ts`
5. **If the feature touches the overlay**, implement all 5 states on both platforms

---

## Environment Variables

Runtime config lives in `electron.env` at the project root (not committed to git).

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_ENV` | Environment name (`PROD` / `DEV`) |
| `NEXT_PUBLIC_MIX_PANEL_KEY` | Mixpanel analytics token |
| `NEXT_PUBLIC_CRISP_WEBSITE_ID` | Crisp customer chat widget ID |
| `NEW_RELIC_LICENSE_KEY` | New Relic log forwarding key |
| `scribe` | JSON blob — full Firebase config for ekascribe-web |
| `SENTRY_DSN` | (optional) Override Sentry DSN; defaults to the hardcoded value in `sentryManager.ts` |

See [electron.env.sample](electron.env.sample) for the expected format.

---

## Deep Links

The app registers the `ekadoc://` URI scheme. Deep links are queued and dispatched after the renderer is ready.

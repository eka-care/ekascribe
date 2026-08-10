# EkaScribe Desktop — Codebase Guide

## Project Overview

**EkaScribe Desktop** is an AI-powered medical scribing desktop application by Eka Care. It listens to doctor-patient consultations and generates structured clinical notes. Distributed as a native desktop app for macOS and Windows.

- **App ID:** `care.eka.ekascribe`
- **Version:** 0.7.0
- **Deep link scheme:** `ekadoc://`
- **Update server:** `https://updates.eka.care/ekascribe/latest/`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 40 + electron-forge 7 + electron-builder |
| Main process | TypeScript 5, Node.js |
| Renderer | React 19, TypeScript, Vite 5 |
| Embedded web app | Next.js (git submodule at `external/ekascribe-web`) |
| macOS native helper | Swift 5, SwiftUI, AppKit |
| Windows native helper | C# .NET 10, WPF, XAML |
| State (Electron) | electron-store 11 |
| Error tracking | Sentry (`@sentry/electron`) |
| Global hotkeys | uiohook-napi |
| Push notifications | @eneris/push-receiver |
| WhatsApp | @whiskeysockets/baileys |

---

## Repository Structure

```
DeskDocEka/
├── src/
│   ├── main/                   # Electron main process
│   │   ├── main.ts             # Entry point — window creation, IPC registration
│   │   ├── managers/           # Feature managers (one per domain)
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
│   │   │   └── NativeBridge.ts # Socket-based IPC bridge to native helpers
│   │   ├── focusTracker.ts
│   │   ├── permissionsHandler.ts
│   │   └── updatesHandler.ts
│   ├── preload/
│   │   └── preload.ts          # contextBridge — exposes safe IPC to renderer
│   └── renderer/
│       ├── main.tsx
│       └── src/
│           ├── screens/        # auth/, home/
│           ├── hooks/
│           └── services/
├── mac/
│   └── EkaCareDesktopHelper/   # macOS native helper (Swift/SwiftUI)
│       └── EkaCareDesktopHelper/
│           ├── Overlay/        # OverlayWindowController + 5 overlay views
│           └── Services/       # NativeBridgeClient, state stores, monitors
├── windows/
│   └── EkaDeskDocHelper/       # Windows native helper (C#/WPF)
│       └── EkaDeskDocHelper/
│           ├── *OverlayWindow.xaml(.cs)  # 5 overlay windows
│           ├── Services/       # ElectronBridgeClient, monitors, stores
│           └── ViewModels/     # MVVM view models for each overlay
├── external/
│   └── ekascribe-web/          # Git submodule — Next.js embedded web app
├── build/
│   └── icons/                  # App icons (.icns, .ico, tray/)
├── scripts/
│   ├── prepare-ekascribe-runtime.cjs
│   └── windows/                # Code-signing scripts (Azure, local)
├── forge.config.ts
├── vite.main.config.ts
├── vite.preload.config.ts
└── vite.renderer.config.ts
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
│  • Spawns / communicates with native helpers │
│  • Embeds Next.js via ekascribeWebManager    │
└──────────┬───────────────────────┬───────────┘
           │ contextBridge IPC     │ socket IPC
           ▼                       ▼
   ┌───────────────┐     ┌──────────────────────┐
   │   Renderer    │     │   Native Helper       │
   │  (React app)  │     │  macOS: Swift helper  │
   │  via preload  │     │  Windows: C# helper   │
   └───────────────┘     └──────────────────────┘
```

### Manager Pattern

Every feature domain has its own manager in `src/main/managers/`. Managers:
- Own all IPC handlers for their domain
- Are registered once in `main.ts`
- Do not import each other directly (communicate via events or IPC)

When adding a feature, create a new manager file — do not add it to `main.ts` directly.

### Native Bridge IPC

`NativeBridge.ts` runs a local socket server. Native helpers connect as clients:
- **macOS:** `Services/NativeBridgeClient.swift`
- **Windows:** `Services/ElectronBridgeClient.cs`

All messages are JSON. When adding a new IPC message, update all three files together:
1. `src/main/nativeCommunication/NativeBridge.ts` — handler
2. `mac/.../Services/NativeBridgeClient.swift` — sender/receiver
3. `windows/.../Services/ElectronBridgeClient.cs` — sender/receiver

### Overlay State Machine

Both native helpers implement the same 5-state overlay UI:

| State | macOS View | Windows Window |
|---|---|---|
| Recording | `RecordingOverlayView.swift` | `RecordingOverlayWindow.xaml` |
| Processing | `ProcessingOverlayView.swift` | `ProcessingOverlayWindow.xaml` |
| Processed | `ProcessedOverlayView.swift` | `ProcessedOverlayWindow.xaml` |
| Prompt | `PromptOverlayView.swift` | (PromptOverlayViewModel.cs) |
| Error | `ErrorOverlayView.swift` | `ErrorOverlayWindow.xaml` |

State is driven by `OverlayStateStore` (both platforms). Never drive overlay state from local ad-hoc variables.

---

## Build Commands

```bash
# Development
npm start                        # Dev mode (auto-builds mac helper on macOS)

# Native helpers
npm run build:mac-helper         # Build macOS Swift helper (Release)
npm run build:mac-helper:clean   # Clean + build macOS helper
npm run build:win-helper         # Build Windows C# helper (Release)
npm run build:win-helper:x64     # Publish Windows x64 self-contained
npm run build:win-helper:arm64   # Publish Windows arm64 self-contained
npm run build:win-helper:all     # Publish both architectures

# Web app (submodule)
npm run build:ekascribe-web      # Build Next.js app
npm run prepare:ekascribe-runtime # Bundle Next.js standalone output

# Distribution
npm run dist:mac                 # macOS dmg + zip (requires signing)
npm run dist:win                 # Windows NSIS installer
npm run make:mac                 # Local unsigned macOS build
npm run make:win                 # Local dev-cert Windows build

# Type checking
npx tsc --noEmit
npm run lint:tslint
```

---

## Coding Guidelines

### General

- One manager per domain — never grow `main.ts` with inline feature logic.
- No Node.js APIs in renderer code. All system access goes through preload → IPC.
- `electron-store` access only through `storageManager` — no direct store imports elsewhere.
- All async main-process code must have error handling. Unhandled rejections are reported via Sentry.

### TypeScript / Electron

- `contextBridge.exposeInMainWorld` exposes only typed, narrow APIs — never the raw `ipcRenderer`.
- `ipcMain.handle` handlers validate their inputs before acting.
- Remove all event listeners on window `close`/`destroyed` to avoid memory leaks.
- Use `sentryManager` for error reporting — do not `console.error` silently in production paths.

### Swift / macOS

- All UI updates on `@MainActor` or `DispatchQueue.main`.
- Use `[weak self]` in all closures that outlive their call site.
- Overlay state is owned by `OverlayStateStore` — views observe it, never duplicate it.
- Entitlements in `*.entitlements` must be as narrow as possible.

### C# / Windows

- ViewModels implement `INotifyPropertyChanged` (or inherit a base class that does).
- No logic in XAML code-behind that belongs in a ViewModel.
- UI updates via `Application.Current.Dispatcher.Invoke` when called from a background thread.
- Services with resources implement `IDisposable` and are disposed on app shutdown.
- Avoid `async void` except in event handlers.

### Cross-platform

- When changing the overlay state machine, update all 5 states on both platforms.
- IPC message names and payload shapes must match exactly across `NativeBridge.ts`, `NativeBridgeClient.swift`, and `ElectronBridgeClient.cs`.
- Preference store keys (layout, shortcuts, disabled apps, notifications) must be the same string literals across platforms.

---

## Development Notes

### Git Submodule

`external/ekascribe-web` is a submodule (branch: `electron-app`). After cloning:
```bash
git submodule update --init --recursive
```

### Code Signing (macOS)

- Production builds require a valid Apple Developer certificate.
- For local unsigned builds: `npm run make:mac` (uses `CSC_IDENTITY_AUTO_DISCOVERY=false`).
- Entitlement files: `build/entitlements.mac.plist`, `build/entitlements.mac.inherit.plist`.

### Code Signing (Windows)

- CI uses Azure Trusted Signing via `scripts/windows/azure-sign.cjs`.
- Local dev signing: `npm run make:win` auto-creates a self-signed cert at `certs/dev-code-signing.pfx`.

### Sentry

Initialized in `src/main/managers/sentryManager.ts`. DSN and environment come from `electron.env`. Do not hardcode DSN values.

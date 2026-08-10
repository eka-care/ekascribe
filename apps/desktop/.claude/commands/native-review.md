You are performing a thorough code review of the EkaScribe Desktop codebase. This app has three distinct codebases that each require different review criteria:

1. **Electron / TypeScript** — `src/main/`, `src/preload/`, `src/renderer/`
2. **macOS native helper** — `mac/EkaCareDesktopHelper/` (Swift / SwiftUI)
3. **Windows native helper** — `windows/EkaDeskDocHelper/` (C# / WPF / .NET 10)

## Step 1 — Determine scope

First run `git diff main...HEAD --name-only` to see which files changed on this branch. If the user passed arguments (e.g. a file path or PR number), scope the review to those files instead.

Group changed files into buckets:
- **Swift** — any `.swift` file under `mac/`
- **C#** — any `.cs` or `.xaml` file under `windows/`
- **Electron/TS** — any `.ts` or `.tsx` file under `src/`
- **Cross-platform IPC** — if `NativeBridge.ts`, `NativeBridgeClient.swift`, or `ElectronBridgeClient.cs` changed

Review each bucket that has changes. Skip buckets with no changes.

---

## Swift / macOS Review Criteria

Read each changed Swift file in full before commenting.

**SwiftUI state ownership**
- `@StateObject` is used only where this view *owns* the object's lifecycle (created here, lives as long as this view).
- `@ObservedObject` is used when the object is passed in or owned elsewhere.
- `@EnvironmentObject` is used only for truly app-wide singletons.
- Overlay state must be sourced from `OverlayStateStore` — not local `@State` variables that duplicate it.

**Memory management (ARC)**
- All closures that escape (`Task {}`, `DispatchQueue.async`, completion handlers, notification observers) capture `self` weakly: `[weak self]`.
- `guard let self` or `self?` used after weak capture — no force unwrap of captured self.
- No strong reference cycles between parent and child views/objects.

**Concurrency**
- All writes to UI properties or `@Published` vars happen on `@MainActor` or `DispatchQueue.main`.
- No blocking calls (`Thread.sleep`, synchronous network, heavy computation) on the main thread.
- `async/await` preferred over nested callbacks for async sequences.
- `Task { @MainActor in ... }` used when bridging async work back to the main thread.

**IPC bridge**
- Messages sent via `NativeBridgeClient` use the exact message type strings defined in `NativeBridge.ts`.
- Payload shapes (field names, types) match the TypeScript contract.
- Socket reconnection logic handles the case where Electron restarts.

**Overlay window lifecycle**
- `NSWindow` / `NSPanel` references are not held beyond the overlay's lifecycle.
- Windows are closed/hidden correctly in all exit paths (normal close, Electron shutdown, crash).
- `OverlayWindowController` is the single entry point for showing/hiding overlays — no direct window manipulation scattered elsewhere.

**Entitlements & sandboxing**
- Any new entitlement added to `*.entitlements` is actually required.
- Microphone / screen recording entitlements match the `NSMicrophoneUsageDescription` in the app plist.

**Code style**
- No `print()` statements left in production paths (use `Logger` / `os.log`).
- No force unwraps (`!`) on values that could legitimately be nil.
- Error handling: `do/catch` where `throws`, not silent `try?` swallowing errors on important paths.

---

## C# / Windows Review Criteria

Read each changed C# and XAML file in full before commenting.

**MVVM correctness**
- ViewModel classes implement `INotifyPropertyChanged` (or a base that does it).
- No business logic in XAML code-behind (`.xaml.cs`) — that belongs in the ViewModel.
- Commands use `RelayCommand` (already exists at `ViewModels/RelayCommand.cs`) — no ad-hoc event handlers wired in code-behind for actions.
- Bindings in XAML use `{Binding PropertyName}` with a ViewModel as `DataContext`, not code-behind properties.

**Thread safety**
- Any property or method called from a background thread that touches UI must use:
  `Application.Current.Dispatcher.Invoke(() => { ... });`
- `INotifyPropertyChanged.PropertyChanged` invocation is safe from any thread only if the binding infrastructure handles it — verify this for any non-obvious threading.
- Timers (`System.Timers.Timer`, `DispatcherTimer`) are started/stopped on the correct thread.

**Resource management**
- Services that hold unmanaged resources, timers, COM objects, or event subscriptions implement `IDisposable`.
- `Dispose()` is called on app shutdown in `App.xaml.cs` or via DI container.
- Event handler subscriptions (`+=`) always have a corresponding unsubscription (`-=`) in `Dispose` or on window close to prevent leaks.

**IPC bridge**
- Messages sent via `ElectronBridgeClient` use the exact message type strings defined in `NativeBridge.ts`.
- Payload field names and types match the TypeScript contract.
- JSON serialization handles nulls and missing fields gracefully (no `NullReferenceException` on unexpected server messages).

**Async patterns**
- `async void` is only used for event handlers (e.g. `Button_Click`). All other async methods return `Task` or `Task<T>`.
- `await` is not called inside a constructor — use `Loaded` event or factory pattern.
- `ConfigureAwait(false)` used in library/service code that doesn't need to resume on the UI thread.

**XAML quality**
- No magic numbers or hard-coded hex colors in XAML — use resource dictionaries under `Themes/`.
- `AutomationProperties.Name` set on interactive controls (buttons, inputs) for accessibility.
- No unnecessary `x:Name` bindings that bypass MVVM.
- Converters reference existing ones in `Converters/` (e.g. `PercentToScaleConverter`) before writing new ones.

**Overlay lifecycle**
- Overlay windows are shown/hidden/positioned exclusively through `OverlayWindowController` — no direct `window.Show()` / `window.Hide()` calls scattered in services.
- Window handles are not stored beyond the window's lifetime.

---

## Electron / TypeScript Review Criteria

Read each changed `.ts` / `.tsx` file in full before commenting.

**Process boundary**
- Renderer code (`src/renderer/`) never imports from `electron` directly.
- All system-level operations go through `window.electronAPI` (exposed via `preload.ts` contextBridge).
- No `require('fs')`, `require('path')`, or other Node.js built-ins in renderer files.

**Preload safety**
- `contextBridge.exposeInMainWorld` exposes typed, narrow functions — not raw `ipcRenderer.on` or `ipcRenderer.send`.
- Every exposed function has a typed interface; no `any` in the public API surface.
- Renderer cannot invoke arbitrary IPC channels — only those explicitly wired in preload.

**IPC handler hygiene**
- Every `ipcMain.handle` and `ipcMain.on` validates its inputs before acting.
- No string interpolation into shell commands from IPC payloads (shell injection risk).
- Handlers return structured responses — never raw Node.js error objects to the renderer.

**Manager pattern**
- New feature logic lives in a new manager file under `src/main/managers/`.
- Managers are instantiated and registered in `main.ts`, not imported ad-hoc in other managers.
- Managers do not call `ipcMain` directly outside of their own registration method.

**Memory and lifecycle**
- `ipcMain.on` listeners added per-window are removed in `win.on('closed', ...)` or `webContents.on('destroyed', ...)`.
- `electron-store` keys are added to `storageManager.ts` — no scattered `store.get`/`store.set` calls outside that manager.
- `BrowserWindow` references are set to `null` on close to avoid memory leaks.

**Error handling**
- All async main-process functions are wrapped in try/catch or have `.catch()`.
- Caught errors are forwarded to `sentryManager` — not silently swallowed.
- Renderer-facing error responses are safe to display (no stack traces or file paths leaked to UI).

**Security**
- `nodeIntegration: false` and `contextIsolation: true` on all `BrowserWindow` instances.
- `webSecurity: false` is not used unless absolutely required and documented.
- `allowRunningInsecureContent` is not set to `true`.
- No `eval()` or `new Function()` called with external data.

---

## Cross-platform Consistency Review

Run this check if `NativeBridge.ts`, `NativeBridgeClient.swift`, or `ElectronBridgeClient.cs` changed — or if overlay views/windows changed.

**IPC message contracts**
- Extract all message type constants from `NativeBridge.ts`.
- Verify each one exists (same string) in `NativeBridgeClient.swift` and `ElectronBridgeClient.cs`.
- For each message, compare payload field names and types across the three files. Flag any mismatch.

**Overlay state parity**
Verify all 5 states exist and are handled on both platforms:
- Recording → `RecordingOverlayView.swift` + `RecordingOverlayWindow.xaml`
- Processing → `ProcessingOverlayView.swift` + `ProcessingOverlayWindow.xaml`
- Processed → `ProcessedOverlayView.swift` + `ProcessedOverlayWindow.xaml`
- Prompt → `PromptOverlayView.swift` + `PromptOverlayViewModel.cs`
- Error → `ErrorOverlayView.swift` + `ErrorOverlayWindow.xaml`

**Preference store keys**
Compare these stores across platforms and flag any key name or default value mismatch:
- `OverlayLayoutPreferencesStore` (Swift) ↔ `OverlayLayoutPreferencesStore.cs`
- `OverlayShortcutPreferencesStore` (Swift) ↔ `OverlayShortcutPreferencesStore.cs`
- `DisabledAppsPreferencesStore` (Swift) ↔ `DisabledAppsPreferencesStore.cs`
- `OverlayNotificationPreferencesStore` (Swift) ↔ `OverlayNotificationPreferencesStore.cs`

---

## Overall Electron App Experience

Check these regardless of which files changed if the branch touches user-facing behavior:

**Auto-update**
- `updatesHandler.ts` correctly sequences: check → notify user → download → prompt to install → quit-and-install.
- The user is never force-quit without confirmation.

**Deep links**
- `ekadoc://` payload is validated and sanitized before being acted on.
- Invalid or malformed deep links are handled gracefully (no crash, no silent failure).

**Tray icon**
- Tray menu items reflect current app state.
- Clicking the tray icon when the app is minimized/hidden restores the window.

**Permissions (macOS)**
- Microphone and screen recording permissions are requested at the right time with the right description strings from `extendInfo` in `package.json`.
- `permissionsHandler.ts` handles the denied/restricted states gracefully.

**Window management**
- No orphaned windows remain after the native helper process exits.
- Focus returns to the correct window after overlay interaction.
- App does not crash if the native helper fails to start.

---

## Review Output Format

For each finding, output:

```
[SEVERITY] File: path/to/file.ext (line N if known)
Category: <one of: Memory Leak | Thread Safety | IPC Contract | Security | MVVM | State Management | Lifecycle | Code Style | Cross-platform Parity | UX/Experience>
Issue: <one sentence describing the problem>
Fix: <one sentence or short code snippet showing the correct approach>
```

Severity levels: **CRITICAL** (crashes, data loss, security hole) | **HIGH** (likely bugs, resource leaks) | **MEDIUM** (correctness risk, pattern violation) | **LOW** (style, minor improvement)

After all findings, output a one-paragraph summary of the overall health of the changed code.

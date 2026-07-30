# Platform Capability Layer

## Core Idea

Instead of scattering `if (isElectronApp)` or `window.someApi?.doThing()` across feature code, every platform-divergent behaviour is defined as a **contract** (TypeScript interface) and implemented **once per platform**. Feature code never knows which platform it's on — it just calls the contract.

## Flow (Build Time -> Runtime)

### 1. Contracts (`src/platform/contracts/`)

Each capability is a TypeScript interface — platform-agnostic, defines *what* can be done, not *how*.

| Contract | What it does |
|---|---|
| `IStorage` | Key-value storage (local + session) |
| `IBlobStore` | Large-object store (audio chunks) |
| `IFilePicker` | File selection dialog |
| `IClipboard` | Rich clipboard (HTML + plain text) |
| `IPrinter` | Print / PDF export |
| `INotifier` | OS notifications |
| `ISystem` | Open external URLs / shell |
| `IAudioCapture` | Mic permission, device listing, streams |
| `IAuthTokens` | Auth token management |
| `IHostBridge` | Host recording control (start/stop/status) |
| `ITransport` | Network requests |
| `IWhatsApp` | WhatsApp linked-device messaging |
| `IAppUpdates` | Desktop app auto-updater |
| `IDesktopSettings` | Desktop widget settings |

### 2. Two Families Implement Those Contracts

**`src/platform/web/`** — Browser APIs (`localStorage`, `IndexedDB`, `navigator.clipboard`, `<input type="file">`, `getUserMedia`, `fetch`, etc.)

**`src/platform/electron/`** — Feature-detects `window.*Api` bridges exposed by the Electron host. Falls back to the web implementation if the bridge is missing.

### 3. Build-Time Selection (`next.config.ts`)

The env var `NEXT_PUBLIC_APP_SOURCE` controls a webpack alias:

```
@platform-impl -> src/platform/web       (when NEXT_PUBLIC_APP_SOURCE=web)
@platform-impl -> src/platform/electron   (when NEXT_PUBLIC_APP_SOURCE=electron-*)
```

Only one family is bundled. The other is tree-shaken out entirely.

### 4. Registry (`src/platform/registry.ts`)

Imports from `@platform-impl` (whichever family was selected). Does two things:
- Exposes implementations via `getPlatform()`
- Computes which **capability descriptors** are active (e.g. if `filePicker` is registered -> `native-file-dialog` becomes active)

### 5. Consumption

| Context | How | Example |
|---|---|---|
| React components | Hooks via `PlatformProvider` context | `useStorage()`, `useFilePicker()`, `useClipboard()` |
| Non-React code (store, utils) | Direct from registry | `getStorage()`, `getBlobStore()` |

## UI Gating — Three Primitives

| Primitive | When to use | Example |
|---|---|---|
| `<Capability id="...">` | Gate on what the platform *can do* | `<Capability id="whatsapp-linked-device"><SendViaWhatsApp /></Capability>` |
| `<DesktopOnly>` | Pure show/hide by host | `<DesktopOnly><UpdateBanner /></DesktopOnly>` |
| `<WebOnly>` | Pure show/hide by host | `<WebOnly><SwitchWorkspace /></WebOnly>` |

All three accept an optional `fallback` prop rendered when the condition is false.

## What Each Family Registers

**Web** (12 capabilities): audioCapture, authTokens, blobStore, clipboard, filePicker, hostBridge, network, notifier, printer, storage, system

**Electron** (14+ capabilities): everything web has + `appUpdates`, `desktopSettings`, `whatsapp` (conditional on bridge presence)

## Electron's Graceful Degradation

Every electron adapter feature-detects the bridge method before calling it:

```ts
// electron/blob-store.ts
async put(txnId, fileName, data) {
  if (typeof window.blobApi?.put === 'function') {
    await window.blobApi.put(txnId, fileName, buffer);
    return;
  }
  return blobStoreWeb.put(txnId, fileName, data); // fallback
}
```

If the desktop host is older and hasn't shipped a bridge, the capability degrades to the web implementation instead of crashing.

## Bridge Contract (`src/platform/bridge/contract.d.ts`)

Single file that types every `window.*Api` surface. Shared with DeskDocEka (the Electron host repo). Rules:
- **Additive only** — never remove or change existing signatures, deprecate instead
- Version bumped when new members added (`bridge/version.ts`)
- Every member is optional so newer web + older host degrades gracefully

## Folder Structure

```
src/platform/
  contracts/        Capability interfaces + CapabilityId descriptors
  web/              Browser implementations (one file per capability)
  electron/         window.*Api adapters (feature-detecting, graceful fallback)
  bridge/           contract.d.ts (shared with DeskDocEka) + version.ts
  components/       <Capability>, <DesktopOnly>, <WebOnly>
  registry.ts       Build-time wiring + active descriptor set
  provider.tsx      React context provider
  hooks.ts          Per-capability React hooks
  index.ts          Public surface (all exports)
```

## Adding a New Capability

1. Define the contract interface in `contracts/`
2. Add the key to the `Platform` interface in `contracts/index.ts`
3. Add a descriptor in `contracts/capabilities.ts`
4. Implement in `web/<capability>.ts` and `electron/<capability>.ts`
5. Register in both family `index.ts` files
6. Wire descriptor in `registry.ts` `DESCRIPTORS_BY_CAPABILITY`
7. Add hook in `hooks.ts`, export from `index.ts`
8. If electron needs a new bridge, add to `bridge/contract.d.ts` and bump version

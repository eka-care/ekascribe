# EkaScribe Desktop

Electron desktop app for EkaScribe — AI-powered medical scribing. Built with Electron 40, React 19, Vite 5, and TypeScript.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | v23+ | Tested with v23.11.0 |
| npm | v11+ | Ships with Node 23 |
| Git | Latest | SSH access to `github.com:eka-care` repos |
| Xcode | Latest | **macOS only** — needed for the native helper app |
| .NET SDK | 10.0 | **Windows only** — needed for the native helper app |

## Quick Start

```bash
# 1. Clone with submodules
git clone --recurse-submodules git@github.com:eka-care/DeskDocEka.git
cd DeskDocEka

# 2. Install root dependencies
npm install

# 3. Install ekascribe-web dependencies
npm --prefix external/ekascribe-web install --legacy-peer-deps

# 4. Start the app (dev mode)
npm start
```

> On macOS, `npm start` automatically builds the native helper via `xcodebuild` (the `prestart` script).

## Project Structure

```
ekascribe-desktop/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── main.ts            # App entry point, window creation, IPC registration
│   │   └── managers/          # Feature managers (auth, recording, whatsapp, etc.)
│   ├── preload/
│   │   └── preload.ts         # contextBridge — exposes APIs to renderer
│   └── renderer/              # React app (login, settings UI)
│       ├── main.tsx            # Renderer entry
│       └── src/               # React components & pages
├── external/
│   └── ekascribe-web/         # Git submodule (Next.js app, branch: electron-app)
├── mac/
│   └── EkaCareDesktopHelper/  # macOS native helper (Swift/Obj-C, Xcode project)
├── windows/
│   └── EkaDeskDocHelper/      # Windows native helper (C#, .NET 10)
├── build/
│   └── icons/                 # App icons (.icns, .ico)
├── scripts/
│   ├── prepare-ekascribe-runtime.cjs  # Bundles Next.js standalone output for packaging
│   └── ensure-win-csc-env.cjs         # Windows code-signing env check
├── forge.config.ts            # Electron Forge config (packaging, makers, plugins)
├── vite.main.config.ts        # Vite config for main process
├── vite.preload.config.ts     # Vite config for preload script
├── vite.renderer.config.ts    # Vite config for renderer process
└── package.json
```

### Architecture

```
┌─────────────────────────────────────────────────┐
│                  Main Process                    │
│  (src/main/main.ts + managers/)                 │
│  - Window management                             │
│  - IPC handlers                                  │
│  - Native helper communication                   │
│  - WhatsApp (Baileys), Auth, Recording, Proxy   │
│  - Serves ekascribe-web via embedded Next.js     │
└────────────┬──────────────────┬──────────────────┘
             │ IPC              │ IPC
     ┌───────▼───────┐  ┌──────▼──────────────────┐
     │   Preload     │  │   ekascribe-web          │
     │ (preload.ts)  │  │  (Next.js, loaded in     │
     │ contextBridge │  │   BrowserView/webview)    │
     └───────┬───────┘  └──────────────────────────┘
             │
     ┌───────▼───────┐
     │   Renderer    │
     │  (React app)  │
     │  Login, etc.  │
     └───────────────┘
```

The main process embeds **ekascribe-web** (a full Next.js app) as a standalone server at runtime. During development, it starts the Next.js dev server; in production, the standalone output is bundled into the app resources.

## Git Submodule: ekascribe-web

The `external/ekascribe-web` directory is a git submodule pointing to the [ekascribe-web](https://github.com/eka-care/ekascribe-web) repo on the `electron-app` branch.

### First-time setup

If you cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

### Verify branch

The submodule must be on the `electron-app` branch:

```bash
cd external/ekascribe-web
git checkout electron-app
git pull origin electron-app
cd ../..
```

### Updating the submodule

```bash
git submodule update --remote external/ekascribe-web
```

## Development

### Running the app

```bash
npm start
```

This runs `electron-forge start`, which:
1. Builds the macOS native helper (if on macOS, via `prestart`)
2. Compiles main + preload + renderer with Vite
3. Launches the Electron app

The ekascribe-web Next.js app is started automatically by the main process (see `ekascribeWebManager.ts`).

### Working on ekascribe-web

If you need to modify the Next.js app:

```bash
cd external/ekascribe-web
npm install --legacy-peer-deps
npm run dev
```

Changes are picked up when the Electron app loads the web view. Restart the Electron app if the submodule's dev server needs to be re-initialized.

## Build & Package

### macOS

```bash
# Build the native helper + package the app
npm run dist:mac
```

This produces a `.dmg` and `.zip` in the `dist/` directory.

Under the hood:
1. `build:mac-helper:clean` — cleans and rebuilds the Xcode project
2. `package` — runs Electron Forge packaging (which triggers `prepackage`)
3. `prepackage` — installs ekascribe-web deps, builds Next.js, prepares standalone runtime
4. `electron-builder --mac dmg zip` — creates distributable

### Windows

```bash
# Build the native helper + package the app
npm run dist:win
```

This produces an NSIS installer in the `dist/` directory for both x64 and arm64.

Requires:
- .NET 10 SDK installed
- For signed builds: code-signing certificate (see `scripts/ensure-win-csc-env.cjs`)

### What `prepackage` does

The `prepackage` script runs automatically before packaging:

1. Builds the Windows native helper (on Windows)
2. Installs ekascribe-web dependencies
3. Builds ekascribe-web (`next build` with standalone output)
4. Runs `prepare-ekascribe-runtime` — copies the Next.js standalone output into `external/ekascribe-web/runtime/`, prunes dev dependencies, removes source maps and test files to minimize bundle size

## npm Scripts Reference

| Script | Description |
|--------|-------------|
| `npm start` | Start dev mode (builds mac helper first on macOS) |
| `npm run package` | Package the app with Electron Forge |
| `npm run make` | Package + create platform installers |
| `npm run dist:mac` | Full macOS build → `.dmg` + `.zip` |
| `npm run dist:win` | Full Windows build → NSIS installer |
| `npm run build:mac-helper` | Build macOS native helper (Xcode) |
| `npm run build:mac-helper:clean` | Clean + rebuild macOS native helper |
| `npm run build:win-helper` | Build Windows native helper (.NET) |
| `npm run build:ekascribe-web` | Build ekascribe-web (Next.js) |
| `npm run prepare:ekascribe-runtime` | Bundle Next.js standalone for packaging |
| `npm run publish` | Build + publish update (platform-specific) |

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `electron` (40.8.0) | Desktop app framework |
| `@electron-forge/cli` | Dev tooling, packaging |
| `electron-builder` | Distributable creation (dmg, nsis) |
| `react` / `react-dom` (19) | UI framework |
| `vite` (5) | Build tool for main/preload/renderer |
| `@whiskeysockets/baileys` | WhatsApp Web API (send prescriptions) |
| `electron-updater` | Auto-update support |
| `@sentry/electron` | Error tracking |
| `uiohook-napi` | Global keyboard/mouse hooks |
| `electron-store` | Persistent key-value storage |

## Deep Links

The app registers the `ekadoc://` protocol for deep linking.

## Troubleshooting

### `npm start` fails with xcodebuild error
Make sure Xcode is installed and command-line tools are configured:
```bash
xcode-select --install
```

### Submodule is empty or on wrong branch
```bash
git submodule update --init --recursive
cd external/ekascribe-web
git checkout electron-app
```

### `npm install` fails in ekascribe-web
The Next.js app requires `--legacy-peer-deps` due to peer dependency conflicts:
```bash
npm --prefix external/ekascribe-web install --legacy-peer-deps
```

### WhatsApp connection shows no QR code
The Baileys library needs to fetch the latest WhatsApp Web version. Ensure you have internet connectivity. If issues persist, delete the cached auth state:
```bash
# Path varies — check Electron's userData directory
rm -rf ~/Library/Application\ Support/EkaScribe/whatsapp-auth
```

### Build fails with "Missing Next standalone output"
The ekascribe-web app must be built before packaging:
```bash
npm run build:ekascribe-web
npm run prepare:ekascribe-runtime
```

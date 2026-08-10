# EkaScribe Desktop — Local Dev & Build Testing Guide

This guide walks from a bare machine to a running Electron app and a locally packaged build. Complete [setup-guide.md](setup-guide.md) first.

---

## macOS

### Step 1 — Install Xcode

1. Open the **Mac App Store** and search for **Xcode**
2. Click **Get** and wait for the download (~10 GB)
3. Launch Xcode once to accept the licence agreement and finish component installation
4. Install the command-line tools:

```bash
xcode-select --install
```

Confirm:

```bash
xcode-select -p
# Expected output: /Applications/Xcode.app/Contents/Developer
xcodebuild -version
# Expected: Xcode 16.x (or current release)
```

### Step 2 — Get Added to the Orbi Health Apple Developer Team

The native helper requires a valid code signing identity even for local development.

1. Ask an existing team member to invite your Apple ID to the **Orbi Health** organisation in App Store Connect
2. Accept the invitation email from Apple
3. In Xcode: **Settings → Accounts → + → Apple ID** — sign in and confirm **Orbi Health** appears as a team

### Step 3 — Configure Signing in Xcode

1. Open `mac/EkaCareDesktopHelper/EkaCareDesktopHelper.xcodeproj` in Xcode
2. Click the `EkaCareDesktopHelper` target in the navigator
3. Go to **Signing & Capabilities**
4. Set **Team** to **Orbi Health**
5. Ensure **Automatically manage signing** is checked
6. Close Xcode — you do not need to build from Xcode directly; the npm scripts call `xcodebuild`

### Step 4 — Complete Setup

If you have not already, complete [setup-guide.md](setup-guide.md):

```bash
npm install
npm --prefix external/ekascribe-web install --legacy-peer-deps
# Place electron.env in the project root
```

### Step 5 — Run the App (Dev Mode)

```bash
npm start
```

What happens:
1. `prestart` automatically runs `build:mac-helper` — compiles the Swift helper via `xcodebuild`
2. Vite compiles the main process, preload, and renderer
3. Electron launches with the React UI
4. `ekascribeWebManager` starts the Next.js dev server in-process

The first run takes longer because Xcode builds the helper. Subsequent runs are faster.

### Step 6 — Create a Locally Packaged Build (macOS)

Use this to test what an end user would install:

```bash
npm run dist:mac
```

What it does:
1. Cleans and rebuilds the Swift helper via Xcode
2. Installs ekascribe-web dependencies
3. Builds the Next.js app (`next build` with standalone output)
4. Runs `prepare-ekascribe-runtime` to bundle the standalone output
5. Runs Electron Forge packaging
6. Runs `electron-builder --mac dmg zip` to create distributable files

Output appears in `dist/`:
- `EkaScribe.dmg` — installer disk image
- `EkaScribe.zip` — zip archive of the `.app`

> **Note:** `npm run dist:mac` requires a valid Apple Developer signing certificate. You must be on the Orbi Health team and have a valid certificate in your keychain. For an unsigned local build (no signing), use `npm run make:mac` instead.

---

## Windows

### Step 1 — Install .NET SDK 10.0

Download from [https://dotnet.microsoft.com/download](https://dotnet.microsoft.com/download) and install the **.NET SDK 10.0**.

Confirm:

```powershell
dotnet --version
# Expected: 10.x.x
```

### Step 2 — Install Visual Studio (Optional)

For browsing or debugging the C# native helper:

- **Visual Studio 2022** (Community or higher) with the **.NET desktop development** workload — to open the `.slnx` solution
- Or **VS Code** with the **C# Dev Kit** extension

You do not need Visual Studio to build — `dotnet` CLI is sufficient.

### Step 3 — Complete Setup

Complete [setup-guide.md](setup-guide.md):

```powershell
npm install
npm --prefix external/ekascribe-web install --legacy-peer-deps
# Place electron.env in the project root
```

### Step 4 — Run the App (Dev Mode)

```powershell
npm start
```

On Windows, `npm start` does **not** auto-build the native helper the way macOS does. The Windows helper is built separately (see Step 5).

### Step 5 — Create a Locally Packaged Build (Windows)

Use this for local packaged build testing with a self-signed developer certificate:

```powershell
npm run make:win
```

What it does:
1. Creates a self-signed dev certificate at `certs/dev-code-signing.pfx` if one does not exist (via a PowerShell script)
2. Builds the C# native helper for both x64 and arm64
3. Packages with Electron Forge
4. Runs `electron-builder --win nsis` signed with the local dev cert

Output appears in `out/` — an NSIS installer for x64 and arm64.

> **Note:** Builds created with `npm run make:win` use a self-signed certificate. They will show a Windows SmartScreen warning when installed. This is expected for dev builds. Production builds are signed via Azure Trusted Signing in CI.

---

## Command Reference

| Command | What it does | Platform |
|---|---|---|
| `npm start` | Dev mode — builds native helper (macOS) + launches Electron | All |
| `npm run dist:mac` | Full signed macOS build → `.dmg` + `.zip` in `dist/` | macOS |
| `npm run make:mac` | Unsigned local macOS build (no Apple signing required) | macOS |
| `npm run make:win` | Local dev-signed Windows build → NSIS installer in `out/` | Windows |
| `npm run dist:win` | Full Windows build (Azure signing) → NSIS in `dist/` | Windows (CI) |
| `npm run build:mac-helper` | Rebuild Swift helper only | macOS |
| `npm run build:mac-helper:clean` | Clean + rebuild Swift helper | macOS |
| `npm run build:win-helper` | Rebuild C# helper only | Windows |
| `npm run build:win-helper:x64` | Publish self-contained x64 C# helper | Windows |
| `npm run build:win-helper:arm64` | Publish self-contained arm64 C# helper | Windows |
| `npm run build:win-helper:all` | Publish both x64 and arm64 C# helpers | Windows |
| `npm run build:ekascribe-web` | Build embedded Next.js app | All |
| `npm run prepare:ekascribe-runtime` | Bundle Next.js standalone output for packaging | All |

---

## Troubleshooting

### `xcodebuild` fails with "no signing certificate"

You are not yet on the Orbi Health Apple Developer team, or Xcode does not have the certificate.

- Confirm the team appears in **Xcode → Settings → Accounts**
- Open the Xcode project and set the team in **Signing & Capabilities**
- Run `security find-identity -v -p codesigning` — you should see a valid certificate for Orbi Health

### `npm start` fails immediately on macOS with a build error

```bash
xcode-select --install          # reinstall CLI tools
sudo xcode-select --reset       # reset to default Xcode path
```

### Submodule is empty or on the wrong branch

```bash
git submodule update --init --recursive
cd external/ekascribe-web
git checkout electron-app
git pull origin electron-app
cd ../..
```

### `npm install` fails in ekascribe-web with peer dependency errors

Always use `--legacy-peer-deps` for the submodule:

```bash
npm --prefix external/ekascribe-web install --legacy-peer-deps
```

### Build fails with "Missing Next.js standalone output"

The ekascribe-web app must be built before packaging:

```bash
npm run build:ekascribe-web
npm run prepare:ekascribe-runtime
```

### Windows SmartScreen blocks the installer

Expected for `npm run make:win` builds (self-signed cert). Click **More info → Run anyway**. Production builds from CI are Azure-signed and will not trigger this.

### App launches but shows a blank screen / auth errors

The `electron.env` file is missing or has wrong values. Confirm it is in the project root and contains valid credentials (see [electron.env.sample](electron.env.sample)). Obtain a valid file from a team member.
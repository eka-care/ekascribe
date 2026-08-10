# EkaScribe Desktop — Setup Guide

Everything you need to do before writing a single line of code.

---

## Prerequisites

Install all tools for your platform before cloning the repo.

| Tool | Version | Platform | Notes |
|---|---|---|---|
| Node.js | v23+ | All | Tested with v23.11.0 — use [nvm](https://github.com/nvm-sh/nvm) or install directly |
| npm | v11+ | All | Ships with Node 23 |
| Git | Latest | All | Must be configured with SSH access to `github.com` |
| Xcode | Latest | macOS only | Install from the Mac App Store |
| .NET SDK | 10.0 | Windows only | Download from [dot.net](https://dotnet.microsoft.com/download) |

### Verify your tools

```bash
node --version      # should be v23.x.x or higher
npm --version       # should be v11.x.x or higher
git --version
xcode-select -p     # macOS — should print a path, not an error
dotnet --version    # Windows — should be 10.x.x
```

---

## Access Checklist

Complete every item below before cloning. Missing any of these will cause the setup to fail partway through.

### 1. GitHub Organisation Access

Request access to the **`eka-care`** GitHub organisation from any existing team member. You need at least read access to:

- [`eka-care/DeskDocEka`](https://github.com/eka-care/DeskDocEka) — the main desktop repo
- [`eka-care/ekascribe-web`](https://github.com/eka-care/ekascribe-web) — the embedded Next.js submodule
- Any additional repos your team lead specifies (ask them for the full list)

Once invited, accept the invitation in your GitHub email and confirm you can visit `https://github.com/eka-care`.

### 2. SSH Key for GitHub

The repo uses SSH for cloning and submodule access. If you have not set up an SSH key with GitHub:

```bash
# Generate a key (skip if you already have one)
ssh-keygen -t ed25519 -C "your@email.com"

# Copy the public key
cat ~/.ssh/id_ed25519.pub   # macOS/Linux
type %USERPROFILE%\.ssh\id_ed25519.pub  # Windows (PowerShell)
```

Add the public key at **GitHub → Settings → SSH and GPG keys → New SSH key**.

Test it:

```bash
ssh -T git@github.com
# Expected: "Hi <username>! You've successfully authenticated..."
```

### 3. Apple Developer Team (macOS only)

The macOS native helper (`EkaCareDesktopHelper`) requires a valid code signing identity — even for local `npm start` development builds.

**Ask any existing team member to add your Apple ID to the Orbi Health Apple Developer team.**

After being added:

1. Open **Xcode → Settings → Accounts**
2. Click **+** and sign in with your Apple ID
3. The **Orbi Health** team should appear under your account
4. Open `mac/EkaCareDesktopHelper/EkaCareDesktopHelper.xcodeproj`
5. Select the `EkaCareDesktopHelper` target → **Signing & Capabilities** → set Team to **Orbi Health**

### 4. `electron.env` File

This file contains API keys and service credentials that are **not committed to the repo**. You must obtain it from an existing team member.

Place it at the root of the cloned repo:

```
ekascribe-desktop/
├── electron.env    ← here
├── package.json
└── ...
```

See [electron.env.sample](electron.env.sample) for the expected keys and format.

---

## Cloning the Repository

Always clone with `--recurse-submodules` to pull the `ekascribe-web` submodule at the same time:

```bash
git clone --recurse-submodules git@github.com:eka-care/DeskDocEka.git
cd DeskDocEka
```

If you already cloned without the flag:

```bash
git submodule update --init --recursive
```

### Verify the submodule

```bash
ls external/ekascribe-web   # should not be empty
cd external/ekascribe-web
git branch                  # should show electron-app
cd ../..
```

If the submodule is on the wrong branch:

```bash
cd external/ekascribe-web
git checkout electron-app
git pull origin electron-app
cd ../..
```

---

## Installing Dependencies

Install from the project root. Do **not** run `npm install` inside the submodule separately — a dedicated script handles that before builds.

```bash
# 1. Install root (Electron) dependencies
npm install

# 2. Install ekascribe-web dependencies
#    --legacy-peer-deps is required due to peer dependency conflicts in the Next.js app
npm --prefix external/ekascribe-web install --legacy-peer-deps
```

---

## Place the `electron.env` File

Copy the `electron.env` file (obtained from a team member) into the project root. The app will fail to start without it.

```bash
# Confirm it is in the right place
ls electron.env    # should print: electron.env
```

---

## Next Steps

Your environment is ready. Head to [testing-guide.md](testing-guide.md) to run the app locally and create your first packaged build.

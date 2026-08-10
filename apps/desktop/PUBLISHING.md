# Desktop App — Building & Publishing

How the Scribe desktop app is built, packaged, distributed, and auto-updated.
All commands run from `apps/desktop/`.

## How the app gets its web code

| Mode | Web source | Freshness |
|---|---|---|
| `npm start` (dev) | `apps/web` source, compiled live by an embedded `next dev` (dist dir `.next-desktop`) | Always the current checkout — every edit hot-reloads |
| Packaged app (`make` / `dist`) | `runtime/` — a production Next build snapshotted at package time | Frozen at build time; rebuild to update |

So in dev you always run the latest web code. A shipped app only updates when
you publish a new version.

## Build outputs

- **macOS**: `Scribe.dmg` (installer) + `Scribe.zip` (used by auto-update) + `latest-mac.yml`
- **Windows**: `Scribe Setup.exe` (NSIS, x64+arm64) + `latest.yml`
- App ID `com.scribe.desktop`, deep-link scheme `scribe://`

## Prerequisites

- Node 20+, npm; Xcode (macOS); .NET 10 SDK (Windows helper)
- `electron.env` created from `electron.env.example` (set `OIDC_BASE_URL` if
  login should be enforced; leave empty to skip the login screen)
- **macOS signing (required to distribute)**: an Apple *Developer ID
  Application* certificate in the keychain, plus notarization credentials in
  the environment (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
  — electron-builder uses these because `notarize: true` is set).
  Unsigned/un-notarized builds only run on machines where Gatekeeper is
  bypassed manually.
- **Windows signing (optional but recommended)**: CI signs via Azure Trusted
  Signing (`scripts/windows/azure-sign.cjs`); local `make:win` auto-creates a
  self-signed dev cert.

## Local test builds (no signing)

```bash
npm run make:mac    # unsigned .app/dmg under out/ — for your own machine
npm run make:win    # dev-cert NSIS installer
```

## Release builds

```bash
# macOS — builds helper + production web runtime, then signed dmg+zip
npm run dist:mac

# Windows — helper (x64+arm64) + runtime, then NSIS installer
npm run dist:win
```

Both run the `prepackage` chain automatically:
`build:mac-helper` (or win) → `build:ekascribe-web` (production Next build of
`apps/web`) → `prepare:ekascribe-runtime` (flattens the standalone output into
`runtime/`).

## Publishing a release (manual steps)

1. **Bump the version** in `package.json` (`version` field). electron-updater
   compares this against the update feed.
2. Build: `npm run dist:mac` (on a Mac) and `npm run dist:win` (on Windows or CI).
3. **Upload to the update host** — copy these artifacts to the URL configured
   under `build.publish` in `package.json`:
   - macOS: `Scribe.zip`, `Scribe.dmg`, `latest-mac.yml`
   - Windows: `Scribe Setup.exe`, `latest.yml`
4. Users' installed apps poll that URL, see the higher version in
   `latest*.yml`, download the zip/exe, and prompt to restart. The in-app
   update banner (sidebar) drives install.
5. Distribute the `dmg` / `Setup.exe` links for first-time installs (website,
   GitHub Releases page, etc.).

## Hosting the update feed

The updater uses electron-builder's **generic provider** — any static file
host works (S3 + CloudFront, nginx, GitHub Pages). Requirements:

- HTTPS URL serving the artifacts + `latest-mac.yml` / `latest.yml` at the
  exact path in `build.publish[0].url`
- No auth, correct content-length (electron-updater streams the download)

> **Current config points at `https://updates.eka.care/ekascribe/latest/`**
> (inherited from the ancestor repo). Before publishing this open-source app,
> change `build.publish[0].url` in `package.json` to your own host.
> GitHub Releases is the simplest alternative: switch the provider to
> `{ "provider": "github", "owner": "<org>", "repo": "<repo>" }` and run
> `electron-builder --publish always` with a `GH_TOKEN`.

## Pre-publish checklist (open-source release)

- [ ] Replace `build.publish[0].url` with your own update host (see above)
- [ ] Replace app icons (`build/icons/icon.icns`, `icon.ico`, `tray/`) — still
      the ancestor repo's artwork
- [ ] Rotate every credential that ever lived in the ancestor `electron.env` /
      `apps/web/.env.local` (Firebase, Sentry, Mixpanel, New Relic) — they
      exist in git history
- [ ] Set real `OIDC_BASE_URL` (or intentionally ship login-less)
- [ ] mac helper is still named `EkaCareDesktopHelper` internally — cosmetic,
      but rename before a public release if branding matters
- [ ] Test auto-update end-to-end: install vN, publish vN+1 to the feed,
      confirm the in-app banner appears and the update installs

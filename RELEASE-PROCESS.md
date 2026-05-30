# DraftoSLP Release Process

**Last updated:** 30 May 2026  
**Applies from:** v1.1.7 onwards

---

## What Was Set Up

Previously, Mac and Windows builds were produced manually on separate machines and there was no automated release pipeline. On 30 May 2026 the following was completed:

- The Mac codebase (canonical) was unified with the Windows codebase and pushed to `github.com/Shrutanjaya/Drafto-Electron` as the single source of truth.
- A GitHub Actions workflow (`.github/workflows/release.yml`) was created that automatically builds and publishes both the Mac `.dmg` and Windows `.exe` whenever a version tag is pushed.
- The repo is **public** — this is required for `electron-updater` to check for and download updates without authentication. The source code is not sensitive (it is already shipped inside every installer).

---

## How to Release a New Version

### 1. Make your code changes and bump the version

Edit [`package.json`](package.json) line 3:

```json
"version": "1.1.7"
```

### 2. Commit and push

```bash
git add package.json
git commit -m "Bump version to v1.1.7"
git push origin main
```

### 3. Push a version tag

```bash
git tag v1.1.7
git push origin v1.1.7
```

That's it. The tag push triggers GitHub Actions automatically.

---

## What Happens After the Tag Push

Two jobs run in parallel on GitHub's servers:

**Mac job** (`macos-14` runner — Apple Silicon):
1. Installs npm dependencies
2. Installs LibreOffice (bundled into the app for DOCX→PDF conversion)
3. Imports the Developer ID certificate into a temporary keychain
4. Writes the Apple API key for notarization
5. Builds the Vite frontend, packages the app with electron-builder
6. Signs with Developer ID, notarizes with Apple, staples the ticket
7. Uploads `DraftoSLP-{version}.dmg` + blockmap + `latest-mac.yml` to the GitHub Release

**Windows job** (`windows-latest` runner):
1. Installs npm dependencies
2. Installs Tesseract OCR
3. Runs `bundle-deps-win.ps1` to assemble the bundled Python runtime
4. Builds the Vite frontend, packages the installer with electron-builder
5. Uploads `DraftoSLP-Setup-{version}.exe` + blockmap + `latest.yml` to the GitHub Release

Once both jobs complete, the GitHub Release is live. Users running any previous version will see an in-app update prompt within a few seconds of next launching the app.

---

## GitHub Secrets Required

These are already configured at `github.com/Shrutanjaya/Drafto-Electron/settings/secrets/actions`. Do not delete them.

| Secret | What it contains |
|---|---|
| `APPLE_CERTIFICATE` | Base64-encoded `Apple/DeveloperID.p12` — Developer ID Application certificate + private key |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` above |
| `APPLE_API_KEY` | Base64-encoded `Apple/AuthKey_K8FL55TT98.p8` — App Store Connect API key for notarization |
| `APPLE_API_KEY_ID` | `K8FL55TT98` — the 10-character key ID |
| `APPLE_API_ISSUER_ID` | Issuer UUID from App Store Connect |
| `GH_PAT` | GitHub personal access token (not used by the current workflow — built-in `GITHUB_TOKEN` is used instead) |

The actual certificate and key files live locally at `/Users/arunbhardwaj/DraftoSLP/Apple/` and are gitignored. Never commit them.

If a secret needs to be re-set (e.g. after certificate renewal), base64-encode the file first:

```bash
base64 -i Apple/AuthKey_K8FL55TT98.p8 | pbcopy   # for the .p8 key
base64 -i Apple/DeveloperID.p12 | pbcopy           # for the .p12 cert
```

Then paste the clipboard contents into the secret on GitHub.

---

## Monitoring a Release

After pushing a tag, watch the build at:  
`github.com/Shrutanjaya/Drafto-Electron/actions`

Common failure points:
- **"Write Apple API key" step fails** — the `APPLE_API_KEY` secret may not be base64-encoded. Re-set it using the command above.
- **"Import Developer ID certificate" step fails** — the `APPLE_CERTIFICATE` secret may be wrong or the certificate may have expired. Check expiry in Keychain Access on the Mac.
- **Notarization rejected by Apple** — the build log will include a developer log URL from Apple with the specific reason.
- **Windows: Tesseract not found** — `choco install tesseract` may have changed its install path. Check `bundle-deps-win.ps1`.

---

## Key Files

| File | Purpose |
|---|---|
| `.github/workflows/release.yml` | The CI/CD release workflow |
| `package.json` | Version number (line 3) and electron-builder config |
| `afterSign.js` | Mac notarization hook — runs automatically during `electron-builder --mac` |
| `beforePack.js` | Mac pre-build hook — stages LibreOffice for bundling |
| `bundle-deps-win.ps1` | Windows pre-build script — assembles Python + Tesseract bundle |
| `electron/main.js` | Main process; contains `autoUpdater` configuration |
| `Apple/` | Local-only certificates and keys (gitignored) |

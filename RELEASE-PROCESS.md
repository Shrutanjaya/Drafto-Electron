# DraftoSLP Release Process

**Last updated:** 6 September 2026
**Applies from:** v1.1.7 onwards

---

## What Was Set Up

Previously, Mac and Windows builds were produced manually on separate machines and there was no automated release pipeline. On 30 May 2026 the following was completed:

- The Mac codebase (canonical) was unified with the Windows codebase and pushed to `github.com/Shrutanjaya/Drafto-Electron` as the single source of truth.
- A GitHub Actions workflow (`.github/workflows/release.yml`) was created that builds both the Mac `.dmg` and the Windows `.exe` whenever a version tag is pushed, and uploads them to a **draft** GitHub Release.
- The repo is **public** — this is required for `electron-updater` to check for and download updates without authentication. The source code is not sensitive (it is already shipped inside every installer).

**Pushing a tag does not release anything to customers.** The build is automatic; publishing is a deliberate manual step (step 4 below). This changed after the workflow was first written — auto-publish is switched off on purpose, and there is a comment at the bottom of `release.yml` explaining how to turn it back on if that is ever wanted.

---

## How to Release a New Version

### 1. Make your code changes and bump the version

Edit [`package.json`](package.json) line 3:

```json
"version": "2.0.12"
```

**Do not skip this, and do not leave it until later.** electron-builder takes the version number from `package.json`, **not** from the git tag. It uses that number to name the installers *and* to write the `latest.yml` / `latest-mac.yml` files that tell every installed copy of the app what the newest version is. If `package.json` still holds the previous version when you tag:

- the installers are built under the **old** version number;
- they are uploaded into the **previous version's draft release, overwriting it** — the earlier build is gone;
- no release exists for the tag you actually pushed;
- and anyone already running that old version number is never offered the update, because as far as the app can tell nothing has changed.

CI goes green throughout. Nothing warns you. This happened on v2.0.11 — see *Things that have gone wrong before*.

### 2. Commit and push

Follow the repo's commit convention: a `feat:` / `fix:` / `ci:` commit for the work itself, then a **separate** commit for the version bump.

```bash
git add package.json
git commit -m "build: v2.0.12"
git push origin main
```

### 3. Push a version tag

```bash
git tag v2.0.12
git push origin v2.0.12
```

The tag push triggers GitHub Actions automatically. The tag must match the version you just put in `package.json`.

### 4. Wait for both jobs to go green, then publish the draft

The build takes roughly 45–90 minutes. When **both** the Mac and Windows jobs have finished successfully, go to `github.com/Shrutanjaya/Drafto-Electron/releases`, open the draft, check that all eight assets are present, and publish it.

Eight assets are expected:

| Mac | Windows |
|---|---|
| `DraftoSLP-{version}-arm64.dmg` + `.blockmap` | `DraftoSLP-Setup-{version}.exe` + `.blockmap` |
| `DraftoSLP-{version}-arm64-mac.zip` + `.blockmap` | |
| `latest-mac.yml` | `latest.yml` |

Or from the command line:

```bash
gh release edit v2.0.12 --draft=false --latest
```

> ⚠️ **Never publish before both jobs are green.** electron-builder only uploads into a *draft*. If the release has already been published by the time the Mac job finishes, it silently skips every Mac file **and still exits 0** — you get a green build and a Mac-less release. Recovering means turning the release back into a draft and re-running the Mac job, about 45 minutes. This happened on v2.0.5.

Until the draft is published, customers see nothing. The release is only live once you publish it.

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
7. Uploads `DraftoSLP-{version}.dmg` + zip + blockmaps + `latest-mac.yml` to the draft release

**Windows job** (`windows-latest` runner):
1. Installs npm dependencies
2. Installs Tesseract OCR
3. Runs `bundle-deps-win.ps1` to assemble the bundled Python runtime
4. Installs LibreOffice (bundled as the PDF-conversion fallback when Word cannot be driven)
5. Builds the Vite frontend, packages the installer with electron-builder
6. Uploads `DraftoSLP-Setup-{version}.exe` + blockmap + `latest.yml` to the draft release

Once both jobs complete, the assets are in place but the release is still a **draft**. After you publish it (step 4), users running any previous version see an in-app update prompt within a few seconds of next launching the app.

---

## Things That Have Gone Wrong Before

Both of these produced a **green** CI run. Neither was caught by the pipeline.

**v2.0.5 — published too early, Mac assets silently dropped.**
The release was published while the Mac job was still running. electron-builder uploads only into a draft, so when the Mac job finished it skipped every Mac file and exited 0. Fix: re-draft the release and re-run the Mac job (~45 min). Prevention: step 4 above.

**v2.0.11 — version not bumped, previous release overwritten.**
The `v2.0.11` tag was pushed with `package.json` still reading `2.0.10`. Everything built and uploaded as "2.0.10" into the existing v2.0.10 draft, overwriting the genuine 2.0.10 installers. The result: no v2.0.11 release at all, and a draft labelled 2.0.10 that actually contains v2.0.11 code. Neither 2.0.10 nor 2.0.11 was ever published, so customers stayed on 2.0.9. Prevention: step 1 above.

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
| `GH_PAT` | Legacy GitHub personal access token. **Not used** — the workflow uses the built-in `GITHUB_TOKEN`. Kept only so nothing depending on it breaks; safe to ignore. |

The certificate and key files themselves live only on the Mac, at `/Users/arunbhardwaj/DraftoSLP/Apple/`, and are gitignored. They are not present on the Windows machine and are not needed there — Mac signing happens entirely on GitHub's runners. Never commit them.

If a secret needs to be re-set (e.g. after certificate renewal), base64-encode the file first, **on the Mac**:

```bash
base64 -i Apple/AuthKey_K8FL55TT98.p8 | pbcopy   # for the .p8 key
base64 -i Apple/DeveloperID.p12 | pbcopy         # for the .p12 cert
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
- **DMG packaging fails with "hdiutil: create failed — Device not configured"** — a known intermittent fault on GitHub's Mac runners. The workflow already retries the packaging step three times; if all three fail, re-run the job.
- **Green build, but the release looks wrong** — check the two failure modes under *Things That Have Gone Wrong Before* before assuming the build is fine.

---

## Key Files

| File | Purpose |
|---|---|
| `.github/workflows/release.yml` | The CI/CD release workflow. Triggers on `v*.*.*` tags; auto-publish deliberately disabled |
| `package.json` | Version number (line 3) and electron-builder config. **The version here — not the git tag — names the installers and drives the update feed** |
| `afterSign.js` | Mac notarization hook — runs automatically during `electron-builder --mac` |
| `beforePack.js` | Mac pre-build hook — stages LibreOffice for bundling |
| `bundle-deps-win.ps1` | Windows pre-build script — assembles Python + Tesseract bundle |
| `electron/main.js` | Main process; contains `autoUpdater` configuration (`autoDownload = false`, startup check) |
| `Apple/` | Local-only certificates and keys, Mac machine only (gitignored) |

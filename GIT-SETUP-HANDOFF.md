# Git Setup Handoff — DraftoSLP Mac → GitHub

**Date:** 29 May 2026  
**Status:** ⚠️ INCOMPLETE — local repo is ready, push to GitHub is failing  
**Goal:** Push the unified Mac+Windows codebase from `/Users/arunbhardwaj/DraftoSLP` to `https://github.com/Shrutanjaya/Drafto-Electron`

---

## Background

DraftoSLP is an Electron + React/TypeScript app. It previously existed as two separate codebases:
- **Mac version** (canonical, more advanced): `/Users/arunbhardwaj/DraftoSLP` on Mac Mini
- **Windows version**: on the Windows machine, with its own git history on GitHub at `Shrutanjaya/Drafto-Electron`

The goal was to consolidate both into a single GitHub repo so future changes only need to be made once, and eventually set up GitHub Actions to auto-build both Mac `.dmg` and Windows `.exe` on version tag push.

The Mac version was chosen as the canonical source. The only thing it was missing was `python_scripts/` (two Python files for Windows PDF conversion and OCR). Those were copied from the Windows machine into `/Users/arunbhardwaj/DraftoSLP/python_scripts/`.

---

## What Has Been Completed

### 1. Codebase unification (DONE ✅)
- `python_scripts/convert_to_pdf.py` and `python_scripts/process_ocr.py` copied from `Windows Files/python_scripts/` to repo root
- `.gitignore` updated: `python_scripts/` entry removed (it was previously gitignored), `Apple/`, `Apple.zip`, `Windows Files/` entries added
- All platform-specific code confirmed already present in the Mac version (`electron/main.js`, `electron/ipc/pdf-converter.js`, `package.json`)

### 2. Local git repo created (DONE ✅)
- Created via GitHub Desktop: "Create a repository here instead?" at `/Users/arunbhardwaj/DraftoSLP`
- Repo name in GitHub Desktop: "DraftoSLP Truth"
- Initial commit was made by GitHub Desktop

### 3. Commit cleaned up (DONE ✅)
- The initial commit accidentally included `Apple.zip` (contains Apple API private key) and `Windows Files` (as a git submodule reference)
- Used `git rm --cached Apple.zip` and `git rm --cached "Windows Files"` to remove them from tracking
- Amended the commit with `git commit --amend --no-edit`
- Final commit: `bc7e941` — "Unified codebase v1.1.6: add python_scripts, update .gitignore"
- **138 files committed**, none are sensitive

### 4. Remote and branch configured (DONE ✅)
- Branch renamed: `master` → `main`
- Remote added: `git@github.com:Shrutanjaya/Drafto-Electron.git` (SSH, not HTTPS)
- SSH key generated: `~/.ssh/github_drafto` (ed25519)
- SSH key added to GitHub account `Shrutanjaya` → Settings → SSH keys → "Mac Mini DraftoSLP"
- SSH connection verified: `ssh -T git@github.com` returns "Hi Shrutanjaya! You've successfully authenticated"

### 5. SSH config set up (DONE ✅)
File: `~/.ssh/config`
```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_drafto
  IdentitiesOnly yes
```

---

## The Blocking Problem: Push Fails

All push attempts have failed. Here is the full diagnosis:

### Root cause: Xcode Command Line Tools not installed
The Mac Mini has **no Xcode Command Line Tools (CLT) installed**. macOS ships a stub `/usr/bin/git` that triggers a GUI dialog "Install Developer Tools" when invoked. Similarly, certain macOS system frameworks that git binaries link against (Security.framework, CoreFoundation, etc.) trigger `xcode-select --install` dialogs.

Every time git tries to do anything that requires these frameworks, macOS prints:
```
xcode-select: note: No developer tools were found, requesting install.
```
and launches a GUI installation dialog in the background. This dialog **interrupts the running git process**, causing network connections to drop mid-transfer.

### Git binary used
System `/usr/bin/git` requires Xcode CLT and does not work at all.  
We use GitHub Desktop's bundled git at:
```
/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git
```
(GitHub Desktop is installed and this binary exists.)

### Attempt 1: HTTPS push — FAILED
```bash
GIT="/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git"
"$GIT" -C "/Users/arunbhardwaj/DraftoSLP" push origin main --force
```
Error: `fatal: remote helper 'https' aborted session`  
Cause: GitHub Desktop's `git-remote-https` binary (in `libexec/git-core/`) links against macOS security frameworks which trigger the Xcode CLT dialog and abort.

### Attempt 2: HTTPS with GitHub Desktop credential helper — FAILED
```bash
GCM="/Applications/GitHub Desktop.app/Contents/Resources/app/git/libexec/git-core/git-credential-desktop"
"$GIT" -C "/Users/arunbhardwaj/DraftoSLP" config credential.helper "$GCM"
"$GIT" -C "/Users/arunbhardwaj/DraftoSLP" push origin main --force
```
Same error: `fatal: remote helper 'https' aborted session`

### Attempt 3: SSH push — PARTIAL FAILURE
Switched remote URL to SSH: `git@github.com:Shrutanjaya/Drafto-Electron.git`  
SSH authentication itself works (`ssh -T git@github.com` succeeds).  
But the push fails mid-transfer:
```
remote: fatal: early EOF
error: remote unpack failed: index-pack failed
To github.com:Shrutanjaya/Drafto-Electron.git
 ! [remote rejected] main -> main (failed)
```
Cause: The xcode-select dialog appears during the pack transfer process (not during SSH auth), interrupting the git process and causing the SSH stdin pipe to close before the full pack is sent. GitHub receives an incomplete pack and rejects it.

---

## Current Exact State

```
Repo path:    /Users/arunbhardwaj/DraftoSLP
Branch:       main
Commit:       bc7e941 — "Unified codebase v1.1.6: add python_scripts, update .gitignore"
Remote:       origin → git@github.com:Shrutanjaya/Drafto-Electron.git (SSH)
Git binary:   /Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git
Working tree: clean (nothing to commit)
Pack size:    2.88 MiB (166 loose objects)
SSH key:      ~/.ssh/github_drafto (ed25519, added to GitHub)
SSH config:   ~/.ssh/config (configured for github.com)
```

The `Windows Files/` folder still exists on disk at `/Users/arunbhardwaj/DraftoSLP/Windows Files/` and has its own `.git` inside it. It is **excluded from tracking** via `.gitignore` and was removed from the git index. It still causes the noisy `fatal: 'git status --porcelain=2' failed in submodule Windows Files` warning when running plain `git status`, but this is cosmetic — use `git -c status.submodulesummary=0 status --ignore-submodules=all` to avoid it. You can safely delete the entire `Windows Files/` folder from disk once you've confirmed `python_scripts/` is present at the repo root.

---

## Recommended Next Steps for a Future Developer

### Option A — Install Xcode Command Line Tools (cleanest fix)

This permanently fixes all git issues on this Mac. The user just needs to run:
```bash
xcode-select --install
```
This opens an installer dialog. After it completes (~5-10 min download), all git operations will work normally. Then push:
```bash
GIT="/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git"
"$GIT" -C "/Users/arunbhardwaj/DraftoSLP" push origin main --force
```

### Option B — Push from GitHub Desktop UI (may work)

GitHub Desktop's UI uses its own networking stack (not `git-remote-https`). The remote is already configured in `.git/config`. Try:
1. Open GitHub Desktop, select "DraftoSLP Truth"
2. Check **Repository → Repository Settings → Remote** — should show `git@github.com:Shrutanjaya/Drafto-Electron.git`
3. Look for **"Push origin"** button in the toolbar
4. If GitHub warns about unrelated/diverged history, choose **Force Push** (Repository menu → Force Push, or hold ⌥ Option while clicking Push origin)

GitHub Desktop's built-in push avoids the `git-remote-https` issue entirely. This should be the first thing to try.

### Option C — Use a GitHub Personal Access Token via curl + git bundle

If neither A nor B works, create a git bundle and push it directly:

1. Create a PAT at https://github.com/settings/tokens (classic, `repo` scope)
2. Create a bundle:
   ```bash
   GIT="/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git"
   "$GIT" -C "/Users/arunbhardwaj/DraftoSLP" bundle create /tmp/drafto.bundle --all
   ```
3. On a different machine (or using curl on the Mac), use the GitHub API to push. OR: copy `/tmp/drafto.bundle` to the Windows machine and push from there:
   ```bash
   git clone /tmp/drafto.bundle drafto-from-bundle
   cd drafto-from-bundle
   git remote set-url origin https://TOKEN@github.com/Shrutanjaya/Drafto-Electron.git
   git push origin main --force
   ```

### Option D — Push from the Windows machine

The Windows machine has a working git setup. You can:
1. Copy the entire `/Users/arunbhardwaj/DraftoSLP` folder (excluding `node_modules/`, `dist-electron/`, `Windows Files/`, `Apple/`, `build/libreoffice-staging/`) to the Windows machine
2. On Windows, `cd` into the folder, then:
   ```bash
   git remote set-url origin https://github.com/Shrutanjaya/Drafto-Electron.git
   git push origin main --force
   ```

---

## After a Successful Push

Once the code is on GitHub, the next major task is **GitHub Actions CI/CD**. The plan:

1. Create `.github/workflows/release.yml` that triggers on `v*` version tags
2. **Mac job** (`macos-14` runner): install LibreOffice, import Developer ID cert from secrets, run `npm run dist:mac`, notarize
3. **Windows job** (`windows-latest` runner): run `bundle-deps-win.ps1`, run `npm run dist:win`
4. Both upload installers to the GitHub Release

### GitHub Secrets needed for Mac signing/notarization:
| Secret name | Value |
|---|---|
| `APPLE_IDENTITY` | `Savita Gour (5Q5VXZ5Z43)` |
| `APPLE_CERTIFICATE_P12` | Base64 of exported Developer ID Application .p12 certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the .p12 |
| `APPLE_KEY_ID` | `K8FL55TT98` |
| `APPLE_ISSUER_ID` | App Store Connect Issuer UUID (from appstoreconnect.apple.com) |
| `APPLE_KEY_CONTENT` | Base64 of `Apple/AuthKey_K8FL55TT98.p8` |
| `GH_TOKEN` | GitHub PAT with `contents: write` scope |

The `.p8` key file is at `/Users/arunbhardwaj/DraftoSLP/Apple/AuthKey_K8FL55TT98.p8` on the Mac Mini. **This file must never be pushed to GitHub** (it is in `.gitignore`). Convert to base64 for the secret: `base64 -i Apple/AuthKey_K8FL55TT98.p8 | pbcopy`

---

## Key Files Reference

| File | Purpose |
|---|---|
| `electron/main.js` | Main process; platform checks via `process.platform === "darwin"` |
| `electron/ipc/pdf-converter.js` | DOCX→PDF; Mac uses LibreOffice, Windows uses Python/docx2pdf |
| `electron/preload.js` | IPC bridge |
| `beforePack.js` | Mac build hook: stages LibreOffice from `/Applications/LibreOffice.app` |
| `afterSign.js` | Mac notarization hook via App Store Connect API |
| `python_scripts/convert_to_pdf.py` | Windows PDF conversion (docx2pdf) |
| `python_scripts/process_ocr.py` | Windows OCR (Tesseract + PyMuPDF) |
| `bundle-deps-win.ps1` | Windows build script: bundles Python + Tesseract + Ghostscript |
| `package.json` | electron-builder config; `mac.extraResources` = LibreOffice; `win.extraResources` = python/ + python_scripts/ |
| `Apple/AuthKey_K8FL55TT98.p8` | Apple API key — **never commit, stays local only** |
| `.gitignore` | Excludes: `node_modules/`, `dist/`, `dist-electron/`, `python/`, `build/libreoffice-staging/`, `Apple/`, `Apple.zip`, `Windows Files/`, `.env` |

---
name: project_release_process
description: "How DraftoSLP CI releases work — tag trigger, draft naming, asset overwrite, mac DMG quirk"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c860039-0f53-41dc-97c5-d355dfb748fd
---

DraftoSLP releases via `.github/workflows/release.yml`, triggered by pushing a `v*.*.*` git tag. Builds mac (macos-14) + windows (windows-latest) jobs, each running `electron-builder --<plat> --publish always`.

Non-obvious facts:
- electron-builder names the GitHub **release** by `package.json` version, NOT the triggering git tag. So a `v1.1.7` tag on a commit whose package.json says `1.1.8` drafts a **v1.1.8** release.
- The GitHub publisher **auto-overwrites** same-name assets on republish (422 already_exists → delete + re-upload, electron-publish gitHubPublisher.js). So re-running a release does not require manually deleting stale assets.
- **Tagging does NOT ship to customers — verified 2026-08-17.** `release.yml` has exactly two jobs (build-mac, build-windows) and no publish job at all; the auto-publish job was deleted, leaving only a comment where it was. electron-builder creates a **draft** release and uploads to it, and the draft stays a draft until published by hand (Releases page, or `gh release edit "<tag>" --draft=false --latest`). An earlier note here claimed releases auto-published because v2.0.0/v2.0.2/v2.0.3 all show `isDraft: false` with author `github-actions[bot]` — that author is whoever *created* the draft, not who published it. v2.0.3's build finished 09:58:35Z and the release was published 10:01:10Z: the user clicking Publish while watching the run. Still tell the user before tagging when a release changes customer-visible behaviour, because publishing is one click away.
- **Publishing while a platform is still building**: publishing only flips the draft flag; the still-running job keeps uploading into the same release, so the missing installers appear on an already-public release later. The catch is electron-updater, which polls `releases/latest` for `latest.yml` (Windows) / `latest-mac.yml` (Mac): until the mac job uploads, Mac customers' update checks fail against the new latest release. If the mac job then *fails* (see the failure modes below — they are not rare), a public release is left with no Mac build at all. Wait for both jobs to go green before publishing.
- Windows also bundles LibreOffice as of v1.2.2: CI step `choco install libreoffice-fresh`, beforePack.js stages `C:\Program Files\LibreOffice` → `build/libreoffice-win-staging/LibreOffice` via robocopy, embedded via `win.extraResources` → `resources/LibreOffice`. Used as a fallback when Word can't be driven for PDF conversion (the "Open.SaveAs" error).

Mac build failure modes (the `build-mac` step retries 3× for transient hdiutil flakes, but these are NOT transient):
- **Notarization HTTP 403 `FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`** (seen on v1.2.3): signing succeeds, then Apple's Notary API rejects the submission because a required Apple Developer Program agreement is unsigned/expired on the signing account (identity "Savita Gour", team 5Q5VXZ5Z43). NOT a code/CI bug — the account holder must accept the pending agreement in App Store Connect → Business → Agreements, Tax, and Banking (and confirm membership isn't lapsed). After fixing, just re-run the failed mac job (`gh run rerun <run-id> --failed`) on the same tag; no new commit/tag needed. Windows succeeds independently and its .exe is already in the draft.

Mac DMG quirk: the app embeds ~790 MB LibreOffice, making the DMG large. dmgbuild's shrink step (`hdiutil resize -> min`) fails with "Unable to shrink" under top-level `compression: maximum` (which forces UDBZ). Fixed in the `dmg` build block with `"format": "UDZO"` + `"shrink": false`. App signing/notarization/zip are unaffected by this — only DMG packaging.

To re-release a single platform: gate the other job with `if: ${{ false }}` on a commit reachable only by that release's tag (keep `main` clean so future tags build both). See [[feedback_verification]] — verify Drafto by asking the user, not screenshots.

# Building the macOS Installer

This document describes how to produce the signed, notarized DraftoSLP DMG
for distribution to end users on macOS.

The output is a single DMG containing one self-contained `DraftoSLP.app`.
Users drag DraftoSLP to /Applications. They do **not** need to install
LibreOffice separately — it is embedded inside DraftoSLP.app and is
invisible to the user.

---

## One-time machine setup

The build machine must have:

1. **macOS Sonoma or newer**, Apple Silicon. Cross-arch builds are not
   supported by this configuration.

2. **Node.js 20** and **npm 10** (matches `package.json` engines target).

3. **Xcode Command Line Tools** — required for `codesign`, `xcrun
   stapler`, and `ditto`. Install with:
   ```bash
   xcode-select --install
   ```

4. **LibreOffice (Still build)** installed at `/Applications/LibreOffice.app`.
   Download from https://www.libreoffice.org/download/download/, pick the
   "Still" channel, and drag to /Applications.

   The `beforePack.js` hook reads from this path at build time and copies
   it into `build/libreoffice-staging/` for embedding. If LibreOffice is
   not installed here, the build fails immediately with a clear error.

5. **Apple Developer ID Application certificate** in the Keychain,
   matching the identity declared in `package.json` under
   `build.mac.identity` (currently `"Savita Gour (5Q5VXZ5Z43)"`).

6. **App Store Connect API key** for notarization. The `afterSign.js`
   hook expects these environment variables:
   ```
   APPLE_API_KEY          # path to the .p8 private key file
   APPLE_API_KEY_ID       # the 10-character Key ID from App Store Connect
   APPLE_API_ISSUER       # the Issuer UUID from App Store Connect
   ```

   If any of these are missing, notarization is skipped (with a warning)
   and the resulting DMG will work on the build machine but trigger
   Gatekeeper warnings on other Macs.

---

## Build sequence

From the project root:

```bash
npm install
npm run dist:mac
```

What this does, in order:

1. **`npm run build`** compiles the Vite/React app to `dist/`.

2. **electron-builder** starts and invokes our `beforePack.js`:
   - Verifies `/Applications/LibreOffice.app` exists.
   - Wipes any old `build/libreoffice-staging/`.
   - `ditto`-copies LibreOffice into `build/libreoffice-staging/LibreOffice.app`,
     preserving framework symlinks and metadata.
   - Strips extended attributes with `xattr -cr` so notarization will
     accept the bundle.
   - Removes pre-existing `_CodeSignature` directories so our identity
     can re-sign every nested binary cleanly.
   - Logs the staged size (typically ~700 MB).

3. **electron-builder packs** Drafto.app, copying:
   - Vite output → `Contents/Resources/app.asar`
   - `python_scripts/` → `Contents/Resources/python_scripts/`
   - `build/libreoffice-staging/LibreOffice.app/` → `Contents/Resources/LibreOffice.app/`
   - `build/licenses/` → `Contents/Resources/licenses/`

4. **electron-builder signs** every Mach-O binary inside Drafto.app
   (including all nested LibreOffice binaries) with the Developer ID
   identity, hardened runtime, and the entitlements in
   `build/entitlements.mac.plist`. This step takes a few minutes because
   LibreOffice contains hundreds of dylibs.

5. **`afterSign.js`** zips the signed app, uploads it to Apple's
   notarization service via the App Store Connect API, polls for the
   Accepted status, and runs `xcrun stapler staple` to embed the
   notarization ticket so Gatekeeper can verify offline.

6. **electron-builder produces the DMG** at
   `dist-electron/DraftoSLP-<version>-arm64.dmg`. The DMG window shows
   DraftoSLP.app and an /Applications shortcut, side by side. That is
   the file you ship to users.

Typical end-to-end time on an M2 Pro is about 8–12 minutes, dominated
by the per-binary signing pass and Apple's notarization queue.

---

## Verifying the output

The `afterSign.js` hook now runs `xcrun stapler validate` and `spctl
--assess` automatically on the signed .app, and *throws* if either fails.
So if `npm run dist:mac` succeeds at all, the app inside the DMG is
guaranteed notarized and stapled.

But before publishing, do these three checks anyway — they catch issues
that can only appear after the .app is wrapped into a DMG and after a
download adds the quarantine attribute:

```bash
DMG="dist-electron/DraftoSLP-$(node -p "require('./package.json').version")-arm64.dmg"
hdiutil attach "$DMG"
VOL=$(ls -d /Volumes/DraftoSLP* | head -1)

# 1. The embedded LibreOffice is present and runnable
"$VOL/DraftoSLP.app/Contents/Resources/LibreOffice.app/Contents/MacOS/soffice" --version

# 2. The .app is signed with hardened runtime and stapled
codesign --verify --deep --strict --verbose=2 "$VOL/DraftoSLP.app"
xcrun stapler validate "$VOL/DraftoSLP.app"

# 3. Gatekeeper accepts the app as if a real user just downloaded it
spctl --assess --type execute --verbose=4 "$VOL/DraftoSLP.app"

hdiutil detach "$VOL"
```

The last command, `spctl --assess`, should print something like:

```
…/DraftoSLP.app: accepted
source=Notarized Developer ID
origin=Developer ID Application: Savita Gour (5Q5VXZ5Z43)
```

If it instead says `rejected` or `source=Unnotarized Developer ID`, **do
not ship**. Re-run the build and check the `[notarize]` lines in the
electron-builder output — afterSign.js logs each step explicitly.

## Pre-flight checklist for every release

Before running `npm run dist:mac`:

```bash
echo "APPLE_API_KEY       = ${APPLE_API_KEY:-MISSING}"
echo "APPLE_API_KEY_ID    = ${APPLE_API_KEY_ID:-MISSING}"
echo "APPLE_API_ISSUER    = ${APPLE_API_ISSUER:-MISSING}"
xcrun --find stapler && echo "xcrun stapler: present"
ls -d /Applications/LibreOffice.app && echo "LibreOffice: present"
security find-identity -v -p codesigning | grep "Savita Gour"
```

All five should report a real value / "present" / a matching identity.
If any of them is missing, `npm run dist:mac` will now fail loudly with
a clear error message instead of producing an unnotarized DMG.

---

## Updating the bundled LibreOffice

When The Document Foundation releases a new LibreOffice Still version:

1. Download and install the new LibreOffice.app to `/Applications`.
2. Re-run `npm run dist:mac`.

The `beforePack.js` hook re-stages from `/Applications/LibreOffice.app`
on every build, so updates pick up automatically. No code changes are
required in DraftoSLP itself.

---

## What ends up in the user's /Applications

A single `DraftoSLP.app` bundle, around 900 MB on disk. From the user's
point of view it is one app, one icon, one uninstall. Internally:

```
DraftoSLP.app/
├── Contents/
│   ├── MacOS/DraftoSLP                         (Electron binary)
│   ├── Resources/
│   │   ├── app.asar                            (React/Vite code)
│   │   ├── python_scripts/                     (unused on macOS)
│   │   ├── licenses/                           (MPL-2.0 + notices)
│   │   └── LibreOffice.app/                    (embedded, ~700 MB)
│   │       └── Contents/MacOS/soffice          (← invoked for PDF conv)
```

The user never sees LibreOffice in their Dock, in their Applications
folder, or in their menu bar.

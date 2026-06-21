/**
 * electron-builder `beforePack` hook.
 *
 * On macOS builds, stages a clean copy of LibreOffice.app under
 * ./build/libreoffice-staging/ so it can be picked up by the
 * `mac.extraResources` rule in package.json and embedded inside
 * Drafto.app/Contents/Resources/LibreOffice.app at pack time.
 *
 * Why a staging copy:
 *  1. We use `ditto` to preserve all macOS metadata, internal symlinks,
 *     framework structure, etc. — a plain `cp -r` corrupts LibreOffice.
 *  2. We strip extended attributes (com.apple.quarantine, ResourceFork,
 *     Finder info) up-front; if these leak into the signed bundle, Apple
 *     notarization rejects it with the famous
 *       "resource fork, Finder information, or similar detritus not allowed"
 *     error.
 *  3. We remove the existing _CodeSignature directories from every nested
 *     .app, .framework, and .bundle so electron-builder can re-sign every
 *     Mach-O binary with the Drafto Developer ID under hardened runtime,
 *     applying our entitlements (DYLD env vars, JIT, library validation
 *     disabled). Without this, re-signing intermittently fails with
 *     "code object is not signed at all" on certain nested binaries.
 *
 * The staging dir is excluded from electron-builder's `files` glob via
 * the `!build/libreoffice-staging/**` rule in package.json, so it does
 * not also get copied into the asar; it is consumed exclusively via the
 * mac.extraResources rule.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const LIBREOFFICE_SOURCE = "/Applications/LibreOffice.app";

// Candidate install locations for LibreOffice on a Windows build machine
// (choco's `libreoffice-fresh`/`libreoffice-still` install to Program Files).
const LIBREOFFICE_WIN_SOURCES = [
  "C:\\Program Files\\LibreOffice",
  "C:\\Program Files (x86)\\LibreOffice",
];

exports.default = async function beforePack(context) {
  // ── Windows: stage LibreOffice into build/libreoffice-win-staging ──────────
  // Embedded later via win.extraResources → resources/LibreOffice. Used as the
  // fallback when Microsoft Word can't be automated (the "Open.SaveAs" failure).
  if (context.electronPlatformName === "win32") {
    const source = LIBREOFFICE_WIN_SOURCES.find((p) => fs.existsSync(p));
    if (!source) {
      throw new Error(
        "[beforePack] LibreOffice not found in Program Files.\n" +
        "             Install it before building Windows, e.g.:\n" +
        "               choco install libreoffice-fresh --no-progress -y"
      );
    }
    const stagingDir = path.join(context.packager.projectDir, "build", "libreoffice-win-staging");
    const stagedApp  = path.join(stagingDir, "LibreOffice");
    if (fs.existsSync(stagingDir)) {
      console.log(`[beforePack] Removing previous Windows staging copy: ${stagingDir}`);
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    fs.mkdirSync(stagedApp, { recursive: true });
    console.log(`[beforePack] Staging LibreOffice from ${source} via robocopy…`);
    // robocopy exit codes < 8 indicate success; execSync treats non-zero as an
    // error, so swallow those and only fail on >= 8.
    try {
      execSync(`robocopy "${source}" "${stagedApp}" /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1`, { stdio: "inherit" });
    } catch (e) {
      const code = typeof e.status === "number" ? e.status : 16;
      if (code >= 8) {
        throw new Error(`[beforePack] robocopy failed staging LibreOffice (exit ${code}).`);
      }
    }
    try {
      const sizeOutput = execSync(`powershell -NoProfile -Command "'{0:N0} MB' -f ((Get-ChildItem -Recurse '${stagedApp}' | Measure-Object -Property Length -Sum).Sum / 1MB)"`, { encoding: "utf8" }).trim();
      console.log(`[beforePack] LibreOffice staged: ${sizeOutput}`);
    } catch {}
    console.log(`[beforePack] LibreOffice ready for embedding into resources/LibreOffice`);
    return;
  }

  // Linux builds: nothing to do.
  if (context.electronPlatformName !== "darwin") return;

  const projectRoot   = context.packager.projectDir;
  const stagingDir    = path.join(projectRoot, "build", "libreoffice-staging");
  const stagedApp     = path.join(stagingDir, "LibreOffice.app");

  // 1. Verify the build machine actually has LibreOffice installed.
  if (!fs.existsSync(LIBREOFFICE_SOURCE)) {
    throw new Error(
      `[beforePack] LibreOffice.app not found at ${LIBREOFFICE_SOURCE}.\n` +
      `             Install LibreOffice (Still build) from https://www.libreoffice.org\n` +
      `             before running 'npm run dist:mac'. The build machine's copy\n` +
      `             is what gets bundled into Drafto.app.`
    );
  }

  // 2. Wipe and recreate the staging directory.
  if (fs.existsSync(stagingDir)) {
    console.log(`[beforePack] Removing previous staging copy: ${stagingDir}`);
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  // 3. ditto preserves HFS+/APFS metadata, internal symlinks, and the
  //    framework "Current" symlink structure that LibreOffice depends on.
  //    --rsrc preserves resource forks, --extattr preserves xattrs (we
  //    strip them after, but the framework symlinks need to come through
  //    intact first).
  console.log(`[beforePack] Staging LibreOffice.app via ditto…`);
  execSync(`/usr/bin/ditto "${LIBREOFFICE_SOURCE}" "${stagedApp}"`, {
    stdio: "inherit",
  });

  // 4. Strip extended attributes that would fail notarization.
  console.log(`[beforePack] Stripping extended attributes…`);
  execSync(`/usr/bin/xattr -cr "${stagedApp}"`, { stdio: "inherit" });

  // 5. Remove existing _CodeSignature directories so electron-builder's
  //    codesign --force can write fresh signatures with our identity and
  //    our entitlements. Without this, re-signing nested .frameworks and
  //    .bundles sometimes fails with "bundle format unrecognized, invalid,
  //    or unsuitable".
  console.log(`[beforePack] Removing pre-existing _CodeSignature directories…`);
  execSync(
    `/usr/bin/find "${stagedApp}" -type d -name "_CodeSignature" -prune -exec rm -rf {} +`,
    { stdio: "inherit" }
  );

  // 6. Report size so the developer knows what they are bundling.
  try {
    const sizeOutput = execSync(`/usr/bin/du -sh "${stagedApp}"`, {
      encoding: "utf8",
    }).trim();
    console.log(`[beforePack] LibreOffice staged: ${sizeOutput}`);
  } catch {}

  console.log(`[beforePack] LibreOffice ready for embedding into Drafto.app`);
};

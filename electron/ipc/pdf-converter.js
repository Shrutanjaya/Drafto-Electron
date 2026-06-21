/**
 * PDF conversion handler for the Electron main process.
 * Called via ipcMain.handle("convert-docx-to-pdf", ...)
 * Replaces the Server Action convertWithDocx2Pdf() from actions.ts.
 *
 * macOS conversion priority:
 *   1. LibreOffice soffice  (highest fidelity, requires LibreOffice installation)
 *   2. Microsoft Word via JXA  (requires Word; exportAsFixedFormat silently no-ops
 *      on macOS Tahoe 26.x, so this is treated as non-fatal and falls through)
 *   3. macOS textutil + Electron printToPDF  (built-in, no external tools needed;
 *      lower formatting fidelity but always available)
 */
const { exec } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const fs = require("fs");
const os = require("os");

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Helper: textutil (DOCX → HTML) + Electron BrowserWindow.printToPDF
// ---------------------------------------------------------------------------
async function convertWithTextutilAndPrintToPDF(docxPath, pdfPath) {
  const { BrowserWindow } = require("electron");
  const htmlPath = path.join(os.tmpdir(), `drafto_html_${Date.now()}.html`);

  // Escape double-quotes in paths for the shell command.
  const esc = (p) => p.replace(/"/g, '\\"');
  await execAsync(`textutil -convert html "${esc(docxPath)}" -output "${esc(htmlPath)}"`, { timeout: 30000 });

  if (!fs.existsSync(htmlPath)) {
    throw new Error("textutil produced no HTML output");
  }

  await new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    const cleanup = () => {
      try { win.destroy(); } catch {}
      try { fs.unlinkSync(htmlPath); } catch {}
    };

    win.webContents.once("did-finish-load", async () => {
      try {
        const pdfData = await win.webContents.printToPDF({
          pageSize: "A4",
          printBackground: false,
          margins: {
            marginType: "custom",
            top: 1,      // inches
            bottom: 1,
            left: 1.5,   // extra left margin for binding
            right: 1,
          },
        });
        fs.writeFileSync(pdfPath, pdfData);
        cleanup();
        resolve();
      } catch (e) {
        cleanup();
        reject(new Error(`printToPDF failed: ${e.message}`));
      }
    });

    win.webContents.once("did-fail-load", (_ev, code, desc) => {
      cleanup();
      reject(new Error(`HTML load failed (${code}): ${desc}`));
    });

    win.loadFile(htmlPath);
  });
}

// ---------------------------------------------------------------------------
// Helper: LibreOffice headless conversion (cross-platform)
// ---------------------------------------------------------------------------
async function convertWithSoffice(docxPath, pdfPath, sofficeCommand) {
  if (!sofficeCommand || !fs.existsSync(sofficeCommand)) {
    throw new Error("LibreOffice (soffice) was not found.");
  }
  const outDir = path.dirname(pdfPath);
  const stem = path.basename(docxPath, path.extname(docxPath));
  const sofficePdfPath = path.join(outDir, stem + ".pdf");

  // Use a private, per-conversion user profile. This avoids the single-instance
  // lock (soffice refuses to start headless if another LibreOffice is open) and
  // sidesteps a read-only/locked profile under Program Files on Windows.
  const profileDir = path.join(os.tmpdir(), `drafto_lo_profile_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const profileUrl = "file:///" + profileDir.replace(/\\/g, "/");
  const cmd = `"${sofficeCommand}" -env:UserInstallation=${profileUrl} --headless --norestore --convert-to pdf --outdir "${outDir}" "${docxPath}"`;

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
    console.log("[PDF] soffice stdout:", stdout);
    if (stderr) console.warn("[PDF] soffice stderr:", stderr);
  } catch (e) {
    throw new Error(`LibreOffice conversion failed: ${e.message}`);
  } finally {
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }
  if (!fs.existsSync(sofficePdfPath)) {
    throw new Error(`LibreOffice did not produce output PDF at: ${sofficePdfPath}`);
  }
  if (sofficePdfPath !== pdfPath) fs.renameSync(sofficePdfPath, pdfPath);
}

async function convertWithDocx2Pdf(docxPath, pdfPath, { pythonCommand, pythonScriptsPath, sofficeCommand }) {
  if (process.platform === "darwin") {
    // ── 1. LibreOffice soffice (best quality) ─────────────────────────────
    if (sofficeCommand && fs.existsSync(sofficeCommand)) {
      await convertWithSoffice(docxPath, pdfPath, sofficeCommand);
      return;
    }

    // NOTE: Microsoft Word's exportAsFixedFormat Apple Event silently no-ops
    // on macOS Tahoe 26.x (confirmed via telemetry log analysis — no internal
    // activity is triggered and no file is written anywhere on disk). The Word
    // JXA branch has been removed to avoid the unnecessary ~10 s delay it added
    // to every PDF export while producing no benefit.

    // ── 2. macOS textutil + Electron printToPDF (built-in fallback) ───────
    try {
      await convertWithTextutilAndPrintToPDF(docxPath, pdfPath);
      if (fs.existsSync(pdfPath)) return;
    } catch (e) {
      console.warn("[PDF] textutil+printToPDF fallback failed:", e.message);
      throw new Error(
        "PDF conversion failed on macOS.\n" +
        "For best results, install LibreOffice (free): https://libreoffice.org\n" +
        `Detail: ${e.message}`
      );
    }

    throw new Error(
      "PDF conversion failed on macOS. " +
      "Please install LibreOffice from https://libreoffice.org and restart the app."
    );
  }

  // ── Windows / Linux ──────────────────────────────────────────────────────
  // 1. Microsoft Word via bundled Python (highest fidelity; the hardened
  //    convert_to_pdf.py clears the common "Open.SaveAs" failure modes).
  // 2. Fall back to bundled LibreOffice if Word can't be driven at all
  //    (Word not installed, or stuck behind a modal it can't clear).

  const pyCmd = pythonCommand || "python";
  const scriptPath = path.join(pythonScriptsPath || "", "convert_to_pdf.py");

  let wordError = null;
  if (fs.existsSync(scriptPath)) {
    const cmd = `"${pyCmd}" "${scriptPath}" "${docxPath}" "${pdfPath}"`;
    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
      if (stdout.includes("SUCCESS") && fs.existsSync(pdfPath)) return;
      wordError = stderr || stdout || "Unknown Word conversion error.";
    } catch (e) {
      // execAsync rejects on non-zero exit; capture its stderr for context.
      wordError = (e && (e.stderr || e.message)) || "Word conversion process failed.";
    }
    console.warn("[PDF] Word/docx2pdf path failed, trying LibreOffice fallback:", wordError);
  } else {
    wordError = `Python script not found at: ${scriptPath}`;
  }

  // Fallback: bundled LibreOffice.
  if (sofficeCommand && fs.existsSync(sofficeCommand)) {
    try {
      await convertWithSoffice(docxPath, pdfPath, sofficeCommand);
      if (fs.existsSync(pdfPath)) return;
    } catch (e) {
      throw new Error(
        "PDF conversion failed.\n" +
        `Microsoft Word: ${wordError}\n` +
        `LibreOffice: ${e.message}`
      );
    }
  }

  // No fallback available — surface a clear, actionable message.
  let msg = "PDF conversion failed. ";
  if (wordError && (wordError.includes("No module named") || wordError.includes("docx2pdf"))) {
    msg += "Please install docx2pdf: pip install docx2pdf";
  } else {
    msg +=
      "Microsoft Word could not be automated and LibreOffice was not available. " +
      `Detail: ${wordError || "Unknown error."}`;
  }
  throw new Error(msg);
}

module.exports = { convertWithDocx2Pdf };

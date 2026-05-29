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

async function convertWithDocx2Pdf(docxPath, pdfPath, { pythonCommand, pythonScriptsPath, sofficeCommand }) {
  if (process.platform === "darwin") {
    // ── 1. LibreOffice soffice (best quality) ─────────────────────────────
    if (sofficeCommand && fs.existsSync(sofficeCommand)) {
      const outDir = path.dirname(pdfPath);
      const stem = path.basename(docxPath, path.extname(docxPath));
      const sofficePdfPath = path.join(outDir, stem + ".pdf");
      const cmd = `"${sofficeCommand}" --headless --convert-to pdf --outdir "${outDir}" "${docxPath}"`;
      try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
        console.log("[PDF] soffice stdout:", stdout);
        if (stderr) console.warn("[PDF] soffice stderr:", stderr);
      } catch (e) {
        throw new Error(`LibreOffice conversion failed: ${e.message}`);
      }
      if (!fs.existsSync(sofficePdfPath)) {
        throw new Error(`LibreOffice did not produce output PDF at: ${sofficePdfPath}`);
      }
      if (sofficePdfPath !== pdfPath) fs.renameSync(sofficePdfPath, pdfPath);
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

  // Windows / Linux: bundled Python + docx2pdf

  const pyCmd = pythonCommand || "python";
  const scriptPath = path.join(pythonScriptsPath || "", "convert_to_pdf.py");

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Python script not found at: ${scriptPath}`);
  }

  const cmd = `"${pyCmd}" "${scriptPath}" "${docxPath}" "${pdfPath}"`;
  const { stdout, stderr } = await execAsync(cmd, { timeout: 60000 });

  if (!stdout.includes("SUCCESS")) {
    let msg = "PDF conversion failed. ";
    if (stderr.includes("No module named") || stderr.includes("docx2pdf")) {
      msg += "Please install docx2pdf: pip install docx2pdf";
    } else {
      msg += stderr || "Unknown error.";
    }
    throw new Error(msg);
  }
}

module.exports = { convertWithDocx2Pdf };

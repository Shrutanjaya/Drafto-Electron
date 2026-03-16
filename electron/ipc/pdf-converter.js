/**
 * PDF conversion handler for the Electron main process.
 * Called via ipcMain.handle("convert-docx-to-pdf", ...)
 * Replaces the Server Action convertWithDocx2Pdf() from actions.ts.
 */
const { exec } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const fs = require("fs");
const os = require("os");

const execAsync = promisify(exec);

async function convertWithDocx2Pdf(docxPath, pdfPath, { pythonCommand, pythonScriptsPath, sofficeCommand }) {
  if (process.platform === "darwin") {
    // 1. LibreOffice soffice
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

    // 2. Microsoft Word via AppleScript
    if (fs.existsSync("/Applications/Microsoft Word.app")) {
      const scriptPath = path.join(os.tmpdir(), `word_conv_${Date.now()}.applescript`);
      const safeDocx = docxPath.replace(/"/g, '\\"');
      const safePdf  = pdfPath.replace(/"/g, '\\"');
      const scriptContent = [
        'tell application "Microsoft Word"',
        `  open POSIX file "${safeDocx}"`,
        "  set theDoc to active document",
        "  try",
        "    set window state of window 1 of theDoc to wdWindowStateMinimize",
        "  end try",
        `  save as theDoc file name "${safePdf}" file format format PDF`,
        "  close theDoc saving no",
        "end tell",
      ].join("\n");
      fs.writeFileSync(scriptPath, scriptContent, "utf-8");
      try {
        await execAsync(`osascript "${scriptPath}"`, { timeout: 120000 });
      } catch (e) {
        throw new Error(`Microsoft Word PDF conversion failed: ${e.message}`);
      } finally {
        try { fs.unlinkSync(scriptPath); } catch {}
      }
      if (!fs.existsSync(pdfPath)) {
        throw new Error("Microsoft Word did not produce the output PDF file");
      }
      return;
    }

    throw new Error(
      "PDF conversion requires Microsoft Word or LibreOffice on macOS. " +
      "Please install one of them and restart the app."
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

// ── PDF text extraction for the AI plugin ────────────────────────────────────
// Extracts the text layer from every PDF in a folder using pdf.js (pure JS, no
// native deps), writes the text to plain .txt files in a temp "context" folder,
// and reports which pages are scanned (image-only) plus an approximate token
// estimate. The assistant is then pointed at the cheap text; scanned pages are
// only read as images after the user confirms the cost. Source PDFs are never
// modified.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// A page with fewer than this many extracted characters is treated as a scanned
// image (no usable text layer).
const SCANNED_TEXT_THRESHOLD = 15;
// Rough vision cost of reading one rendered page as an image.
const IMAGE_TOKENS_PER_PAGE = 1500;

// Use the CommonJS *legacy* build (pdfjs-dist v3): it works on the Node 18
// runtime bundled with Electron 28 (the ESM v6 build needs Node 22's
// Promise.withResolvers and fails inside Electron). Loaded once, lazily.
let pdfjsLib = null;
function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
    // Point the (fake, main-thread) worker at its module so Node doesn't warn;
    // if this fails pdf.js still falls back gracefully.
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");
    } catch { /* fake worker fallback */ }
  }
  return pdfjsLib;
}

// ~4 chars per token is a good rough estimate for English/legal prose.
function estTextTokens(s) {
  return Math.ceil((s || "").length / 4);
}

async function extractPdfPages(pdfPath) {
  const pdfjs = getPdfjs();
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => (it.str || "")).join(" ").replace(/\s+/g, " ").trim();
    pages.push(text);
    page.cleanup();
  }
  await pdf.cleanup();
  return pages;
}

// Scan a folder of PDFs. Returns:
//   { ok, contextDir, files:[{name, originalPath, pageCount, scannedPages, txtName, error?}],
//     textTokens, scannedPageCount, imageTokens }
async function scanFolder(folderPath) {
  let entries;
  try {
    entries = fs.readdirSync(folderPath).filter((f) => f.toLowerCase().endsWith(".pdf"));
  } catch (e) {
    return { ok: false, error: `Couldn't read that folder: ${e.message}` };
  }
  if (entries.length === 0) return { ok: false, error: "No PDF files found in that folder." };

  const contextDir = path.join(os.tmpdir(), `drafto-ai-${crypto.randomBytes(6).toString("hex")}`);
  fs.mkdirSync(contextDir, { recursive: true });

  const files = [];
  let textTokens = 0;
  let scannedPageCount = 0;
  let extractedAny = false;
  let lastError = null;

  for (const name of entries) {
    const full = path.join(folderPath, name);
    let pages;
    try {
      pages = await extractPdfPages(full);
      extractedAny = true;
    } catch (e) {
      lastError = e.message;
      files.push({ name, originalPath: full, pageCount: 0, scannedPages: [], error: e.message });
      continue;
    }

    const scannedPages = [];
    const lines = [];
    pages.forEach((t, idx) => {
      const pno = idx + 1;
      if (t.length < SCANNED_TEXT_THRESHOLD) {
        scannedPages.push(pno);
        lines.push(`[Page ${pno}: scanned image — no extractable text]`);
      } else {
        textTokens += estTextTokens(t);
        lines.push(`[Page ${pno}]\n${t}`);
      }
    });
    scannedPageCount += scannedPages.length;

    const txtName = name.replace(/\.pdf$/i, "") + ".txt";
    try {
      fs.writeFileSync(path.join(contextDir, txtName), `Source document: ${name}\n\n${lines.join("\n\n")}\n`, "utf8");
    } catch { /* ignore individual write failures */ }
    files.push({ name, originalPath: full, pageCount: pages.length, scannedPages, txtName });
  }

  // If not a single PDF could be read, don't hand Claude an empty folder —
  // surface the failure so the user sees a clear message.
  if (!extractedAny) {
    try { fs.rmSync(contextDir, { recursive: true, force: true }); } catch {}
    return { ok: false, error: `Couldn't read any text from the PDFs${lastError ? ` (${lastError})` : ""}.` };
  }

  return {
    ok: true,
    contextDir,
    files,
    textTokens,
    scannedPageCount,
    imageTokens: scannedPageCount * IMAGE_TOKENS_PER_PAGE,
  };
}

module.exports = { scanFolder };

// ── Source-document text extraction for the AI plugin ────────────────────────
// Extracts the text layer from every source document (PDF via pdf.js, DOCX via
// jszip) in a folder or from an explicit file list, writes the text to plain
// .txt files in a temp "context" folder, and reports which pages are scanned
// (image-only) plus an approximate token estimate. The assistant is then pointed
// at the cheap text; scanned pages are only read as images after the user
// confirms the cost. Source files are never modified.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { macSupportsVision, recognisePdfPages } = require("./mac-ocr");

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

// Extract readable text from a .docx (a zip of XML). Word has no fixed pages, so
// the whole document is returned as one text blob; paragraph/tab/line breaks are
// preserved, then all XML tags are stripped (text lives only inside <w:t>).
async function extractDocxText(docxPath) {
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(fs.readFileSync(docxPath));
  const entry = zip.file("word/document.xml");
  if (!entry) return "";
  let xml = await entry.async("string");
  xml = xml
    .replace(/<w:tab\b[^>]*\/?>/g, "\t")
    .replace(/<w:br\b[^>]*\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n");
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Shared processor. `sources` is a list of { name, full }. Returns the same shape
// as before: { ok, contextDir, files, textTokens, scannedPageCount, imageTokens }.
async function processSources(sources) {
  const contextDir = path.join(os.tmpdir(), `drafto-ai-${crypto.randomBytes(6).toString("hex")}`);
  fs.mkdirSync(contextDir, { recursive: true });

  const files = [];
  let textTokens = 0;
  let scannedPageCount = 0;
  let extractedAny = false;
  let lastError = null;

  // Keep txt names unique even if two sources share a base name.
  const usedTxt = new Set();
  const uniqueTxt = (base) => {
    let t = `${base}.txt`;
    let n = 1;
    while (usedTxt.has(t)) t = `${base}-${n++}.txt`;
    usedTxt.add(t);
    return t;
  };

  for (const { name, full } of sources) {
    const isDocx = /\.docx$/i.test(name);
    try {
      if (isDocx) {
        const text = await extractDocxText(full);
        extractedAny = true;
        textTokens += estTextTokens(text);
        const txtName = uniqueTxt(name.replace(/\.docx$/i, ""));
        fs.writeFileSync(path.join(contextDir, txtName), `Source document: ${name}\n\n[Page 1]\n${text}\n`, "utf8");
        // Word has no fixed pages; report as a single page, never "scanned".
        files.push({ name, originalPath: full, pageCount: 1, scannedPages: [], txtName });
      } else {
        const pages = await extractPdfPages(full);
        extractedAny = true;
        const scannedPages = [];
        const lines = [];

        // Pages with no text layer: on macOS, recognise them locally with the
        // system's own text recognition before falling back to sending images to
        // the model. Free, and it keeps a scanned paper-book affordable.
        const noTextPages = pages
          .map((t, i) => (t.length < SCANNED_TEXT_THRESHOLD ? i + 1 : 0))
          .filter(Boolean);
        let recognised = {};
        if (noTextPages.length > 0 && macSupportsVision()) {
          try {
            recognised = await recognisePdfPages(full, noTextPages);
          } catch { /* fall through to the image path */ }
        }

        pages.forEach((t, idx) => {
          const pno = idx + 1;
          if (t.length < SCANNED_TEXT_THRESHOLD) {
            const ocr = recognised[pno];
            if (ocr && ocr.length >= SCANNED_TEXT_THRESHOLD) {
              // Recovered locally — the model reads it as ordinary text.
              textTokens += estTextTokens(ocr);
              lines.push(`[Page ${pno}] (read by text recognition)\n${ocr}`);
            } else {
              scannedPages.push(pno);
              lines.push(`[Page ${pno}: scanned image — no extractable text]`);
            }
          } else {
            textTokens += estTextTokens(t);
            lines.push(`[Page ${pno}]\n${t}`);
          }
        });
        scannedPageCount += scannedPages.length;
        const txtName = uniqueTxt(name.replace(/\.pdf$/i, ""));
        try {
          fs.writeFileSync(path.join(contextDir, txtName), `Source document: ${name}\n\n${lines.join("\n\n")}\n`, "utf8");
        } catch { /* ignore individual write failures */ }
        files.push({ name, originalPath: full, pageCount: pages.length, scannedPages, txtName });
      }
    } catch (e) {
      lastError = e.message;
      files.push({ name, originalPath: full, pageCount: 0, scannedPages: [], error: e.message });
    }
  }

  if (!extractedAny) {
    try { fs.rmSync(contextDir, { recursive: true, force: true }); } catch {}
    return { ok: false, error: `Couldn't read any text from the documents${lastError ? ` (${lastError})` : ""}.` };
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

// Scan a folder of source documents (PDF + DOCX).
async function scanFolder(folderPath) {
  let entries;
  try {
    entries = fs.readdirSync(folderPath).filter((f) => /\.(pdf|docx)$/i.test(f));
  } catch (e) {
    return { ok: false, error: `Couldn't read that folder: ${e.message}` };
  }
  if (entries.length === 0) return { ok: false, error: "No PDF or Word files found in that folder." };
  return processSources(entries.map((name) => ({ name, full: path.join(folderPath, name) })));
}

// Scan an explicit list of picked files (PDF + DOCX).
async function scanFiles(filePaths) {
  const list = (filePaths || []).filter((p) => /\.(pdf|docx)$/i.test(p));
  if (list.length === 0) return { ok: false, error: "No PDF or Word files selected." };
  return processSources(list.map((full) => ({ name: path.basename(full), full })));
}

module.exports = { scanFolder, scanFiles };

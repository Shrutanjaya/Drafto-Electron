// ── Deterministic PDF splitting for the AI annexure flow ─────────────────────
// Given an approved document map (page ranges within source PDFs), cut each
// document into its own PDF with pdf-lib (exact, no model involved) and write it
// to a managed folder next to the .drafto project. Source PDFs are never
// modified.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

function sanitize(name) {
  return String(name || "document")
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "document";
}

// Where split files go: "<project>-annexures" next to the .drafto file, or a
// temp folder if the project hasn't been saved yet.
function resolveOutputDir(projectPath) {
  if (projectPath && typeof projectPath === "string") {
    const base = path.basename(projectPath).replace(/\.drafto$/i, "");
    const dir = path.join(path.dirname(projectPath), `${base}-annexures`);
    fs.mkdirSync(dir, { recursive: true });
    return { dir, managed: true };
  }
  const dir = path.join(os.tmpdir(), `drafto-annexures-${crypto.randomBytes(4).toString("hex")}`);
  fs.mkdirSync(dir, { recursive: true });
  return { dir, managed: false };
}

function uniquePath(dir, fileName) {
  let candidate = path.join(dir, fileName);
  if (!fs.existsSync(candidate)) return candidate;
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, -ext.length);
  let n = 2;
  while (fs.existsSync((candidate = path.join(dir, `${stem}-${n}${ext}`)))) n++;
  return candidate;
}

// documents: [{ id, sourcePath, startPage, endPage, title }]  (1-indexed pages)
// Returns { ok, outputDir, results:[{ id, ok, filePath?, error? }] }.
async function splitDocuments({ projectPath, documents }) {
  const { PDFDocument } = require("pdf-lib");
  const { dir: outputDir, managed } = resolveOutputDir(projectPath);

  const loaded = new Map(); // sourcePath -> { doc, pageCount }
  async function getSource(sourcePath) {
    if (loaded.has(sourcePath)) return loaded.get(sourcePath);
    const bytes = fs.readFileSync(sourcePath);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const entry = { doc, pageCount: doc.getPageCount() };
    loaded.set(sourcePath, entry);
    return entry;
  }

  const results = [];
  let idx = 0;
  for (const d of documents || []) {
    idx++;
    try {
      const src = await getSource(d.sourcePath);
      const start = Math.max(1, d.startPage);
      const end = Math.min(src.pageCount, d.endPage);
      if (end < start) throw new Error("invalid page range");
      const indices = [];
      for (let p = start - 1; p <= end - 1; p++) indices.push(p);

      const out = await PDFDocument.create();
      const pages = await out.copyPages(src.doc, indices);
      pages.forEach((p) => out.addPage(p));
      const bytes = await out.save();

      const fileName = `${String(idx).padStart(2, "0")}-${sanitize(d.title)}.pdf`;
      const filePath = uniquePath(outputDir, fileName);
      fs.writeFileSync(filePath, bytes);
      results.push({ id: d.id, ok: true, filePath });
    } catch (e) {
      results.push({ id: d.id, ok: false, error: e.message });
    }
  }

  return { ok: true, outputDir, managed, results };
}

module.exports = { splitDocuments };

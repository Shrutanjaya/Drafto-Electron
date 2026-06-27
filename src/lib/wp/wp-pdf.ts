// Writ Petition (Delhi HC) PDF assembly. Generates the WP component docx files,
// converts each to PDF (LibreOffice via electron IPC), merges them into one
// paper-book, stamps continuous top-right page numbers (the Index is left
// unnumbered, numbering starts at 1 on the Notice of Motion), and adds
// per-component bookmarks.
//
// v1 assembles the GENERATED components (front matter + petition + CMs +
// vakalatnama). Interleaving uploaded annexure PDFs, the Court Fee / Proof of
// Service, signed Affidavit/Vakalatnama overlays, nested colly bookmarks, and
// back-filling the Index page numbers are the next increment.

import { PDFDocument, StandardFonts, rgb, PDFDict, PDFName, PDFArray, PDFString, PDFNumber, type PDFRef } from "pdf-lib";
import { convertDocxToPdf as ipcConvertDocxToPdf } from "@/lib/ipc/pdf";
import type { DraftoProject } from "@/lib/schema";
import { wpAnnexureOrder } from "./wp-annexures";
import {
  generateWpIndex,
  generateWpNoticeOfMotion,
  generateWpUrgencyApplication,
  generateWpMemoOfParties,
  generateWpSynopsisAndLod,
  generateWpPetition,
  generateWpAffidavit,
  generateWpSingleCm,
  generateWpVakalatnama,
  wpActiveCms,
  wpCmTitle,
} from "./wp-actions";
import { factsAnnexureSentence } from "./wp-facts";

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// Chunked to avoid call-stack overflow on large paper-books.
function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

async function docxToPdf(docxB64: string): Promise<PDFDocument> {
  const res = await ipcConvertDocxToPdf(b64ToBytes(docxB64));
  if (!res.success || !res.pdfBase64) throw new Error(res.error || "PDF conversion failed");
  return PDFDocument.load(b64ToBytes(res.pdfBase64));
}

interface WpBookmark {
  title: string;
  pageIndex: number;
  startPage?: number;
  endPage?: number;
  children?: WpBookmark[]; // nested constituents (colly annexures)
}

// Read an annexure/constituent file to bytes (File object, or disk path via the
// electron IPC).
async function fileBytes(file: any, filePath?: string): Promise<Uint8Array | null> {
  try {
    if (file && typeof file.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
    const el = (typeof window !== "undefined" ? (window as any).electron : null);
    if (filePath && el?.readFileByPath) {
      const res = await el.readFileByPath(filePath);
      if (res?.data) return b64ToBytes(res.data);
    }
  } catch { /* ignore */ }
  return null;
}

// Bytes → a PDFDocument. PDFs load directly; images (PNG/JPG) become a one-page
// PDF. Returns null if neither works.
async function pdfFromBytes(bytes: Uint8Array): Promise<PDFDocument | null> {
  try { return await PDFDocument.load(bytes, { ignoreEncryption: true }); } catch { /* not a PDF */ }
  try {
    const d = await PDFDocument.create();
    let img;
    try { img = await d.embedPng(bytes); } catch { img = await d.embedJpg(bytes); }
    const pg = d.addPage([img.width, img.height]);
    pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    return d;
  } catch { /* not an image either */ }
  return null;
}

// Build one outline dict (recursively for children). Returns its ref and the
// number of descendants (for the parent's Count).
function buildOutline(ctx: any, pages: any[], bm: WpBookmark): { ref: PDFRef; count: number } {
  const pageRef = pages[bm.pageIndex].ref;
  const h = pages[bm.pageIndex].getHeight();
  let title = bm.title;
  if (bm.startPage !== undefined && bm.endPage !== undefined) {
    title += bm.startPage === bm.endPage ? ` [p.${bm.startPage}]` : ` [pp.${bm.startPage}-${bm.endPage}]`;
  }
  const d = PDFDict.withContext(ctx);
  d.set(PDFName.of("Title"), PDFString.of(title));
  const dest = PDFArray.withContext(ctx);
  dest.push(pageRef); dest.push(PDFName.of("XYZ")); dest.push(PDFNumber.of(0)); dest.push(PDFNumber.of(h)); dest.push(PDFNumber.of(0));
  d.set(PDFName.of("Dest"), dest);
  const ref = ctx.register(d);

  const kids = (bm.children || []).filter(c => c.pageIndex >= 0 && c.pageIndex < pages.length);
  if (kids.length) {
    const childRefs: PDFRef[] = [];
    let total = 0;
    for (const c of kids) { const r = buildOutline(ctx, pages, c); childRefs.push(r.ref); total += 1 + r.count; }
    for (let i = 0; i < childRefs.length; i++) {
      const cd = ctx.lookup(childRefs[i]) as PDFDict;
      cd.set(PDFName.of("Parent"), ref);
      if (i > 0) cd.set(PDFName.of("Prev"), childRefs[i - 1]);
      if (i < childRefs.length - 1) cd.set(PDFName.of("Next"), childRefs[i + 1]);
    }
    d.set(PDFName.of("First"), childRefs[0]);
    d.set(PDFName.of("Last"), childRefs[childRefs.length - 1]);
    d.set(PDFName.of("Count"), PDFNumber.of(total));
    return { ref, count: total };
  }
  return { ref, count: 0 };
}

// Nesting-capable outline (one level deep for colly constituents).
function applyWpBookmarks(pdf: PDFDocument, entries: WpBookmark[]) {
  const top = entries.filter(bm => bm.pageIndex >= 0 && bm.pageIndex < pdf.getPageCount());
  if (top.length === 0) return;
  try {
    const ctx = pdf.context;
    const pages = pdf.getPages();
    const built = top.map(bm => buildOutline(ctx, pages, bm));
    const refs = built.map(b => b.ref);
    for (let i = 0; i < refs.length; i++) {
      const d = ctx.lookup(refs[i]) as PDFDict;
      if (i > 0) d.set(PDFName.of("Prev"), refs[i - 1]);
      if (i < refs.length - 1) d.set(PDFName.of("Next"), refs[i + 1]);
    }
    const outlines = PDFDict.withContext(ctx);
    outlines.set(PDFName.of("Type"), PDFName.of("Outlines"));
    outlines.set(PDFName.of("First"), refs[0]);
    outlines.set(PDFName.of("Last"), refs[refs.length - 1]);
    outlines.set(PDFName.of("Count"), PDFNumber.of(built.reduce((s, b) => s + 1 + b.count, 0)));
    const ref = ctx.register(outlines);
    for (const r of refs) (ctx.lookup(r) as PDFDict).set(PDFName.of("Parent"), ref);
    (ctx.lookup(ctx.trailerInfo.Root) as PDFDict).set(PDFName.of("Outlines"), ref);
  } catch (e) {
    console.warn("[WP PDF] bookmark application failed:", e);
  }
}

export async function generateWpPdf(
  project: DraftoProject,
  onProgress?: (label: string) => void,
): Promise<{ success: boolean; pdfBase64?: string; fileName: string; error?: string }> {
  const fileName = "Writ Petition.pdf";
  try {
    const merged = await PDFDocument.create();
    const bookmarks: WpBookmark[] = [];
    const stamps: { pageIndex: number; number: number }[] = [];
    const annexLabelStamps: { pageIndex: number; text: string }[] = [];
    const uploads = project.wp.uploads || ({} as any);

    // ── PASS 1: collect every body component (the Index is generated last, once
    // page ranges are known). Each carries its index key so ranges line up. ──
    interface BodyItem { key: string; title: string; pdf: PDFDocument; paginated: boolean; colly?: { title: string; offset: number }[]; label?: string; }
    const items: BodyItem[] = [];

    const genItem = async (gen: (p: DraftoProject) => Promise<{ docx?: string }>, key: string, title: string) => {
      const res = await gen(project);
      if (res.docx) items.push({ key, title, pdf: await docxToPdf(res.docx), paginated: true });
    };
    const uploadItem = async (entry: any, key: string, title: string): Promise<boolean> => {
      const bytes = await fileBytes(entry?.file, entry?.filePath);
      if (!bytes) return false;
      const pdf = await pdfFromBytes(bytes);
      if (!pdf || pdf.getPageCount() === 0) return false;
      items.push({ key, title, pdf, paginated: true });
      return true;
    };

    onProgress?.("Building front matter…");
    await genItem(generateWpNoticeOfMotion, "notice", "Notice of Motion");
    await genItem(generateWpUrgencyApplication, "urgency", "Urgency Application");
    await genItem(generateWpMemoOfParties, "memo", "Memo of Parties");
    await genItem(generateWpSynopsisAndLod, "slod", "Synopsis and List of Dates");
    await genItem((p) => generateWpPetition(p, { includeAffidavit: false }), "petition", `Writ Petition under Article ${project.wp.articleBasis}`);
    if (!(await uploadItem(uploads.signedAffidavit, "affidavit", "Affidavit"))) await genItem(generateWpAffidavit, "affidavit", "Affidavit");

    // Annexures (impugned-order first). Colly annexures are assembled from their
    // constituent files with nested bookmarks; missing files get a placeholder.
    for (const { annex, pNumber } of wpAnnexureOrder(project)) {
      onProgress?.(`Annexure P-${pNumber}…`);
      let src: PDFDocument | null = null;
      const collyChildren: { title: string; offset: number }[] = [];
      if (annex.isColly && (annex.collyDocuments?.length ?? 0) > 0) {
        src = await PDFDocument.create();
        for (const cd of annex.collyDocuments) {
          const offset = src.getPageCount();
          const bytes = await fileBytes(cd.file, cd.filePath);
          const cpdf = bytes ? await pdfFromBytes(bytes) : null;
          if (cpdf && cpdf.getPageCount() > 0) {
            const cp = await src.copyPages(cpdf, cpdf.getPageIndices());
            cp.forEach(p => src!.addPage(p));
          } else { src.addPage(); }
          collyChildren.push({ title: cd.title || cd.date || "Document", offset });
        }
      } else {
        const bytes = await fileBytes(annex.file, annex.filePath);
        src = bytes ? await pdfFromBytes(bytes) : null;
      }
      if (!src || src.getPageCount() === 0) { src = await PDFDocument.create(); src.addPage(); }
      items.push({
        key: `annex:${annex.id}`,
        title: factsAnnexureSentence(pNumber, annex).replace(/\.\s*$/, ""),
        pdf: src,
        paginated: true,
        colly: collyChildren.length ? collyChildren : undefined,
        label: `Annexure P-${pNumber}${annex.isColly ? " (Colly)" : ""}`,
      });
    }

    // CM applications (each separately bookmarked), then Vakalatnama, Court Fee,
    // Proof of Service.
    const cms = wpActiveCms(project);
    for (let i = 0; i < cms.length; i++) {
      onProgress?.(`CM Application ${i + 1}…`);
      const res = await generateWpSingleCm(project, i);
      if (res.docx) items.push({ key: `cm:${i}`, title: wpCmTitle(cms[i]), pdf: await docxToPdf(res.docx), paginated: true });
    }
    if (!(await uploadItem(uploads.signedVakalatnama, "vakalatnama", "Vakalatnama"))) await genItem(generateWpVakalatnama, "vakalatnama", "Vakalatnama");
    await uploadItem(uploads.courtFee, "courtfee", "Court Fee");
    await uploadItem(uploads.proofOfService, "proofofservice", "Proof of Service");

    // ── Compute printed page ranges (continuous from 1) for the Index. ──
    let calc = 1;
    const rangeByKey: Record<string, { s: number; e: number }> = {};
    for (const it of items) {
      if (!it.paginated) continue;
      const n = it.pdf.getPageCount();
      rangeByKey[it.key] = { s: calc, e: calc + n - 1 };
      calc += n;
    }
    const fmt = (r: { s: number; e: number }) => (r.s === r.e ? `${r.s}` : `${r.s}-${r.e}`);
    const pageRanges: Record<string, string> = {};
    for (const k in rangeByKey) pageRanges[k] = fmt(rangeByKey[k]);
    // The Index "Writ Petition … with affidavit" row spans petition + affidavit.
    if (rangeByKey["petition"]) {
      pageRanges["petition"] = fmt({ s: rangeByKey["petition"].s, e: (rangeByKey["affidavit"] ?? rangeByKey["petition"]).e });
    }

    // ── Generate the Index with the page ranges, then assemble Index-first. ──
    onProgress?.("Building index…");
    const idxRes = await generateWpIndex(project, pageRanges);
    const indexPdf = idxRes.docx ? await docxToPdf(idxRes.docx) : null;

    let printedPage = 1;
    const addToMerged = async (src: PDFDocument, title: string, paginated: boolean, opts?: { colly?: { title: string; offset: number }[]; label?: string }) => {
      const count = src.getPageCount();
      if (count === 0) return;
      const startIndex = merged.getPageCount();
      const cp = await merged.copyPages(src, src.getPageIndices());
      cp.forEach(p => merged.addPage(p));
      const bm: WpBookmark = { title, pageIndex: startIndex };
      if (paginated) {
        bm.startPage = printedPage;
        bm.endPage = printedPage + count - 1;
        for (let i = 0; i < count; i++) stamps.push({ pageIndex: startIndex + i, number: printedPage + i });
        printedPage += count;
      }
      if (opts?.colly) bm.children = opts.colly.map(c => ({ title: c.title, pageIndex: startIndex + c.offset }));
      if (opts?.label) for (let i = 0; i < count; i++) annexLabelStamps.push({ pageIndex: startIndex + i, text: opts.label });
      bookmarks.push(bm);
    };

    if (indexPdf) await addToMerged(indexPdf, "Index", false); // Index pages are unnumbered
    for (const it of items) await addToMerged(it.pdf, it.title, it.paginated, { colly: it.colly, label: it.label });

    // Stamp continuous top-right bold page numbers, plus the annexure label
    // just below the page number on each annexure page.
    onProgress?.("Numbering pages…");
    const font = await merged.embedFont(StandardFonts.TimesRomanBold);
    const fontSize = 20;
    const topMargin = 54;
    const rightMargin = 54;
    for (const s of stamps) {
      const page = merged.getPage(s.pageIndex);
      const { width, height } = page.getSize();
      const text = String(s.number);
      const tw = font.widthOfTextAtSize(text, fontSize);
      page.drawText(text, { x: width - rightMargin - tw, y: height - topMargin - fontSize, size: fontSize, font, color: rgb(0, 0, 0) });
    }
    const labelSize = 13;
    for (const s of annexLabelStamps) {
      const page = merged.getPage(s.pageIndex);
      const { width, height } = page.getSize();
      const tw = font.widthOfTextAtSize(s.text, labelSize);
      // Below the page number (page number occupies ~topMargin+fontSize from top).
      page.drawText(s.text, { x: width - rightMargin - tw, y: height - topMargin - fontSize - labelSize - 8, size: labelSize, font, color: rgb(0, 0, 0) });
    }

    onProgress?.("Adding bookmarks…");
    applyWpBookmarks(merged, bookmarks);

    const bytes = await merged.save();
    return { success: true, pdfBase64: bytesToB64(bytes), fileName };
  } catch (e: any) {
    return { success: false, fileName, error: e?.message || "WP PDF assembly failed" };
  }
}

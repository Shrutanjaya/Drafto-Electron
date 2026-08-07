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

import { PDFDocument, StandardFonts, rgb, degrees, PDFDict, PDFName, PDFArray, PDFString, PDFNumber, type PDFRef, type PDFPage, type PDFFont } from "pdf-lib";
import { getWpStampSettings, type WpStampSettings } from "./wp-settings";
import { convertDocxToPdf as ipcConvertDocxToPdf } from "@/lib/ipc/pdf";
import type { DraftoProject } from "@/lib/schema";
import { wpAnnexureOrder, cmAnnexLabel, cmAnnexIndexText } from "./wp-annexures";
import { pageRotation } from "@/lib/pdf-rotation";
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
  wpFrontMatterOrder,
} from "./wp-actions";
import { factsAnnexureSentence } from "./wp-facts";

export function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ── Rotation-aware stamping (ported from the SLP assembler's fix) ────────────
// A scanned page may carry /Rotate 90/180/270; drawing at plain mediabox
// coordinates then shows the stamp sideways or upside-down. All stamps are
// therefore positioned in the page's VISUAL frame — (alongRight, alongUp)
// offsets from the visual bottom-left — converted to mediabox x/y, and drawn
// with `rotate: degrees(rotation)` so they always read upright on screen.
export function visualFrame(page: PDFPage) {
  const { width, height } = page.getSize();
  const rotation = pageRotation(page);
  let cx: number, cy: number, rx: number, ry: number, ux: number, uy: number;
  if (rotation === 90) { cx = width; cy = 0; rx = 0; ry = 1; ux = -1; uy = 0; }
  else if (rotation === 180) { cx = width; cy = height; rx = -1; ry = 0; ux = 0; uy = -1; }
  else if (rotation === 270) { cx = 0; cy = height; rx = 0; ry = -1; ux = 1; uy = 0; }
  else { cx = 0; cy = 0; rx = 1; ry = 0; ux = 0; uy = 1; }
  const sideways = rotation === 90 || rotation === 270;
  return {
    rotation,
    visualWidth: sideways ? height : width,
    visualHeight: sideways ? width : height,
    toXY: (aRight: number, aUp: number) => ({ x: cx + aRight * rx + aUp * ux, y: cy + aRight * ry + aUp * uy }),
  };
}

// Draw `text` with its left baseline at (alongRight, alongUp) in the visual
// frame, optionally over a white background pad.
export function stampVisualText(page: PDFPage, font: PDFFont, text: string, sizePt: number, aRight: number, aUp: number, withBg: boolean) {
  const f = visualFrame(page);
  const tw = font.widthOfTextAtSize(text, sizePt);
  if (withBg) {
    const pad = 4;
    const a = f.toXY(aRight - pad, aUp - pad);
    page.drawRectangle({ x: a.x, y: a.y, width: tw + pad * 2, height: sizePt + pad * 2, color: rgb(1, 1, 1), rotate: degrees(f.rotation) });
  }
  const a = f.toXY(aRight, aUp);
  page.drawText(text, { x: a.x, y: a.y, size: sizePt, font, color: rgb(0, 0, 0), rotate: degrees(f.rotation) });
}

// Chunked to avoid call-stack overflow on large paper-books.
export function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export async function docxToPdf(docxB64: string): Promise<PDFDocument> {
  const res = await ipcConvertDocxToPdf(b64ToBytes(docxB64));
  if (!res.success || !res.pdfBase64) throw new Error(res.error || "PDF conversion failed");
  return PDFDocument.load(b64ToBytes(res.pdfBase64));
}

export interface WpBookmark {
  title: string;
  pageIndex: number;
  startPage?: number;
  endPage?: number;
  children?: WpBookmark[]; // nested constituents (colly annexures)
}

// Read an annexure/constituent file to bytes (File object, or disk path via the
// electron IPC).
export async function fileBytes(file: any, filePath?: string): Promise<Uint8Array | null> {
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
export async function pdfFromBytes(bytes: Uint8Array): Promise<PDFDocument | null> {
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
export function applyWpBookmarks(pdf: PDFDocument, entries: WpBookmark[]) {
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
): Promise<{ success: boolean; pdfBase64?: string; fileName: string; error?: string; annexureFirstPages?: Record<string, number> }> {
  const fileName = "Writ Petition.pdf";
  try {
    const merged = await PDFDocument.create();
    const bookmarks: WpBookmark[] = [];
    const stamps: { pageIndex: number; number: number }[] = [];
    const annexLabelStamps: { pageIndex: number; text: string }[] = [];
    const trueCopyPages: number[] = [];
    const uploads = project.wp.uploads || ({} as any);

    // ── PASS 1: collect every body component (the Index is generated last, once
    // page ranges are known). Each carries its index key so ranges line up. ──
    // `pdf: null` marks a PHANTOM item: it consumes `phantomPages` printed page
    // number(s) in the Index without adding any pages to the PDF — used for the
    // Court Fee / Proof of Service slots when nothing is uploaded (the printed
    // receipt/acknowledgement is inserted physically at that page).
    // `trueCopy` marks annexure pages that receive the True Copy stamp.
    interface BodyItem { key: string; title: string; pdf: PDFDocument | null; paginated: boolean; colly?: { title: string; offset: number }[]; label?: string; phantomPages?: number; trueCopy?: boolean; }
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
    // Front matter follows the user-configured order (must match wpIndexItems).
    // The PDF path opts into the advocate signature (Settings → Writ Petition);
    // plain .docx exports never carry it.
    const frontGens: Record<"notice" | "urgency" | "memo", { gen: (p: DraftoProject) => Promise<{ docx?: string }>; title: string }> = {
      notice: { gen: (p) => generateWpNoticeOfMotion(p, true), title: "Notice of Motion" },
      urgency: { gen: (p) => generateWpUrgencyApplication(p, true), title: "Urgency Application" },
      memo: { gen: (p) => generateWpMemoOfParties(p, true), title: "Memo of Parties" },
    };
    for (const k of wpFrontMatterOrder(project)) await genItem(frontGens[k].gen, k, frontGens[k].title);
    await genItem(generateWpSynopsisAndLod, "slod", "Synopsis and List of Dates");
    await genItem((p) => generateWpPetition(p, { includeAffidavit: false, includeSignature: true }), "petition", `Writ Petition under Article ${project.wp.articleBasis}`);
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
        trueCopy: true,
      });
    }

    // CM applications (each separately bookmarked, immediately followed by its
    // own A-series annexures), then Vakalatnama, Court Fee, Proof of Service.
    const cms = wpActiveCms(project);
    for (let i = 0; i < cms.length; i++) {
      onProgress?.(`CM Application ${i + 1}…`);
      const res = await generateWpSingleCm(project, i, true);
      if (res.docx) items.push({ key: `cm:${i}`, title: wpCmTitle(cms[i]), pdf: await docxToPdf(res.docx), paginated: true });
      for (const { annex, aNumber } of cms[i].annexures) {
        onProgress?.(`CM ${i + 1} — Annexure A-${aNumber}…`);
        const bytes = await fileBytes(annex.file, annex.filePath);
        let src = bytes ? await pdfFromBytes(bytes) : null;
        if (!src || src.getPageCount() === 0) { src = await PDFDocument.create(); src.addPage(); }
        items.push({
          key: `cmannex:${annex.id}`,
          title: `${cmAnnexLabel(aNumber)}: ${cmAnnexIndexText(annex).replace(/\.\s*$/, "")}`,
          pdf: src,
          paginated: true,
          label: cmAnnexLabel(aNumber),
          trueCopy: true,
        });
      }
    }
    if (!(await uploadItem(uploads.signedVakalatnama, "vakalatnama", "Vakalatnama"))) await genItem(generateWpVakalatnama, "vakalatnama", "Vakalatnama");
    // Court Fee / Proof of Service: when not uploaded, the Index still reserves
    // one page each so the row carries the page number the physical insert will
    // occupy; nothing is added to the PDF itself.
    if (!(await uploadItem(uploads.courtFee, "courtfee", "Court Fee")))
      items.push({ key: "courtfee", title: "Court Fee", pdf: null, paginated: true, phantomPages: 1 });
    if (!(await uploadItem(uploads.proofOfService, "proofofservice", "Proof of Service")))
      items.push({ key: "proofofservice", title: "Proof of Service", pdf: null, paginated: true, phantomPages: 1 });

    // ── Compute printed page ranges (continuous from 1) for the Index. ──
    let calc = 1;
    const rangeByKey: Record<string, { s: number; e: number }> = {};
    for (const it of items) {
      if (!it.paginated) continue;
      const n = it.pdf ? it.pdf.getPageCount() : (it.phantomPages ?? 0);
      if (n === 0) continue;
      rangeByKey[it.key] = { s: calc, e: calc + n - 1 };
      calc += n;
    }
    const fmt = (r: { s: number; e: number }) => (r.s === r.e ? `${r.s}` : `${r.s}-${r.e}`);
    const pageRanges: Record<string, string> = {};
    for (const k in rangeByKey) pageRanges[k] = fmt(rangeByKey[k]);
    // Annexure-id → first paper-book page (P-series and CM A-series), for the
    // quick briefing note.
    const annexureFirstPages: Record<string, number> = {};
    for (const k in rangeByKey) {
      const m = k.match(/^(?:annex|cmannex):(.+)$/);
      if (m) annexureFirstPages[m[1]] = rangeByKey[k].s;
    }
    // The Index "Writ Petition … with affidavit" row spans petition + affidavit.
    if (rangeByKey["petition"]) {
      pageRanges["petition"] = fmt({ s: rangeByKey["petition"].s, e: (rangeByKey["affidavit"] ?? rangeByKey["petition"]).e });
    }

    // ── Generate the Index with the page ranges, then assemble Index-first. ──
    onProgress?.("Building index…");
    const idxRes = await generateWpIndex(project, pageRanges, true);
    const indexPdf = idxRes.docx ? await docxToPdf(idxRes.docx) : null;

    let printedPage = 1;
    const addToMerged = async (src: PDFDocument | null, title: string, paginated: boolean, opts?: { colly?: { title: string; offset: number }[]; label?: string; phantomPages?: number; trueCopy?: boolean }) => {
      if (!src) {
        // Phantom slot: advance the printed page counter without adding pages
        // (no bookmark — there is no page to point at).
        if (paginated) printedPage += opts?.phantomPages ?? 0;
        return;
      }
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
      // The annexure label goes on the FIRST page of the annexure only.
      if (opts?.label) annexLabelStamps.push({ pageIndex: startIndex, text: opts.label });
      if (opts?.trueCopy) for (let i = 0; i < count; i++) trueCopyPages.push(startIndex + i);
      bookmarks.push(bm);
    };

    if (indexPdf) await addToMerged(indexPdf, "Index", false); // Index pages are unnumbered
    for (const it of items) await addToMerged(it.pdf, it.title, it.paginated, { colly: it.colly, label: it.label, phantomPages: it.phantomPages, trueCopy: it.trueCopy });

    // Stamp page numbers, annexure labels (first page of each annexure) and the
    // True Copy mark — all settings-driven (Settings → Writ Petition) and
    // rotation-aware (see visualFrame above).
    onProgress?.("Numbering pages…");
    const st: WpStampSettings = getWpStampSettings();
    const STAMP_FONTS = { times: StandardFonts.TimesRomanBold, helvetica: StandardFonts.HelveticaBold, courier: StandardFonts.CourierBold } as const;
    const font = await merged.embedFont(STAMP_FONTS[st.font]);

    for (const s of stamps) {
      const page = merged.getPage(s.pageIndex);
      const f = visualFrame(page);
      const text = String(s.number);
      const tw = font.widthOfTextAtSize(text, st.pageNumberSizePt);
      stampVisualText(page, font, text, st.pageNumberSizePt,
        f.visualWidth - st.pageNumberMarginRightPt - tw,
        f.visualHeight - st.pageNumberMarginTopPt - st.pageNumberSizePt,
        st.stampBackground);
    }

    for (const s of annexLabelStamps) {
      const page = merged.getPage(s.pageIndex);
      const f = visualFrame(page);
      const tw = font.widthOfTextAtSize(s.text, st.annexureLabelSizePt);
      const aRight = st.annexureLabelPosition === "center"
        ? (f.visualWidth - tw) / 2
        : f.visualWidth - st.pageNumberMarginRightPt - tw; // right: aligned under the page number
      const aUp = st.annexureLabelPosition === "center"
        ? f.visualHeight - st.annexureLabelMarginPt - st.annexureLabelSizePt
        : f.visualHeight - st.pageNumberMarginTopPt - st.pageNumberSizePt - st.annexureLabelSizePt - 8;
      stampVisualText(page, font, s.text, st.annexureLabelSizePt, aRight, aUp, st.stampBackground);
    }

    // True Copy mark (small advocate signature above the words "True Copy") at
    // the visual bottom-left/centre of EVERY annexure page.
    if (st.trueCopy && st.signaturePngBase64 && st.signatureAspect > 0 && trueCopyPages.length) {
      let sigImage;
      try { sigImage = await merged.embedPng(b64ToBytes(st.signaturePngBase64)); } catch { sigImage = null; }
      if (sigImage) {
        const tcSize = 9;
        const gap = 3;
        const tcText = "True Copy";
        const tcTw = font.widthOfTextAtSize(tcText, tcSize);
        const imgW = st.signatureHalfWidthPt;
        const imgH = imgW * st.signatureAspect;
        for (const pageIndex of trueCopyPages) {
          const page = merged.getPage(pageIndex);
          const f = visualFrame(page);
          const isCentre = st.trueCopyPosition === "center";
          const textRightOff = isCentre ? (f.visualWidth - tcTw) / 2 : st.trueCopyMarginXPt;
          const imgRightOff = isCentre ? (f.visualWidth - imgW) / 2 : st.trueCopyMarginXPt;
          const textUpOff = st.trueCopyMarginBottomPt;
          const imgUpOff = st.trueCopyMarginBottomPt + tcSize + gap;
          if (st.trueCopyBackground) {
            const pad = 3;
            const rMin = Math.min(textRightOff, imgRightOff) - pad;
            const rMax = Math.max(textRightOff + tcTw, imgRightOff + imgW) + pad;
            const upMin = textUpOff - tcSize * 0.25 - pad;
            const upMax = imgUpOff + imgH + pad;
            const a = f.toXY(rMin, upMin);
            page.drawRectangle({ x: a.x, y: a.y, width: rMax - rMin, height: upMax - upMin, color: rgb(1, 1, 1), rotate: degrees(f.rotation) });
          }
          const imgA = f.toXY(imgRightOff, imgUpOff);
          const textA = f.toXY(textRightOff, textUpOff);
          page.drawImage(sigImage, { x: imgA.x, y: imgA.y, width: imgW, height: imgH, rotate: degrees(f.rotation) });
          page.drawText(tcText, { x: textA.x, y: textA.y, size: tcSize, font, color: rgb(0, 0, 0), rotate: degrees(f.rotation) });
        }
      }
    }

    onProgress?.("Adding bookmarks…");
    applyWpBookmarks(merged, bookmarks);

    const bytes = await merged.save();
    return { success: true, pdfBase64: bytesToB64(bytes), fileName, annexureFirstPages };
  } catch (e: any) {
    return { success: false, fileName, error: e?.message || "WP PDF assembly failed" };
  }
}

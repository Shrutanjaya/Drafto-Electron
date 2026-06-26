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
import {
  generateWpIndex,
  generateWpNoticeOfMotion,
  generateWpUrgencyApplication,
  generateWpMemoOfParties,
  generateWpSynopsisAndLod,
  generateWpPetition,
  generateWpCms,
  generateWpVakalatnama,
} from "./wp-actions";

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

interface WpComponent {
  id: string;
  title: string;
  gen: (p: DraftoProject) => Promise<{ success: boolean; docx?: string; fileName: string }>;
  paginated: boolean; // the Index is unpaginated
}

interface WpBookmark {
  title: string;
  pageIndex: number;
  startPage?: number;
  endPage?: number;
}

function hasAnyCm(p: DraftoProject): boolean {
  const c = p.wp.cms;
  return (p.wp.isIoWrit && c.stay.active) || c.lengthySynopsis.active || c.exemptionCopies.active || (p.wp.customCms?.length ?? 0) > 0;
}

// Flat per-component outline with a printed page-range suffix. (Nested colly
// children arrive with annexure interleaving.)
function applyWpBookmarks(pdf: PDFDocument, entries: WpBookmark[]) {
  if (entries.length === 0) return;
  try {
    const ctx = pdf.context;
    const pages = pdf.getPages();
    const items: PDFRef[] = [];
    for (const bm of entries) {
      if (bm.pageIndex < 0 || bm.pageIndex >= pages.length) continue;
      const pageRef = pages[bm.pageIndex].ref;
      const h = pages[bm.pageIndex].getHeight();
      let title = bm.title;
      if (bm.startPage !== undefined && bm.endPage !== undefined) {
        title += bm.startPage === bm.endPage ? ` [p.${bm.startPage}]` : ` [pp.${bm.startPage}-${bm.endPage}]`;
      }
      const d = PDFDict.withContext(ctx);
      d.set(PDFName.of("Title"), PDFString.of(title));
      const dest = PDFArray.withContext(ctx);
      dest.push(pageRef);
      dest.push(PDFName.of("XYZ"));
      dest.push(PDFNumber.of(0));
      dest.push(PDFNumber.of(h));
      dest.push(PDFNumber.of(0));
      d.set(PDFName.of("Dest"), dest);
      items.push(ctx.register(d));
    }
    if (items.length === 0) return;
    for (let i = 0; i < items.length; i++) {
      const d = ctx.lookup(items[i]) as PDFDict;
      if (i > 0) d.set(PDFName.of("Prev"), items[i - 1]);
      if (i < items.length - 1) d.set(PDFName.of("Next"), items[i + 1]);
    }
    const outlines = PDFDict.withContext(ctx);
    outlines.set(PDFName.of("Type"), PDFName.of("Outlines"));
    outlines.set(PDFName.of("First"), items[0]);
    outlines.set(PDFName.of("Last"), items[items.length - 1]);
    outlines.set(PDFName.of("Count"), PDFNumber.of(items.length));
    const ref = ctx.register(outlines);
    for (const it of items) (ctx.lookup(it) as PDFDict).set(PDFName.of("Parent"), ref);
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
    const components: WpComponent[] = [
      { id: "index", title: "Index", gen: generateWpIndex, paginated: false },
      { id: "notice", title: "Notice of Motion", gen: generateWpNoticeOfMotion, paginated: true },
      { id: "urgency", title: "Urgency Application", gen: generateWpUrgencyApplication, paginated: true },
      { id: "memo", title: "Memo of Parties", gen: generateWpMemoOfParties, paginated: true },
      { id: "slod", title: "Synopsis and List of Dates", gen: generateWpSynopsisAndLod, paginated: true },
      { id: "petition", title: "Writ Petition under Article " + project.wp.articleBasis + ", with affidavit", gen: generateWpPetition, paginated: true },
      ...(hasAnyCm(project) ? [{ id: "cms", title: "CM Applications", gen: generateWpCms, paginated: true } as WpComponent] : []),
      { id: "vakalatnama", title: "Vakalatnama", gen: generateWpVakalatnama, paginated: true },
    ];

    const merged = await PDFDocument.create();
    const bookmarks: WpBookmark[] = [];
    const stamps: { pageIndex: number; number: number }[] = [];
    let printedPage = 1;

    for (const comp of components) {
      onProgress?.(`Building ${comp.title}…`);
      const result = await comp.gen(project);
      if (!result.docx) continue;
      const pdf = await docxToPdf(result.docx);
      const count = pdf.getPageCount();
      if (count === 0) continue;

      const startIndex = merged.getPageCount();
      const copied = await merged.copyPages(pdf, pdf.getPageIndices());
      copied.forEach(p => merged.addPage(p));

      const bm: WpBookmark = { title: comp.title, pageIndex: startIndex };
      if (comp.paginated) {
        bm.startPage = printedPage;
        bm.endPage = printedPage + count - 1;
        for (let i = 0; i < count; i++) stamps.push({ pageIndex: startIndex + i, number: printedPage + i });
        printedPage += count;
      }
      bookmarks.push(bm);
    }

    // Stamp continuous top-right bold page numbers.
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

    onProgress?.("Adding bookmarks…");
    applyWpBookmarks(merged, bookmarks);

    const bytes = await merged.save();
    return { success: true, pdfBase64: bytesToB64(bytes), fileName };
  } catch (e: any) {
    return { success: false, fileName, error: e?.message || "WP PDF assembly failed" };
  }
}

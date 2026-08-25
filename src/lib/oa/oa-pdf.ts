// CAT Original Application paper-book assembler.
//
// Mirrors the Writ Petition assembler: every generated component is converted to
// PDF, merged in filing order with the uploaded annexures and filing documents,
// then stamped with continuous top-right page numbers, "Annexure A-N" labels on
// each annexure's first page, and the True Copy mark — all driven by
// Settings → Original Application. Bookmarks are added for navigation.
//
// Filing order:
//   Index → Memo of Parties → Synopsis & List of Dates → Petition for Transfer
//   (+ Affidavit) → Miscellaneous Applications (each + Affidavit) → Original
//   Application (Paras 1–9) → Last Page(s) → Annexures → Vakalatnama →
//   Authority Letter(s) → Court Fee → Proof of Service

import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { withAnnexureCustomText } from "@/lib/wp/wp-facts";
import type { DraftoProject } from "@/lib/schema";
import {
  b64ToBytes, bytesToB64, docxToPdf, fileBytes, pdfFromBytes,
  applyWpBookmarks, visualFrame, stampVisualText, type WpBookmark,
} from "@/lib/wp/wp-pdf";
import { wpAnnexureOrder } from "@/lib/wp/wp-annexures";
import { getOaStampSettings } from "@/lib/oa/oa-settings";
import {
  generateOaIndexDoc, generateOaMemoDoc, generateOaSynopsisDoc, generateOaBodyOnly,
  generateOaLastPageDoc, generateOaMaDoc, generateOaMaAffidavitForDoc, generateOaVakalatnamaDoc,
  generateOaVakalatnamaForDoc, generateOaAuthorityLetterDoc, oaAnnexLabel, oaSigning,
} from "@/lib/oa/oa-actions";

interface Item {
  key: string;
  title: string;
  pdf: PDFDocument | null;
  paginated: boolean;
  label?: string;                                   // annexure label stamp
  trueCopy?: boolean;                               // stamp True Copy on every page
  colly?: { title: string; offset: number }[];      // nested bookmarks
  phantomPages?: number;                            // consumes numbers, adds no pages
}

export async function generateOaPdf(
  project: DraftoProject,
  onProgress?: (label: string) => void,
): Promise<{ success: boolean; pdfBase64?: string; fileName: string; error?: string }> {
  const fileName = "Original Application.pdf";
  try {
    const merged = await PDFDocument.create();
    const bookmarks: WpBookmark[] = [];
    const stamps: { pageIndex: number; number: number }[] = [];
    const annexLabelStamps: { pageIndex: number; text: string }[] = [];
    const trueCopyPages: number[] = [];
    const uploads = (project.oa.uploads || {}) as any;
    const items: Item[] = [];

    const add = async (docx: string | undefined, key: string, title: string) => {
      if (docx) items.push({ key, title, pdf: await docxToPdf(docx), paginated: true });
    };

    // ── PASS 1: body components (the Index is generated last, once page ranges
    //    are known, so its page column can be filled in). ──
    onProgress?.("Generating Memo of Parties…");
    await add((await generateOaMemoDoc(project)).docx, "memo", "Memo of Parties");

    onProgress?.("Generating Synopsis & List of Dates…");
    await add((await generateOaSynopsisDoc(project)).docx, "synopsis", "Synopsis and List of Dates");

    const pts = (project.oa.mas || []).filter((m) => m.kind === "pt");
    const mas = (project.oa.mas || []).filter((m) => m.kind !== "pt");
    // Each application is the body followed by its affidavit — an uploaded
    // signed affidavit replaces the generated one, and both share the
    // application's Index key so the page range covers the pair.
    const sg = oaSigning(project);
    // Who swears each application's affidavit: Applicant No. 1 alone when the
    // others have given authority letters, otherwise every Applicant.
    const swearers: (number | undefined)[] = !sg.multi
      ? [undefined]
      : sg.authorityLetters ? [0] : sg.applicants.map((_, i) => i);

    const addApplication = async (ma: any, key: string, title: string) => {
      await add((await generateOaMaDoc(project, ma, { includeAffidavit: false })).docx, key, title);
      // An uploaded signed affidavit (one PDF holding every signed copy)
      // replaces the generated ones.
      const signed = await fileBytes(ma.signedAffidavit?.file, ma.signedAffidavit?.filePath);
      const signedPdf = signed ? await pdfFromBytes(signed) : null;
      if (signedPdf) { items.push({ key, title: `${title} — Affidavit (signed)`, pdf: signedPdf, paginated: true }); return; }
      for (const idx of swearers) {
        const suffix = idx != null && swearers.length > 1 ? ` — Applicant No. ${idx + 1}` : "";
        await add((await generateOaMaAffidavitForDoc(project, ma, idx)).docx, key, `${title} — Affidavit${suffix}`);
      }
    };
    for (const [i, pt] of pts.entries()) {
      onProgress?.("Generating Petition for Transfer…");
      await addApplication(pt, `pt:${i}`, "Petition for Transfer");
    }
    for (const [i, ma] of mas.entries()) {
      onProgress?.(`Generating Miscellaneous Application ${i + 1}…`);
      await addApplication(ma, `ma:${i}`, "Miscellaneous Application");
    }

    onProgress?.("Generating the Original Application…");
    await add((await generateOaBodyOnly(project)).docx, "oa", "Original Application");

    // Last page(s): one per applicant when several sign, else a single copy. An
    // uploaded signed last page replaces the generated one.
    const applicants = (project.petitioners || []).filter((p) => p.name?.trim());
    const signedLast = await fileBytes(uploads.signedLastPage?.file, uploads.signedLastPage?.filePath);
    if (signedLast) {
      const src = await pdfFromBytes(signedLast);
      if (src) items.push({ key: "oa", title: "Last Page (signed)", pdf: src, paginated: true });
    } else if (applicants.length > 1 && sg.separateLastPages) {
      for (let i = 0; i < applicants.length; i++) {
        await add((await generateOaLastPageDoc(project, i)).docx, "oa", `Last Page — Applicant No. ${i + 1}`);
      }
    } else {
      await add((await generateOaLastPageDoc(project, null)).docx, "oa", "Last Page");
    }

    // ── Annexures (in A-order), each stamped and True-Copy marked ──
    onProgress?.("Adding annexures…");
    for (const entry of wpAnnexureOrder(project)) {
      const a: any = entry.annex;
      const label = oaAnnexLabel(entry.pNumber, a);
      let src: PDFDocument | null = null;
      const colly: { title: string; offset: number }[] = [];

      if (a.isColly && (a.collyDocuments || []).length) {
        // Each constituent is appended in order and bookmarked separately.
        src = await PDFDocument.create();
        for (const cd of a.collyDocuments) {
          const bytes = await fileBytes(cd.file, cd.filePath);
          const part = bytes ? await pdfFromBytes(bytes) : null;
          if (!part) continue;
          colly.push({ title: cd.title || "Document", offset: src.getPageCount() });
          const copied = await src.copyPages(part, part.getPageIndices());
          copied.forEach((pg) => src!.addPage(pg));
        }
      } else {
        const bytes = await fileBytes(a.file, a.filePath);
        src = bytes ? await pdfFromBytes(bytes) : null;
      }
      // A missing upload still occupies its place (one blank page) so the Index
      // page numbers stay correct.
      if (!src || src.getPageCount() === 0) { src = await PDFDocument.create(); src.addPage(); }
      items.push({
        key: `annex:${a.id}`,
        title: withAnnexureCustomText(`${label}: ${a.title || "[description]"}`, a).replace(/\.\s*$/, ""),
        pdf: src,
        paginated: true,
        label,
        trueCopy: true,
        colly: colly.length ? colly : undefined,
      });
    }

    // ── Vakalatnama (uploaded signed copy wins), Authority Letters ──
    // Vakalatnama(s), each followed by that Applicant's Authority Letter. They
    // share one Index key ("Vakalatnama(s) and Authority Letter(s)"), so the
    // page range spans the whole group.
    const signedVak = await fileBytes(uploads.signedVakalatnama?.file, uploads.signedVakalatnama?.filePath);
    if (signedVak) {
      const src = await pdfFromBytes(signedVak);
      if (src) items.push({ key: "vakalatnama", title: "Vakalatnama (signed)", pdf: src, paginated: true });
    } else if (sg.separateVakalatnamas) {
      for (let i = 0; i < sg.count; i++) {
        await add((await generateOaVakalatnamaForDoc(project, i)).docx, "vakalatnama", `Vakalatnama — Applicant No. ${i + 1}`);
        if (sg.authorityLetters && i > 0) {
          await add((await generateOaAuthorityLetterDoc(project, i)).docx, "vakalatnama", `Authority Letter — Applicant No. ${i + 1}`);
        }
      }
    } else {
      await add((await generateOaVakalatnamaDoc(project)).docx, "vakalatnama", "Vakalatnama");
      if (sg.authorityLetters) {
        for (let i = 1; i < sg.count; i++) {
          await add((await generateOaAuthorityLetterDoc(project, i)).docx, "vakalatnama", `Authority Letter — Applicant No. ${i + 1}`);
        }
      }
    }

    // ── Filing documents ──
    for (const [key, title, up] of [
      ["courtFee", "Court Fee", uploads.courtFee],
      ["proofOfService", "Proof of Service", uploads.proofOfService],
    ] as const) {
      const bytes = await fileBytes(up?.file, up?.filePath);
      const src = bytes ? await pdfFromBytes(bytes) : null;
      if (src) items.push({ key, title, pdf: src, paginated: true });
      else items.push({ key, title, pdf: null, paginated: true, phantomPages: 1 }); // physically inserted at filing
    }

    // ── PASS 2: merge, tracking printed page numbers and stamp targets ──
    onProgress?.("Assembling the paper-book…");
    let printedPage = 1;
    const pageRanges: Record<string, string> = {};

    const addToMerged = async (it: Item) => {
      const startIndex = merged.getPageCount();
      if (it.pdf) {
        const copied = await merged.copyPages(it.pdf, it.pdf.getPageIndices());
        copied.forEach((pg) => merged.addPage(pg));
      }
      const count = it.pdf ? it.pdf.getPageCount() : (it.phantomPages ?? 0);
      if (count > 0) {
        if (it.paginated) {
          for (let i = 0; i < count; i++) if (it.pdf) stamps.push({ pageIndex: startIndex + i, number: printedPage + i });
          // A key seen again (e.g. the Last Page continuing the OA) extends the
          // existing range instead of replacing it.
          const end = printedPage + count - 1;
          const prev = pageRanges[it.key];
          const startOf = prev ? Number(String(prev).split("–")[0]) : printedPage;
          pageRanges[it.key] = startOf === end ? `${startOf}` : `${startOf}–${end}`;
          printedPage += count;
        }
        if (it.pdf) {
          if (it.label) annexLabelStamps.push({ pageIndex: startIndex, text: it.label });
          if (it.trueCopy) for (let i = 0; i < count; i++) trueCopyPages.push(startIndex + i);
          bookmarks.push({
            title: it.title,
            pageIndex: startIndex,
            children: it.colly?.map((c) => ({ title: c.title, pageIndex: startIndex + c.offset })),
          } as WpBookmark);
        }
      }
    };

    // The Index itself is unnumbered and sits first, so build the body first and
    // then splice the Index pages in at the front.
    for (const it of items) await addToMerged(it);

    onProgress?.("Building the Index…");
    const indexRes = await generateOaIndexDoc(project, pageRanges);
    const indexPdf = indexRes.docx ? await docxToPdf(indexRes.docx) : null;
    let indexCount = 0;
    if (indexPdf) {
      indexCount = indexPdf.getPageCount();
      const copied = await merged.copyPages(indexPdf, indexPdf.getPageIndices());
      // Insert at the front, preserving order.
      copied.forEach((pg, i) => merged.insertPage(i, pg));
    }
    // Everything shifted down by the Index's page count.
    const shift = (n: number) => n + indexCount;
    for (const s of stamps) s.pageIndex = shift(s.pageIndex);
    for (const s of annexLabelStamps) s.pageIndex = shift(s.pageIndex);
    for (let i = 0; i < trueCopyPages.length; i++) trueCopyPages[i] = shift(trueCopyPages[i]);
    for (const b of bookmarks) {
      b.pageIndex = shift(b.pageIndex);
      b.children?.forEach((c) => { c.pageIndex = shift(c.pageIndex); });
    }
    if (indexPdf) bookmarks.unshift({ title: "Index", pageIndex: 0 } as WpBookmark);

    // ── PASS 3: stamps (settings-driven, rotation-aware) ──
    onProgress?.("Numbering pages…");
    const st = getOaStampSettings();
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
        : f.visualWidth - st.pageNumberMarginRightPt - tw;
      const aUp = st.annexureLabelPosition === "center"
        ? f.visualHeight - st.annexureLabelMarginPt - st.annexureLabelSizePt
        : f.visualHeight - st.pageNumberMarginTopPt - st.pageNumberSizePt - st.annexureLabelSizePt - 8;
      stampVisualText(page, font, s.text, st.annexureLabelSizePt, aRight, aUp, st.stampBackground);
    }

    if (st.trueCopy && st.signaturePngBase64 && st.signatureAspect > 0 && trueCopyPages.length) {
      let sigImage;
      try { sigImage = await merged.embedPng(b64ToBytes(st.signaturePngBase64)); } catch { sigImage = null; }
      if (sigImage) {
        const tcSize = 9, gap = 3, tcText = "True Copy";
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
    return { success: true, pdfBase64: bytesToB64(bytes), fileName };
  } catch (e: any) {
    return { success: false, fileName, error: e?.message || "OA PDF assembly failed" };
  }
}

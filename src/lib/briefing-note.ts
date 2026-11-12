// Quick briefing note: a chronological roadmap table (Date | Particulars | Page Nos.),
// headed by the cause title.
// Supports single or multi-annexure chronological splitting, Impugned Orders,
// date of filing, and true copy vs. typed/translated copy page numbers (e.g. "145 [148]").

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
  AlignmentType,
  BorderStyle,
} from "docx";
import { format } from "date-fns";
import { getPartyHeader, smartTextRun, convertToSmartQuotes, isLodRowNonEmpty } from "@/lib/docx-helpers";
import { parseHtml } from "@/lib/html-to-docx";
import type { DraftoProject, Annexure } from "@/lib/schema";
import { parseLegalDate } from "@/lib/annexure-chronology";
import { annexurePrefix, isAppeal } from "@/lib/court-family";
import { annexureRowsOf } from "@/lib/wp/facts-mode";
import { cleanProjectName } from "@/lib/project-name";
import { annexureDetails } from "@/lib/annexure-details";
import { wpAnnexureOrder } from "@/lib/wp/wp-annexures";

// Arial 11, single line spacing, 3pt before/after each paragraph.
const BRIEFING_SPACING = { before: 60, after: 60, line: 240 };

function briefingStyles() {
  return {
    paragraphStyles: [
      {
        id: "Normal",
        name: "Normal",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: "Arial", size: 22 }, // 11pt
        paragraph: { spacing: BRIEFING_SPACING, alignment: AlignmentType.LEFT },
      },
    ],
  };
}

// Column widths: Date: 14%, Particulars: 74%, Page Nos.: 12%
// 12% comfortably accommodates "145 [148]" at Arial 11 without line wrapping.
const DATE_PCT = 14;
const PARTICULARS_PCT = 74;
const PAGE_PCT = 12;

const cellMargins = { top: 40, bottom: 40, left: 115, right: 115 };
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder, insideHorizontal: cellBorder, insideVertical: cellBorder };

const CACHE_KEY_PREFIX = "paperbook_cached_pages_";

/**
 * Caches page numbers from the latest paperbook compilation so the Briefing Note
 * can be exported standalone at any time.
 */
export function cachePaperbookPages(projectId: string | undefined, pages: Record<string, string | number>): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(`${CACHE_KEY_PREFIX}${projectId || "default"}`, JSON.stringify(pages));
    }
  } catch { /* silent */ }
}

/**
 * Retrieves the cached page numbers for a project.
 */
export function getCachedPaperbookPages(projectId: string | undefined): Record<string, string | number> {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(`${CACHE_KEY_PREFIX}${projectId || "default"}`);
      if (raw) return JSON.parse(raw);
    }
  } catch { /* silent */ }
  return {};
}

// Formats the cause title dynamically based on the court type
export function briefingCauseTitle(project: DraftoProject): string {
  const pet = getPartyHeader(project.petitioners) || (project.courtType === "OriginalApplicationCAT" ? "[Applicant]" : "[Petitioner]");
  const res = getPartyHeader(project.respondents) || "[Respondent]";
  const year = new Date().getFullYear();
  const isCrl = project.caseType === "Criminal";
  const bracket = isCrl ? "Crl." : "C";

  let caseNumberStr = "";
  if (project.courtType === "Appeal") {
    caseNumberStr = `${isCrl ? "Criminal" : "Civil"} Appeal No. ___/${year}`;
  } else if (project.courtType === "WritPetitionPIL") {
    caseNumberStr = `W.P.(C) [PIL] No. ___/${year}`;
  } else if (project.courtType === "WritPetitionSC" || project.courtType === "WritPetitionDHC") {
    caseNumberStr = `W.P.(${bracket}) No. ___/${year}`;
  } else if (project.courtType === "OriginalApplicationCAT") {
    caseNumberStr = `O.A. No. ___/${year}`;
  } else {
    // Default SLP
    caseNumberStr = `SLP(${bracket}) No. ___/${year}`;
  }

  return `${pet} v. ${res}, ${caseNumberStr}`;
}

function headerCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    margins: cellMargins,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: BRIEFING_SPACING, children: [smartTextRun({ text, bold: true })] })],
  });
}

function formatPageValue(val: string | number | undefined): string {
  if (val === undefined || val === null || val === "") return "";
  return String(val);
}

function toDisplayDate(val: any): string {
  if (!val) return "";
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? "" : format(val, "dd.MM.yyyy");
  }
  const str = String(val).trim();
  if (!str) return "";
  if (str.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return format(d, "dd.MM.yyyy");
    }
  }
  return str;
}

interface TimelineEntry {
  date: string;
  particulars: Paragraph[];
  pageText: string;
  sortTimestamp: number;
  originalIndex: number;
}

/**
 * Builds the chronological timeline rows for the Briefing Note.
 * Expands multiple annexures into their own rows, orders them chronologically,
 * incorporates Impugned Orders, and appends the filing entry.
 */
function buildBriefingTimeline(
  project: DraftoProject,
  pageByAnnexId: Record<string, string | number>,
  numberingConfigs: any[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let itemIdx = 0;

  // 1. Build Annexure Numbering Map
  const activeLodRows = annexureRowsOf(project);
  const allAnnexures: Annexure[] = activeLodRows.flatMap((l) => l.annexures || []);
  const prefix = annexurePrefix(project.courtType);
  const annexureNumberingMap = new Map<string, number>();

  if (project.courtType === "WritPetitionDHC" || project.courtType === "OriginalApplicationCAT") {
    const ordered = wpAnnexureOrder(project);
    ordered.forEach((e) => annexureNumberingMap.set(e.annex.id, e.pNumber));
  } else {
    // Supreme Court: non-AD first, then AD
    let pCount = 1;
    allAnnexures.filter((a) => !a.isAdditionalDocument).forEach((a) => annexureNumberingMap.set(a.id, pCount++));
    allAnnexures.filter((a) => a.isAdditionalDocument).forEach((a) => annexureNumberingMap.set(a.id, pCount++));
  }

  const formatAnnexParagraph = (annex: Annexure): Paragraph => {
    const pNum = annexureNumberingMap.get(annex.id);
    const label = pNum ? `Annexure ${prefix}-${pNum}` : "Annexure";
    const details = annexureDetails(annex);
    return new Paragraph({
      spacing: BRIEFING_SPACING,
      children: [
        smartTextRun({ text: `${label}: `, bold: true }),
        smartTextRun(convertToSmartQuotes(details)),
      ],
    });
  };

  // 2. Process List of Dates rows
  const validLods = (project.listOfDates || []).filter(isLodRowNonEmpty);

  for (const lod of validLods) {
    const rowDate = toDisplayDate(lod.date);
    const rowEvent = (lod.event || "").trim();
    const annexes = lod.annexures || [];
    const rowTs = parseLegalDate(rowDate) ?? -999999999999;

    const parsedEvent = parseHtml(rowEvent, BRIEFING_SPACING);
    if (parsedEvent.numbering.length) numberingConfigs.push(...parsedEvent.numbering);
    const eventParagraphs = parsedEvent.paragraphs.length
      ? parsedEvent.paragraphs
      : [new Paragraph({ spacing: BRIEFING_SPACING, children: [] })];

    if (annexes.length === 0) {
      entries.push({
        date: rowDate,
        particulars: eventParagraphs,
        pageText: "",
        sortTimestamp: rowTs,
        originalIndex: itemIdx++,
      });
    } else if (annexes.length === 1) {
      const annex = annexes[0];
      const annexDate = toDisplayDate(annex.date);
      const annexTs = parseLegalDate(annexDate);
      const pageText = formatPageValue(pageByAnnexId[annex.id]);

      // If annexure has a distinctly different valid date from the row date, split into two chronological rows
      if (annexDate && rowDate && annexDate !== rowDate && annexTs !== null && annexTs !== rowTs) {
        if (rowEvent) {
          entries.push({
            date: rowDate,
            particulars: eventParagraphs,
            pageText: "",
            sortTimestamp: rowTs,
            originalIndex: itemIdx++,
          });
        }
        entries.push({
          date: annexDate,
          particulars: [formatAnnexParagraph(annex)],
          pageText,
          sortTimestamp: annexTs,
          originalIndex: itemIdx++,
        });
      } else {
        // Single row with both particulars and the annexure page
        entries.push({
          date: rowDate || annexDate,
          particulars: eventParagraphs,
          pageText,
          sortTimestamp: rowTs !== -999999999999 ? rowTs : (annexTs ?? -999999999999),
          originalIndex: itemIdx++,
        });
      }
    } else {
      // Multiple annexures on the same row: create distinct chronological rows for each
      if (rowEvent) {
        entries.push({
          date: rowDate,
          particulars: eventParagraphs,
          pageText: "",
          sortTimestamp: rowTs,
          originalIndex: itemIdx++,
        });
      }

      for (const annex of annexes) {
        const annexDate = toDisplayDate(annex.date) || rowDate;
        const annexTs = parseLegalDate(annexDate) ?? rowTs;
        const pageText = formatPageValue(pageByAnnexId[annex.id]);

        entries.push({
          date: annexDate,
          particulars: [formatAnnexParagraph(annex)],
          pageText,
          sortTimestamp: annexTs,
          originalIndex: itemIdx++,
        });
      }
    }
  }

  // 3. Process Impugned Orders (if applicable and not already an annexure)
  if (project.impugnedOrders && project.impugnedOrders.length > 0) {
    for (const order of project.impugnedOrders) {
      const rawDate = toDisplayDate(order.date);
      if (!rawDate && !order.court && !order.caseNumber) continue;
      const courtName = order.court === "Other" ? order.customCourt : order.court;
      const orderType = order.type || "Order";
      const desc = `True copy of the Impugned ${orderType}${rawDate ? ` dated ${rawDate}` : ""} passed by the ${courtName || "[Court]"}${order.caseNumber ? ` in ${order.caseNumber}` : ""}.`;

      const orderPage =
        pageByAnnexId[`impugnedOrder_${order.id}`] ??
        pageByAnnexId["impugnedOrder"] ??
        "";

      entries.push({
        date: rawDate,
        particulars: [
          new Paragraph({
            spacing: BRIEFING_SPACING,
            children: [
              smartTextRun({ text: `Impugned ${orderType}: `, bold: true }),
              smartTextRun(convertToSmartQuotes(desc)),
            ],
          }),
        ],
        pageText: formatPageValue(orderPage),
        sortTimestamp: parseLegalDate(rawDate) ?? 999999999900,
        originalIndex: itemIdx++,
      });
    }
  }

  // 4. Append Date of Filing of the present case
  const isCrl = project.caseType === "Criminal";
  let caseDocName = "Special Leave Petition";
  if (project.courtType === "Appeal") caseDocName = isCrl ? "Criminal Appeal" : "Civil Appeal";
  else if (project.courtType === "WritPetitionSC" || project.courtType === "WritPetitionDHC") caseDocName = "Writ Petition";
  else if (project.courtType === "WritPetitionPIL") caseDocName = "Writ Petition (PIL)";
  else if (project.courtType === "OriginalApplicationCAT") caseDocName = "Original Application";

  const filingDate = toDisplayDate(project.filingDate) || format(new Date(), "dd.MM.yyyy");
  const petitionPage = pageByAnnexId["petition"] ?? pageByAnnexId["slp"] ?? pageByAnnexId["oa"] ?? "";

  entries.push({
    date: filingDate,
    particulars: [
      new Paragraph({
        spacing: BRIEFING_SPACING,
        children: [
          smartTextRun({ text: "Filing: ", bold: true }),
          smartTextRun(convertToSmartQuotes(`Filing of the accompanying ${caseDocName}.`)),
        ],
      }),
    ],
    pageText: formatPageValue(petitionPage),
    sortTimestamp: parseLegalDate(filingDate) ?? 999999999999,
    originalIndex: itemIdx++,
  });

  // 5. Strict Chronological Sort with stable index tiebreaker
  entries.sort((a, b) => {
    if (a.sortTimestamp !== b.sortTimestamp) {
      return a.sortTimestamp - b.sortTimestamp;
    }
    return a.originalIndex - b.originalIndex;
  });

  return entries;
}

/**
 * Generates the Briefing Note .docx (base64 string).
 */
export async function generateBriefingNoteDocx(
  project: DraftoProject,
  pageByAnnexId: Record<string, string | number> = {},
): Promise<{ success: boolean; docx?: string; fileName: string }> {
  const numberingConfigs: any[] = [];

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Date", DATE_PCT),
      headerCell("Particulars", PARTICULARS_PCT),
      headerCell("Page Nos.", PAGE_PCT),
    ],
  });

  const timeline = buildBriefingTimeline(project, pageByAnnexId, numberingConfigs);

  const bodyRows = timeline.map((item) => {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: DATE_PCT, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.TOP,
          margins: cellMargins,
          children: [new Paragraph({ spacing: BRIEFING_SPACING, children: [smartTextRun(convertToSmartQuotes(item.date || ""))] })],
        }),
        new TableCell({
          width: { size: PARTICULARS_PCT, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.TOP,
          margins: cellMargins,
          children: item.particulars.length ? item.particulars : [new Paragraph({ spacing: BRIEFING_SPACING, children: [] })],
        }),
        new TableCell({
          width: { size: PAGE_PCT, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.TOP,
          margins: cellMargins,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: BRIEFING_SPACING, children: [smartTextRun(item.pageText)] })],
        }),
      ],
    });
  });

  const uniqueNumbering = numberingConfigs.filter((v, i, a) => a.findIndex((t) => t.reference === v.reference) === i);

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [DATE_PCT * 100, PARTICULARS_PCT * 100, PAGE_PCT * 100],
    borders: allBorders,
    rows: [headerRow, ...bodyRows],
  });

  const doc = new Document({
    styles: briefingStyles(),
    ...(uniqueNumbering.length ? { numbering: { config: uniqueNumbering } } : {}),
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 } } },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 140, line: 240 },
            children: [smartTextRun({ text: briefingCauseTitle(project), bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 180, line: 240 },
            children: [smartTextRun({ text: "SKELETAL BRIEFING NOTE", bold: true })],
          }),
          table,
        ],
      },
    ],
  });

  const docx = await Packer.toBase64String(doc);
  const firstWords = (s: string, n: number) => s.trim().split(/\s+/).slice(0, n).join(" ");
  const rawPet = project?.petitioners?.[0]?.name?.trim();
  const rawRes = project?.respondents?.[0]?.name?.trim();
  const pet = rawPet ? cleanProjectName(firstWords(rawPet, 3)) : null;
  const res = rawRes ? cleanProjectName(firstWords(rawRes, 3)) : null;
  const caseName = pet && res ? `${pet} v. ${res}` : pet || res || "";
  const fileName = caseName ? `${caseName} – Skeletal Briefing Note.docx` : "Skeletal Briefing Note.docx";
  return { success: true, docx, fileName };
}

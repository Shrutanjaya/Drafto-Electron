// Quick briefing note: a verbatim reproduction of the List of Dates as a
// 3-column table (Date | Particulars | Page Nos.), headed by the cause title.
// Offered after a successful paper-book generation. The page column carries the
// first paper-book page of the first annexure attached in that row (blank when
// the row has none). Content is intentionally minimal for now — it will be
// customised later — so this stays a thin, dependency-light generator.

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
import { getPartyHeader, smartTextRun, convertToSmartQuotes } from "@/lib/docx-helpers";
import { parseHtml } from "@/lib/html-to-docx";
import type { DraftoProject } from "@/lib/schema";

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

const cellMargins = { top: 40, bottom: 40, left: 115, right: 115 };
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder, insideHorizontal: cellBorder, insideVertical: cellBorder };

// "ABC v. XYZ, SLP(C) No. ___/2026" (or W.P.(C) for a writ petition).
export function briefingCauseTitle(project: DraftoProject): string {
  const pet = getPartyHeader(project.petitioners) || "[Petitioner]";
  const res = getPartyHeader(project.respondents) || "[Respondent]";
  const year = new Date().getFullYear();
  const bracket = project.caseType === "Criminal" ? "Crl." : "C";
  const kind = project.courtType === "WritPetitionDHC" ? "W.P." : "SLP";
  return `${pet} v. ${res}, ${kind}(${bracket}) No. ___/${year}`;
}

function headerCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    margins: cellMargins,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: BRIEFING_SPACING, children: [smartTextRun({ text, bold: true })] })],
  });
}

// Generate the briefing-note .docx (base64). `pageByAnnexId` maps an annexure id
// to the first paper-book page it occupies; rows whose annexures aren't in the
// map (or have none) get a blank page column.
export async function generateBriefingNoteDocx(
  project: DraftoProject,
  pageByAnnexId: Record<string, number> = {},
): Promise<{ success: boolean; docx?: string; fileName: string }> {
  const numbering: any[] = [];

  const headerRow = new TableRow({
    tableHeader: true,
    children: [headerCell("Date", 18), headerCell("Particulars", 66), headerCell("Page Nos.", 16)],
  });

  const bodyRows = (project.listOfDates || []).map((lod) => {
    // Verbatim particulars (rich text preserved).
    const parsed = parseHtml(lod.event || "", BRIEFING_SPACING);
    if (parsed.numbering.length) numbering.push(...parsed.numbering);
    const particulars = parsed.paragraphs.length ? parsed.paragraphs : [new Paragraph({ spacing: BRIEFING_SPACING, children: [] })];

    // First annexure in the row that landed on a known page.
    let pageText = "";
    for (const annex of lod.annexures || []) {
      const p = pageByAnnexId[annex.id];
      if (typeof p === "number" && p > 0) { pageText = String(p); break; }
    }

    return new TableRow({
      children: [
        new TableCell({
          width: { size: 18, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.TOP,
          margins: cellMargins,
          children: [new Paragraph({ spacing: BRIEFING_SPACING, children: [smartTextRun(convertToSmartQuotes(lod.date || ""))] })],
        }),
        new TableCell({
          width: { size: 66, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.TOP,
          margins: cellMargins,
          children: particulars,
        }),
        new TableCell({
          width: { size: 16, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.TOP,
          margins: cellMargins,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: BRIEFING_SPACING, children: [smartTextRun(pageText)] })],
        }),
      ],
    });
  });

  const uniqueNumbering = numbering.filter((v, i, a) => a.findIndex((t) => t.reference === v.reference) === i);

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [1600, 6400, 1600],
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
            spacing: { before: 0, after: 180, line: 240 },
            children: [smartTextRun({ text: briefingCauseTitle(project), bold: true })],
          }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 180, line: 240 }, children: [smartTextRun({ text: "BRIEFING NOTE", bold: true })] }),
          table,
        ],
      },
    ],
  });

  const docx = await Packer.toBase64String(doc);
  return { success: true, docx, fileName: "Briefing Note.docx" };
}

// Shared building blocks for Delhi High Court writ-petition documents. These
// mirror the SLP helpers in docx-helpers.ts but use the High Court cause title
// and the "Filed by" advocate block (the High Court has no Advocate-on-Record).

import {
  AlignmentType,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  VerticalAlign,
} from "docx";
import { format } from "date-fns";
import { smartTextRun } from "@/lib/docx-helpers";
import type { DraftoProject } from "@/lib/schema";

export const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "auto" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
  left: { style: BorderStyle.NONE, size: 0, color: "auto" },
  right: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
};

// Page margins — match the SLP defaults; the top margin leaves room for the
// top-right page number stamped at PDF-generation time.
export const wpMargins = {
  top: 1.5 * 1440,
  right: 1 * 1440,
  bottom: 1 * 1440,
  left: 1.5 * 1440,
};

// Output paragraph styling. Historical defaults (Times New Roman, 14pt, 1.5
// line, 12pt after, justified); settings-driven overrides arrive in Phase 6.
export function getWpStyles() {
  return {
    paragraphStyles: [
      {
        id: "Normal",
        name: "Normal",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: "Times New Roman", size: 28 }, // 14pt
        paragraph: {
          spacing: { line: 360, after: 240, before: 0 }, // 1.5 line, 12pt after
          alignment: AlignmentType.JUSTIFIED,
        },
      },
    ],
  };
}

const PETITION_LABEL: Record<DraftoProject["caseType"], string> = {
  Civil: "Civil",
  Criminal: "Criminal",
};

// The repeated cause title at the top of every WP component.
//   IN THE HIGH COURT OF DELHI AT NEW DELHI
//   <Civil|Criminal> Extraordinary Writ Jurisdiction        (italic)
//   Writ Petition (<Civil|Criminal>) No. _____ of <year>     (bold)
export function createWpHeader(
  caseType: DraftoProject["caseType"],
  opts?: { subTitle?: string },
) {
  const year = new Date().getFullYear();
  const label = PETITION_LABEL[caseType];
  const lines: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [smartTextRun({ text: "IN THE HIGH COURT OF DELHI AT NEW DELHI", size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [smartTextRun({ text: `${label} Extraordinary Writ Jurisdiction`, italics: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [smartTextRun({ text: `Writ Petition (${label}) No. _____ of ${year}`, bold: true, size: 28 })],
    }),
  ];
  // Optional sub-title (e.g. "C.M. No. ____ of <year> / in" for a CM header).
  if (opts?.subTitle) {
    lines.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 240, after: 240 },
        children: [smartTextRun({ text: opts.subTitle, bold: true, size: 28 })],
      }),
    );
  }
  return lines;
}

// "IN THE MATTER OF:" + petitioner / Versus / respondent block.
export function createWpPartiesHeader(petHeader: string, resHeader: string) {
  return [
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [smartTextRun("IN THE MATTER OF:")] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [6300, 3700],
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: petHeader, bold: true })] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER }),
            new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun("…Petitioner")] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ columnSpan: 2, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun("Versus")] })], borders: NO_BORDERS }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: resHeader, bold: true })] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER }),
            new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun("…Respondents")] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER }),
          ],
        }),
      ],
    }),
  ];
}

// The "Filed by" advocate block used at the foot of every WP component.
export function createWpFiledBy(project: DraftoProject): Paragraph[] {
  const adv = project.wp.advocate;
  const filingDate = project.advocate.filingDate ? format(new Date(project.advocate.filingDate), "dd.MM.yyyy") : "__.__.____";
  const place = project.advocate.filingPlace || "New Delhi";

  const idLine = [adv.enrolmentNo ? `Enrl. No.: ${adv.enrolmentNo}` : ""].filter(Boolean).join("");
  const contactLine = [adv.email, adv.phone].filter(Boolean).join(" | ");

  const lines: (Paragraph | null)[] = [
    new Paragraph({ spacing: { before: 240 }, children: [smartTextRun(`Filed on: ${filingDate}`)] }),
    new Paragraph({ children: [smartTextRun(`Place: ${place}`)] }),
    new Paragraph({ spacing: { before: 120 }, children: [smartTextRun("Filed by:")] }),
    adv.name ? new Paragraph({ spacing: { before: 240 }, children: [smartTextRun({ text: adv.name, bold: true })] }) : null,
    adv.firm ? new Paragraph({ children: [smartTextRun(adv.firm)] }) : null,
    adv.address ? new Paragraph({ children: [smartTextRun(adv.address)] }) : null,
    (idLine || contactLine) ? new Paragraph({ children: [smartTextRun([adv.enrolmentNo ? `Enrl. No.: ${adv.enrolmentNo}` : "", contactLine].filter(Boolean).join(" | "))] }) : null,
  ];
  return lines.filter((p): p is Paragraph => p !== null);
}

// Position label for a party in the Memo of Parties.
export function partyPosition(role: "Petitioner" | "Respondent", index: number, total: number): string {
  if (total <= 1) return `…${role}`;
  return `…${role} No. ${index + 1}`;
}

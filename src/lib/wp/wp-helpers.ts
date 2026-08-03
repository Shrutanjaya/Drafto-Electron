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
  ImageRun,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
} from "docx";
import { format } from "date-fns";
import { smartTextRun } from "@/lib/docx-helpers";
import type { DraftoProject } from "@/lib/schema";
import { getWpFiledBySignature, getWpMarginsIn, getWpOutputFormatting, getWpFiledByLeftPct, getWpFiledByLayout, wpFiledByLines, type WpFiledByLayoutItem } from "./wp-settings";

export const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "auto" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
  left: { style: BorderStyle.NONE, size: 0, color: "auto" },
  right: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
};

// Page margins — user-configurable (Settings → Writ Petition); historical
// defaults 1.5" top/left, 1" bottom/right. The top margin leaves room for the
// top-right page number stamped at PDF-generation time.
export function getWpMargins() {
  const m = getWpMarginsIn();
  return {
    top: Math.round(m.top * 1440),
    right: Math.round(m.right * 1440),
    bottom: Math.round(m.bottom * 1440),
    left: Math.round(m.left * 1440),
  };
}

// A4 width in twips; content width = page − left/right margins. Shared by the
// Filed-by signature anchor so it tracks the configured margins.
const A4_WIDTH_TWIPS = 11906;
export function wpContentWidthTwips(): number {
  const m = getWpMargins();
  return A4_WIDTH_TWIPS - m.left - m.right;
}

// Output paragraph styling — user-configurable (Settings → Writ Petition);
// historical defaults: Times New Roman, 14pt, 1.5 line, 0pt before / 12pt
// after, justified.
export function getWpStyles() {
  const f = getWpOutputFormatting();
  return {
    paragraphStyles: [
      {
        id: "Normal",
        name: "Normal",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: f.font, size: Math.round(f.sizePt * 2) }, // half-points
        paragraph: {
          spacing: {
            line: Math.round(f.lineSpacing * 240),  // multiplier of single (240)
            after: Math.round(f.afterPt * 20),      // twips (1pt = 20 twips)
            before: Math.round(f.beforePt * 20),
          },
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
  opts?: { cm?: boolean; size?: number },
) {
  const year = new Date().getFullYear();
  const label = PETITION_LABEL[caseType];
  // Follows the configured body size, unless the caller overrides it (the
  // vakalatnama uses its own smaller size so it fits one page).
  const headerSize = opts?.size ?? Math.round(getWpOutputFormatting().sizePt * 2);
  const centerBold = (text: string, italics = false) => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: 240, after: 240 },
    children: [smartTextRun({ text, bold: !italics, italics, size: headerSize })],
  });

  const lines: Paragraph[] = [
    centerBold("IN THE HIGH COURT OF DELHI AT NEW DELHI"),
    centerBold(`${label} Extraordinary Writ Jurisdiction`, true),
  ];
  if (opts?.cm) {
    // CM Appl. No. ____ of <year> / in / Writ Petition (…) No. ____ of <year>
    lines.push(
      centerBold(`CM Appl. No. _____ of ${year}`),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 240, after: 240 }, children: [smartTextRun({ text: "in", italics: true, size: headerSize })] }),
      centerBold(`Writ Petition (${label}) No. _____ of ${year}`),
    );
  } else {
    lines.push(centerBold(`Writ Petition (${label}) No. _____ of ${year}`));
  }
  return lines;
}

// Salutation block ("To / <addressee>…"). The opening "To" line is left as
// normal text; the addressee lines below it are indented 0.5" and italic. Zero
// after-spacing on every line except the last.
export function createSalutation(lines: string[]): Paragraph[] {
  return lines.map((text, i) => {
    const isFirst = i === 0;
    const isLast = i === lines.length - 1;
    return new Paragraph({
      ...(isFirst ? {} : { indent: { left: 720 } }),
      spacing: { after: isLast ? 240 : 0 },
      children: [smartTextRun({ text, italics: !isFirst })],
    });
  });
}

// "IN THE MATTER OF:" + petitioner / Versus / respondent block.
export function createWpPartiesHeader(petHeader: string, resHeader: string, o?: { size?: number }) {
  const sz = o?.size ? { size: o.size } : {};
  return [
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [smartTextRun({ text: "IN THE MATTER OF:", ...sz })] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [6300, 3700],
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: petHeader, ...sz })] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER }),
            new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun({ text: "…Petitioner", ...sz })] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ columnSpan: 2, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: "Versus", ...sz })] })], borders: NO_BORDERS }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: resHeader, ...sz })] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER }),
            new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun({ text: "…Respondents", ...sz })] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER }),
          ],
        }),
      ],
    }),
  ];
}

// The "Filed by" block at the foot of every WP component — a borderless
// two-column table: left = Filed on / Place, right = Filed by + advocate
// details. Left-aligned, single line spacing.
const filedByCellMargins = { top: 0, bottom: 0, left: 0, right: 115 };

export function createWpFiledBy(
  project: DraftoProject,
  opts?: {
    includeSignature?: boolean;
    showDrawnOn?: boolean;
    advocate?: DraftoProject["wp"]["advocate"];
    // Other document types (the CAT OA) supply their own layout / column split /
    // signature so their Filed-by block is configured independently of the WP one.
    layout?: WpFiledByLayoutItem[];
    leftPct?: number;
    signature?: { data: Uint8Array; widthPx: number; heightPx: number } | null;
  },
): (Paragraph | Table)[] {
  // Advocate data defaults to the WP block; other document types (e.g. the CAT
  // OA, whose Filed-by is identical to the WP one) pass their own advocate.
  const adv = opts?.advocate ?? project.wp.advocate;
  const filingDate = project.advocate.filingDate ? format(new Date(project.advocate.filingDate), "dd.MM.yyyy") : "__.__.____";
  const place = project.advocate.filingPlace || "New Delhi";
  const single = { line: 240, before: 0, after: 0 };
  const L = (text: string, bold = false) =>
    new Paragraph({ spacing: single, alignment: AlignmentType.LEFT, children: [smartTextRun(bold ? { text, bold: true } : text)] });

  // The advocate's signature (Settings → Writ Petition) floats above the name,
  // drawn behind the text so nothing is displaced — mirroring the SLP AoR
  // signature. Embedded only when the caller opts in (the PDF path); plain
  // .docx exports never carry it.
  const signature = opts?.includeSignature ? (opts?.signature !== undefined ? opts.signature : getWpFiledBySignature()) : null;
  const EMU_PER_PX = 9525;   // 914400 EMU/in ÷ 96 px/in
  const EMU_PER_PT = 12700;  // 914400 EMU/in ÷ 72 pt/in
  const SIGNATURE_OVERLAP_PT = 6; // signature dips this many pt into the name line
  // The right cell starts after the configured left-column share of the content
  // width (both Settings → Writ Petition); the image is anchored there so it
  // sits over the left-aligned advocate name.
  const leftPct = opts?.leftPct ?? getWpFiledByLeftPct();
  const RIGHT_CELL_OFFSET_EMU = Math.round((leftPct / 100) * (wpContentWidthTwips() / 1440) * 914400);
  const signatureRuns = signature
    ? [
        new ImageRun({
          data: signature.data,
          transformation: { width: signature.widthPx, height: signature.heightPx },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, offset: RIGHT_CELL_OFFSET_EMU },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: -(signature.heightPx * EMU_PER_PX - SIGNATURE_OVERLAP_PT * EMU_PER_PT) },
            behindDocument: true,
            allowOverlap: true,
            wrap: { type: TextWrappingType.NONE },
          },
        }),
      ]
    : [];

  const leftCell: Paragraph[] = [];
  // "Drawn on" appears only where the caller asks for it (the petition body's
  // Filed-by block) and only when the user has set the date.
  if (opts?.showDrawnOn && project.wp.drawnOnDate) {
    leftCell.push(L(`Drawn on: ${format(new Date(project.wp.drawnOnDate), "dd.MM.yyyy")}`));
  }
  leftCell.push(L(`Filed on: ${filingDate}`), L(`Place: ${place}`));

  const rightCell: Paragraph[] = [L("Filed by:")];
  if (adv.name) {
    rightCell.push(new Paragraph({ spacing: { line: 240, before: 240, after: 0 }, alignment: AlignmentType.LEFT, children: [...signatureRuns, smartTextRun({ text: adv.name, bold: true })] }));
  } else if (signatureRuns.length) {
    // No name entered — anchor the signature to the "Filed by:" line instead.
    rightCell[0] = new Paragraph({ spacing: single, alignment: AlignmentType.LEFT, children: [...signatureRuns, smartTextRun("Filed by:")] });
  }
  // Advocate-details lines follow the user-designed layout (order, " | " joins,
  // per-item bold/italics/underline/caps) from Settings → Writ Petition.
  const fbValues = {
    firm: adv.firm || "",
    address: adv.address || "",
    enrolmentNo: adv.enrolmentNo ? `Enrl. No.: ${adv.enrolmentNo}` : "",
    email: adv.email || "",
    phone: adv.phone || "",
  };
  for (const line of wpFiledByLines(opts?.layout ?? getWpFiledByLayout(), fbValues)) {
    const runs = line.flatMap((part, i) => [
      ...(i > 0 ? [smartTextRun(" | ")] : []),
      smartTextRun({
        text: part.text,
        ...(part.item.bold ? { bold: true } : {}),
        ...(part.item.italics ? { italics: true } : {}),
        ...(part.item.underline ? { underline: {} } : {}),
        ...(part.item.caps === "allCaps" ? { allCaps: true } : {}),
        ...(part.item.caps === "smallCaps" ? { smallCaps: true } : {}),
      }),
    ]);
    rightCell.push(new Paragraph({ spacing: single, alignment: AlignmentType.LEFT, children: runs }));
  }

  return [
    new Paragraph({ spacing: { before: 240 }, children: [] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [Math.round(leftPct * 100), Math.round((100 - leftPct) * 100)],
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: leftCell, borders: NO_BORDERS, verticalAlign: VerticalAlign.TOP, margins: filedByCellMargins }),
            new TableCell({ children: rightCell, borders: NO_BORDERS, verticalAlign: VerticalAlign.TOP, margins: filedByCellMargins }),
          ],
        }),
      ],
    }),
  ];
}

// Position label for a party in the Memo of Parties.
export function partyPosition(role: "Petitioner" | "Respondent", index: number, total: number): string {
  if (total <= 1) return `…${role}`;
  return `…${role} No. ${index + 1}`;
}

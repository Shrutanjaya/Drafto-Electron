
import {
  AlignmentType,
  BorderStyle,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from "docx";
import type { VaadiTableItem, Annexure } from "./schema";
import { format } from "date-fns";
import { parseHtml } from "./html-to-docx";
import { appealOrderRule, appealTitle } from "./appeal/appeal-provisions";
import { isAppeal } from "./court-family";
import { isHeaderPlural } from "./party-grammar";

export interface CoverPageSpacing {
  sizeHalfPt: number;
  line: number;
  headerLine: number;
  headerAfter: number;
  ioAfter: number;
  paraAfter: number;
  cellAfter: number;
  beforePaperbook: number;
}

/**
 * Computes adaptive spacing and font size for the Cover Page so that even when
 * a petition has a long cause title, SCI rule header, lengthy impugned-order block,
 * and multiple accompanying IAs, the cover page never spills onto a second page.
 */
export function computeCoverPageSpacing(opts: {
  baseSizePt?: number;
  marginTopTwips?: number;
  marginBottomTwips?: number;
  headerStyle?: "short" | "sci";
  isAppeal?: boolean;
  isScWp?: boolean;
  ioText?: string;
  petHeader?: string;
  resHeader?: string;
  withInterimRelief?: boolean;
  iaList?: { prefix: string; title: string }[];
  hasVolumeHeading?: boolean;
}): CoverPageSpacing {
  const baseSizePt = opts.baseSizePt ?? 14;
  const topTwips = opts.marginTopTwips ?? 2160;
  const bottomTwips = opts.marginBottomTwips ?? 1440;
  // A4 height is 16,838 twips. Reserve 700 twips at the foot for the bottom-anchored
  // "Advocate for the Petitioner: ..." frame plus safety headroom.
  const availableTwips = Math.max(8000, 16838 - topTwips - bottomTwips - 700);

  const headerTitleParas = opts.isScWp
    ? (opts.headerStyle === "sci" ? 4 : 3)
    : (opts.headerStyle === "sci" ? (opts.isAppeal ? 5 : 6) : 3);
  const ioChars = opts.isScWp ? 0 : ((opts.ioText || "").length + (opts.isAppeal ? 32 : 10));
  const ioLines = opts.isScWp ? 0 : Math.max(1, Math.ceil(ioChars / 58));

  const petLines = Math.max(1, Math.ceil((opts.petHeader || "").length / 34));
  const resLines = Math.max(1, Math.ceil((opts.resHeader || "").length / 34));
  const iaList = opts.iaList || [];
  const iaTotalLines = iaList.reduce((acc, ia) => acc + Math.max(1, Math.ceil((ia.title || "").length / 44)), 0);

  const candidates: CoverPageSpacing[] = [
    // 1. Standard (identical to classic spacious layout when content is light)
    { sizeHalfPt: baseSizePt * 2, line: 360, headerLine: 240, headerAfter: 240, ioAfter: 360, paraAfter: 240, cellAfter: 120, beforePaperbook: 240 },
    // 2. Moderate tightening
    { sizeHalfPt: baseSizePt * 2, line: 300, headerLine: 240, headerAfter: 160, ioAfter: 200, paraAfter: 160, cellAfter: 60, beforePaperbook: 140 },
    // 3. Snug
    { sizeHalfPt: baseSizePt * 2, line: 260, headerLine: 240, headerAfter: 100, ioAfter: 120, paraAfter: 100, cellAfter: 20, beforePaperbook: 80 },
    // 4. Compact (1pt smaller font, single-spaced)
    { sizeHalfPt: (baseSizePt - 1) * 2, line: 240, headerLine: 240, headerAfter: 60, ioAfter: 80, paraAfter: 60, cellAfter: 0, beforePaperbook: 40 },
    // 5. Ultra-compact (2pt smaller font, tight spacing for heavy IA lists)
    { sizeHalfPt: Math.max(22, (baseSizePt - 2) * 2), line: 230, headerLine: 220, headerAfter: 40, ioAfter: 60, paraAfter: 40, cellAfter: 0, beforePaperbook: 20 },
  ];

  const estimateHeight = (c: CoverPageSpacing): number => {
    const pt = c.sizeHalfPt / 2;
    const singleLineTwips = pt * 24; // 1pt = 20 twips, 1.2 line box factor = 24 twips
    const flowLineTwips = singleLineTwips * (c.line / 240);
    const hdrLineTwips = singleLineTwips * (c.headerLine / 240);

    let total = 0;
    // Header title lines
    total += headerTitleParas * (hdrLineTwips + c.headerAfter);
    // Against / Impugned Order block
    if (!opts.isScWp) {
      total += ioLines * hdrLineTwips + c.ioAfter;
    }
    // "IN THE MATTER OF:"
    total += flowLineTwips + c.paraAfter;
    // Parties table (pet + Versus + res)
    total += (petLines + 1 + resLines) * hdrLineTwips + 3 * c.cellAfter + c.paraAfter;
    // Interim relief line
    if (opts.withInterimRelief) {
      total += flowLineTwips + c.paraAfter;
    }
    // "WITH:" + IA table
    if (iaList.length > 0) {
      total += flowLineTwips + c.paraAfter;
      total += iaTotalLines * hdrLineTwips + iaList.length * 20 + c.paraAfter;
    }
    // Before PAPERBOOK (or VOLUME X) + PAPERBOOK + [For Index, please see inside]
    total += c.beforePaperbook + (opts.hasVolumeHeading ? flowLineTwips + c.paraAfter : 0);
    total += 2 * (flowLineTwips + c.paraAfter);
    return total;
  };

  for (const cand of candidates) {
    if (estimateHeight(cand) <= availableTwips) {
      return cand;
    }
  }
  return candidates[candidates.length - 1];
}

/**
 * Test whether a List of Dates row has non-blank particulars/event.
 * Used across all document generators to omit empty rows left in the UI.
 */
export function isLodRowNonEmpty(lod?: { event?: string }): boolean {
  return !!(lod?.event || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim();
}

/**
 * Converts straight quotes and apostrophes to smart (curly) quotes.
 * Handles all edge cases including:
 * - Opening vs closing double quotes
 * - Opening vs closing single quotes
 * - Apostrophes in contractions and possessives
 * - Nested quotes
 * - Quotes at boundaries (start/end of string)
 * - Quotes adjacent to punctuation
 */
export function convertToSmartQuotes(text: string): string {
  if (!text) return text;
  
  let result = '';
  const length = text.length;
  
  for (let i = 0; i < length; i++) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';
    const nextChar = i < length - 1 ? text[i + 1] : '';
    
    if (char === '"') {
      // Rule 1: Opening Quote (")
      // Apply if the quote is at the beginning, or preceded by whitespace, opening delimiters, or dashes
      const isOpening = 
        i === 0 || // At the very beginning of the text
        /[\s\(\[\{]/.test(prevChar) || // Preceded by whitespace or opening delimiter: (, [, {
        /[—–]/.test(prevChar); // Preceded by em dash or en dash
      
      // Rule 2: Closing Quote (")
      // If Rule 1 is not met, default to closing quote
      result += isOpening ? '\u201C' : '\u201D'; // " or "
    } 
    else if (char === "'") {
      // Handle apostrophes and single quotes
      const prevIsLetter = /[a-zA-Z]/.test(prevChar);
      const nextIsLetter = /[a-zA-Z]/.test(nextChar);
      const prevIsDigit = /[0-9]/.test(prevChar);
      
      // Apostrophe in contractions (don't, it's, I'm)
      if (prevIsLetter && nextIsLetter) {
        result += '\u2019'; // '
      }
      // Possessive apostrophe (John's, dogs', '90s)
      else if ((prevIsLetter || prevIsDigit) && (nextIsLetter || nextChar === 's' || /[\s,;:.!?)\]}]/.test(nextChar) || nextChar === '')) {
        result += '\u2019'; // '
      }
      // Opening single quote
      else if (
        i === 0 || // Start of string
        /[\s\(\[\{—–-]/.test(prevChar) || // After whitespace or opening punctuation
        prevChar === '"' || // After opening double quote
        /[.!?,;:]/.test(prevChar) // After sentence-ending punctuation
      ) {
        result += '\u2018'; // '
      }
      // Closing single quote
      else if (
        i === length - 1 || // End of string
        /[\s,;:.!?)\]}]/.test(nextChar) || // Before whitespace or closing punctuation
        nextChar === '"' // Before closing double quote
      ) {
        result += '\u2019'; // '
      }
      // Default to right single quote (most common case)
      else {
        result += '\u2019'; // '
      }
    }
    else {
      result += char;
    }
  }
  
  return result;
}

// Helper function to create TextRun with automatic smart quotes conversion
export const smartTextRun = (options: string | { text: string; [key: string]: any }) => {
  if (typeof options === 'string') {
    return new TextRun(convertToSmartQuotes(options));
  }
  return new TextRun({
    ...options,
    text: convertToSmartQuotes(options.text)
  });
};

export const getPartyHeader = (parties: VaadiTableItem[] | undefined): string => {
  if (!parties || parties.length === 0 || !parties[0]?.name) return "";
  if (parties.length === 1) return parties[0].name;
  if (parties.length === 2) return `${parties[0].name} & Anr.`;
  return `${parties[0].name} & Ors.`;
};


/**
 * The title block above the petition.
 *
 * `short` is the block Drafto has always produced. `sci` follows the format
 * published by the Supreme Court: the rule citation under the court name, the
 * jurisdiction in capitals, and the Article 136 line under "SPECIAL LEAVE
 * PETITION". The rule cited depends on the SLP type — Order XXI Rule 3(1)(a)
 * for civil, Order XXII Rule 2(1) for criminal.
 */
export const createSlpHeader = (
  caseType: string,
  ioText: string,
  headerStyle: 'short' | 'sci' = 'short',
  // Set for the statutory-appeal tool. The Appeal shares this header with the
  // SLP and differs in three places: the rule cited, the document's name, and
  // the closing block, which names the provision the appeal is brought under.
  // Absent, every SLP renders exactly as before.
  appeal?: { provision: string; provisionId?: string },
  pageBreakBefore = false,
  coverSpacing?: CoverPageSpacing,
) => {
  const currentYear = new Date().getFullYear();
  const sz = coverSpacing ? coverSpacing.sizeHalfPt : 28;
  const hdrLine = coverSpacing ? coverSpacing.headerLine : 240;
  const hdrAfter = coverSpacing ? coverSpacing.headerAfter : 240;
  const ioAfter = coverSpacing ? coverSpacing.ioAfter : 360;
  const centered = (text: string, extra: Record<string, unknown> = {}, breakBefore = false) =>
    new Paragraph({
      pageBreakBefore: breakBefore || undefined,
      alignment: AlignmentType.CENTER,
      spacing: { line: hdrLine, after: hdrAfter },
      children: [smartTextRun({ text, size: sz, ...extra })],
    });

  const sciBlock = headerStyle === 'sci'
    ? [
        centered("IN THE SUPREME COURT OF INDIA", {}, pageBreakBefore),
        centered(appeal
          ? `[S.C.R., ${appealOrderRule(caseType, appeal.provisionId)}]`
          : caseType === 'Criminal'
            ? "[S.C.R., Order XXII Rule 2(1)]"
            : "[S.C.R., Order XXI Rule 3(1)(a)]"),
        centered(`${caseType.toUpperCase()} APPELLATE JURISDICTION`),
        centered(appeal ? appealTitle(caseType).toUpperCase() : "SPECIAL LEAVE PETITION"),
        ...(appeal ? [] : [centered("(Under Article 136 of the Constitution of India)")]),
      ]
    : null;

  return [
    ...(sciBlock ?? [
    new Paragraph({
      pageBreakBefore: pageBreakBefore || undefined,
      alignment: AlignmentType.CENTER,
      spacing: { line: hdrLine, after: hdrAfter },
      children: [
        smartTextRun({
          text: "IN THE SUPREME COURT OF INDIA",
          size: sz,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: hdrLine, after: hdrAfter },
      children: [
        smartTextRun({
          text: `${caseType} Appellate Jurisdiction`,
          italics: true,
          size: sz,
        }),
      ],
    }),
    ]),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: hdrLine, after: hdrAfter },
      children: [
        smartTextRun({
          text: appeal
            ? `${appealTitle(caseType)} No. _______ of ${currentYear}`
            : `Special Leave Petition (${caseType}) No. _______ of ${currentYear}`,
          bold: true,
          size: sz,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: 720, right: 720 }, // 0.5 inch indent
      spacing: { line: hdrLine, after: ioAfter },
      children: [
        smartTextRun({
          // The appeal states the provision it is brought under, in square
          // brackets, immediately before the order appealed against.
          text: appeal
            ? `[Under ${appeal.provision} against${ioText}]`
            : `Against${ioText}`,
          ...(coverSpacing ? { size: sz } : {}),
        }),
      ],
    }),
  ];
};

export const createIaHeader = (caseType: string, courtType?: string) => {
  const currentYear = new Date().getFullYear();
  const iaLabel = caseType === 'Criminal' ? 'Crl. M.P. No.' : 'I.A. No.';
  const isApp = isAppeal(courtType);
  const parentDocName = isApp
    ? `${appealTitle(caseType)} No. _______ of ${currentYear}`
    : `Special Leave Petition (${caseType}) No. _______ of ${currentYear}`;

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({ text: "IN THE SUPREME COURT OF INDIA", size: 28 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({ text: `${caseType} Appellate Jurisdiction`, italics: true, size: 28 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({ text: `${iaLabel} _______ of ${currentYear}`, bold: true, size: 28 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({ text: "in", size: 28 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({
          text: parentDocName,
          bold: true,
          size: 28,
        }),
      ],
    }),
  ];
};

export const createPartiesHeader = (
  petHeader: string,
  resHeader: string,
  partyNoun: string = "Petitioner",
  opts?: { multiPet?: boolean; multiRes?: boolean; coverSpacing?: CoverPageSpacing },
) => {
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
  };

  const multiPet = opts?.multiPet ?? isHeaderPlural(petHeader);
  const multiRes = opts?.multiRes ?? isHeaderPlural(resHeader);
  const petLabel = `...${partyNoun}${multiPet ? "s" : ""}`;
  const resLabel = `...Respondent${multiRes ? "s" : ""}`;
  const cs = opts?.coverSpacing;
  const runSz = cs ? { size: cs.sizeHalfPt } : {};
  const cellParaSpacing = cs ? { line: cs.headerLine, after: cs.cellAfter, before: 0 } : undefined;

  return [
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      ...(cs ? { spacing: { line: cs.line, after: cs.paraAfter, before: 0 } } : {}),
      children: [smartTextRun({ text: "IN THE MATTER OF:", ...runSz })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [6300, 3700],
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                ...(cellParaSpacing ? { spacing: cellParaSpacing } : {}),
                children: [smartTextRun({ text: petHeader, ...runSz })],
              })],
              borders: noBorders,
              verticalAlign: VerticalAlign.CENTER,
            }),
            new TableCell({
              children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                ...(cellParaSpacing ? { spacing: cellParaSpacing } : {}),
                children: [smartTextRun({ text: petLabel, ...runSz })],
              })],
              borders: noBorders,
              verticalAlign: VerticalAlign.CENTER,
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 2,
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                ...(cellParaSpacing ? { spacing: cellParaSpacing } : {}),
                children: [smartTextRun({ text: "Versus", ...runSz })],
              })],
              borders: noBorders,
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                ...(cellParaSpacing ? { spacing: cellParaSpacing } : {}),
                children: [smartTextRun({ text: resHeader, ...runSz })],
              })],
              borders: noBorders,
              verticalAlign: VerticalAlign.CENTER,
            }),
            new TableCell({
              children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                ...(cellParaSpacing ? { spacing: cellParaSpacing } : {}),
                children: [smartTextRun({ text: resLabel, ...runSz })],
              })],
              borders: noBorders,
              verticalAlign: VerticalAlign.CENTER,
            }),
          ],
        }),
      ],
    }),
  ];
};

export const createWithTable = (
  iaList: { prefix: string; title: string }[],
  withInterimRelief = false,
  coverSpacing?: CoverPageSpacing,
) => {
  const runSz = coverSpacing ? { size: coverSpacing.sizeHalfPt } : {};
  const flowSpacing = coverSpacing
    ? { line: coverSpacing.line, after: coverSpacing.paraAfter, before: 0 }
    : undefined;

  // Cover-page interim-relief notation, shown just above the "WITH:" list when the
  // SLP includes a prayer for interim relief (bold, centred, all caps).
  const interimReliefLine = withInterimRelief
    ? [new Paragraph({
        alignment: AlignmentType.CENTER,
        ...(flowSpacing ? { spacing: flowSpacing } : {}),
        children: [smartTextRun({ text: "WITH PRAYER FOR INTERIM RELIEF", bold: true, ...runSz })],
      })]
    : [];

  // No accompanying IAs → still emit the interim-relief line if applicable.
  if (iaList.length === 0) return interimReliefLine;

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
  };
  
  const paraSpacing = { line: coverSpacing ? coverSpacing.headerLine : 240, before: 0, after: 0 };

  const tableRows = iaList.map(ia => {
    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({
            children: [smartTextRun({ text: ia.prefix, bold: true, ...runSz })],
            alignment: AlignmentType.LEFT,
            spacing: paraSpacing,
          })],
          borders: noBorders,
           width: {
            size: 2268, // 4cm in dxa
            type: WidthType.DXA,
          },
        }),
        new TableCell({
          children: [new Paragraph({
            children: [smartTextRun({ text: ia.title, ...runSz })],
            spacing: paraSpacing,
          })],
          borders: noBorders,
          width: {
            size: 5670, // 10cm in dxa
            type: WidthType.DXA,
          },
        }),
      ],
    });
  });

  return [
    ...interimReliefLine,
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      ...(flowSpacing ? { spacing: flowSpacing } : {}),
      children: [smartTextRun({ text: "WITH: ", ...runSz })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [2500, 7500],
      borders: noBorders,
      rows: tableRows,
    }),
  ];
};


/**
 * Reads the AoR signature settings from localStorage. Runs in the renderer
 * (the same context that generates the .docx). Returns null when no signature
 * is configured or the "place in paperbook" toggle is off.
 */
const getFiledBySignature = (isScWp = false): { data: Uint8Array; widthPx: number; heightPx: number } | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem('drafto-settings');
        if (!raw) return null;
        const s = JSON.parse(raw);
        const placeSig = isScWp ? (s.scWpPlaceSignatureInPaperbook ?? s.placeSignatureInPaperbook) : s.placeSignatureInPaperbook;
        const sigPng = isScWp ? (s.scWpAorSignaturePng || s.aorSignaturePng) : s.aorSignaturePng;
        const sigW = isScWp ? (s.scWpAorSignatureW || s.aorSignatureW) : s.aorSignatureW;
        const sigH = isScWp ? (s.scWpAorSignatureH || s.aorSignatureH) : s.aorSignatureH;
        if (!placeSig || !sigPng || !sigW || !sigH) return null;
        const base64 = String(sigPng).split(',').pop() || '';
        const widthPx = Math.max(24, Math.round((isScWp ? (s.scWpSignatureSizePx ?? s.signatureSizePx) : s.signatureSizePx) ?? 120));
        const heightPx = Math.max(1, Math.round(widthPx * (sigH / sigW)));
        return { data: base64ToBuffer(base64), widthPx, heightPx };
    } catch {
        return null;
    }
};

export const createFiledByTable = (
    filingDate: Date,
    aorName: string,
    opts?: { fontSizePt?: number; lineSpacing?: number; paraSpacingPt?: number; includeSignature?: boolean; isScWp?: boolean; trailingParagraph?: boolean }
) => {
    const formattedDate = filingDate ? format(new Date(filingDate), "dd.MM.yyyy") : "";
    const noBorders = {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    };
    // Spacing follows caller-supplied formatting when present (e.g. the Advocate's
    // Checklist), otherwise the historical default (single line, no after-spacing).
    const paraSpacing = {
        after: opts?.paraSpacingPt != null ? Math.round(opts.paraSpacingPt * 20) : 0,
        line: opts?.lineSpacing != null ? Math.round(opts.lineSpacing * 240) : 240,
    };
    // Half-point run size, when a caller specifies a font size.
    const runSize = opts?.fontSizePt != null ? Math.round(opts.fontSizePt * 2) : undefined;
    const fbRun = (text: string) => smartTextRun(runSize != null ? { text, size: runSize } : text);

    // The signature is a *floating* image anchored to the "Filed by" line and drawn
    // behind the document text, so it overlays the page without displacing any
    // content (the line never gets pushed down). It is right-aligned to the cell
    // column and lifted above the baseline by its own height so it sits over the name.
    // Only embedded when the caller opts in (the PDF path) — plain .docx exports must
    // never carry the AoR signature, so drafts can be shared without it.
    const signature = opts?.includeSignature ? getFiledBySignature(opts?.isScWp) : null;
    const EMU_PER_PX = 9525;   // 914400 EMU/in ÷ 96 px/in
    const EMU_PER_PT = 12700;  // 914400 EMU/in ÷ 72 pt/in
    const SIGNATURE_OVERLAP_PT = 6; // signature dips this many pt into the "Filed by" line
    const signatureRuns = signature
        ? [
            new ImageRun({
                data: signature.data,
                transformation: { width: signature.widthPx, height: signature.heightPx },
                floating: {
                    horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, align: HorizontalPositionAlign.RIGHT },
                    verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: -(signature.heightPx * EMU_PER_PX - SIGNATURE_OVERLAP_PT * EMU_PER_PT) },
                    behindDocument: true,
                    allowOverlap: true,
                    wrap: { type: TextWrappingType.NONE },
                },
            }),
        ]
        : [];

    return [
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [5000, 5000],
            borders: noBorders,
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            children: [
                                new Paragraph({ children: [fbRun(`Date: ${formattedDate}`)], spacing: paraSpacing }),
                                new Paragraph({ children: [fbRun("Place: New Delhi")], spacing: paraSpacing })
                            ],
                            borders: noBorders,
                        }),
                        new TableCell({
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.RIGHT,
                                    children: [
                                        ...signatureRuns,
                                        fbRun(`Filed by: ${aorName}`),
                                    ],
                                    spacing: paraSpacing,
                                }),
                                new Paragraph({
                                    alignment: AlignmentType.RIGHT,
                                    children: [
                                        fbRun("Advocate for the Petitioner")
                                    ],
                                    spacing: paraSpacing,
                                })
                            ],
                            borders: noBorders,
                        }),
                    ]
                })
            ]
        }),
        // Minimal 1pt trailing paragraph so Word/LibreOffice attaches <w:sectPr>
        // here instead of synthesizing a full-height Normal paragraph after the
        // table (which pushes an otherwise full page onto a trailing blank page).
        // Omitted when another paragraph (e.g. a pageBreakBefore Certificate header)
        // immediately follows the table in the same section.
        ...(opts?.trailingParagraph === false ? [] : [
            new Paragraph({
                spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
                children: [new TextRun({ text: "", size: 2 })],
            }),
        ]),
    ]
}

export const createAnnexureText = (pNumber: number, annex: Annexure, forIndex: boolean = false, prefix: string = "P"): (TextRun | string)[] => {
    let copyType = (annex.copyType || '[copy type]');
    if (forIndex) {
        copyType = copyType.charAt(0).toUpperCase() + copyType.slice(1);
    }
    const annexureLabel = `Annexure ${prefix}-${pNumber}`;

    const parts: (TextRun | string)[] = [
        smartTextRun({ text: annexureLabel, bold: true }),
        convertToSmartQuotes(`: ${copyType} of ${annex.title || '[description]'}`)
    ];

    if (annex.date) {
        parts.push(convertToSmartQuotes(` dated ${annex.date}`));
    }
    if (annex.customText) {
        parts.push(convertToSmartQuotes(` ${annex.customText}`));
    }
    
    // Auto-append period if user forgot (trim trailing whitespace first)
    const lastPart = parts[parts.length - 1];
    if (typeof lastPart === 'string') {
        const trimmed = lastPart.trimEnd();
        parts[parts.length - 1] = trimmed.match(/[.!?]$/) ? trimmed : trimmed + '.';
    }
    
    return parts;
};

export const createIaAnnexureText = (aNumber: number, annex: any, forIndex: boolean = false): (TextRun | string)[] => {
    const annexureLabel = `Annexure A-${aNumber}`;

    const parts: (TextRun | string)[] = [
        smartTextRun({ text: annexureLabel, bold: true }),
        convertToSmartQuotes(`: ${annex.title || '[description]'}`)
    ];

    if (annex.date) {
        parts.push(convertToSmartQuotes(` dated ${annex.date}`));
    }
    
    // Auto-append period if user forgot
    const lastPart = parts[parts.length - 1];
    if (typeof lastPart === 'string' && !lastPart.match(/[.!?]$/)) {
        parts[parts.length - 1] = lastPart + '.';
    }
    
    return parts;
};


export const createHtmlParagraph = (html: string): Paragraph[] => {
  if (!html) {
    return [new Paragraph("")];
  }
  const { paragraphs, numbering } = parseHtml(html);
  // This is a simplification. If numbering is used, the Document object needs the config.
  // For now, assuming createHtmlParagraph is used in contexts where complex numbering isn't the primary goal.
  return paragraphs;
};

export const base64ToBuffer = (b64: string): Uint8Array => {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

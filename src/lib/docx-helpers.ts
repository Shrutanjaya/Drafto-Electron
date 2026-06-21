
import {
  AlignmentType,
  BorderStyle,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
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


export const createSlpHeader = (caseType: string, ioText: string) => {
  const currentYear = new Date().getFullYear();
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({
          text: "IN THE SUPREME COURT OF INDIA",
          size: 28, // 14pt
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({
          text: `${caseType} Appellate Jurisdiction`,
          italics: true,
          size: 28, // 14pt
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({
          text: `Special Leave Petition (${caseType}) No. _______ of ${currentYear}`,
          bold: true,
          size: 28, // 14pt
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: 720, right: 720 }, // 0.5 inch indent
      spacing: { line: 240, after: 360 }, // 18pt after
      children: [
        smartTextRun({
          text: `Against${ioText}`,
        }),
      ],
    }),
  ];
};

export const createIaHeader = (caseType: string) => {
  const currentYear = new Date().getFullYear();
  const iaLabel = caseType === 'Criminal' ? 'Crl. M.P. No.' : 'I.A. No.';

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
          text: `Special Leave Petition (${caseType}) No. _______ of ${currentYear}`,
          bold: true,
          size: 28,
        }),
      ],
    }),
  ];
};

export const createPartiesHeader = (petHeader: string, resHeader: string) => {
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
  };

  return [
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [smartTextRun("IN THE MATTER OF:")],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      // Right column holds "...Petitioner(s)" / "...Respondent(s)"; widened so the
      // label fits on one line even in wider fonts (e.g. Arial) at the constrained
      // size, avoiding a forced break that splits the closing bracket.
      columnWidths: [6300, 3700],
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph(petHeader)],
              borders: noBorders,
              verticalAlign: VerticalAlign.CENTER,
            }),
            new TableCell({
              children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                // Word joiners (U+2060) keep "(s)" from breaking onto a new line
                // (some renderers split before the ")") so the label stays intact.
                children: [smartTextRun("...Petitioner⁠(⁠s⁠)")],
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
                children: [smartTextRun("Versus")],
              })],
              borders: noBorders,
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph(resHeader)],
              borders: noBorders,
              verticalAlign: VerticalAlign.CENTER,
            }),
            new TableCell({
              children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [smartTextRun("...Respondent⁠(⁠s⁠)")],
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

export const createWithTable = (iaList: { prefix: string; title: string }[]) => {
  if (iaList.length === 0) return [];

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
  };
  
  const paraSpacing = { line: 240, before: 0, after: 0 };

  const tableRows = iaList.map(ia => {
    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({
            children: [smartTextRun({ text: ia.prefix, bold: true })],
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
          children: [new Paragraph({ text: ia.title, spacing: paraSpacing })],
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
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [smartTextRun("WITH: ")],
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
const getFiledBySignature = (): { data: Uint8Array; widthPx: number; heightPx: number } | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem('drafto-settings');
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (!s.placeSignatureInPaperbook || !s.aorSignaturePng || !s.aorSignatureW || !s.aorSignatureH) return null;
        const base64 = String(s.aorSignaturePng).split(',').pop() || '';
        const widthPx = Math.max(24, Math.round(s.signatureSizePx ?? 120));
        const heightPx = Math.max(1, Math.round(widthPx * (s.aorSignatureH / s.aorSignatureW)));
        return { data: base64ToBuffer(base64), widthPx, heightPx };
    } catch {
        return null;
    }
};

export const createFiledByTable = (
    filingDate: Date,
    aorName: string,
    opts?: { fontSizePt?: number; lineSpacing?: number; paraSpacingPt?: number }
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
    const signature = getFiledBySignature();
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
        })
    ]
}

export const createAnnexureText = (pNumber: number, annex: Annexure, forIndex: boolean = false): (TextRun | string)[] => {
    let copyType = (annex.copyType || '[copy type]');
    if (forIndex) {
        copyType = copyType.charAt(0).toUpperCase() + copyType.slice(1);
    }
    const annexureLabel = `Annexure P-${pNumber}`;

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

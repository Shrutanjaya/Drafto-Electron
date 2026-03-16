
import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
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
    new Paragraph({ text: "" }),
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
    new Paragraph({ text: "" }),
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
                children: [smartTextRun("...Petitioner(s)")],
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
                children: [smartTextRun("...Respondent(s)")],
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
      borders: noBorders,
      rows: tableRows,
    }),
  ];
};


export const createFiledByTable = (filingDate: Date, aorName: string) => {
    const formattedDate = filingDate ? format(new Date(filingDate), "dd.MM.yyyy") : "";
    const noBorders = {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    };
    const paraSpacing = { after: 0, line: 240 };

    return [
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorders,
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            children: [
                                new Paragraph({ text: `Date: ${formattedDate}`, spacing: paraSpacing }),
                                new Paragraph({ text: "Place: New Delhi", spacing: paraSpacing })
                            ],
                            borders: noBorders,
                        }),
                        new TableCell({
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.RIGHT,
                                    children: [
                                        smartTextRun(`Filed by: ${aorName}`),
                                    ],
                                    spacing: paraSpacing,
                                }),
                                new Paragraph({
                                    alignment: AlignmentType.RIGHT,
                                    children: [
                                        smartTextRun("Advocate for the Petitioner")
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

export const base64ToBuffer = (b64: string): Buffer => {
    return Buffer.from(b64, 'base64');
}

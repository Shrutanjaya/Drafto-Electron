import { Packer, Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, VerticalAlign, BorderStyle, ISectionOptions, SectionType, Header, Footer, FrameAnchorType, HorizontalPositionAlign, VerticalPositionAlign, PageBreak } from "docx";
import { format } from "date-fns";
import type { DraftoProject, Annexure, CustomIa } from "@/lib/schema";
import {
  smartTextRun,
  convertToSmartQuotes,
  getPartyHeader,
  createAnnexureText,
  createIaAnnexureText,
  createFiledByTable,
  createPartiesHeader,
  createWithTable,
} from "@/lib/docx-helpers";
import { parseHtml, setDocxExportContext, type ListGeom } from "@/lib/html-to-docx";
import { cascadeFor, type EnumStyle } from "@/lib/wp/wp-numbering";
import type { WpNumbering } from "@/lib/wp/wp-settings";
import {
  annexureRangeText,
} from "@/lib/actions";

// ── Supreme Court Writ Petition Settings Helpers ──────────────────────────────
// Read settings from drafto-settings in localStorage, falling back to general/SLP settings.

export const getScWpOutputFormatting = () => {
  const d = { font: "Times New Roman", sizePt: 14, lineSpacing: 1.5, afterPt: 12 };
  if (typeof window === "undefined") return d;
  try {
    const raw = window.localStorage.getItem("drafto-settings");
    if (!raw) return d;
    const s = JSON.parse(raw);
    return {
      font: s.scWpOutputFont || s.outputFont || d.font,
      sizePt: s.scWpOutputFontSizePt ?? s.outputFontSizePt ?? d.sizePt,
      lineSpacing: s.scWpOutputLineSpacing ?? s.outputLineSpacing ?? d.lineSpacing,
      afterPt: s.scWpOutputParaAfterPt ?? s.outputParaAfterPt ?? d.afterPt,
    };
  } catch {
    return d;
  }
};

export const getScWpQuoteSettings = () => {
  const d = { quoteLineSpacing: "default" as "default" | "single", quoteItalics: true };
  if (typeof window === "undefined") return d;
  try {
    const raw = window.localStorage.getItem("drafto-settings");
    if (!raw) return d;
    const s = JSON.parse(raw);
    return {
      quoteLineSpacing: (s.scWpQuoteLineSpacing || s.quoteLineSpacing || d.quoteLineSpacing) as "default" | "single",
      quoteItalics: s.scWpQuoteItalics !== undefined ? s.scWpQuoteItalics : (s.quoteItalics !== false),
    };
  } catch {
    return d;
  }
};

export const getScWpNumbering = (): WpNumbering => {
  const d: WpNumbering = { facts: "lower-alpha", grounds: "upper-alpha", prayers: "lower-alpha" };
  if (typeof window === "undefined") return d;
  try {
    const raw = window.localStorage.getItem("drafto-settings");
    if (!raw) return d;
    const s = JSON.parse(raw);
    const n = s.scWpNumbering || {};
    return {
      facts: n.facts || d.facts,
      grounds: n.grounds || d.grounds,
      prayers: n.prayers || d.prayers,
    };
  } catch {
    return d;
  }
};

export const getScWpDefaultStyles = () => {
  const f = getScWpOutputFormatting();
  return {
    paragraphStyles: [
      {
        id: "Normal",
        name: "Normal",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: {
          font: f.font,
          size: Math.round(f.sizePt * 2), // half-points
        },
        paragraph: {
          spacing: {
            line: Math.round(f.lineSpacing * 240), // multiplier of single (240)
            after: Math.round(f.afterPt * 20),     // twips (1pt = 20 twips)
            before: 0,
          },
          alignment: AlignmentType.JUSTIFIED,
        },
      },
    ],
  };
};

export const getScWpMargins = () => {
  const d = { top: 2160, right: 1440, bottom: 1440, left: 2160 }; // in twips: 1.5", 1", 1", 1.5"
  if (typeof window === "undefined") return d;
  try {
    const raw = window.localStorage.getItem("drafto-settings");
    if (!raw) return d;
    const s = JSON.parse(raw);
    const clamp = (v: any, fallback: number) => {
      const n = typeof v === "number" ? v : parseFloat(v);
      return isFinite(n) ? Math.round(Math.min(3, Math.max(0.2, n)) * 1440) : fallback;
    };
    return {
      top: clamp(s.scWpMarginTopIn ?? s.slpMarginTopIn, d.top),
      right: clamp(s.scWpMarginRightIn ?? s.slpMarginRightIn, d.right),
      bottom: clamp(s.scWpMarginBottomIn ?? s.slpMarginBottomIn, d.bottom),
      left: clamp(s.scWpMarginLeftIn ?? s.slpMarginLeftIn, d.left),
    };
  } catch {
    return d;
  }
};

export const getScWpDraftingPreferences = () => {
  const d = { headingBreak: false, translatedCopyFirst: false, headerStyle: "short" as "short" | "sci" };
  if (typeof window === "undefined") return d;
  try {
    const raw = window.localStorage.getItem("drafto-settings");
    if (!raw) return d;
    const s = JSON.parse(raw);
    return {
      headingBreak: s.scWpHeadingBreak ?? s.slpHeadingBreak ?? d.headingBreak,
      translatedCopyFirst: s.scWpTranslatedCopyFirst ?? s.slpTranslatedCopyFirst ?? d.translatedCopyFirst,
      headerStyle: (s.scWpHeaderStyle ?? s.slpHeaderStyle ?? d.headerStyle) as "short" | "sci",
    };
  } catch {
    return d;
  }
};

export const scWpAffidavitWantsBlankAnnexureRange = () => {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("drafto-settings");
    if (!raw) return false;
    const s = JSON.parse(raw);
    return (s.scWpAffidavitAnnexureRef ?? s.slpAffidavitAnnexureRef) === "blank";
  } catch {
    return false;
  }
};
import {
  getActiveAppendixItems,
  appendixIndexText,
  appendixLabel,
  appendixBodyText,
  appendixItemIdFromComponentId,
  isAppendixComponentId,
} from "@/lib/appendix";
export { wpAnnexureOrderFromLods } from "@/lib/wp/wp-annexures";
import { wpAnnexureOrderFromLods } from "@/lib/wp/wp-annexures";
import { inlineHtml, factsAnnexureSentenceParts, withAnnexureCustomText, injectAnnexurePageRangesIntoFacts, transposeLodToFacts } from "@/lib/wp/wp-facts";
import { resolveFactsHtml } from "@/lib/wp/facts-mode";
import { groundsSequence, getGroundsHeadingStyle, groundsHeadingRuns, groundsHeadingHang } from "@/lib/grounds-headings";

const defaultCellMargins = { top: 100, bottom: 100, left: 150, right: 150 };
const tableParagraphSpacing = { after: 0, line: 240 };
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "auto" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
  left: { style: BorderStyle.NONE, size: 0, color: "auto" },
  right: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
};

const SC_WP_FACTS_LIST_GEOM: ListGeom = {
  base: 720,
  step: 360,
  itemLeft: 1080,
  itemStep: 360,
  itemHanging: 360,
};

function applyScWpFactsCascade(numbering: any[], style: EnumStyle = "lower-alpha") {
  const cascade = cascadeFor(style);
  for (const cfg of numbering) {
    if (typeof cfg?.reference === "string" && /^olx?-/.test(cfg.reference) && Array.isArray(cfg.levels)) {
      cfg.levels.forEach((lvl: any, i: number) => {
        if (cascade[i]) lvl.format = cascade[i];
        lvl.style = {
          paragraph: {
            indent: {
              left: 1080 + i * 360,
              hanging: 360,
            },
          },
        };
      });
    }
  }
}

export const createScWpHeader = (caseType: string) => {
  const currentYear = new Date().getFullYear();
  const f = getScWpOutputFormatting();
  const headerSize = Math.round(f.sizePt * 2);
  const prefs = getScWpDraftingPreferences();

  const paragraphs: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({
          text: "IN THE SUPREME COURT OF INDIA",
          size: headerSize,
        }),
      ],
    }),
  ];

  if (prefs.headerStyle === "sci") {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 240, after: 240 },
        children: [
          smartTextRun({
            text: "[S.C.R., Order XXXVIII, Rule 1(1)]",
            size: headerSize,
          }),
        ],
      })
    );
  }

  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({
          text: `${caseType} Original Jurisdiction`,
          italics: true,
          size: headerSize,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({
          text: `Writ Petition (${caseType === "Criminal" ? "Crl." : "Civil"}) No. _______ of ${currentYear}`,
          bold: true,
          size: headerSize,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      indent: { left: 720, right: 720 },
      spacing: { line: 240, after: 360 },
      children: [
        smartTextRun({
          text: "[Under Article 32 of the Constitution of India]",
          size: headerSize,
        }),
      ],
    }),
  );

  return paragraphs;
};

export const createScWpIaHeader = (caseType: string) => {
  const currentYear = new Date().getFullYear();
  const iaLabel = caseType === "Criminal" ? "Crl. M.P. No." : "I.A. No.";
  const f = getOutputFormatting();
  const headerSize = Math.round(f.sizePt * 2);

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({ text: "IN THE SUPREME COURT OF INDIA", size: headerSize }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({ text: `${caseType} Original Jurisdiction`, italics: true, size: headerSize }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({ text: `${iaLabel} _______ of ${currentYear}`, bold: true, size: headerSize }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({ text: "in", size: headerSize }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 240 },
      children: [
        smartTextRun({
          text: `Writ Petition (${caseType === "Criminal" ? "Crl." : "Civil"}) No. _______ of ${currentYear}`,
          bold: true,
          size: headerSize,
        }),
      ],
    }),
  ];
};

export function getScWpIaList(projectData: DraftoProject): { id: string; title: string; prefix: string }[] {
  const list: { id: string; title: string; prefix: string }[] = [];
  const year = new Date().getFullYear();
  const iaPrefix = projectData.caseType === "Civil" ? `IA ____/${year}` : `Crl. MP ___/${year}`;

  if (projectData.standardIas?.exemptionOfficialTranslation?.active) {
    list.push({
      id: "exemptionOfficialTranslation",
      title: "Application for exemption from filing official translation",
      prefix: iaPrefix,
    });
  }



  (projectData.customIas || []).forEach(customIa => {
    list.push({
      id: customIa.id,
      title: customIa.title || "Custom Interlocutory Application",
      prefix: iaPrefix,
    });
  });

  return list;
}

function toRomanNumeral(n: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  let r = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) {
      r += syms[i];
      n -= vals[i];
    }
  }
  return r;
}

function buildScWpVolumeIndexTableRows(
  particularsList: (string | (TextRun | string)[])[],
  volumeNum: number,
  sNoToVolume: Map<number, number>,
  splitSNos: Map<number, { v1: number; v2: number; splitPage: number }>,
  pageRanges: Map<number, string> | undefined,
  volumePageRanges: Map<number, Map<number, string>>,
): TableRow[] {
  const rows: TableRow[] = [];
  particularsList.forEach((item, index) => {
    const sNo = index + 1;
    const splitInfo = splitSNos?.get(sNo);
    const primaryVol = sNoToVolume?.get(sNo) ?? 1;

    if (sNo <= 8) {
      if (volumeNum !== 1) return;
    } else {
      if (splitInfo) {
        if (splitInfo.v1 !== volumeNum && splitInfo.v2 !== volumeNum) return;
      } else if (primaryVol !== volumeNum) {
        return;
      }
    }

    let pageNum = "";
    if (sNo === 1) pageNum = "";
    else if (sNo === 2) pageNum = pageRanges?.get(2) || "A1-A2";
    else if (sNo === 3) pageNum = "A3";
    else if (sNo === 4) pageNum = "A4";
    else if (sNo === 5) pageNum = "A5";
    else if (sNo === 6) pageNum = "A6";
    else if (sNo === 7) pageNum = "NS1-NS_";
    else {
      const volSpecific = volumePageRanges?.get(volumeNum)?.get(sNo);
      pageNum = volSpecific ?? (pageRanges?.get(sNo) ?? "");
    }

    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: `${sNo}.`, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })],
            verticalAlign: VerticalAlign.CENTER,
            margins: defaultCellMargins,
            width: { size: 10, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: Array.isArray(item) ? item.map(i => (typeof i === "string" ? smartTextRun(i) : i)) : [smartTextRun(item)], style: "Normal", spacing: tableParagraphSpacing })],
            verticalAlign: VerticalAlign.CENTER,
            margins: defaultCellMargins,
            width: { size: 60, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: pageNum, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })],
            verticalAlign: VerticalAlign.CENTER,
            margins: defaultCellMargins,
            width: { size: 15, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: "", style: "Normal", spacing: tableParagraphSpacing })],
            verticalAlign: VerticalAlign.CENTER,
            margins: defaultCellMargins,
            width: { size: 15, type: WidthType.PERCENTAGE },
          }),
        ],
      })
    );
  });
  return rows;
}

function buildScWpMasterIndexTableRows(
  particularsList: (string | (TextRun | string)[])[],
  sNoToVolume: Map<number, number>,
  splitSNos: Map<number, { v1: number; v2: number; splitPage: number }>,
  pageRanges: Map<number, string> | undefined,
  totalVolumes: number,
): TableRow[] {
  const rows: TableRow[] = [];

  for (let v = 1; v <= totalVolumes; v++) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 4,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [smartTextRun({ text: `VOLUME ${toRomanNumeral(v)}`, bold: true })],
                style: "Normal",
                spacing: tableParagraphSpacing,
              }),
            ],
            margins: defaultCellMargins,
          }),
        ],
      })
    );

    particularsList.forEach((item, index) => {
      const sNo = index + 1;
      const splitInfo = splitSNos?.get(sNo);
      const primaryVol = sNoToVolume?.get(sNo) ?? 1;

      if (sNo <= 8) {
        if (v !== 1) return;
      } else if (splitInfo) {
        if (splitInfo.v1 !== v && splitInfo.v2 !== v) return;
      } else {
        if (primaryVol !== v) return;
      }

      let pageNum = "";
      if (sNo === 1) pageNum = "";
      else if (sNo === 2) pageNum = pageRanges?.get(2) || "A1-A2";
      else if (sNo === 3) pageNum = "A3";
      else if (sNo === 4) pageNum = "A4";
      else if (sNo === 5) pageNum = "A5";
      else if (sNo === 6) pageNum = "A6";
      else if (sNo === 7) pageNum = "NS1-NS_";
      else pageNum = pageRanges?.get(sNo) ?? "";

      rows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ text: `${sNo}.`, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })],
              verticalAlign: VerticalAlign.CENTER,
              margins: defaultCellMargins,
              width: { size: 10, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ children: Array.isArray(item) ? item.map(i => (typeof i === "string" ? smartTextRun(i) : i)) : [smartTextRun(item)], style: "Normal", spacing: tableParagraphSpacing })],
              verticalAlign: VerticalAlign.CENTER,
              margins: defaultCellMargins,
              width: { size: 60, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ text: pageNum, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })],
              verticalAlign: VerticalAlign.CENTER,
              margins: defaultCellMargins,
              width: { size: 15, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ text: "", style: "Normal", spacing: tableParagraphSpacing })],
              verticalAlign: VerticalAlign.CENTER,
              margins: defaultCellMargins,
              width: { size: 15, type: WidthType.PERCENTAGE },
            }),
          ],
        })
      );
    });
  }
  return rows;
}

// ─── Cover Page and Index (CI) for SC WP ────────────────────────────────────
export async function generateScWpCiDocx(
  projectData: DraftoProject,
  pageRanges?: Map<number, string>,
  volumeOptions?: any,
  optionalDocIds?: Set<string>
) {
  const petHeader = getPartyHeader(projectData.petitioners);
  const resHeader = getPartyHeader(projectData.respondents);
  const iaList = getScWpIaList(projectData);

  const particularsList: (string | (TextRun | string)[])[] = [
    "Court Fees",
    "Listing Proforma",
    "Cover Page of Paper Book",
    "Index of Record of Proceedings",
    "Limitation Report prepared by the Registry",
    "Defect List",
    "Note Sheet",
    "Synopsis and List of Dates",
    "Writ Petition under Article 32 of the Constitution of India, with supporting affidavit",
  ];

  const appendixItems = getActiveAppendixItems(projectData);
  appendixItems.forEach((item, index) => {
    particularsList.push([
      smartTextRun({ text: appendixLabel(index, appendixItems.length), bold: true }),
      convertToSmartQuotes(`: ${appendixBodyText(item)}`),
    ]);
  });

  const orderedAnnexures = wpAnnexureOrderFromLods(projectData.listOfDates || []);
  orderedAnnexures.forEach(({ annex, pNumber }) => {
    particularsList.push(createAnnexureText(pNumber, annex, true));
  });

  // Collect IA ground annexures
  const allIaAnnexures: any[] = [];
  (projectData.customIas || []).forEach(customIa => {
    (customIa.grounds || []).forEach(ground => {
      (ground.annexures || []).forEach(annex => {
        allIaAnnexures.push({ ...annex, iaId: customIa.id });
      });
    });
  });

  const iaAnnexureNumberingMap = new Map<string, number>();
  let aCounter = 1;
  allIaAnnexures.forEach(a => iaAnnexureNumberingMap.set(a.id, aCounter++));

  iaList.forEach(ia => {
    particularsList.push([smartTextRun({ text: ia.prefix, bold: true }), convertToSmartQuotes(`: ${ia.title}`)]);
    const iaSpecificAnnexures = allIaAnnexures.filter(a => a.iaId === ia.id);
    iaSpecificAnnexures.forEach(annex => {
      const aNum = iaAnnexureNumberingMap.get(annex.id);
      if (aNum) {
        particularsList.push(createIaAnnexureText(aNum, annex, true));
      }
    });
  });

  particularsList.push("Filing Memo", "Vakalatnama(s)");

  // 4 columns: S. No., Particulars, Page, Remarks
  const colWidths = [1000, 6000, 1500, 1500];

  const indexTableRows = [
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [smartTextRun({ text: "S. No.", bold: true })], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })],
          verticalAlign: VerticalAlign.CENTER,
          margins: defaultCellMargins,
          width: { size: 10, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [new Paragraph({ children: [smartTextRun({ text: "Particulars", bold: true })], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })],
          verticalAlign: VerticalAlign.CENTER,
          margins: defaultCellMargins,
          width: { size: 60, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [new Paragraph({ children: [smartTextRun({ text: "Page", bold: true })], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })],
          verticalAlign: VerticalAlign.CENTER,
          margins: defaultCellMargins,
          width: { size: 15, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [new Paragraph({ children: [smartTextRun({ text: "Remarks", bold: true })], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })],
          verticalAlign: VerticalAlign.CENTER,
          margins: defaultCellMargins,
          width: { size: 15, type: WidthType.PERCENTAGE },
        }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [smartTextRun({ text: "(i)", bold: true })], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })],
          verticalAlign: VerticalAlign.CENTER,
          margins: defaultCellMargins,
        }),
        new TableCell({
          children: [new Paragraph({ children: [smartTextRun({ text: "(ii)", bold: true })], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })],
          verticalAlign: VerticalAlign.CENTER,
          margins: defaultCellMargins,
        }),
        new TableCell({
          children: [new Paragraph({ children: [smartTextRun({ text: "(iii)", bold: true })], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })],
          verticalAlign: VerticalAlign.CENTER,
          margins: defaultCellMargins,
        }),
        new TableCell({
          children: [new Paragraph({ children: [smartTextRun({ text: "(iv)", bold: true })], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })],
          verticalAlign: VerticalAlign.CENTER,
          margins: defaultCellMargins,
        }),
      ],
    }),
    ...particularsList.map((item, index) => {
      const sNo = index + 1;
      let pageNum = "";

      if (sNo === 1) {
        pageNum = ""; // Court Fees
      } else if (sNo === 2) {
        pageNum = pageRanges?.get(2) || "A1-A2"; // Listing Proforma
      } else if (sNo === 3) {
        pageNum = "A3"; // Cover Page
      } else if (sNo === 4) {
        pageNum = "A4"; // Index of Record
      } else if (sNo === 5) {
        pageNum = "A5"; // Limitation Report
      } else if (sNo === 6) {
        pageNum = "A6"; // Defect List
      } else if (sNo === 7) {
        pageNum = "NS1-NS_"; // Note Sheet
      } else if (sNo >= 8) {
        pageNum = pageRanges?.get(sNo) || "";
      }

      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: `${sNo}.`, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })],
            verticalAlign: VerticalAlign.CENTER,
            margins: defaultCellMargins,
            width: { size: 10, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: Array.isArray(item) ? item.map(i => (typeof i === "string" ? smartTextRun(i) : i)) : [smartTextRun(item)], style: "Normal", spacing: tableParagraphSpacing })],
            verticalAlign: VerticalAlign.CENTER,
            margins: defaultCellMargins,
            width: { size: 60, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: pageNum, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })],
            verticalAlign: VerticalAlign.CENTER,
            margins: defaultCellMargins,
            width: { size: 15, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: "", style: "Normal", spacing: tableParagraphSpacing })],
            verticalAlign: VerticalAlign.CENTER,
            margins: defaultCellMargins,
            width: { size: 15, type: WidthType.PERCENTAGE },
          }),
        ],
      });
    }),
  ];

function createRecordOfProceedings(): (Paragraph | Table)[] {
  const cell = (text: string, bold = false) => new TableCell({
    children: [new Paragraph({
      children: text ? [smartTextRun({ text, bold })] : [],
      alignment: AlignmentType.CENTER,
      style: "Normal",
      spacing: tableParagraphSpacing,
    })],
    verticalAlign: VerticalAlign.CENTER,
    margins: defaultCellMargins,
  });

  const rows = [
    new TableRow({ tableHeader: true, children: [cell("S. No.", true), cell("Record of Proceedings", true), cell("Page No.", true)] }),
    ...Array.from({ length: 18 }, () => new TableRow({ children: [cell(""), cell(""), cell("")] })),
  ];

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [smartTextRun({ text: "INDEX OF RECORD OF PROCEEDINGS", bold: true })],
    }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [1000, 7000, 1500], rows }),
  ];
}

  const vo = volumeOptions;
  let indexChildren: (Paragraph | Table)[];

  if (!vo) {
    indexChildren = [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: "INDEX", bold: true })] }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: colWidths, rows: indexTableRows }),
    ];
  } else {
    const pl = vo.particularsList || particularsList;
    indexChildren = [];
    if (vo.volumeNum === 1) {
      indexChildren.push(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: "MASTER INDEX", bold: true })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: colWidths,
          rows: [
            ...indexTableRows.slice(0, 2),
            ...buildScWpMasterIndexTableRows(pl, vo.sNoToVolume, vo.splitSNos, vo.pageRanges || pageRanges, vo.totalVolumes),
          ],
        }),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: `INDEX – VOLUME ${toRomanNumeral(1)}`, bold: true })] }),
      );
    } else {
      indexChildren.push(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: `INDEX – VOLUME ${toRomanNumeral(vo.volumeNum)}`, bold: true })] }),
      );
    }

    indexChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: colWidths,
        rows: [
          ...indexTableRows.slice(0, 2),
          ...buildScWpVolumeIndexTableRows(pl, vo.volumeNum, vo.sNoToVolume, vo.splitSNos, vo.pageRanges || pageRanges, vo.volumePageRanges),
        ],
      }),
    );
  }

  const beforePaperbook = (!vo || vo.volumeNum === 1)
    ? new Paragraph("")
    : new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: `VOLUME ${toRomanNumeral(vo.volumeNum)}`, bold: true })] });

  const sectionBase: Partial<ISectionOptions> = {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: { margin: getScWpMargins() },
    },
    headers: { default: new Header({ children: [] }) },
    footers: { default: new Footer({ children: [] }) },
  };

  const aorName = projectData.advocate?.aorName || "[AoR Name]";

  const doc = new Document({
    styles: getScWpDefaultStyles(),
    sections: [
      {
        // 1. Cover Page
        ...sectionBase,
        children: [
          ...createScWpHeader(projectData.caseType),
          ...createPartiesHeader(petHeader, resHeader),
          ...createWithTable(iaList, false),
          beforePaperbook,
          new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: "PAPERBOOK", bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: "[For Index, please see inside]", italics: true })] }),
          new Paragraph({
            frame: {
              type: "alignment",
              alignment: { x: HorizontalPositionAlign.CENTER, y: VerticalPositionAlign.BOTTOM },
              anchor: { horizontal: FrameAnchorType.MARGIN, vertical: FrameAnchorType.MARGIN },
              width: 8000,
              height: 400,
            },
            alignment: AlignmentType.CENTER,
            children: [smartTextRun({ text: `Advocate for the Petitioner(s): ${aorName}`, bold: true })],
          }),
        ],
      },
      {
        // 2. Index of Record of Proceedings
        ...sectionBase,
        children: createRecordOfProceedings(),
      },
      {
        // 3. Index
        ...sectionBase,
        children: indexChildren,
      },
    ],
  });

  const b64string = await Packer.toBase64String(doc);
  return { success: true, docx: b64string, fileName: "CI.docx" };
}

// ─── Synopsis and List of Dates (SLoD) for SC WP ────────────────────────────
// In SC WP, annexure sentences are omitted from the LoD table and appear only in Facts.
export async function generateScWpSlodDocx(
  projectData: DraftoProject,
  annexurePageRanges?: Map<string, { start: number; end: number }>
) {
  let allNumberingConfigs: any[] = [];
  const lodEventParagraphs = (projectData.listOfDates || []).map(lod => {
    const { paragraphs, numbering } = parseHtml(lod.event || "");
    if (numbering.length > 0) allNumberingConfigs.push(...numbering);
    return { lodId: lod.id, paragraphs };
  });

  const synopsisResult = parseHtml(projectData.synopsis || "");
  if (synopsisResult.numbering.length > 0) allNumberingConfigs.push(...synopsisResult.numbering);

  const uniqueNumberingConfigs = allNumberingConfigs.filter(
    (v, i, a) => a.findIndex(t => t.reference === v.reference) === i
  );

  const lodTableRows = (projectData.listOfDates || []).map((lod, lodIndex) => {
    const eventParas = lodEventParagraphs[lodIndex]?.paragraphs || [];
    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ text: lod.date || "", alignment: AlignmentType.CENTER, style: "Normal" })],
          verticalAlign: VerticalAlign.TOP,
          margins: defaultCellMargins,
          width: { size: 20, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: eventParas.length > 0 ? eventParas : [new Paragraph({ text: "", style: "Normal" })],
          verticalAlign: VerticalAlign.TOP,
          margins: defaultCellMargins,
          width: { size: 80, type: WidthType.PERCENTAGE },
        }),
      ],
    });
  });

  const doc = new Document({
    styles: getScWpDefaultStyles(),
    numbering: { config: uniqueNumberingConfigs },
    sections: [
      {
        properties: { page: { margin: getScWpMargins() } },
        children: [
          new Paragraph({ children: [smartTextRun({ text: "SYNOPSIS", bold: true })], alignment: AlignmentType.CENTER }),
          ...synopsisResult.paragraphs,
          new Paragraph({ children: [smartTextRun({ text: "LIST OF DATES", bold: true })], alignment: AlignmentType.CENTER }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [2000, 8000],
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Date", bold: true })], alignment: AlignmentType.CENTER, style: "Normal" })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins, width: { size: 20, type: WidthType.PERCENTAGE } }),
                  new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Particulars", bold: true })], alignment: AlignmentType.CENTER, style: "Normal" })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins, width: { size: 80, type: WidthType.PERCENTAGE } }),
                ],
              }),
              ...lodTableRows,
            ],
          }),
        ],
      },
    ],
  });

  const b64string = await Packer.toBase64String(doc);
  return { success: true, docx: b64string, fileName: "SLoD.docx" };
}

export async function generateScWpPetitionDocx(
  projectData: DraftoProject,
  includeSignature = false,
  annexurePageRanges?: Map<string, { start: number; end: number }>
) {
  const qSettings = getScWpQuoteSettings();
  const scWpF = getScWpOutputFormatting();
  setDocxExportContext({
    quoteSingleSpacing: qSettings.quoteLineSpacing === "single",
    quoteItalics: qSettings.quoteItalics,
    outputFontSizePt: scWpF.sizePt,
    outputLineSpacing: scWpF.lineSpacing,
    outputParaAfterPt: scWpF.afterPt,
  });

  try {
    let allNumberingConfigs: any[] = [];

  const getAlphabeticalLabel = (i: number): string => {
    const charCodeA = "A".charCodeAt(0);
    const numAlphabets = 26;
    let label = "";
    let num = i;
    do {
      label = String.fromCharCode(charCodeA + (num % numAlphabets)) + label;
      num = Math.floor(num / numAlphabets) - 1;
    } while (num >= 0);
    return label;
  };

  const makeScWpListConfig = (reference: string, start = 1) => ({
    reference,
    levels: [{ level: 0, format: "decimal" as const, text: "%1.", alignment: AlignmentType.START, start, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
  });

  // 1. Header
  const headerParagraphs = createScWpHeader(projectData.caseType);

  // 2. 3-column Memo of Parties table (identical to High Court WP)
  const partyPosition = (role: "Petitioner" | "Respondent", index: number, total: number) => {
    if (total === 1) return `…${role}`;
    return `…${role} No. ${index + 1}`;
  };

  const headerRow = new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "S. No.", bold: true })], alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins, width: { size: 10, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Particulars", bold: true })], alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins, width: { size: 65, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Position", bold: true })], alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins, width: { size: 25, type: WidthType.PERCENTAGE } }),
    ],
  });

  const partyRows = (parties: typeof projectData.petitioners, role: "Petitioner" | "Respondent") =>
    parties.map((p, i) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: `${i + 1}.`, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.TOP, margins: defaultCellMargins }),
        new TableCell({
          children: [
            new Paragraph({ children: [smartTextRun({ text: p.name || "[Name]", bold: true })], spacing: tableParagraphSpacing }),
            ...(p.through?.trim() ? [new Paragraph({ children: [smartTextRun({ text: p.through.trim(), italics: true })], spacing: tableParagraphSpacing })] : []),
            ...(p.address ? [new Paragraph({ text: p.address, spacing: tableParagraphSpacing })] : []),
          ],
          verticalAlign: VerticalAlign.TOP,
          margins: defaultCellMargins,
        }),
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun(partyPosition(role, i, parties.length))], spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.BOTTOM, margins: defaultCellMargins }),
      ],
    }));

  const versusRow = new TableRow({
    children: [
      new TableCell({ columnSpan: 3, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun("Versus")], spacing: tableParagraphSpacing })], margins: defaultCellMargins }),
    ],
  });

  const memoOfPartiesTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [1000, 6500, 2500],
    borders: noBorders,
    rows: [headerRow, ...partyRows(projectData.petitioners, "Petitioner"), versusRow, ...partyRows(projectData.respondents, "Respondent")],
  });

  // 3. Centered bold heading with 0.5" indent (ALL CAPS)
  const centerHeading = new Paragraph({
    alignment: AlignmentType.CENTER,
    indent: { left: 720, right: 720 },
    spacing: { before: 240, after: 240 },
    children: [smartTextRun({ text: "WRIT PETITION UNDER ARTICLE 32 OF THE CONSTITUTION OF INDIA", bold: true })],
  });

  // 4. Salutation to CJI & Companion Justices
  const scWpF = getScWpOutputFormatting();
  const salutationParagraphs = [
    new Paragraph({ children: [smartTextRun({ text: "To,", italics: true })], spacing: { line: 240, after: 0 } }),
    new Paragraph({ indent: { left: 720 }, spacing: { line: 240, after: 0 }, children: [smartTextRun({ text: "The Hon'ble Chief Justice of India", italics: true })] }),
    new Paragraph({ indent: { left: 720 }, spacing: { line: 240, after: 0 }, children: [smartTextRun({ text: "And his Companion Justices of the", italics: true })] }),
    new Paragraph({ indent: { left: 720 }, spacing: { line: 240, after: Math.round(scWpF.afterPt * 20) }, children: [smartTextRun({ text: "Hon'ble Supreme Court of India", italics: true })] }),
    new Paragraph({ spacing: { line: 240, after: Math.round(scWpF.afterPt * 20) }, children: [smartTextRun({ text: "The Petitioner most respectfully submits that:", bold: true })] }),
  ];

  const scWpLayout = getScWpDraftingPreferences();
  const headingWithText = (heading: string, text: string, reference: string): Paragraph[] => {
    if (!scWpLayout.headingBreak) {
      return [new Paragraph({
        children: [smartTextRun({ text: `${heading} `, bold: true }), smartTextRun(text)],
        numbering: { reference, level: 0 },
      })];
    }
    return [
      new Paragraph({
        children: [smartTextRun({ text: heading, bold: true })],
        numbering: { reference, level: 0 },
      }),
      new Paragraph({
        children: [smartTextRun(text)],
        indent: { left: 720 },
      }),
    ];
  };

  // 5. Para 1: opening praying for appropriate writ/order with inline reliefs + IO annexure sentences
  const rawReliefs = (projectData.wp?.reliefs || []).map(r => r.particulars || "").filter(h => !!h.replace(/<[^>]+>/g, "").trim());
  const para1Html = `<p>This Writ Petition is filed praying that this Hon’ble Court may be pleased to issue an appropriate writ, order or direction and: ${rawReliefs
    .map((h, i) => `[${String.fromCharCode(97 + i)}] ${inlineHtml(h)}`)
    .join(" ")}</p>`;
  const para1Result = parseHtml(para1Html, undefined, { reference: "scwp-para-1", level: 0 });
  allNumberingConfigs.push(...para1Result.numbering);

  // IO annexure sentences for Impugned Orders
  const ioAnnexures = wpAnnexureOrderFromLods(projectData.listOfDates || []).filter(e => e.annex.isImpugnedOrder);
  const ioSentenceRuns: TextRun[] = ioAnnexures.flatMap((e, i) => {
    const pr = annexurePageRanges?.get(e.annex.id);
    const prText = pr
      ? pr.start === pr.end
        ? `(p.${pr.start})`
        : `(pp.${pr.start} to ${pr.end})`
      : "(pp.___ to ___)";
    const { label, rest } = factsAnnexureSentenceParts(e.pNumber, e.annex, "P", prText);
    return [
      smartTextRun({ text: `${i > 0 ? " " : ""}${label}`, bold: true }),
      smartTextRun(rest),
    ];
  });

  const para1Paragraphs: (Paragraph | Table)[] = [
    ...para1Result.paragraphs,
    ...(ioSentenceRuns.length ? [new Paragraph({
      indent: { left: 720 },
      children: ioSentenceRuns,
    })] : []),
  ];

  // 6. Para 2: FACTS
  const wpNumbering = getScWpNumbering();
  const rawFacts = (resolveFactsHtml(projectData) || projectData.wp?.facts || "").trim()
    || transposeLodToFacts(projectData, "P");
  const factsWithPageRanges = injectAnnexurePageRangesIntoFacts(rawFacts, projectData, annexurePageRanges);
  const factsResult = parseHtml(factsWithPageRanges, undefined, undefined, SC_WP_FACTS_LIST_GEOM);
  applyScWpFactsCascade(factsResult.numbering, wpNumbering.facts);
  allNumberingConfigs.push(...factsResult.numbering);
  const hasFacts = (rawFacts || "").replace(/<[^>]+>/g, "").trim().length > 0;
  const factsParagraphs: (Paragraph | Table)[] = [
    ...headingWithText("FACTS:", "The facts giving rise to the present Writ Petition are as under:", "scwp-para-2"),
    ...(hasFacts && factsResult.paragraphs.length > 0
      ? factsResult.paragraphs
      : [new Paragraph({ indent: { left: 720 }, children: [smartTextRun("[Facts — generated from the List of Dates.]")] })]
    ),
  ];

  // 7. Para 3: GROUNDS
  const groundsHeadingStyle = getGroundsHeadingStyle(projectData);
  const groundsEntries = groundsSequence(projectData.grounds, groundsHeadingStyle);
  const groundsHang = groundsHeadingHang(groundsEntries);

  const groundsRows = groundsEntries.map(entry => {
    if (entry.kind === "heading") {
      return new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            borders: noBorders,
            children: [new Paragraph({
              style: "Normal",
              indent: { left: groundsHang, hanging: groundsHang },
              children: groundsHeadingRuns(entry.label, entry.text, groundsHeadingStyle),
            })],
          }),
        ],
      });
    }
    const { paragraphs, numbering } = parseHtml(entry.row.particulars || "");
    if (numbering.length > 0) allNumberingConfigs.push(...numbering);
    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ text: `${getAlphabeticalLabel(entry.ordinal)}.`, style: "Normal" })],
          borders: noBorders,
          width: { size: 8, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: paragraphs,
          borders: noBorders,
          width: { size: 92, type: WidthType.PERCENTAGE },
        }),
      ],
    });
  });

  const groundsTable = new Table({
    width: { size: 91.66, type: WidthType.PERCENTAGE },
    columnWidths: [800, 9200],
    rows: groundsRows,
    borders: noBorders,
    indent: { size: 720, type: WidthType.DXA },
  });

  const groundsParagraphs: (Paragraph | Table)[] = [
    ...headingWithText("GROUNDS:", "This Writ Petition is being filed on the following grounds taken without prejudice against each other:", "scwp-para-3"),
    groundsTable,
  ];

  // 8. Paras 4–7: boilerplate
  const para4 = new Paragraph({
    numbering: { reference: "scwp-para-4", level: 0 },
    children: [smartTextRun("This Hon’ble Court has the necessary jurisdiction to entertain this Writ Petition as the Respondents are situated within, and the cause of action has arisen within, the territorial jurisdiction of this Hon’ble Court.")],
  });

  const para5 = new Paragraph({
    numbering: { reference: "scwp-para-5", level: 0 },
    children: [smartTextRun("The Petitioner has no other equally efficacious alternate remedy available than to approach this Hon’ble Court.")],
  });

  const para6 = new Paragraph({
    numbering: { reference: "scwp-para-6", level: 0 },
    children: [smartTextRun("The Petitioner has not filed any other Writ Petition or proceeding before this Hon’ble Court or any other Court seeking the same or similar relief.")],
  });

  const para7 = new Paragraph({
    numbering: { reference: "scwp-para-7", level: 0 },
    children: [smartTextRun("The Petitioner craves leave of this Hon’ble Court to produce additional documents and/or affidavits and to add, alter or amend this Writ Petition at a later stage of the proceedings, if required.")],
  });

  // 9. Para 8: PRAYERS (from Relief(s) in UI)
  const prayersTableRows = rawReliefs.map((reliefHtml, index) => {
    const parsed = parseHtml(reliefHtml);
    if (parsed.numbering.length > 0) allNumberingConfigs.push(...parsed.numbering);
    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ text: `${String.fromCharCode(97 + index)}.`, style: "Normal" })],
          borders: noBorders,
          width: { size: 8, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: parsed.paragraphs,
          borders: noBorders,
          width: { size: 92, type: WidthType.PERCENTAGE },
        }),
      ],
    });
  });

  const prayersTable = new Table({
    width: { size: 91.66, type: WidthType.PERCENTAGE },
    columnWidths: [800, 9200],
    rows: prayersTableRows,
    borders: noBorders,
    indent: { size: 720, type: WidthType.DXA },
  });

  const para8Paragraphs: (Paragraph | Table)[] = [
    ...headingWithText("PRAYERS:", "In view of the foregoing submissions, it is respectfully prayed that this Hon’ble Court may be pleased to issue an appropriate writ, order or direction and:", "scwp-para-8"),
    prayersTable,
  ];

  // 10. Closing & Filed By Table
  const closingParagraph = new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 240, after: 240 },
    children: [smartTextRun({ text: "And for this act of kindness, the Petitioner as in duty bound shall ever pray.", italics: true })],
  });

  const { advocate } = projectData;
  let advocateDetailsTable: Table | null = null;
  const paraSpacing = { after: 0, line: 240 };
  if (advocate?.wantsDrawnBy || advocate?.wantsSettledBy) {
    advocateDetailsTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [5000, 5000],
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                ...(advocate.wantsSettledBy ? [new Paragraph({ text: `Settled on: ${advocate.settledByDate ? format(new Date(advocate.settledByDate), "dd.MM.yyyy") : ""}`, spacing: paraSpacing })] : []),
                ...(advocate.wantsSettledBy ? [new Paragraph({ text: `Settled by: ${advocate.settledByName}`, spacing: paraSpacing })] : []),
              ],
              borders: noBorders,
            }),
            new TableCell({
              children: [
                ...(advocate.wantsDrawnBy ? [new Paragraph({ text: `Drawn on: ${advocate.drawnByDate ? format(new Date(advocate.drawnByDate), "dd.MM.yyyy") : ""}`, alignment: AlignmentType.RIGHT, spacing: paraSpacing })] : []),
                ...(advocate.wantsDrawnBy ? [new Paragraph({ text: `Drawn by: ${advocate.drawnByName}`, alignment: AlignmentType.RIGHT, spacing: paraSpacing })] : []),
              ],
              borders: noBorders,
            }),
          ],
        }),
      ],
    });
  }

  const filedByTableParagraphs = createFiledByTable(
    advocate?.filingDate as any,
    advocate?.aorName || "[AoR Name]",
    { includeSignature, isScWp: true }
  );

  const uniqueNumberingConfigs = [
    ...allNumberingConfigs.filter((v, i, a) => a.findIndex(t => t.reference === v.reference) === i),
    makeScWpListConfig("scwp-para-1", 1),
    makeScWpListConfig("scwp-para-2", 2),
    makeScWpListConfig("scwp-para-3", 3),
    makeScWpListConfig("scwp-para-4", 4),
    makeScWpListConfig("scwp-para-5", 5),
    makeScWpListConfig("scwp-para-6", 6),
    makeScWpListConfig("scwp-para-7", 7),
    makeScWpListConfig("scwp-para-8", 8),
  ];

  const petitionChildren: (Paragraph | Table)[] = [
    ...headerParagraphs,
    new Paragraph({ text: "BETWEEN:", spacing: { after: 0, before: 0, line: 240 } }),
    memoOfPartiesTable,
    new Paragraph(""),
    centerHeading,
    ...salutationParagraphs,
    ...para1Paragraphs,
    ...factsParagraphs,
    ...groundsParagraphs,
    para4,
    para5,
    para6,
    para7,
    ...para8Paragraphs,
    closingParagraph,
    ...(advocateDetailsTable ? [advocateDetailsTable, new Paragraph("")] : []),
    ...filedByTableParagraphs,
  ];

  const doc = new Document({
    styles: getScWpDefaultStyles(),
    numbering: { config: uniqueNumberingConfigs },
    sections: [
      {
        properties: { page: { margin: getScWpMargins() } },
        children: petitionChildren,
      },
    ],
  });

  const b64string = await Packer.toBase64String(doc);
  return { success: true, docx: b64string, fileName: "WritPetition.docx" };
} finally {
  setDocxExportContext(null);
}
}

// ─── Affidavits for SC WP ───────────────────────────────────────────────────
export async function generateScWpAffidavitsDocx(projectData: DraftoProject) {
  const { deponent, petitioners, caseType } = projectData;
  const petHeader = getPartyHeader(projectData.petitioners);
  const resHeader = getPartyHeader(projectData.respondents);
  const orderedAnnexures = wpAnnexureOrderFromLods(projectData.listOfDates || []);
  const lastPNumber = orderedAnnexures.length;

  const docs = [];

  const affidavitNumbering = {
    reference: "scwp-affidavit-numbering",
    levels: [{
      level: 0,
      format: "decimal" as const,
      text: "%1.",
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 720, hanging: 360 } } },
    }],
  };

  const presentlyAtPart = deponent?.location?.trim() ? `, presently at ${deponent.location.trim()}` : "";
  const deponentIntro = `I, ${deponent?.name || "[Name]"}, ${deponent?.relationship || "son of"} ${deponent?.fatherName || "[Father/Husband Name]"}, aged ${deponent?.age || "__"} years, resident of ${deponent?.address || "[Address]"}${presentlyAtPart}, do hereby solemnly state and affirm as under:`;

  // 1. Writ Petition Affidavit
  const wpAffidavitChildren = [
    ...createScWpHeader(caseType),
    new Paragraph(""),
    ...createPartiesHeader(petHeader, resHeader),
    new Paragraph({ children: [smartTextRun({ text: "AFFIDAVIT", bold: true })], alignment: AlignmentType.CENTER }),
    new Paragraph(deponentIntro),
    new Paragraph({
      text: `I am the ${deponent?.role || "[Role]"} in the present case. As such, I am fully conversant with the facts of the case and hence capable to swear to this Affidavit${petitioners.length > 1 ? " on behalf of myself and the other Petitioner(s) as well" : ""}.`,
      numbering: { reference: "scwp-affidavit-numbering", level: 0 },
    }),
    new Paragraph({
      text: `I have read and understood the contents of the accompanying Writ Petition including Synopsis and List of Dates from Page B to Page ___ and Writ Petition at Paragraphs 1 to 8, and the contents of all accompanying applications/ IAs. I say that the contents thereof are true and correct to the best of my knowledge and belief.`,
      numbering: { reference: "scwp-affidavit-numbering", level: 0 },
    }),
    new Paragraph({
      text: `${annexureRangeText(lastPNumber, scWpAffidavitWantsBlankAnnexureRange())} to the petition and all annexures to the accompanying applications/IAs are true/translated copies of their respective originals.`,
      numbering: { reference: "scwp-affidavit-numbering", level: 0 },
    }),
    new Paragraph({
      text: "I have not preferred any similar/other petition or proceeding before this Hon’ble Court or any other Court seeking the same or similar relief.",
      numbering: { reference: "scwp-affidavit-numbering", level: 0 },
    }),
    new Paragraph({ children: [smartTextRun({ text: "DEPONENT", bold: true })], alignment: AlignmentType.RIGHT }),
    new Paragraph({ children: [smartTextRun({ text: "VERIFICATION", bold: true })] }),
    new Paragraph(`Verified at ${deponent?.location || "_______"} on this ___ day of _______ that the contents of the above affidavit are true and correct to the best of my knowledge and no part of it is false and nothing material has been concealed therefrom.`),
    new Paragraph({ children: [smartTextRun({ text: "DEPONENT", bold: true })], alignment: AlignmentType.RIGHT }),
  ];

  const wpAffidavitDoc = new Document({
    styles: getScWpDefaultStyles(),
    numbering: { config: [affidavitNumbering] },
    sections: [{ properties: { page: { margin: getScWpMargins() } }, children: wpAffidavitChildren }],
  });
  docs.push({ fileName: "Affidavit-WP.docx", doc: wpAffidavitDoc });

  // 2. IA Affidavits
  const iaList = getScWpIaList(projectData);
  iaList.forEach((ia) => {
    const iaAffidavitChildren = [
      ...createScWpIaHeader(caseType),
      new Paragraph(""),
      ...createPartiesHeader(petHeader, resHeader),
      new Paragraph({ children: [smartTextRun({ text: "AFFIDAVIT", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph(deponentIntro),
      new Paragraph({
        text: `I am the ${deponent?.role || "[Role]"} in the accompanying Application. As such, I am fully conversant with the facts of the case and hence capable to swear to this Affidavit${petitioners.length > 1 ? " on behalf of myself and the other Petitioner(s) as well" : ""}.`,
        numbering: { reference: "scwp-affidavit-numbering", level: 0 },
      }),
      new Paragraph({
        text: `I have read and understood the contents of the accompanying Application at Paragraphs 1 to ___. I say that the contents thereof are true and correct to the best of my knowledge and belief.`,
        numbering: { reference: "scwp-affidavit-numbering", level: 0 },
      }),
      new Paragraph({
        text: "The annexures to the application, if any, are true/translated copies of their respective originals.",
        numbering: { reference: "scwp-affidavit-numbering", level: 0 },
      }),
      new Paragraph({ children: [smartTextRun({ text: "DEPONENT", bold: true })], alignment: AlignmentType.RIGHT }),
      new Paragraph({ children: [smartTextRun({ text: "VERIFICATION", bold: true })] }),
      new Paragraph(`Verified at ${deponent?.location || "_______"} on this ___ day of _______ that the contents of the above affidavit are true and correct to the best of my knowledge and no part of it is false and nothing material has been concealed therefrom.`),
      new Paragraph({ children: [smartTextRun({ text: "DEPONENT", bold: true })], alignment: AlignmentType.RIGHT }),
    ];

    const iaAffidavitDoc = new Document({
      styles: getScWpDefaultStyles(),
      numbering: { config: [affidavitNumbering] },
      sections: [{ properties: { page: { margin: getScWpMargins() } }, children: iaAffidavitChildren }],
    });
    docs.push({ fileName: `Affidavit-${ia.id}.docx`, doc: iaAffidavitDoc });
  });

  const generatedDocs = await Promise.all(
    docs.map(async (d) => ({
      fileName: d.fileName,
      docx: await Packer.toBase64String(d.doc),
    }))
  );

  return { success: true, files: generatedDocs };
}

// ─── Filing Memo for SC WP ──────────────────────────────────────────────────
export async function generateScWpFilingMemoDocx(projectData: DraftoProject, includeSignature = false) {
  const petHeader = getPartyHeader(projectData.petitioners);
  const resHeader = getPartyHeader(projectData.respondents);
  const iaList = getScWpIaList(projectData);
  const orderedAnnexures = wpAnnexureOrderFromLods(projectData.listOfDates || []);
  const lastAnnexureNumber = orderedAnnexures.length;

  const memoRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: "1.", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ text: "Writ Petition under Article 32 of the Constitution of India, with supporting affidavit", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: "2.", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ text: annexureRangeText(lastAnnexureNumber), spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
      ],
    }),
    ...iaList.map((ia, index) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: `${index + 3}.`, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ text: ia.title, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
      ],
    })),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: `${iaList.length + 3}.`, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ text: "Vakalatnama(s)", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
      ],
    }),
  ];

  const doc = new Document({
    styles: getScWpDefaultStyles(),
    sections: [{
      properties: { page: { margin: getScWpMargins() } },
      children: [
        ...createScWpHeader(projectData.caseType),
        ...createPartiesHeader(petHeader, resHeader),
        new Paragraph({ children: [smartTextRun({ text: "FILING MEMO", bold: true })], alignment: AlignmentType.CENTER }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [10, 60, 15, 15].map(v => v * 100),
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "S. No.", bold: true })], alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Particulars", bold: true })], alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Court Fee", bold: true })], alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Remarks", bold: true })], alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
              ],
            }),
            ...memoRows,
          ],
        }),
        new Paragraph(""),
        ...createFiledByTable(projectData.advocate?.filingDate as any, projectData.advocate?.aorName || "[AoR Name]", { includeSignature, isScWp: true }),
      ],
    }],
  });

  const b64string = await Packer.toBase64String(doc);
  return { success: true, docx: b64string, fileName: "FilingMemo.docx" };
}

// ─── Individual IA DOCX for SC WP ───────────────────────────────────────────
export async function generateScWpIaDocx(
  projectData: DraftoProject,
  iaIdentifier: string,
  customText?: string,
  iaAnnexurePageRanges?: Map<string, { start: number; end: number }>,
  includeSignature = false
) {
  const qSettings = getScWpQuoteSettings();
  const scWpF = getScWpOutputFormatting();
  setDocxExportContext({
    quoteSingleSpacing: qSettings.quoteLineSpacing === "single",
    quoteItalics: qSettings.quoteItalics,
    outputFontSizePt: scWpF.sizePt,
    outputLineSpacing: scWpF.lineSpacing,
    outputParaAfterPt: scWpF.afterPt,
  });

  try {
    const petHeader = getPartyHeader(projectData.petitioners);
    const resHeader = getPartyHeader(projectData.respondents);
    const { advocate } = projectData;

    let allNumberingConfigs: any[] = [];
  const getAlphabeticalLabel = (i: number): string => {
    const charCodeA = "A".charCodeAt(0);
    const numAlphabets = 26;
    let label = "";
    let num = i;
    do {
      label = String.fromCharCode(charCodeA + (num % numAlphabets)) + label;
      num = Math.floor(num / numAlphabets) - 1;
    } while (num >= 0);
    return label;
  };

  const makeIaListConfig = (reference: string, start = 1) => ({
    reference,
    levels: [{ level: 0, format: "decimal" as const, text: "%1.", alignment: AlignmentType.START, start, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
  });

  const listSegments: { reference: string; start: number }[] = [];
  let paraNo = 0;
  let currentListRef = "scwp-ia-intro-list";
  const newListSegment = () => {
    currentListRef = listSegments.length === 0 ? "scwp-ia-intro-list" : `scwp-ia-intro-list-${listSegments.length + 1}`;
    listSegments.push({ reference: currentListRef, start: paraNo + 1 });
  };
  const nextNumbering = () => {
    paraNo++;
    return { reference: currentListRef, level: 0 };
  };

  newListSegment();

  let prayerParagraphs: Paragraph[] = [];
  let iaTitle = "";
  let customTextParagraphs: (Paragraph | Table)[] = [];

  const createIaAnnexText = (aNumber: number, annex: { id?: string; title?: string; date?: string }): (TextRun | string)[] => {
    const annexureLabel = `Annexure A-${aNumber}`;
    const pageRange = annex.id ? iaAnnexurePageRanges?.get(annex.id) : undefined;
    let pageRangeText = pageRange
      ? pageRange.start === pageRange.end
        ? `(p.${pageRange.start})`
        : `(pp.${pageRange.start} to ${pageRange.end})`
      : `(pp.___ to ___)`;

    const parts: (TextRun | string)[] = [
      smartTextRun({ text: `${annexureLabel} ${pageRangeText}`, bold: true }),
      convertToSmartQuotes(` is a ${annex.title || "[Annexure Title]"}`),
    ];
    if (annex.date) parts.push(convertToSmartQuotes(` dated ${annex.date}`));
    const lastPart = parts[parts.length - 1];
    if (typeof lastPart === "string") {
      const trimmed = lastPart.trimEnd();
      parts[parts.length - 1] = trimmed.match(/[.!?]$/) ? trimmed : trimmed + ".";
    }
    return parts;
  };

  const openingParagraph = new Paragraph({
    text: convertToSmartQuotes("The accompanying Writ Petition has been filed under Article 32 of the Constitution of India. The contents of the Writ Petition may kindly be treated as part and parcel of this application and are not being repeated herein for the sake of brevity."),
    numbering: nextNumbering(),
  });

  if (iaIdentifier === "exemptionOfficialTranslation") {
    iaTitle = "Application for exemption from filing official translation";
    const orderedAnnexures = wpAnnexureOrderFromLods(projectData.listOfDates || []);
    const translatedAnnexures = orderedAnnexures
      .filter(e => e.annex.copyType === "translated copy" || e.annex.copyType === "true and translated copy")
      .map(e => `P-${e.pNumber}`);

    let translatedListText = "";
    if (translatedAnnexures.length > 0) {
      if (translatedAnnexures.length === 1) {
        translatedListText = `Annexure ${translatedAnnexures[0]}`;
      } else {
        const last = translatedAnnexures.pop();
        translatedListText = `Annexures ${translatedAnnexures.join(", ")} and ${last}`;
      }
    } else {
      translatedListText = "certain annexures";
    }

    const customPrayer = `Grant exemption to the Petitioner(s) from filing official translation of ${translatedListText}; and`;
    prayerParagraphs.push(new Paragraph({ children: [smartTextRun(customPrayer)], style: "Normal" }));

    const otReason = (projectData.standardIas?.exemptionOfficialTranslation?.reason || "").trim();
    const otReasonClause = otReason ? ` ${otReason}` : ` ${translatedListText}`;
    const customText = `This application seeks exemption from filing official translation of${otReasonClause}. It is respectfully submitted that true and correct translations of the said documents have been placed on record. The Petitioner undertakes to file official translations as and when directed by this Hon'ble Court.`;

    customTextParagraphs = [
      new Paragraph({
        text: convertToSmartQuotes(customText),
        numbering: nextNumbering(),
      }),
    ];
  } else {
    // Custom IA
    const customIa = (projectData.customIas || []).find(ia => ia.id === iaIdentifier);
    if (customIa) {
      iaTitle = customIa.title;
      const customAnnexureMap = new Map<string, number>();
      let cCounter = 1;
      (customIa.grounds || []).forEach(g => {
        (g.annexures || []).forEach(annex => customAnnexureMap.set(annex.id, cCounter++));
      });

      const groundsRows = (customIa.grounds || [])
        .filter(g => g.particulars.trim() !== "")
        .map((g, index) => {
          const { paragraphs, numbering } = parseHtml(g.particulars);
          if (numbering.length > 0) allNumberingConfigs.push(...numbering);
          if (g.annexures && g.annexures.length > 0) {
            g.annexures.forEach(annex => {
              const aNumber = customAnnexureMap.get(annex.id);
              if (aNumber) {
                const partsArray = createIaAnnexText(aNumber, annex);
                paragraphs.push(new Paragraph({ children: partsArray.map(p => (typeof p === "string" ? smartTextRun(p) : p)), style: "Normal" }));
              }
            });
          }
          return new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                borders: noBorders,
                width: { size: 8, type: WidthType.PERCENTAGE },
              }),
              new TableCell({ children: paragraphs, borders: noBorders, width: { size: 92, type: WidthType.PERCENTAGE } }),
            ],
          });
        });

      const groundsTable = new Table({
        width: { size: 91.66, type: WidthType.PERCENTAGE },
        columnWidths: [800, 9200],
        rows: groundsRows,
        borders: noBorders,
        indent: { size: 720, type: WidthType.DXA },
      });

      const para2Extra = (customIa.para2 || "").trim();
      const para2Text = para2Extra
        ? `The present application is being filed by the Petitioner(s) ${para2Extra}`
        : "The present application is being filed by the Petitioner(s)";

      customTextParagraphs = [
        new Paragraph({ text: convertToSmartQuotes(para2Text), numbering: nextNumbering() }),
        new Paragraph({ text: "The present application is filed on the following grounds:", numbering: nextNumbering() }),
        groundsTable,
      ];
      newListSegment();

      (customIa.prayers || [])
        .filter(p => p.particulars && p.particulars.trim() !== "")
        .forEach(p => {
          let prayerText = p.particulars.trim();
          prayerText = prayerText.replace(/[;.\s]+$/, "");
          prayerText += "; and";
          prayerParagraphs.push(new Paragraph({ children: [smartTextRun(prayerText)], style: "Normal" }));
        });
    }
  }

  const uniqueNumberingConfigs = [
    ...allNumberingConfigs.filter((v, i, a) => a.findIndex(t => t.reference === v.reference) === i),
    ...listSegments.map(seg => makeIaListConfig(seg.reference, seg.start)),
  ];

  const prayerTableRows = prayerParagraphs.map((p, index) => new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ text: `${getAlphabeticalLabel(index).toLowerCase()}.`, style: "Normal" })],
        borders: noBorders,
        width: { size: 8, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [p],
        borders: noBorders,
        width: { size: 92, type: WidthType.PERCENTAGE },
      }),
    ],
  }));

  // Residual prayer
  prayerTableRows.push(new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ text: `${getAlphabeticalLabel(prayerTableRows.length).toLowerCase()}.`, style: "Normal" })],
        borders: noBorders,
      }),
      new TableCell({
        children: [new Paragraph({ children: [smartTextRun("Pass any such other or further order(s) as this Hon'ble Court may deem fit in the facts and circumstances of this case.")], style: "Normal" })],
        borders: noBorders,
      }),
    ],
  }));

  const prayerTable = new Table({
    width: { size: 91.66, type: WidthType.PERCENTAGE },
    columnWidths: [800, 9200],
    rows: prayerTableRows,
    borders: noBorders,
    indent: { size: 720, type: WidthType.DXA },
  });

  const doc = new Document({
    numbering: { config: uniqueNumberingConfigs },
    styles: getScWpDefaultStyles(),
    sections: [{
      properties: { page: { margin: getScWpMargins() } },
      children: [
        ...createScWpIaHeader(projectData.caseType),
        ...createPartiesHeader(petHeader, resHeader),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: iaTitle.toUpperCase(), bold: true })] }),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            smartTextRun("To"),
            new TextRun({ break: 1 }),
            smartTextRun("The Hon'ble Chief Justice of India and"),
            new TextRun({ break: 1 }),
            smartTextRun("His Companion Justices of"),
            new TextRun({ break: 1 }),
            smartTextRun("The Hon'ble Supreme Court of India"),
          ],
        }),
        new Paragraph({ alignment: AlignmentType.LEFT, children: [smartTextRun({ text: "It is most respectfully submitted that:", bold: true })] }),
        openingParagraph,
        ...customTextParagraphs,
        new Paragraph({
          text: convertToSmartQuotes("No prejudice would be caused to the Respondent(s) if this application were allowed. On the other hand, irreparable injury would be caused to the Petitioner(s) if the application were not allowed."),
          numbering: nextNumbering(),
        }),
        new Paragraph({
          text: convertToSmartQuotes("This application is filed in good faith and in the interests of justice."),
          numbering: nextNumbering(),
        }),
        new Paragraph({
          children: [
            smartTextRun({ text: "PRAYERS", bold: true }),
            smartTextRun({ text: ": In view of the foregoing averments, it is most respectfully prayed that this Hon'ble Court may be pleased to:" }),
          ],
          numbering: nextNumbering(),
        }),
        prayerTable,
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [smartTextRun({ text: "And for this act of kindness, the humble Petitioner(s) shall ever pray.", italics: true })],
        }),
        new Paragraph(""),
        ...createFiledByTable(advocate?.filingDate as any, advocate?.aorName || "[AoR Name]", { includeSignature, isScWp: true }),
      ],
    }],
  });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `${iaIdentifier}.docx` };
  } finally {
    setDocxExportContext(null);
  }
}

export async function generateScWpAllIasDocx(projectData: DraftoProject) {
  const ias = getScWpIaList(projectData);
  const files = await Promise.all(
    ias.map(async (ia) => {
      const res = await generateScWpIaDocx(projectData, ia.id);
      return { id: ia.id, fileName: res.fileName, docx: res.docx };
    })
  );
  return { success: true, files };
}

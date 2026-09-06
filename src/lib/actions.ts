
import { Packer } from "docx";
import { createSlpHeader, createPartiesHeader, createWithTable, getPartyHeader, createAnnexureText, createIaAnnexureText, createFiledByTable, createIaHeader, base64ToBuffer, convertToSmartQuotes, smartTextRun } from "@/lib/docx-helpers";
import type { DraftoProject, Annexure } from "@/lib/schema";
import { Document, AlignmentType, Paragraph, TextRun, PageBreak, Table, TableCell, TableRow, WidthType, VerticalAlign, Header, Footer, PageNumber, SectionType, ISectionOptions, BorderStyle, CheckBox, FrameAnchorType, HorizontalPositionAlign, VerticalPositionAlign } from "docx";
import { differenceInDays, format } from "date-fns";
import { standardIaList } from "@/lib/ia-list";
import { createListingProforma } from "@/lib/proforma-helpers";
import { parseHtml } from "@/lib/html-to-docx";
import { getChecklistQueries, CHECKLIST_DECLARATION } from "@/lib/checklist-queries";
import { PDFDocument, rgb, StandardFonts, PDFName, PDFDict, PDFArray, PDFRef, PDFString, PDFNumber, PDFRawStream, decodePDFRawStream, degrees } from 'pdf-lib';
import { convertDocxToPdf as ipcConvertDocxToPdf } from "@/lib/ipc/pdf";
import { pageRotation } from "@/lib/pdf-rotation";
import {
  groundsSequence,
  getGroundsHeadingStyle,
  groundsHeadingRuns,
  groundsHeadingHang,
} from "@/lib/grounds-headings";
import {
  getActiveAppendixItems,
  appendixIndexText,
  appendixLabel,
  appendixBodyText,
  appendixItemIdFromComponentId,
  isAppendixComponentId,
} from "@/lib/appendix";
import {
  generateScWpCiDocx,
  generateScWpSlodDocx,
  generateScWpPetitionDocx,
  generateScWpFilingMemoDocx,
  generateScWpIaDocx,
  generateScWpAffidavitsDocx,
  getScWpIaList,
  wpAnnexureOrderFromLods,
  getScWpOutputFormatting,
  getScWpMargins,
  SC_WP_FACTS_LIST_GEOM,
  applyScWpFactsCascade,
} from "@/lib/sc-wp/sc-wp-actions";
import { isScWpFamily, isAppeal, annexurePrefix } from "@/lib/court-family";
import { appealProvisionText, appealTitle, appealOrderRule } from "@/lib/appeal/appeal-provisions";
import { resolveFactsHtml } from "@/lib/wp/facts-mode";
import { transposeLodToFacts, injectAnnexurePageRangesIntoFacts } from "@/lib/wp/wp-facts";


// The fourth argument to createSlpHeader, set only for the statutory appeal.
// Undefined for an SLP, which keeps every existing header byte-for-byte the
// same; for an Appeal it carries the provision chosen in Preliminary, which
// the header prints in place of the Article 136 line.
// How the main document names itself in the Index, the paper-book particulars
// and the Filing Memo. The Appeal states the provision it is brought under; the
// SLP keeps the wording it has always had.
const mainDocumentParticular = (projectData: DraftoProject) =>
  isAppeal(projectData.courtType)
    ? `Appeal under ${appealProvisionText(projectData)}, with accompanying Affidavit`
    : "Special Leave Petition with Certificate and Affidavit";

const appealHeaderArg = (projectData: DraftoProject) =>
  isAppeal(projectData.courtType) ? { provision: appealProvisionText(projectData) } : undefined;

const calculateIoText = (projectData: DraftoProject) => {
    if (!projectData.impugnedOrders || projectData.impugnedOrders.length === 0) {
      return '';
    }

    const sortedOrders = [...projectData.impugnedOrders].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return sortedOrders
      .map(order => {
        const courtName = order.court === 'Other' ? order.customCourt : order.court;
        const orderDate = order.date ? format(new Date(order.date), "dd.MM.yyyy") : '[date]';
        return `the Impugned ${order.type} dated ${orderDate} passed by the ${courtName || '[Court]'} in ${order.caseNumber || '[Case No.]'}`;
      })
      .join(' and ');
}

// Para 1's "appeal against …" clause pairs EACH impugned order with its own
// "by which <effect>" action, so multiple orders read correctly —
// "…in X by which A; and …in Y by which B." — rather than clubbing all the order
// descriptions first and all the effects at the end (which produced an
// ungrammatical "…and …, by which A; B"). A single order keeps the original
// ", by which" comma; multiple orders drop it so each clause reads as one unit.
// Each effect's own trailing sentence punctuation is stripped so clauses are
// joined by a semicolon (not a stray mid-sentence full stop) and the whole para
// is closed by exactly one full stop. Orders are date-sorted to match
// calculateIoText() used elsewhere. Returns '' when there are no orders.
const calculateIoActionText = (projectData: DraftoProject) => {
    const orders = projectData.impugnedOrders;
    if (!orders || orders.length === 0) {
      return '';
    }

    const sortedOrders = [...orders].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const byWhich = sortedOrders.length === 1 ? ', by which ' : ' by which ';

    const clauses = sortedOrders.map(order => {
        const courtName = order.court === 'Other' ? order.customCourt : order.court;
        const orderDate = order.date ? format(new Date(order.date), "dd.MM.yyyy") : '[date]';
        const desc = `the Impugned ${order.type} dated ${orderDate} passed by the ${courtName || '[Court]'} in ${order.caseNumber || '[Case No.]'}`;
        const effect = (order.effect || '').trim().replace(/[.;,]+$/, '');
        return `${desc}${byWhich}${effect}`;
    });

    // One order: "<clause>." Multiple: "<c1>; <c2>; and <cN>." — semicolon-separated
    // so the long paired clauses don't run together, with a serial "; and" before
    // the last and a single closing full stop.
    const body = clauses.length === 1
        ? clauses[0]
        : `${clauses.slice(0, -1).join('; ')}; and ${clauses[clauses.length - 1]}`;
    return `${body}.`;
}

const getIaList = (projectData: DraftoProject) => {
    const ias = [];
    const year = new Date().getFullYear();
    const iaPrefix = projectData.caseType === 'Civil' ? `IA ____/${year}` : `Crl. MP ___/${year}`;
    
    const allAnnexures: Annexure[] = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
    
    // Additional Documents IA comes first for P-annexure continuity
    if (projectData.standardIas.additionalDocuments) {
        const title = standardIaList.find(i => i.id === 'additionalDocuments')?.title || "";
        ias.push({ prefix: iaPrefix, title, id: 'additionalDocuments' });
    }
    if (projectData.standardIas.condonationOfDelay.active) {
        const delayDays = projectData.standardIas.condonationOfDelay.delayDays > 0 ? projectData.standardIas.condonationOfDelay.delayDays : "__";
        const title = `Application for condonation of delay of ${delayDays} days in filing the ${isAppeal(projectData.courtType) ? 'Appeal' : 'SLP'}`;
        ias.push({ prefix: iaPrefix, title, id: 'condonationOfDelay' });
    }
    if (projectData.standardIas.exemptionCertifiedCopy.active) {
        const title = standardIaList.find(i => i.id === 'exemptionCertifiedCopy')?.title || "";
        ias.push({ prefix: iaPrefix, title, id: 'exemptionCertifiedCopy' });
    }
    if (projectData.standardIas.exemptionOfficialTranslation.active) {
        const annexureNumberingMap = new Map<string, number>();
        let pCounter = 1;
        allAnnexures.filter(annex => !annex.isAdditionalDocument).forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));
        allAnnexures.filter(annex => annex.isAdditionalDocument).forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));
        
        const translatedAnnexures = allAnnexures
          .filter(annex => annex.copyType === 'translated copy' || annex.copyType === 'true and translated copy')
          .map(annex => annexureNumberingMap.get(annex.id))
          .filter(Boolean)
          .map(pNumber => `${annexurePrefix(projectData.courtType)}-${pNumber}`);
        
        let annexureList = '';
        if (translatedAnnexures.length > 0) {
            const last = translatedAnnexures.pop();
            annexureList = translatedAnnexures.length > 0
                ? `Annexures ${translatedAnnexures.join(', ')} and ${last}`
                : `Annexure ${last}`;
        }
        
        const title = `Application for exemption from filing Official Translation(s) of ${annexureList || projectData.standardIas.exemptionOfficialTranslation.reason || 'Annexures'}`;
        ias.push({ prefix: iaPrefix, title, id: 'exemptionOfficialTranslation' });
    }
    if (projectData.standardIas.exemptionFromSurrendering.active) {
        const title = standardIaList.find(i => i.id === 'exemptionFromSurrendering')?.title || "";
        ias.push({ prefix: iaPrefix, title, id: 'exemptionFromSurrendering' });
    }
    // Criminal appeals only.
    if (isAppeal(projectData.courtType) && projectData.caseType === 'Criminal' && projectData.standardIas.suspensionOfSentence?.active) {
        const title = standardIaList.find(i => i.id === 'suspensionOfSentence')?.title || "";
        ias.push({ prefix: iaPrefix, title, id: 'suspensionOfSentence' });
    }
    projectData.customIas.forEach(ia => {
        ias.push({ prefix: iaPrefix, title: ia.title, id: ia.id });
    });
    return ias;
}

// User-configurable SLP layout preferences (drafting style, not wording). The
// fallbacks reproduce exactly what Drafto generated before these existed, so an
// untouched installation keeps its old output.
export const getSlpLayout = () => {
    const d = { headerStyle: 'short' as 'short' | 'sci', headingBreak: false, translatedCopyFirst: false };
    if (typeof window === 'undefined') return d;
    try {
        const raw = window.localStorage.getItem('drafto-settings');
        if (!raw) return d;
        const s = JSON.parse(raw);
        return {
            headerStyle: s.slpHeaderStyle === 'sci' ? 'sci' as const : 'short' as const,
            headingBreak: s.slpHeadingBreak ?? d.headingBreak,
            translatedCopyFirst: s.slpTranslatedCopyFirst ?? d.translatedCopyFirst,
        };
    } catch {
        return d;
    }
};

// User-configurable output text formatting (read from drafto-settings at export
// time, in the renderer). Falls back to the historical defaults.
export const getOutputFormatting = () => {
    const d = { font: "Times New Roman", sizePt: 14, lineSpacing: 1.5, afterPt: 12 };
    if (typeof window === 'undefined') return d;
    try {
        const raw = window.localStorage.getItem('drafto-settings');
        if (!raw) return d;
        const s = JSON.parse(raw);
        return {
            font: s.outputFont || d.font,
            sizePt: s.outputFontSizePt ?? d.sizePt,
            lineSpacing: s.outputLineSpacing ?? d.lineSpacing,
            afterPt: s.outputParaAfterPt ?? d.afterPt,
        };
    } catch {
        return d;
    }
};

// User-configurable formatting for the Advocate's Checklist (read at export time
// in the renderer). The font *family* follows the output font; size, line spacing
// and paragraph spacing are independent so users can tighten a long checklist.
const getChecklistFormatting = () => {
    const d = { sizePt: 14, lineSpacing: 1.5, paraSpacingPt: 6, marginTopInches: 1, marginLeftInches: 1 };
    if (typeof window === 'undefined') return d;
    try {
        const raw = window.localStorage.getItem('drafto-settings');
        if (!raw) return d;
        const s = JSON.parse(raw);
        return {
            sizePt: s.checklistFontSizePt ?? d.sizePt,
            lineSpacing: s.checklistLineSpacing ?? d.lineSpacing,
            paraSpacingPt: s.checklistParaSpacingPt ?? d.paraSpacingPt,
            marginTopInches: s.checklistMarginTopInches ?? d.marginTopInches,
            marginLeftInches: s.checklistMarginLeftInches ?? d.marginLeftInches,
        };
    } catch {
        return d;
    }
};

// Listing Proforma formatting. It has always been a rigid one-page form (13pt,
// single spaced) and the defaults keep that; the user can loosen it, or have it
// follow the checklist's settings. A proforma that then runs past two pages is
// described honestly in the Index and the bookmark — see the LP page count in
// generatePdf.
const getLpFormatting = () => {
    const d = { sizePt: 13, lineSpacing: 1, paraSpacingPt: 0, marginTopInches: 1.5, marginLeftInches: 1.5 };
    if (typeof window === 'undefined') return d;
    try {
        const s = JSON.parse(window.localStorage.getItem('drafto-settings') || '{}');
        if (s.lpFollowChecklist) {
            const c = getChecklistFormatting();
            return { sizePt: c.sizePt, lineSpacing: c.lineSpacing, paraSpacingPt: c.paraSpacingPt, marginTopInches: c.marginTopInches, marginLeftInches: c.marginLeftInches };
        }
        return {
            sizePt: s.lpFontSizePt ?? d.sizePt,
            lineSpacing: s.lpLineSpacing ?? d.lineSpacing,
            paraSpacingPt: s.lpParaSpacingPt ?? d.paraSpacingPt,
            marginTopInches: s.lpMarginTopInches ?? d.marginTopInches,
            marginLeftInches: s.lpMarginLeftInches ?? d.marginLeftInches,
        };
    } catch {
        return d;
    }
};

const getScWpChecklistFormatting = () => {
    const d = { sizePt: 14, lineSpacing: 1.5, paraSpacingPt: 6, marginTopInches: 1, marginLeftInches: 1 };
    if (typeof window === 'undefined') return d;
    try {
        const raw = window.localStorage.getItem('drafto-settings');
        if (!raw) return d;
        const s = JSON.parse(raw);
        return {
            sizePt: s.scWpChecklistFontSizePt ?? s.checklistFontSizePt ?? d.sizePt,
            lineSpacing: s.scWpChecklistLineSpacing ?? s.checklistLineSpacing ?? d.lineSpacing,
            paraSpacingPt: s.scWpChecklistParaSpacingPt ?? s.checklistParaSpacingPt ?? d.paraSpacingPt,
            marginTopInches: s.scWpChecklistMarginTopInches ?? s.checklistMarginTopInches ?? d.marginTopInches,
            marginLeftInches: s.scWpChecklistMarginLeftInches ?? s.checklistMarginLeftInches ?? d.marginLeftInches,
        };
    } catch {
        return d;
    }
};

const getScWpLpFormatting = () => {
    const d = { sizePt: 13, lineSpacing: 1, paraSpacingPt: 0, marginTopInches: 1.5, marginLeftInches: 1.5 };
    if (typeof window === 'undefined') return d;
    try {
        const s = JSON.parse(window.localStorage.getItem('drafto-settings') || '{}');
        const followChecklist = s.scWpLpFollowChecklist ?? s.lpFollowChecklist;
        if (followChecklist) {
            const c = getScWpChecklistFormatting();
            return { sizePt: c.sizePt, lineSpacing: c.lineSpacing, paraSpacingPt: c.paraSpacingPt, marginTopInches: c.marginTopInches, marginLeftInches: c.marginLeftInches };
        }
        return {
            sizePt: s.scWpLpFontSizePt ?? s.lpFontSizePt ?? d.sizePt,
            lineSpacing: s.scWpLpLineSpacing ?? s.lpLineSpacing ?? d.lineSpacing,
            paraSpacingPt: s.scWpLpParaSpacingPt ?? s.lpParaSpacingPt ?? d.paraSpacingPt,
            marginTopInches: s.scWpLpMarginTopInches ?? s.lpMarginTopInches ?? d.marginTopInches,
            marginLeftInches: s.scWpLpMarginLeftInches ?? s.lpMarginLeftInches ?? d.marginLeftInches,
        };
    } catch {
        return d;
    }
};

export const getDefaultStyles = () => {
    const f = getOutputFormatting();
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
                before: 0
              },
              alignment: AlignmentType.JUSTIFIED,
            },
          },
        ],
    };
};

// Cover Page and Office Report must always fit on a single page, so their size
// and spacing are enforced regardless of the user's output-formatting choices.
// The user's chosen font *family* is honoured; size is pinned to 13pt for Arial
// (wider metrics) and 14pt for every other font, with fixed 1.5 line spacing and
// 12pt after-paragraph spacing — the values known to fit.
const getConstrainedStyles = () => {
    const f = getOutputFormatting();
    const sizePt = f.font === 'Arial' ? 13 : 14;
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
              size: sizePt * 2, // half-points
            },
            paragraph: {
              spacing: {
                line: 360, // 1.5 lines
                after: 240, // 12pt
                before: 0
              },
              alignment: AlignmentType.JUSTIFIED,
            },
          },
        ],
    };
};

// Page margins for every SLP document — user-configurable (Settings →
// Formatting); historical defaults 1.5" top/left, 1" bottom/right. Read from
// drafto-settings at export time, in the renderer.
// "Annexures P-1 to P-N" — the phrase used by the affidavit, the SLP's own
// declaration and the checklist. With no annexures on the record it used to
// read "P-1 to P-0"; it now leaves the number blank for the deponent to fill
// in. Settings → SLP can also force the blank form even when annexures exist,
// for drafters who prefer the affidavit not to commit to a number.
export const annexureRangeText = (lastNumber: number, alwaysBlank = false, prefix: string = "P"): string =>
    (alwaysBlank || lastNumber < 1) ? `Annexures ${prefix}-1 to ${prefix}-__` : `Annexures ${prefix}-1 to ${prefix}-${lastNumber}`;

// Whether the affidavit states the actual last annexure number or always leaves
// it blank (Settings → SLP → Affidavit).
export const affidavitWantsBlankAnnexureRange = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        const s = JSON.parse(window.localStorage.getItem('drafto-settings') || '{}');
        return s.slpAffidavitAnnexureRef === 'blank';
    } catch { return false; }
};

export const getSlpMargins = () => {
    const d = { top: 1.5, right: 1, bottom: 1, left: 1.5 };
    if (typeof window !== 'undefined') {
        try {
            const s = JSON.parse(window.localStorage.getItem('drafto-settings') || '{}');
            const clamp = (v: unknown, dv: number) => {
                const n = typeof v === 'number' ? v : parseFloat(String(v));
                return isFinite(n) ? Math.min(3, Math.max(0.2, n)) : dv;
            };
            d.top = clamp(s.slpMarginTopIn, d.top);
            d.right = clamp(s.slpMarginRightIn, d.right);
            d.bottom = clamp(s.slpMarginBottomIn, d.bottom);
            d.left = clamp(s.slpMarginLeftIn, d.left);
        } catch { /* ignore */ }
    }
    return {
        top: Math.round(d.top * 1440),
        right: Math.round(d.right * 1440),
        bottom: Math.round(d.bottom * 1440),
        left: Math.round(d.left * 1440),
    };
};

// Default cell margins matching MS Word (0.08 inches = 115 twips)
const defaultCellMargins = {
    top: 0,
    bottom: 0,
    left: 115,
    right: 115,
};

// Table paragraph spacing (6pt before and after)
const tableParagraphSpacing = {
    before: 120, // 6pt = 120 twips
    after: 120,  // 6pt = 120 twips
};

// ── Index of Record of Proceedings ───────────────────────────────────────────
// The registry fills this in by hand, so Drafto supplies the title and an empty
// ruled table. It sits between the cover page and the Index, which is exactly
// where the Index's own row 5 ("Index of Record of Proceedings", p. A4) says it
// is.
//
// Ten rows, fixed. Sizing the table to the page filled it to within a line, and
// LibreOffice lays rows out a shade taller than Word's own arithmetic predicts,
// so the last row tipped onto a second page — taking a repeated header row with
// it. Ten rows is comfortably inside one page at any margin setting the app
// allows, and the registry writes on the ruled lines regardless.
const ROP_ROW_COUNT = 10;

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
        ...Array.from({ length: ROP_ROW_COUNT }, () => new TableRow({ children: [cell(""), cell(""), cell("")] })),
    ];

    return [
        new Paragraph({
            // The break stays in a paragraph of its own on the cover page (see
            // below) rather than riding on this heading: the "Advocate for the
            // Petitioner(s)" line is in a frame pinned to the bottom margin, and
            // with pageBreakBefore here LibreOffice carries that frame onto this
            // page instead of leaving it at the foot of the cover page.
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [smartTextRun({ text: "INDEX OF RECORD OF PROCEEDINGS", bold: true })],
        }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [1000, 7000, 1500], rows }),
    ];
}

// ── Volume-splitting utilities ─────────────────────────────────────────────────

function toRomanNumeral(n: number): string {
    const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
    const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
    let result = '';
    for (let i = 0; i < vals.length; i++) {
        while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
    }
    return result;
}

interface NumericComponent {
    id: string;
    startNumericPage: number;
    endNumericPage: number;
    pageCount: number;
    indexSNo?: number;
}

interface SplitPoint {
    splitNumericPage: number;   // first numeric page of the next volume
    isIntraComponent: boolean;  // true if we cut inside a component
    componentId?: string;       // which component is being cut (intra only)
    vol1: number;               // volume number before the cut
    vol2: number;               // volume number after the cut
}

function calcNumVolumes(total: number, firstThreshold: number, step: number): number {
    if (total <= firstThreshold) return 1;
    return 1 + Math.ceil((total - firstThreshold) / step);
}

function findActualSplitPage(
    targetPage: number,
    components: NumericComponent[],
    maxIntraComponentPages: number,
    minTailPages: number,
    minHeadPages: number,
): { page: number; isIntra: boolean; componentId?: string } {
    for (const comp of components) {
        if (targetPage >= comp.startNumericPage && targetPage <= comp.endNumericPage) {
            if (comp.pageCount <= maxIntraComponentPages) {
                // Small component: keep intact, snap to nearest boundary
                const distToStart = targetPage - comp.startNumericPage;
                const distToEnd   = comp.endNumericPage - targetPage + 1;
                if (distToStart <= distToEnd) {
                    return { page: comp.startNumericPage, isIntra: false };
                } else {
                    return { page: comp.endNumericPage + 1, isIntra: false };
                }
            } else {
                // Large component: eligible for intra-component split.
                const tailPages = comp.endNumericPage - targetPage + 1; // pages spilling into next vol
                const headPages = targetPage - comp.startNumericPage;   // pages staying in current vol

                if (tailPages <= minTailPages) {
                    // Spill too small → retain whole component in the current volume
                    return { page: comp.endNumericPage + 1, isIntra: false };
                }
                if (headPages <= minHeadPages) {
                    // Stub too small → push whole component to the next volume
                    return { page: comp.startNumericPage, isIntra: false };
                }
                return { page: targetPage, isIntra: true, componentId: comp.id };
            }
        }
    }
    return { page: targetPage, isIntra: false };
}

// An annexure and its typed/translated copy share ONE Index row and one page
// range. Which of the two is placed first is a user setting, so the pairing is
// read off the actual merge order rather than assumed: whichever comes first
// owns the row, and the one after it is folded into that row.
const TYPED_SUFFIX = '_typed';
const partnerIdOf = (id: string): string | null => {
    if (id.endsWith(TYPED_SUFFIX)) return id.slice(0, -TYPED_SUFFIX.length);
    if (id.startsWith('annexure_')) return `${id}${TYPED_SUFFIX}`;
    return null;
};

/** True when the very next item in the merge is this item's other copy. */
function pairedWithNext(id: string, metas: { id: string }[]): boolean {
    if (!id.startsWith('annexure_')) return false;
    const i = metas.findIndex(m => m.id === id);
    if (i < 0 || i >= metas.length - 1) return false;
    return metas[i + 1].id === partnerIdOf(id);
}

/** True when this item is the second half of a pair — no row of its own. */
function isSecondOfPair(id: string, metas: { id: string }[]): boolean {
    if (!id.startsWith('annexure_')) return false;
    const i = metas.findIndex(m => m.id === id);
    if (i <= 0) return false;
    return metas[i - 1].id === partnerIdOf(id);
}

/** The annexure this item belongs to, whichever copy it is. */
const annexureBaseId = (id: string): string => {
    const noSuffix = id.endsWith(TYPED_SUFFIX) ? id.slice(0, -TYPED_SUFFIX.length) : id;
    if (noSuffix.startsWith('annexure_')) return noSuffix.substring('annexure_'.length);
    if (noSuffix.startsWith('ia_annexure_')) return noSuffix.substring('ia_annexure_'.length);
    return noSuffix;
};

// Build the ordered list of numeric components from Pass-1 data
function buildNumericComponents(
    fileMetas: { id: string }[],
    docPageCounts: Map<string, { id: string; pageCount: number; shouldCombineWithNext: boolean }>,
    docIdToIndexSNo: Map<string, number>,
    isScWp?: boolean,
): NumericComponent[] {
    const components: NumericComponent[] = [];
    let runningPage = 1;
    let seenImpugned = false;

    for (const meta of fileMetas) {
        if (isScWp ? meta.id === 'slp' : meta.id.startsWith('impugnedOrder_')) seenImpugned = true;
        if (!seenImpugned) continue;
        if (['ci','or','lp','slod','advocateChecklist','slpAffidavit'].includes(meta.id)) continue;
        if (meta.id.startsWith('ia_affidavit_') || isSecondOfPair(meta.id, fileMetas)) continue;

        const info = docPageCounts.get(meta.id);
        if (!info || info.pageCount === 0) continue;

        let totalPages = info.pageCount;
        if (info.shouldCombineWithNext) {
            const idx = fileMetas.findIndex(m => m.id === meta.id);
            if (idx >= 0 && idx < fileMetas.length - 1) {
                const nxt = docPageCounts.get(fileMetas[idx + 1].id);
                if (nxt) totalPages += nxt.pageCount;
            }
        }

        components.push({
            id: meta.id,
            startNumericPage: runningPage,
            endNumericPage:   runningPage + totalPages - 1,
            pageCount: totalPages,
            indexSNo: docIdToIndexSNo.get(meta.id),
        });
        runningPage += totalPages;
    }
    return components;
}

// Build volume index table rows (filtered to items assigned to `volumeNum`)
function buildVolumeIndexTableRows(
    particularsList: (string | (TextRun | string)[])[],
    volumeNum: number,
    sNoToVolume: Map<number, number>,
    splitSNos: Map<number, { v1: number; v2: number; splitPage: number }>,
    pageRanges: Map<number, string>,
    volumePageRanges: Map<number, Map<number, string>>,
): TableRow[] {
    const rows: TableRow[] = [];
    particularsList.forEach((item, index) => {
        const sNo = index + 1;
        const splitInfo = splitSNos.get(sNo);
        const primaryVol = sNoToVolume.get(sNo) ?? 1;

        // Decide if this item belongs to this volume's own index
        if (sNo <= 9) {
            if (volumeNum !== 1) return; // pre-numeric items only in Vol I
        } else {
            if (splitInfo) {
                if (splitInfo.v1 !== volumeNum && splitInfo.v2 !== volumeNum) return;
            } else if (primaryVol !== volumeNum) {
                return;
            }
        }

        let part1PageNum = '';
        let part2PageNum = '';
        if (sNo === 2) part1PageNum = 'A';
        else if (sNo === 3) part1PageNum = 'A1-A2';
        else if (sNo === 4) part2PageNum = 'A3';
        else if (sNo === 5) part2PageNum = 'A4';
        else if (sNo === 6) part2PageNum = 'A5';
        else if (sNo === 7) part2PageNum = 'A6';
        else if (sNo === 8) part2PageNum = 'NS1-NS_';
        else {
            // sNo >= 9: use volume-specific page range if available, else overall
            const volSpecific = volumePageRanges.get(volumeNum)?.get(sNo);
            part1PageNum = volSpecific ?? (pageRanges.get(sNo) ?? '');
        }

        rows.push(new TableRow({ children: [
            new TableCell({ children: [new Paragraph({ text: `${sNo}.`, style: 'Normal', alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            new TableCell({ children: [new Paragraph({ children: Array.isArray(item) ? item.map(i => (typeof i === 'string' ? smartTextRun(i) : i)) : [smartTextRun(item as string)], style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            new TableCell({ children: [new Paragraph({ text: part1PageNum, style: 'Normal', alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            new TableCell({ children: [new Paragraph({ text: part2PageNum, style: 'Normal', alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            new TableCell({ children: [new Paragraph({ text: '', style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        ]}));
    });
    return rows;
}

// Build master index table rows (all items + Volume column)
// Build master index rows: standard 5-column table with merged "VOLUME X" section-header rows
// separating items by volume. No separate Volume column.
function buildMasterIndexTableRows(
    particularsList: (string | (TextRun | string)[])[],
    sNoToVolume: Map<number, number>,
    splitSNos: Map<number, { v1: number; v2: number; splitPage: number }>,
    pageRanges: Map<number, string>,
    totalVolumes: number,
): TableRow[] {
    const rows: TableRow[] = [];

    // Standard 5-column header (same as the per-volume index)
    rows.push(
        new TableRow({ children: [
            new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: 'S. No.', bold: true })], alignment: AlignmentType.CENTER, style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, rowSpan: 2, margins: defaultCellMargins }),
            new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: 'Particulars of the Document', bold: true })], alignment: AlignmentType.CENTER, style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, rowSpan: 2, margins: defaultCellMargins }),
            new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: 'Page Nos. of Part to which it belongs', bold: true })], alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, columnSpan: 2, margins: defaultCellMargins }),
            new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: 'Remarks', bold: true })], alignment: AlignmentType.CENTER, style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, rowSpan: 2, margins: defaultCellMargins }),
        ]}),
        new TableRow({ children: [
            new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: 'Part 1 (Contents of the Paper Book)', bold: true })], alignment: AlignmentType.CENTER, style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: 'Part 2 (Contents of the file alone)', bold: true })], alignment: AlignmentType.CENTER, style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        ]}),
    );

    for (let v = 1; v <= totalVolumes; v++) {
        // Merged section-header row for this volume
        rows.push(new TableRow({ children: [
            new TableCell({
                columnSpan: 5,
                children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [smartTextRun({ text: `VOLUME ${toRomanNumeral(v)}`, bold: true })],
                    style: 'Normal',
                    spacing: tableParagraphSpacing,
                })],
                margins: defaultCellMargins,
            }),
        ]}));

        // Items belonging to this volume section
        particularsList.forEach((item, index) => {
            const sNo = index + 1;
            const splitInfo = splitSNos.get(sNo);
            const primaryVol = sNoToVolume.get(sNo) ?? 1;

            // Determine if this item goes in this volume's section.
            // Pre-numeric (sNo 1-9) → Volume I only.
            // Split items appear in both volume sections (with their partial range).
            // Non-split items appear in their assigned volume.
            if (sNo <= 9) {
                if (v !== 1) return;
            } else if (splitInfo) {
                if (splitInfo.v1 !== v && splitInfo.v2 !== v) return;
            } else {
                if (primaryVol !== v) return;
            }

            let part1PageNum = '';
            let part2PageNum = '';
            if (sNo === 2) part1PageNum = 'A';
            else if (sNo === 3) part1PageNum = 'A1-A2';
            else if (sNo === 4) part2PageNum = 'A3';
            else if (sNo === 5) part2PageNum = 'A4';
            else if (sNo === 6) part2PageNum = 'A5';
            else if (sNo === 7) part2PageNum = 'A6';
            else if (sNo === 8) part2PageNum = 'NS1-NS_';
            else {
                // For split items: show the portion belonging to this volume
                if (splitInfo && splitInfo.v1 === v) {
                    const parsed = pageRanges.get(sNo);
                    if (parsed) {
                        const full = parsed.split('-').map(s => s.trim());
                        part1PageNum = full.length >= 2 ? `${full[0]}-${splitInfo.splitPage - 1}` : parsed;
                    }
                } else if (splitInfo && splitInfo.v2 === v) {
                    const parsed = pageRanges.get(sNo);
                    if (parsed) {
                        const full = parsed.split('-').map(s => s.trim());
                        part1PageNum = full.length >= 2 ? `${splitInfo.splitPage}-${full[full.length - 1]}` : parsed;
                    }
                } else {
                    part1PageNum = pageRanges.get(sNo) ?? '';
                }
            }

            rows.push(new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ text: `${sNo}.`, style: 'Normal', alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ children: Array.isArray(item) ? item.map(i => (typeof i === 'string' ? smartTextRun(i) : i)) : [smartTextRun(item as string)], style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: part1PageNum, style: 'Normal', alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: part2PageNum, style: 'Normal', alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: '', style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            ]}));
        });
    }

    return rows;
}

interface CiVolumeOptions {
    volumeNum: number;
    totalVolumes: number;
    particularsList: (string | (TextRun | string)[])[];
    sNoToVolume: Map<number, number>;
    splitSNos: Map<number, { v1: number; v2: number; splitPage: number }>;
    pageRanges: Map<number, string>;             // overall page ranges
    volumePageRanges: Map<number, Map<number, string>>; // per-volume overrides for split items
}

// IDs that are user-uploaded and optional (Criminal SLPs only)
const OPTIONAL_CRIMINAL_DOC_IDS = new Set(['custodyCertificate', 'firDetails', 'proofOfService']);

export async function generateCiDocx(projectData: DraftoProject, pageRanges?: Map<number, string>, volumeOptions?: CiVolumeOptions, optionalDocIds?: Set<string>) {
  const ioText = ` ${calculateIoText(projectData)}`;
  const effectivePetitioners = (projectData.isCommonOrder && (projectData.commonOrderParties?.length ?? 0) > 0)
    ? projectData.commonOrderParties[0].petitioners
    : projectData.petitioners;
  const effectiveRespondents = (projectData.isCommonOrder && (projectData.commonOrderParties?.length ?? 0) > 0)
    ? projectData.commonOrderParties[0].respondents
    : projectData.respondents;
  const petHeader = getPartyHeader(effectivePetitioners);
  const resHeader = getPartyHeader(effectiveRespondents);
  
  if (projectData.impugnedOrders && projectData.impugnedOrders.length > 0 && projectData.advocate.filingDate) {
    const latestOrder = projectData.impugnedOrders.reduce((latest, current) => {
        return new Date(latest.date) > new Date(current.date) ? latest : current;
    });

    const daysDifference = differenceInDays(new Date(projectData.advocate.filingDate), new Date(latestOrder.date));
    const calculatedDelay = daysDifference - 90;
    projectData.standardIas.condonationOfDelay.delayDays = Math.max(0, calculatedDelay);
  }

  const iaList = getIaList(projectData);
  const aorName = projectData.advocate.aorName || "[AoR Name]";

  const year = new Date().getFullYear();
  const iaPrefix = projectData.caseType === 'Civil' ? `IA ____/${year}` : `Crl. MP ___/${year}`;

  const particularsList: (string | (TextRun | string)[])[] = [
      "Court Fees",
      "O/R on Limitation",
      "Listing Proforma",
      "Cover Page of Paper Book",
      "Index of Record of Proceedings",
      "Limitation Report prepared by the Registry",
      "Defect List",
      "Note Sheet",
      "Synopsis and List of Dates",
  ];

  if (projectData.impugnedOrders && projectData.impugnedOrders.length > 0) {
      const sortedOrders = [...projectData.impugnedOrders].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      sortedOrders.forEach(order => {
          const courtName = order.court === 'Other' ? order.customCourt : order.court;
          const orderDate = order.date ? format(new Date(order.date), "dd.MM.yyyy") : '[date]';
          const singleIoText = `the Impugned ${order.type || '[Order Type]'}`;
          particularsList.push(`Impugned ${order.type || '[Order Type]'}: True copy of ${singleIoText} dated ${orderDate} passed by the ${courtName || '[Court]'} in ${order.caseNumber || '[Case No.]'}`);
      });
  } else {
      particularsList.push(`Impugned [Order Type]: True copy of [Impugned Order Details]`);
  }

  particularsList.push(mainDocumentParticular(projectData));

  // One row per attached Appendix document, in the order they are merged into
  // the paper-book — getActiveAppendixItems() is the single source both read,
  // so a row can never go missing while its pages are still there (which used
  // to throw every page number after it out by the length of the Appendix).
  const appendixItems = getActiveAppendixItems(projectData);
  appendixItems.forEach((item, index) => {
    particularsList.push([
      smartTextRun({ text: appendixLabel(index, appendixItems.length), bold: true }),
      convertToSmartQuotes(`: ${appendixBodyText(item)}`),
    ]);
  });

  const allAnnexures: Annexure[] = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
  const nonAdAnnexures = allAnnexures.filter(annex => !annex.isAdditionalDocument);
  const adAnnexures = allAnnexures.filter(annex => annex.isAdditionalDocument);

  const annexureNumberingMap = new Map<string, number>();
  let pCounter = 1;
  nonAdAnnexures.forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));
  adAnnexures.forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));

  nonAdAnnexures.forEach(annex => {
    const pNumber = annexureNumberingMap.get(annex.id);
    if (pNumber) {
        particularsList.push(createAnnexureText(pNumber, annex, true, annexurePrefix(projectData.courtType)));
    }
  });
  
  // Add Additional Documents IA with its AD P-annexures
  if (adAnnexures.length > 0) {
    const adIa = iaList.find(ia => ia.id === 'additionalDocuments');
    if (adIa) {
        particularsList.push([smartTextRun({ text: adIa.prefix, bold: true }), convertToSmartQuotes(`: ${adIa.title}`)]);
        adAnnexures.forEach(annex => {
            const pNumber = annexureNumberingMap.get(annex.id);
            if (pNumber) {
                particularsList.push(createAnnexureText(pNumber, annex, true, annexurePrefix(projectData.courtType)));
            }
        });
    }
  }
  
  // Collect all IA ground annexures
  const allIaAnnexures: any[] = [];
  if (projectData.standardIas?.condonationOfDelay?.active) {
      projectData.standardIas.condonationOfDelay.grounds?.forEach(ground => {
          if (ground.annexures) {
              ground.annexures.forEach(annex => {
                  allIaAnnexures.push({ ...annex, iaId: 'condonationOfDelay' });
              });
          }
      });
  }
  if (projectData.standardIas?.suspensionOfSentence?.active) {
      projectData.standardIas.suspensionOfSentence.grounds?.forEach(ground => {
          if (ground.annexures) {
              ground.annexures.forEach(annex => {
                  allIaAnnexures.push({ ...annex, iaId: 'suspensionOfSentence' });
              });
          }
      });
  }
  if (projectData.standardIas?.exemptionFromSurrendering?.active) {
      projectData.standardIas.exemptionFromSurrendering.grounds?.forEach(ground => {
          if (ground.annexures) {
              ground.annexures.forEach(annex => {
                  allIaAnnexures.push({ ...annex, iaId: 'exemptionFromSurrendering' });
              });
          }
      });
  }
  if (projectData.customIas && projectData.customIas.length > 0) {
      projectData.customIas.forEach(customIa => {
          if (customIa.grounds) {
              customIa.grounds.forEach(ground => {
                  if (ground.annexures) {
                      ground.annexures.forEach(annex => {
                          allIaAnnexures.push({ ...annex, iaId: customIa.id });
                      });
                  }
              });
          }
      });
  }

  const iaAnnexureNumberingMap = new Map<string, number>();
  let aCounter = 1;
  allIaAnnexures.forEach(a => iaAnnexureNumberingMap.set(a.id, aCounter++));

  // Add other IAs (excluding Additional Documents which was already added)
  const otherIas = iaList.filter(ia => ia.id !== 'additionalDocuments');
  otherIas.forEach(ia => {
    particularsList.push([smartTextRun({ text: ia.prefix, bold: true }), convertToSmartQuotes(`: ${ia.title}`)]);
    
    // Add IA ground annexures for this specific IA
    const iaSpecificAnnexures = allIaAnnexures.filter(a => a.iaId === ia.id);
    iaSpecificAnnexures.forEach(annex => {
        const aNum = iaAnnexureNumberingMap.get(annex.id);
        if (aNum) {
            particularsList.push(createIaAnnexureText(aNum, annex, true));
        }
    });

    // Add certified copy receipt entry (Annexure-A) for exemptionCertifiedCopy IA
    if (ia.id === 'exemptionCertifiedCopy' && projectData.standardIas?.exemptionCertifiedCopy?.hasApplied === 'yes') {
        const receiptDate = projectData.standardIas.exemptionCertifiedCopy.receiptDate;
        const dateText = receiptDate ? ` dated ${format(new Date(receiptDate), 'dd.MM.yyyy')}` : '';
        particularsList.push([
            smartTextRun({ text: 'Annexure-A', bold: true }),
            convertToSmartQuotes(`: True copy of the Receipt of application for certified copy${dateText}.`)
        ]);
    }
  });
  
  if (projectData.caseType === 'Criminal') {
    // When optionalDocIds is provided (PDF generation), only include items that have files.
    // When undefined (DOCX-only generation), always include both entries.
    const includeCustody = !optionalDocIds || optionalDocIds.has('custodyCertificate');
    const includeFir     = !optionalDocIds || optionalDocIds.has('firDetails');
    const includeService = !optionalDocIds || optionalDocIds.has('proofOfService');
    if (includeCustody) particularsList.push("Custody Certificate");
    if (includeFir)     particularsList.push("FIR Details");
    if (includeService) particularsList.push("Proof of Service");
  }
  particularsList.push("Memo of Parties", "Filing Memo", "Vakalatnama(s)");


  const indexTableRows = [
      new TableRow({
          children: [
              new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "S. No.", bold: true})], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, rowSpan: 2, margins: defaultCellMargins }),
              new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Particulars of the Document", bold: true})], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, rowSpan: 2, margins: defaultCellMargins }),
              new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Page Nos. of Part to which it belongs", bold: true})], alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, columnSpan: 2, margins: defaultCellMargins }),
              new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Remarks", bold: true})], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, rowSpan: 2, margins: defaultCellMargins }),
          ],
      }),
      new TableRow({
          children: [
              new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Part 1 (Contents of the Paper Book)", bold: true})], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
              new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Part 2 (Contents of the file alone)", bold: true})], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
          ],
      }),
      ...particularsList.map((item, index) => {
          const sNo = index + 1;
          
          // Define standard page numbers for specific rows
          let part1PageNum = "";
          let part2PageNum = "";
          
          // Row 2: O/R on Limitation → Part 1: A
          if (sNo === 2) {
              part1PageNum = "A";
          }
          // Row 3: Listing Proforma → Part 1: A1-A2, or however many pages it
          // actually runs to (its formatting is the user's to set). The page
          // count arrives in pageRanges under this row's own number; without it
          // — a DOCX-only export, where no pages have been counted — the
          // customary two-page form is assumed.
          else if (sNo === 3) {
              part1PageNum = pageRanges?.get(3) || "A1-A2";
          }
          // Row 4: Cover Page of Paper Book → Part 2: A3
          else if (sNo === 4) {
              part2PageNum = "A3";
          }
          // Row 5: Index of Record of Proceedings → Part 2: A4
          else if (sNo === 5) {
              part2PageNum = "A4";
          }
          // Row 6: Limitation Report → Part 2: A5
          else if (sNo === 6) {
              part2PageNum = "A5";
          }
          // Row 7: Defect List → Part 2: A6
          else if (sNo === 7) {
              part2PageNum = "A6";
          }
          // Row 8: Note Sheet → Part 2: NS1-NS_
          else if (sNo === 8) {
              part2PageNum = "NS1-NS_";
          }
          // Row 9 onwards: Use calculated pageRanges in Part 1
          else if (sNo >= 9) {
              part1PageNum = pageRanges?.get(sNo) || "";
          }
          
          return new TableRow({
              children: [
                  new TableCell({ children: [new Paragraph({ text: `${sNo}.`, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                  new TableCell({ children: [new Paragraph({ children: Array.isArray(item) ? item.map(i => (typeof i === 'string' ? smartTextRun(i) : i)) : [smartTextRun(item)], style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                  new TableCell({ children: [new Paragraph({ text: part1PageNum, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                  new TableCell({ children: [new Paragraph({ text: part2PageNum, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                  new TableCell({ children: [new Paragraph({ text: "", style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
              ]
          });
      })
  ];
  
  // ── Build index children (volume-aware) ──────────────────────────────────────
  const vo = volumeOptions;
  let indexChildren: (Paragraph | Table)[];

  if (!vo) {
    // Standard single-volume index
    indexChildren = [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: "INDEX", bold: true })] }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [1000, 5000, 1500, 1500, 1000], rows: indexTableRows }),
    ];
  } else {
    // Volume-splitting mode
    const pl = vo.particularsList;
    indexChildren = [];

    if (vo.volumeNum === 1) {
      // Master Index: 5-column table with merged "VOLUME X" section-header rows embedded
      indexChildren.push(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: 'MASTER INDEX', bold: true })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [1000, 5000, 1500, 1500, 1000],
          rows: buildMasterIndexTableRows(pl, vo.sNoToVolume, vo.splitSNos, vo.pageRanges, vo.totalVolumes),
        }),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: `INDEX – VOLUME ${toRomanNumeral(1)}`, bold: true })] }),
      );
    } else {
      indexChildren.push(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: `INDEX – VOLUME ${toRomanNumeral(vo.volumeNum)}`, bold: true })] }),
      );
    }

    // Per-volume standard 5-column index table
    const stdHeaderRows = [
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: 'S. No.', bold: true })], alignment: AlignmentType.CENTER, style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, rowSpan: 2, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: 'Particulars of the Document', bold: true })], alignment: AlignmentType.CENTER, style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, rowSpan: 2, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: 'Page Nos. of Part to which it belongs', bold: true })], alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, columnSpan: 2, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: 'Remarks', bold: true })], alignment: AlignmentType.CENTER, style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, rowSpan: 2, margins: defaultCellMargins }),
      ]}),
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: 'Part 1 (Contents of the Paper Book)', bold: true })], alignment: AlignmentType.CENTER, style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
        new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: 'Part 2 (Contents of the file alone)', bold: true })], alignment: AlignmentType.CENTER, style: 'Normal', spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
      ]}),
    ];
    indexChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [1000, 5000, 1500, 1500, 1000],
        rows: [...stdHeaderRows, ...buildVolumeIndexTableRows(pl, vo.volumeNum, vo.sNoToVolume, vo.splitSNos, vo.pageRanges, vo.volumePageRanges)],
      }),
    );
  }

  // ── Cover page paragraph before "PAPERBOOK" ──────────────────────────────────
  // Vol 1 (or single-volume): blank paragraph; Vol 2+: "VOLUME X" in bold caps
  const beforePaperbook = (!vo || vo.volumeNum === 1)
    ? new Paragraph('')
    : new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: `VOLUME ${toRomanNumeral(vo.volumeNum)}`, bold: true })] });

  // Each page of the front matter is its OWN section, so Word starts the next
  // one on a fresh page by itself.
  //
  // A manual page break cannot do this job here. The break has to live in a
  // paragraph, and that paragraph needs room on the cover page — on a full
  // cover page (a long cause title, several applications listed) there is none,
  // so the paragraph slid onto page 2 and its break then pushed the Record of
  // Proceedings to page 3, leaving page 2 empty. Moving the break onto the next
  // heading instead (pageBreakBefore) is no better: LibreOffice then carries the
  // framed "Advocate for the Petitioner(s)" line off the cover page along with
  // it. A section break belongs to no paragraph and so has neither problem.
  const sectionBase = {
    properties: { page: { margin: getSlpMargins() } },
    headers: { default: new Header({ children: [] }) },
    footers: { default: new Footer({ children: [] }) },
  };
  const nextPage = {
    properties: { type: SectionType.NEXT_PAGE, page: { margin: getSlpMargins() } },
    headers: { default: new Header({ children: [] }) },
    footers: { default: new Footer({ children: [] }) },
  };

  const doc = new Document({
    styles: getConstrainedStyles(),
    sections: [
      { // Cover Page
        ...sectionBase,
        children: [
          ...createSlpHeader(projectData.caseType, ioText, getSlpLayout().headerStyle, appealHeaderArg(projectData)),
          ...createPartiesHeader(petHeader, resHeader),
          // IA table only for Volume I (or single-volume mode)
          ...(!vo || vo.volumeNum === 1 ? createWithTable(iaList, projectData.wantsInterimRelief) : []),
          beforePaperbook,
          new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: 'PAPERBOOK', bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: '[For Index, please see inside]', italics: true })] }),
          // Pin the "Advocate for the Petitioner(s)" line to the very bottom of the
          // cover page via a paragraph frame (framePr vAnchor=margin, yAlign=bottom),
          // so it sits at the foot of page 1 regardless of how much is above it.
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
      // One record of proceedings per file, so Volume I carries it.
      ...(!vo || vo.volumeNum === 1
        ? [{ ...nextPage, children: createRecordOfProceedings() }]
        : []),
      { // Index
        ...nextPage,
        children: indexChildren,
      },
    ],
  });

  const b64string = await Packer.toBase64String(doc);
  return { success: true, docx: b64string, fileName: `CI.docx` };
}

export async function generateOrDocx(projectData: DraftoProject, includeSignature = false) {
  const ioText = ` ${calculateIoText(projectData)}`;
  const effectivePetitioners = (projectData.isCommonOrder && (projectData.commonOrderParties?.length ?? 0) > 0)
    ? projectData.commonOrderParties[0].petitioners
    : projectData.petitioners;
  const effectiveRespondents = (projectData.isCommonOrder && (projectData.commonOrderParties?.length ?? 0) > 0)
    ? projectData.commonOrderParties[0].respondents
    : projectData.respondents;
  const petHeader = getPartyHeader(effectivePetitioners);
  const resHeader = getPartyHeader(effectiveRespondents);
  const aorName = projectData.advocate.aorName || "[AoR Name]";
  
  const doc = new Document({
    styles: getConstrainedStyles(),
    sections: [
      { // Office Report
        properties: { 
          page: { margin: getSlpMargins() }
        },
        headers: {
            default: new Header({
                children: [
                    new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun({ text: "A", size: 40, bold: true })] }),
                ],
            }),
        },
        footers: {
          default: new Footer({ children: [] }),
        },
        children: [
          ...createSlpHeader(projectData.caseType, ioText, getSlpLayout().headerStyle, appealHeaderArg(projectData)),
          ...createPartiesHeader(petHeader, resHeader),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [ smartTextRun({ text: "OFFICE REPORT ON LIMITATION", bold: true }) ] }),
          new Paragraph({ children: [smartTextRun("1. The Special Leave Petition is within limitation.")] }),
          new Paragraph({ children: [smartTextRun("2. The Petition is barred by time and there is a delay of __ days in filing SLP against the judgment dated ____ and application for condonation of __ days' delay has been filed.")] }),
          new Paragraph({ children: [smartTextRun("3. There is delay of __ days in re-filing the petition and petition for condonation of __ days delay in re-filing has been/not been filed.")] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [ smartTextRun({ text: "BRANCH OFFICER", bold: true }) ] }),
          new Paragraph({}),
          ...createFiledByTable(projectData.advocate.filingDate, aorName, { includeSignature }),
        ],
      },
    ],
  });

  const b64string = await Packer.toBase64String(doc);
  return { success: true, docx: b64string, fileName: `OR.docx` };
}

// Legacy function for backward compatibility - just returns CI.docx now
export async function generateCiorDocx(projectData: DraftoProject, pageRanges?: Map<number, string>) {
  return await generateCiDocx(projectData, pageRanges);
}

export async function generateLpDocx(projectData: DraftoProject, includeSignature = false) {
    // The font family follows Output Text Formatting; size, spacing and margins
    // are the Listing Proforma's own (Settings → SLP/SC WP → Listing Proforma), which
    // default to the rigid 13pt single-spaced form.
    const isScWp = isScWpFamily(projectData.courtType);
    const lpf = isScWp ? getScWpLpFormatting() : getLpFormatting();
    const baseMargins = isScWp ? getScWpMargins() : getSlpMargins();
    const outputFont = isScWp ? getScWpOutputFormatting().font : getOutputFormatting().font;
    const lpMargins = { ...baseMargins, top: Math.round(lpf.marginTopInches * 1440), left: Math.round(lpf.marginLeftInches * 1440) };
    const lpStyles = {
        paragraphStyles: [
          {
            id: "Normal",
            name: "Normal",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              font: outputFont,
              size: Math.round(lpf.sizePt * 2), // half-points
            },
            paragraph: {
              spacing: {
                line: Math.round(lpf.lineSpacing * 240),
                after: Math.round(lpf.paraSpacingPt * 20),
                before: 0,
              },
              alignment: AlignmentType.JUSTIFIED,
            },
          },
        ],
    };

    const doc = new Document({
        styles: lpStyles,
        sections: [{
            properties: { 
                page: { margin: lpMargins },
                type: SectionType.NEXT_PAGE,
                pageNumberStart: 1,
            },
            headers: {
                default: new Header({ children: [] }),
            },
            footers: {
                default: new Footer({ children: [] }),
            },
            children: createListingProforma(projectData, includeSignature),
        }],
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `LP.docx` };
}

export async function generateSlodDocx(projectData: DraftoProject, annexurePageRanges?: Map<string, {start: number, end: number}>) {
    const allAnnexures: (Annexure & { lodId: string })[] = (projectData.listOfDates || []).flatMap(lod => (lod.annexures || []).map(a => ({ ...a, lodId: lod.id })));
    const nonAdAnnexures = allAnnexures.filter(annex => !annex.isAdditionalDocument);
    const annexureNumberingMap = new Map<string, number>();
    let pCounter = 1;
    nonAdAnnexures.forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));

    let allNumberingConfigs: any[] = [];
    const lodEventParagraphs = projectData.listOfDates.map(lod => {
        const { paragraphs, numbering } = parseHtml(lod.event);
        if (numbering.length > 0) {
            allNumberingConfigs.push(...numbering);
        }
        return { lodId: lod.id, paragraphs };
    });

    const synopsisResult = parseHtml(projectData.synopsis);
    if (synopsisResult.numbering.length > 0) {
        allNumberingConfigs.push(...synopsisResult.numbering);
    }
    
    const uniqueNumberingConfigs = allNumberingConfigs.filter(
      (v, i, a) => a.findIndex(t => t.reference === v.reference) === i
    );

    const createLodAnnexureText = (pNumber: number, annex: Annexure): (TextRun | string)[] => {
        const annexureLabel = `Annexure ${annexurePrefix(projectData.courtType)}-${pNumber}`;
        
        // Get page range if available
        const pageRange = annexurePageRanges?.get(annex.id);
        let pageRangeText: string;
        if (pageRange) {
            // Handle single page vs page range
            if (pageRange.start === pageRange.end) {
                pageRangeText = `(p.${pageRange.start})`;
            } else {
                pageRangeText = `(pp.${pageRange.start} to ${pageRange.end})`;
            }
        } else {
            pageRangeText = `(pp.___ to ___)`;
        }
        
        const parts: (TextRun | string)[] = [
            smartTextRun({ text: `${annexureLabel} ${pageRangeText}`, bold: true }),
            convertToSmartQuotes(` is a ${annex.copyType || '[copy type]'} of ${annex.title || '[description]'}`)
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


    const lodTableRows = projectData.listOfDates.flatMap((lod, lodIndex) => {
        // The Appeal states its annexures in the Facts section instead, so its
        // List of Dates carries the events alone — the same split the SC WP
        // tool uses. Everything else about the table is unchanged.
        const relatedAnnexures = isAppeal(projectData.courtType)
            ? []
            : nonAdAnnexures.filter(annex => annex.lodId === lod.id);

        // One paragraph per annexure so justified alignment works correctly —
        // a single paragraph with TextRun breaks would cause every non-final
        // "line" to be fully stretched by the justified renderer.
        const annexureParagraphs: Paragraph[] = relatedAnnexures
            .map(annex => {
                const pNumber = annexureNumberingMap.get(annex.id);
                if (!pNumber) return null;
                const textRuns = createLodAnnexureText(pNumber, annex).map(part =>
                    typeof part === 'string' ? smartTextRun(part) : part
                );
                return new Paragraph({ children: textRuns, style: "Normal" });
            })
            .filter((p): p is Paragraph => p !== null);

        const eventParagraphs = lodEventParagraphs.find(p => p.lodId === lod.id)?.paragraphs || [new Paragraph("")];

        return new TableRow({
            children: [
                new TableCell({
                    children: [new Paragraph({ text: lod.date, style: "Normal", alignment: AlignmentType.CENTER })],
                    width: { size: 20, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.TOP,
                    margins: defaultCellMargins
                }),
                new TableCell({
                    children: [
                        ...eventParagraphs,
                        ...annexureParagraphs
                    ],
                    width: { size: 80, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: defaultCellMargins
                }),
            ]
        });
    });

    const lodTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [2000, 8000],
        rows: [
            new TableRow({
                children: [
                  new TableCell({ 
                      children: [new Paragraph({ children: [smartTextRun({ text: "Date", bold: true })], alignment: AlignmentType.CENTER, style: "Normal" })], 
                      width: { size: 20, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      margins: defaultCellMargins
                  }),
                  new TableCell({ 
                      children: [new Paragraph({ children: [smartTextRun({ text: "Particulars", bold: true })], alignment: AlignmentType.CENTER, style: "Normal" })], 
                      width: { size: 80, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      margins: defaultCellMargins
                  }),
                ]
            }),
            ...lodTableRows,
        ]
    });

    const doc = new Document({
        numbering: {
            config: uniqueNumberingConfigs,
        },
        styles: getDefaultStyles(),
        sections: [{
            properties: { page: { margin: getSlpMargins() } },
            children: [
                new Paragraph({ children: [smartTextRun({ text: "SYNOPSIS", bold: true })], alignment: AlignmentType.CENTER, style: "Normal" }),
                ...synopsisResult.paragraphs,
                new Paragraph({ children: [new PageBreak()] }),
                new Paragraph({ children: [smartTextRun({ text: "LIST OF DATES", bold: true })], alignment: AlignmentType.CENTER, style: "Normal" }),
                lodTable,
            ],
        }],
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `SLoD.docx` };
}

export async function generateSlpDocx(
    projectData: DraftoProject,
    includeSignature = false,
    // Supplied only when the paper-book PDF is assembled. The Appeal's Facts
    // carry annexure page ranges, which stay blank in the DOCX and are filled
    // in here — the same contract the SC WP petition already follows.
    annexurePageRanges?: Map<string, { start: number; end: number }>,
) {
    // The certificate names the document four times over; an Appeal calls
    // itself an Appeal throughout.
    const certDocNoun = isAppeal(projectData.courtType) ? 'Appeal' : 'SLP';
    const isAppealDoc = isAppeal(projectData.courtType);
    // The Memo of Parties — the BETWEEN: table on the first page — calls the
    // petitioners Appellants in an appeal. Only this table changes: per the
    // spec the affidavits and vakalatnama keep saying Petitioner.
    const partyLabel = isAppealDoc ? 'Appellant' : 'Petitioner';
    const ioText = ` ${calculateIoText(projectData)}`;
    const slpLayout = getSlpLayout();

    // A lead-in heading inside the petition. Either "HEADING: text" on a single
    // line (the historical output), or the heading on its own line with the text
    // beneath it, aligned to the heading — the user's choice in Settings. The
    // paragraph number stays on the heading either way.
    const headingWithText = (heading: string, text: string, reference: string): Paragraph[] => {
        if (!slpLayout.headingBreak) {
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

    // For common order, use first group's parties for the header/AOR certificate
    const isCommonOrder = projectData.isCommonOrder && (projectData.commonOrderParties?.length ?? 0) > 0;
    const effectivePetitioners = isCommonOrder
        ? (projectData.commonOrderParties[0].petitioners ?? [])
        : projectData.petitioners;
    const effectiveRespondents = isCommonOrder
        ? (projectData.commonOrderParties[0].respondents ?? [])
        : projectData.respondents;

    const petHeader = getPartyHeader(effectivePetitioners);
    const resHeader = getPartyHeader(effectiveRespondents);

    const noBorders = {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    };

    // Helper: build the 4-column parties table from any petitioners + respondents arrays
    const buildPartiesTable = (
        petitioners: typeof projectData.petitioners,
        respondents: typeof projectData.respondents,
    ) => {
        const petRows = petitioners.map((p, i) => new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: `${i + 1}.`, alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [
                    new Paragraph({ children: [smartTextRun({ text: p.name, bold: true })] }),
                    new Paragraph(p.address),
                ] }),
                new TableCell({ children: [new Paragraph({ text: p.positionInEarlierCourt, alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ text: petitioners.length === 1 ? partyLabel : `${partyLabel} No. ${i + 1}`, alignment: AlignmentType.CENTER })] }),
            ]
        }));
        const resRows = respondents.map((r, i) => new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: `${i + 1}.`, alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [
                    new Paragraph({ children: [smartTextRun({ text: r.name, bold: true })] }),
                    new Paragraph(r.address),
                ] }),
                new TableCell({ children: [new Paragraph({ text: r.positionInEarlierCourt, alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ text: respondents.length === 1 ? "Respondent" : `Respondent No. ${i + 1}`, alignment: AlignmentType.CENTER })] }),
            ]
        }));
        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [10, 40, 25, 25].map(v => v * 100),
            borders: noBorders,
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            children: [new Paragraph({ children: [smartTextRun({ text: "S. No.", bold: true })], alignment: AlignmentType.CENTER })],
                            rowSpan: 2,
                            verticalAlign: VerticalAlign.CENTER
                        }),
                        new TableCell({
                            children: [new Paragraph({ children: [smartTextRun({ text: "Name and Address", bold: true })], alignment: AlignmentType.CENTER })],
                            rowSpan: 2,
                            verticalAlign: VerticalAlign.CENTER
                        }),
                        new TableCell({
                            children: [new Paragraph({ children: [smartTextRun({ text: "Position of Parties", bold: true })], alignment: AlignmentType.CENTER })],
                            columnSpan: 2,
                        }),
                    ]
                }),
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Before the High Court/ Earlier Court", bold: true })], alignment: AlignmentType.CENTER })] }),
                        new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Before this Hon'ble Court", bold: true })], alignment: AlignmentType.CENTER })] }),
                    ]
                }),
                ...petRows,
                new TableRow({
                    children: [
                        new TableCell({
                            children: [new Paragraph({ text: "Versus", alignment: AlignmentType.CENTER })],
                            columnSpan: 4,
                        }),
                    ]
                }),
                ...resRows
            ],
        });
    };

    // Build the BETWEEN blocks (either single or multiple for common order)
    const betweenBlocks: (Paragraph | Table)[] = [];
    if (isCommonOrder) {
        const currentYear = new Date().getFullYear();
        const mainOrder = projectData.impugnedOrders?.[0];
        const courtName = mainOrder?.court === 'Other' ? mainOrder?.customCourt : mainOrder?.court;
        const orderDate = mainOrder?.date ? format(new Date(mainOrder.date), "dd.MM.yyyy") : '[date]';

        // Title block: IN THE SUPREME COURT OF INDIA + jurisdiction (shown once).
        // Follows the same Settings choice as the single-order header.
        const centeredTitle = (text: string, extra: Record<string, unknown> = {}) =>
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { line: 240, after: 240 },
                children: [smartTextRun({ text, size: 28, ...extra })],
            });
        betweenBlocks.push(
            ...(slpLayout.headerStyle === 'sci'
                ? [
                    centeredTitle("IN THE SUPREME COURT OF INDIA"),
                    centeredTitle(isAppealDoc
                        ? `[S.C.R., ${appealOrderRule(projectData.caseType)}]`
                        : projectData.caseType === 'Criminal'
                            ? "[S.C.R., Order XXII Rule 2(1)]"
                            : "[S.C.R., Order XXI Rule 3(1)(a)]"),
                    centeredTitle(`${projectData.caseType.toUpperCase()} APPELLATE JURISDICTION`),
                    centeredTitle(isAppealDoc ? appealTitle(projectData.caseType).toUpperCase() : "SPECIAL LEAVE PETITION"),
                    ...(isAppealDoc ? [] : [centeredTitle("(Under Article 136 of the Constitution of India)")]),
                  ]
                : [
                    centeredTitle("IN THE SUPREME COURT OF INDIA"),
                    centeredTitle(`${projectData.caseType} Appellate Jurisdiction`, { italics: true }),
                  ]),
        );

        // One block per common order group
        for (const group of projectData.commonOrderParties) {
            const groupCaseNumber = group.caseNumber || '[Case No.]';
            const groupIoText = mainOrder
                ? ` the Impugned ${mainOrder.type} dated ${orderDate} passed by the ${courtName || '[Court]'} in ${groupCaseNumber}`
                : ioText;

            betweenBlocks.push(
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { line: 240, after: 240 },
                    children: [smartTextRun({ text: isAppealDoc ? `${appealTitle(projectData.caseType)} No. _______ of ${currentYear}` : `Special Leave Petition (${projectData.caseType}) No. _______ of ${currentYear}`, bold: true, size: 28 })],
                }),
                new Paragraph({
                    alignment: AlignmentType.JUSTIFIED,
                    indent: { left: 720, right: 720 },
                    spacing: { line: 240, after: 360 },
                    children: [smartTextRun({ text: isAppealDoc ? `[Under ${appealProvisionText(projectData)} against${groupIoText}]` : `Against${groupIoText}` })],
                }),
                new Paragraph({ text: "BETWEEN:", spacing: { after: 0, before: 0, line: 240 } }),
                buildPartiesTable(group.petitioners ?? [], group.respondents ?? []),
                new Paragraph(""),
            );
        }
    } else {
        betweenBlocks.push(
            ...createSlpHeader(projectData.caseType, ioText, getSlpLayout().headerStyle, appealHeaderArg(projectData)),
            new Paragraph({ text: "BETWEEN:", spacing: { after: 0, before: 0, line: 240 } }),
            buildPartiesTable(effectivePetitioners, effectiveRespondents),
            new Paragraph(""),
        );
    }

    const ioActionText = calculateIoActionText(projectData);
    const allAnnexures: Annexure[] = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
    const nonAdAnnexures = allAnnexures.filter(annex => !annex.isAdditionalDocument);
    const lastNonAdPNumber = nonAdAnnexures.length;

    // Para 1A is an averment about intra-court appeals, and it belongs in the
    // petition only when the advocate has actually made that averment by ticking
    // one of the two options. Left untouched, the petition runs 1 → 2.
    let para1A: Paragraph | null = null;
    const { intraCourtAppealStatus, intraCourtAppealReason } = projectData;
    const para1AIndent = { indent: { left: 720, hanging: 360 } };
    if (intraCourtAppealStatus === 'no_appeal_lies') {
        para1A = new Paragraph({
            text: "1A. The Impugned Order(s) is/are passed by a Ld. Single Judge of the High Court, but no intra-court appeal lies.",
            ...para1AIndent,
        });
    } else if (intraCourtAppealStatus === 'appeal_lies_but') {
        para1A = new Paragraph({
            text: `1A. The Impugned Order(s) is/are passed by a Ld. Single Judge of the High Court and an intra-court appeal lies. However, ${intraCourtAppealReason || '[reason not provided]'}`,
            ...para1AIndent,
        });
    }

    // Para 1B: optional free-text content. Added directly below 1A only when the
    // user has entered non-whitespace content.
    const para1BText = (projectData.para1BContent || '').trim();
    const para1B = para1BText
        ? new Paragraph({ text: `1B. ${para1BText}`, ...para1AIndent })
        : null;

    let allNumberingConfigs: any[] = [];
    
    const getAlphabeticalLabel = (i: number): string => {
        const charCodeA = 'A'.charCodeAt(0);
        const numAlphabets = 26;
        let label = '';
        let num = i;
    
        do {
            label = String.fromCharCode(charCodeA + (num % numAlphabets)) + label;
            num = Math.floor(num / numAlphabets) - 1;
        } while (num >= 0);
    
        return label;
    };

    const questionsOfLawRows = projectData.questionsOfLaw
        .filter(qol => qol.particulars.trim() !== '')
        .map((qol, index) => {
            const { paragraphs, numbering } = parseHtml(qol.particulars);
            if (numbering.length > 0) {
                allNumberingConfigs.push(...numbering);
            }
            return new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                        borders: noBorders,
                        width: { size: 10, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        children: paragraphs,
                        borders: noBorders,
                        width: { size: 90, type: WidthType.PERCENTAGE },
                    }),
                ],
            });
        });

    const questionsOfLawTable = questionsOfLawRows.length > 0 ? new Table({
        width: { size: 91.66, type: WidthType.PERCENTAGE },
        columnWidths: [1000, 9000],
        rows: questionsOfLawRows,
        borders: noBorders,
        indent: {
            size: 720, // 0.5 inch
            type: WidthType.DXA,
        },
    }) : null;

    // Grounds, with any headings the user has placed between them. A heading is
    // a full-width row of the SAME table: the table is never split, so nothing
    // downstream shifts and the petition's paragraph numbering is untouched.
    // It sits at the table's left edge, one notch in from the ground text.
    // Lettering counts grounds only, so A, B, C run on across a heading.
    const slpGroundsHeadingStyle = getGroundsHeadingStyle(projectData);
    const slpGroundsEntries = groundsSequence(projectData.grounds, slpGroundsHeadingStyle);
    const slpHeadingHang = groundsHeadingHang(slpGroundsEntries);
    const groundsRows = slpGroundsEntries.map(entry => {
        if (entry.kind === 'heading') {
            return new TableRow({
                children: [
                    new TableCell({
                        columnSpan: 2,
                        borders: noBorders,
                        // No spacing of its own: "Normal" carries the line and
                        // paragraph spacing the user has set for the output, so
                        // the heading sits in the same rhythm as the grounds.
                        // The hanging indent keeps the number out at the left,
                        // level with the ground letters, and holds a heading
                        // that runs to several lines in one clean block.
                        children: [new Paragraph({
                            style: "Normal",
                            indent: { left: slpHeadingHang, hanging: slpHeadingHang },
                            children: groundsHeadingRuns(entry.label, entry.text, slpGroundsHeadingStyle),
                        })],
                    }),
                ],
            });
        }
        const { paragraphs, numbering } = parseHtml(entry.row.particulars || '');
        if (numbering.length > 0) {
            allNumberingConfigs.push(...numbering);
        }
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
        indent: {
            size: 720, // 0.5 inch
            type: WidthType.DXA,
        },
    });
    
    const interimGroundsRows = projectData.interimReliefGrounds
        .filter(ig => ig.particulars.trim() !== '')
        .map((ig, index) => {
            const { paragraphs, numbering } = parseHtml(ig.particulars);
            if (numbering.length > 0) {
                allNumberingConfigs.push(...numbering);
            }
            return new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
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

    const interimGroundsTable = interimGroundsRows.length > 0 ? new Table({
        width: { size: 91.66, type: WidthType.PERCENTAGE },
        columnWidths: [800, 9200],
        rows: interimGroundsRows,
        borders: noBorders,
        indent: {
            size: 720, // 0.5 inch
            type: WidthType.DXA,
        },
    }) : null;

    const interimPrayersRows = projectData.interimReliefPrayers
        .filter(ip => ip.particulars.trim() !== '')
        .map((ip, index) => {
            const { paragraphs, numbering } = parseHtml(ip.particulars);
            if (numbering.length > 0) {
                allNumberingConfigs.push(...numbering);
            }
            return new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ text: `${getAlphabeticalLabel(index).toLowerCase()}.`, style: "Normal" })],
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

    const interimPrayersTable = interimPrayersRows.length > 0 ? new Table({
        width: { size: 91.66, type: WidthType.PERCENTAGE },
        columnWidths: [800, 9200],
        rows: interimPrayersRows,
        borders: noBorders,
        indent: {
            size: 720, // 0.5 inch
            type: WidthType.DXA,
        },
    }) : null;

    const mainPrayersTable = new Table({
        width: { size: 91.66, type: WidthType.PERCENTAGE },
        columnWidths: [800, 9200],
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ text: 'a.', style: "Normal" })],
                        borders: noBorders,
                        width: { size: 8, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: isAppealDoc ? `Allow the present Appeal and set aside${ioText}; and` : `Grant special leave to appeal against${ioText}; and`, style: "Normal" })],
                        borders: noBorders,
                        width: { size: 92, type: WidthType.PERCENTAGE },
                    }),
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ text: 'b.', style: "Normal" })],
                        borders: noBorders,
                    }),
                    new TableCell({
                        children: [new Paragraph({ children: [smartTextRun("Pass any such other or further order(s) as this Hon'ble Court may deem fit in the facts and circumstances of this case.")], style: "Normal" })],
                        borders: noBorders,
                    }),
                ]
            })
        ],
        borders: noBorders,
        indent: {
            size: 720, // 0.5 inch
            type: WidthType.DXA,
        },
    });
    
    let interimGroundsSection: (Paragraph | Table)[] = [];
    let interimPrayersSection: (Paragraph | Table)[] = [];

    if (projectData.wantsInterimRelief) {
        interimGroundsSection = [
            ...headingWithText("GROUNDS FOR INTERIM RELIEF:", "Interim relief is sought on the following grounds:", "slp-intro-list-6"),
            ...(interimGroundsTable ? [interimGroundsTable] : []),
        ];
        interimPrayersSection = [
            ...headingWithText("PRAYERS FOR INTERIM RELIEF:", "In view of the foregoing submissions, the Petitioner most respectfully prays that pending the final outcome of the present SLP, this Hon'ble Court may be pleased to:", "slp-intro-list-8"),
            ...(interimPrayersTable ? [interimPrayersTable] : []),
        ];
    } else {
        interimGroundsSection = [
            ...headingWithText("GROUNDS FOR INTERIM RELIEF:", "NIL.", "slp-intro-list-6"),
        ];
        interimPrayersSection = [
            ...headingWithText("PRAYERS FOR INTERIM RELIEF:", "NIL.", "slp-intro-list-8"),
        ];
    }

    // ── Appeal: FACTS (Para 3) ──────────────────────────────────────────────
    // Reuses the writ tools' facts engine unchanged, so the Appeal's Facts read
    // exactly like the SC WP's: transposed from the List of Dates, with annexure
    // sentences whose page ranges are blank in the DOCX and filled when the
    // paper-book is assembled. The Appeal's annexures are the A-series, so the
    // prefix is "A" where the writ tools pass "P".
    let appealFactsParagraphs: (Paragraph | Table)[] = [];
    if (isAppealDoc) {
        const rawAppealFacts = (resolveFactsHtml(projectData, "A") || "").trim()
            || transposeLodToFacts(projectData, "A");
        const appealFactsHtml = injectAnnexurePageRangesIntoFacts(rawAppealFacts, projectData, annexurePageRanges);
        const appealFactsResult = parseHtml(appealFactsHtml, undefined, undefined, SC_WP_FACTS_LIST_GEOM);
        applyScWpFactsCascade(appealFactsResult.numbering);
        allNumberingConfigs.push(...appealFactsResult.numbering);
        const hasAppealFacts = rawAppealFacts.replace(/<[^>]+>/g, "").trim().length > 0;
        appealFactsParagraphs = hasAppealFacts && appealFactsResult.paragraphs.length > 0
            ? appealFactsResult.paragraphs
            : [new Paragraph({ indent: { left: 720 }, children: [smartTextRun("[Facts \u2014 generated from the List of Dates.]")] })];
    }

    const makeSlpListConfig = (reference: string, start = 1) => ({
        reference,
        levels: [{ level: 0, format: "decimal" as const, text: "%1.", alignment: AlignmentType.START, start, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
    });

    const uniqueNumberingConfigs = [
        ...allNumberingConfigs.filter((v, i, a) => a.findIndex(t => t.reference === v.reference) === i),
        makeSlpListConfig("slp-intro-list"),
        makeSlpListConfig("slp-intro-list-3", 3),
        makeSlpListConfig("slp-intro-list-6", 6),
        makeSlpListConfig("slp-intro-list-7", 7),
        makeSlpListConfig("slp-intro-list-8", 8),
        // The Appeal's own resume-points: 3 Facts, 4 Grounds, 5 Declaration,
        // 6 Prayers. Word restarts a numbered list after a table, so every
        // heading that follows one has to say where to pick up again.
        makeSlpListConfig("appeal-list-3", 3),
        makeSlpListConfig("appeal-list-4", 4),
        makeSlpListConfig("appeal-list-5", 5),
        makeSlpListConfig("appeal-list-6", 6),
    ];

    // ── The petition body ───────────────────────────────────────────────────
    // SLP:    1 intro | 2 questions of law | 3 & 4 the Rule declarations |
    //         5 grounds | 6 interim grounds | 7 prayers | 8 interim prayers.
    // Appeal: 1 intro | 2 questions of law | 3 facts | 4 grounds |
    //         5 the single "no other appeal" declaration | 6 prayers,
    //         with no interim relief at all.
    const petitionBodyBlocks: (Paragraph | Table)[] = isAppealDoc
        ? [
            new Paragraph({
                text: convertToSmartQuotes(`The present appeal is being filed under ${appealProvisionText(projectData)} against ${ioActionText}${ioActionText && ioActionText.match(/[.!?]$/) ? '' : '.'}`),
                numbering: { reference: "slp-intro-list", level: 0 },
            }),
            ...(para1A ? [para1A] : []),
            ...(para1B ? [para1B] : []),
            ...headingWithText("QUESTIONS OF LAW:", "The following questions of law arise for this Hon'ble Court's consideration in the present Appeal:", "slp-intro-list"),
            ...(questionsOfLawTable ? [questionsOfLawTable] : []),
            ...headingWithText("FACTS:", "The facts giving rise to the present Appeal are as under:", "appeal-list-3"),
            ...appealFactsParagraphs,
            ...headingWithText("GROUNDS:", "This Appeal is preferred on the following grounds taken without prejudice against each other:", "appeal-list-4"),
            groundsTable,
            new Paragraph({
                text: convertToSmartQuotes(`The Appellant has not filed any other appeal or petition against${ioText}.`),
                numbering: { reference: "appeal-list-5", level: 0 },
            }),
            ...headingWithText("MAIN PRAYERS:", "In view of the foregoing submissions, the Appellant most respectfully prays that this Hon'ble Court may be pleased to:", "appeal-list-6"),
            mainPrayersTable,
        ]
        : [
            new Paragraph({
                text: convertToSmartQuotes(`By this Special Leave Petition, leave is sought under Article 136 of the Constitution of India to appeal against ${ioActionText}${ioActionText && ioActionText.match(/[.!?]$/) ? '' : '.'}`),
                numbering: { reference: "slp-intro-list", level: 0 },
            }),
            ...(para1A ? [para1A] : []),
            ...(para1B ? [para1B] : []),
            ...headingWithText("QUESTIONS OF LAW:", "The following questions of law arise for this Hon'ble Court's consideration in the present SLP:", "slp-intro-list"),
            ...(questionsOfLawTable ? [questionsOfLawTable] : []),
             // Criminal SLPs are governed by Order XXII (Rules 2(2) & 4);
            // Civil by Order XXI (Rules 3(2) & 5).
            ...headingWithText(
                `DECLARATION IN TERMS OF RULE ${projectData.caseType === 'Criminal' ? '2(2)' : '3(2)'}:`,
                `No other petition seeking Special Leave to Appeal against${ioText} has been filed by the Petitioner(s).`,
                "slp-intro-list-3",
            ),
            ...headingWithText(
                `DECLARATION IN TERMS OF RULE ${projectData.caseType === 'Criminal' ? '4' : '5'}:`,
                `${annexureRangeText(lastNonAdPNumber)} produced along with the Special Leave Petition are true copies of the pleadings/documents which formed part of the Courts below.`,
                "slp-intro-list-3",
            ),
            ...headingWithText("GROUNDS:", "This Special Leave Petition is preferred on the following grounds taken without prejudice against each other:", "slp-intro-list-3"),
            groundsTable,
            ...interimGroundsSection,
            ...headingWithText("MAIN PRAYERS:", "In view of the foregoing submissions, the Petitioner most respectfully prays that this Hon'ble Court may be pleased to:", "slp-intro-list-7"),
            mainPrayersTable,
            ...interimPrayersSection,
        ];

    const { advocate } = projectData;
    let advocateDetailsTable: Table | null = null;
    const paraSpacing = { after: 0, line: 240 };
    if (advocate.wantsDrawnBy || advocate.wantsSettledBy) {
        advocateDetailsTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [5000, 5000],
            borders: noBorders,
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            children: [
                                ...(advocate.wantsSettledBy ? [new Paragraph({ text: `Settled on: ${advocate.settledByDate ? format(advocate.settledByDate, 'dd.MM.yyyy') : ''}`, spacing: paraSpacing })] : []),
                                ...(advocate.wantsSettledBy ? [new Paragraph({ text: `Settled by: ${advocate.settledByName}`, spacing: paraSpacing })] : [])
                            ],
                            borders: noBorders,
                        }),
                        new TableCell({
                            children: [
                                ...(advocate.wantsDrawnBy ? [new Paragraph({ text: `Drawn on: ${advocate.drawnByDate ? format(advocate.drawnByDate, 'dd.MM.yyyy') : ''}`, alignment: AlignmentType.RIGHT, spacing: paraSpacing })] : []),
                                ...(advocate.wantsDrawnBy ? [new Paragraph({ text: `Drawn by: ${advocate.drawnByName}`, alignment: AlignmentType.RIGHT, spacing: paraSpacing })] : [])
                            ],
                             borders: noBorders,
                        }),
                    ],
                }),
            ],
        });
    }

    const sections: ISectionOptions[] = [{
        properties: { page: { margin: getSlpMargins() } },
        children: [
            ...betweenBlocks,
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
                ]
            }),
            new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [ smartTextRun({ text: "It is most respectfully submitted that:", bold: true }) ]
            }),
            ...petitionBodyBlocks,
            new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [smartTextRun({ text: `And for this act of kindness, the humble ${partyLabel}(s) shall ever pray.`, italics: true })]
            }),
            new Paragraph(""),
            ...(advocateDetailsTable ? [advocateDetailsTable, new Paragraph("")] : []),
            ...createFiledByTable(projectData.advocate.filingDate, projectData.advocate.aorName || "[AoR Name]", { includeSignature }),
            new Paragraph({ children: [new PageBreak()] }),
            ...createSlpHeader(projectData.caseType, ioText, getSlpLayout().headerStyle, appealHeaderArg(projectData)),
            ...createPartiesHeader(petHeader, resHeader),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 240 },
                children: [smartTextRun({ text: "CERTIFICATE", bold: true })],
            }),
            new Paragraph({
                children: [smartTextRun(`Certified that the ${certDocNoun} is confined only to the pleadings before the Court whose judgment is challenged and the other documents relied upon in those proceedings. No additional facts, documents or grounds have been taken or relied upon in the ${certDocNoun} except those facts/documents for which an application for permission to file the same has been filed. The documents/annexures attached to the ${certDocNoun} are necessary to answer the questions of law raised and/or to make out the grounds urged in the ${certDocNoun} for consideration of this Hon'ble Court. This certificate is given on the basis of instructions given by the ${partyLabel} whose affidavit is filed in support of the ${certDocNoun}.`)],
                spacing: { line: 240 },
                alignment: AlignmentType.JUSTIFIED,
            }),
            new Paragraph(""), // Spacer
            ...createFiledByTable(projectData.advocate.filingDate, projectData.advocate.aorName || "[AoR Name]", { includeSignature }),
        ]
    }];

    const doc = new Document({
        numbering: {
            config: uniqueNumberingConfigs,
        },
        styles: getDefaultStyles(),
        sections: sections,
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `SLP.docx` };
}

// Builds the typed-out Appendix documents. With an itemId it produces that one
// document (this is what the paper-book merges, one component per Appendix);
// without one it produces every typed Appendix in a single file, each starting
// on a fresh page, which is what the stand-alone DOCX export hands over.
// ── Refiling declaration ─────────────────────────────────────────────────────
// Filed when a paper-book goes back to the registry after defects have been
// cured. It is the first page of the paper-book, ahead of the cover page, and
// is not part of the Index — the Index's numbered rows follow the Supreme
// Court's own form and take no additions.
//
// Headings and body use the same styles as the Synopsis and List of Dates, so
// it follows the user's output text formatting like every other drafted page.
export async function generateRefilingDocx(projectData: DraftoProject, includeSignature = false) {
    const ioText = ` ${calculateIoText(projectData)}`;
    const petHeader = getPartyHeader(projectData.petitioners);
    const resHeader = getPartyHeader(projectData.respondents);

    const doc = new Document({
        styles: getDefaultStyles(),
        sections: [{
            properties: { page: { margin: getSlpMargins() } },
            children: [
                ...createSlpHeader(projectData.caseType, ioText, getSlpLayout().headerStyle, appealHeaderArg(projectData)),
                ...createPartiesHeader(petHeader, resHeader),
                new Paragraph({ children: [smartTextRun({ text: "DECLARATION", bold: true })], alignment: AlignmentType.CENTER, style: "Normal" }),
                new Paragraph({
                    children: [smartTextRun("It is certified and declared that all defects marked in the captioned matter stand cured. Accordingly, the matter may kindly be processed for listing.")],
                    style: "Normal",
                }),
                new Paragraph(""),
                ...createFiledByTable(projectData.advocate.filingDate, projectData.advocate.aorName || "[AoR Name]", { includeSignature }),
            ],
        }],
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `Refiling Declaration.docx` };
}

export async function generateAppendixDocx(projectData: DraftoProject, itemId?: string) {
    const activeItems = getActiveAppendixItems(projectData);
    const total = activeItems.length;

    // Index of each typed-out Appendix within the full active list, so its
    // heading carries the same letter as its Index row.
    const wanted = activeItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.useManual && (item.manualEntry || '').trim())
        .filter(({ item }) => (itemId ? item.id === itemId : true));

    if (wanted.length === 0) {
        return { success: false, message: "Appendix not wanted or not provided." };
    }

    const allNumberingConfigs: any[] = [];
    const children: (Paragraph | Table)[] = [];

    wanted.forEach(({ item, index }, position) => {
        const parsed = parseHtml(item.manualEntry);
        allNumberingConfigs.push(...parsed.numbering);
        if (position > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
        children.push(new Paragraph({
            children: [smartTextRun({ text: appendixIndexText(item, index, total).toUpperCase(), bold: true })],
            alignment: AlignmentType.CENTER
        }));
        children.push(new Paragraph(""));
        children.push(...parsed.paragraphs);
    });

    const uniqueNumberingConfigs = allNumberingConfigs.filter(
        (v, i, a) => a.findIndex(t => t.reference === v.reference) === i
    );

    const doc = new Document({
        numbering: {
            config: uniqueNumberingConfigs,
        },
        styles: getDefaultStyles(),
        sections: [{
            properties: { page: { margin: getSlpMargins() } },
            children,
        }]
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `Appendix.docx` };
}

const getShortIaTitle = (iaIdentifier: string, iaTitle: string): string => {
    switch (iaIdentifier) {
        case 'condonationOfDelay': return 'IA-CoD';
        case 'exemptionCertifiedCopy': return 'IA-CC';
        case 'exemptionOfficialTranslation': return 'IA-OT';
        case 'exemptionFromSurrendering': return 'IA-surr';
        case 'suspensionOfSentence': return 'IA-susp';
        case 'additionalDocuments': return 'IA-AD';
        default:
            // Sanitize and shorten custom title
            const sanitized = iaTitle.replace(/[^a-zA-Z0-9]/g, '_').replace(/Application_for_/, '');
            return `IA-${sanitized.slice(0, 20)}`;
    }
}

export async function generateIaDocx(
    projectData: DraftoProject,
    iaIdentifier: string,
    customText?: string,
    iaAnnexurePageRanges?: Map<string, {start: number, end: number}>,
    includeSignature = false,
) {
    const ioText = ` ${calculateIoText(projectData)}`;
    const petHeader = getPartyHeader(projectData.petitioners);
    const resHeader = getPartyHeader(projectData.respondents);
    const { advocate } = projectData;

    const noBorders = {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    };

    let allNumberingConfigs: any[] = [];
    const getAlphabeticalLabel = (i: number): string => {
        const charCodeA = 'A'.charCodeAt(0);
        const numAlphabets = 26;
        let label = '';
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

    // Every top-level IA paragraph (opening, lead-in, any user-added grounds,
    // the closing paragraphs and the prayer lead-in) belongs to one continuous
    // count. It cannot be one Word list, though: Word restarts a numbered list
    // wherever a table interrupts it, which is why the paragraphs after a
    // grounds table came out as 1., 2., 3. again. The body is therefore
    // numbered in segments — each table closes the current segment, and the
    // paragraphs after it open a fresh list that starts explicitly at the
    // number they should carry. Because every segment states its own start,
    // the result is the same whether or not Word restarts. (The SLP solves the
    // same problem with hard-coded starts; its structure is fixed, an IA's is
    // not.)
    const listSegments: { reference: string; start: number }[] = [];
    let paraNo = 0;                 // the last number handed out
    let currentListRef = "ia-intro-list";
    const newListSegment = () => {
        currentListRef = listSegments.length === 0 ? "ia-intro-list" : `ia-intro-list-${listSegments.length + 1}`;
        listSegments.push({ reference: currentListRef, start: paraNo + 1 });
    };
    // The numbering property for the next body paragraph. Call it in document
    // order — the count is what ends up printed.
    const nextNumbering = () => {
        paraNo++;
        return { reference: currentListRef, level: 0 };
    };
    // Body paragraphs built elsewhere (parseHtml, for user-typed grounds that
    // sit in the numbered flow rather than in a table) consume numbers too.
    const countNumbered = (paras: unknown[]) => {
        for (const para of paras) {
            const refs = (para as any)?.properties?.numberingReferences;
            if (!Array.isArray(refs)) {
                if (para instanceof Paragraph) paraNo++;
            } else if (refs.some((r: any) => r?.reference === currentListRef)) {
                paraNo++;
            }
        }
    };
    newListSegment();

    let prayerParagraphs: Paragraph[] = [];
    let iaTitle = "";
    let customTextParagraphs: (Paragraph | Table)[] = [];

    // Helper function to create IA annexure text with page range and period-appending
    const createIaAnnexureText = (aNumber: number, annex: { id?: string; title: string; date?: string }): (TextRun | string)[] => {
        const annexureLabel = `Annexure A-${aNumber}`;
        const pageRange = annex.id ? iaAnnexurePageRanges?.get(annex.id) : undefined;
        let pageRangeText: string;
        if (pageRange) {
            pageRangeText = pageRange.start === pageRange.end
                ? `(p.${pageRange.start})`
                : `(pp.${pageRange.start} to ${pageRange.end})`;
        } else {
            pageRangeText = `(pp.___ to ___)`;
        }
        const parts: (TextRun | string)[] = [
            smartTextRun({ text: `${annexureLabel} ${pageRangeText}`, bold: true }),
            convertToSmartQuotes(` is a ${annex.title}`)
        ];
        if (annex.date) parts.push(convertToSmartQuotes(` dated ${annex.date}`));
        
        // Auto-append period if user forgot (trim trailing whitespace first)
        const lastPart = parts[parts.length - 1];
        if (typeof lastPart === 'string') {
            const trimmed = lastPart.trimEnd();
            parts[parts.length - 1] = trimmed.match(/[.!?]$/) ? trimmed : trimmed + '.';
        }
        
        return parts;
    };

    // Every application names the document it accompanies. An Appeal calls
    // itself an Appeal throughout; an SLP keeps the wording it has always had.
    const iaDocShort = isAppeal(projectData.courtType) ? 'Appeal' : 'SLP';
    const iaDocLong = isAppeal(projectData.courtType) ? 'Appeal' : 'Special Leave Petition';

    // Paragraph 1 of every IA. Built here, ahead of the IA-specific paragraphs
    // below, because the numbering has to be handed out in document order.
    const openingParagraph = new Paragraph({
        text: convertToSmartQuotes(`The accompanying ${iaDocLong} has been filed against${ioText}. The contents of the ${iaDocLong} may kindly be treated as part and parcel of this application and are not being repeated herein for the sake of brevity.`),
        numbering: nextNumbering(),
    });

    const standardIa = standardIaList.find(ia => ia.id === iaIdentifier);
    if(standardIa) {
        iaTitle = standardIa.title;
        let customPrayer = "";
        switch(iaIdentifier) {
            case "condonationOfDelay":
                const delayDays = projectData.standardIas.condonationOfDelay.delayDays > 0 ? projectData.standardIas.condonationOfDelay.delayDays : "__";
                iaTitle = `Application for condonation of delay of ${delayDays} days in filing the ${iaDocShort}`;
                customPrayer = `Condone the delay of ${delayDays} days in filing the accompanying ${iaDocShort} against${ioText}; and`;
                prayerParagraphs.push(new Paragraph({ children: [smartTextRun(customPrayer)], style: "Normal" }));

                const grounds = projectData.standardIas.condonationOfDelay.grounds;
                
                // Build annexure numbering map for grounds
                const groundsAnnexureMap = new Map<string, number>();
                let aCounter = 1;
                grounds.forEach(g => {
                    if (g.annexures) {
                        g.annexures.forEach(annex => {
                            groundsAnnexureMap.set(annex.id, aCounter++);
                        });
                    }
                });
                
                const groundsRows = grounds
                    .filter(g => g.particulars.trim() !== '')
                    .map((g, index) => {
                        const { paragraphs, numbering } = parseHtml(g.particulars);
                        if (numbering.length > 0) allNumberingConfigs.push(...numbering);
                        
                        // Add annexure sentences for this ground
                        if (g.annexures && g.annexures.length > 0) {
                            g.annexures.forEach(annex => {
                                const aNumber = groundsAnnexureMap.get(annex.id);
                                if (aNumber) {
                                    const annexureTextParts = createIaAnnexureText(aNumber, annex);
                                    const textRuns = annexureTextParts.map(part => 
                                        typeof part === 'string' ? smartTextRun(part) : part
                                    );
                                    paragraphs.push(new Paragraph({ children: textRuns, style: "Normal" }));
                                }
                            });
                        }
                        
                        return new TableRow({
                            children: [
                                new TableCell({
                                    children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                                    borders: noBorders, width: { size: 10, type: WidthType.PERCENTAGE },
                                }),
                                new TableCell({ children: paragraphs, borders: noBorders, width: { size: 90, type: WidthType.PERCENTAGE } }),
                            ],
                        });
                    });

                const groundsTable = new Table({
                    width: { size: 91.66, type: WidthType.PERCENTAGE },
                    columnWidths: [800, 9200],
                    rows: groundsRows, borders: noBorders,
                    indent: { size: 720, type: WidthType.DXA },
                });

                customTextParagraphs = [
                    new Paragraph({
                        text: `This application, seeking condonation of delay of ${delayDays} days in filing the accompanying ${iaDocShort}, is preferred on the following grounds:`,
                        numbering: nextNumbering(),
                    }),
                    groundsTable
                ];
                newListSegment(); // the grounds table interrupts the numbering
                break;
            case "exemptionCertifiedCopy":
                iaTitle = standardIaList.find(ia => ia.id === iaIdentifier)?.title || iaTitle;
                customPrayer = `Grant exemption to the Petitioner(s) from filing certified copy of${ioText}; and`;
                prayerParagraphs.push(new Paragraph({ children: [smartTextRun(customPrayer)], style: "Normal" }));
                
                let certParaText = `This application seeks exemption from filing certified copy of${ioText}. `;
                if (projectData.standardIas.exemptionCertifiedCopy.hasApplied === 'yes') {
                    const receiptDate = projectData.standardIas.exemptionCertifiedCopy.receiptDate;
                    const formattedDate = receiptDate ? format(new Date(receiptDate), "dd.MM.yyyy") : '[date]';
                    certParaText += `It is most respectfully submitted that the Petitioner(s) have applied for a certified copy of${ioText}. Annexure-A is a true copy of the Receipt dated ${formattedDate} reflecting the application for certified copy made by/on behalf of the Petitioner(s). `;
                } else {
                    certParaText += `It is most respectfully submitted that the Petitioner(s) have not been able to apply for a certified copy of${ioText}. ${projectData.standardIas.exemptionCertifiedCopy.reasonForNotApplying || ''} `;
                }
                certParaText += "In the circumstances, it is prayed that an exemption from filing the certified copy may be granted. The Petitioner(s) undertake(s) to produce the certified copy as and when made available to the Petitioner(s) and/or directed by this Hon'ble Court.";
                
                customTextParagraphs = [new Paragraph({ children: [smartTextRun(certParaText)], numbering: nextNumbering() })];
                break;
            case "additionalDocuments":
                 iaTitle = standardIaList.find(ia => ia.id === iaIdentifier)?.title || iaTitle;
                 const allAnnexures: Annexure[] = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
                 const adAnnexures = allAnnexures.filter(annex => annex.isAdditionalDocument);
                 const annexureNumberingMap = new Map<string, number>();
                 let pCounter = 1;
                 allAnnexures.filter(annex => !annex.isAdditionalDocument).forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));
                 adAnnexures.forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));

                 const adNumbers = adAnnexures.map(a => annexureNumberingMap.get(a.id)).filter((n): n is number => n !== undefined).sort((a,b) => a-b);
                 
                 let adRange = "";
                 if (adNumbers.length > 0) {
                     if (adNumbers.length === 1) {
                         adRange = `Annexure ${annexurePrefix(projectData.courtType)}-${adNumbers[0]}`;
                     } else {
                         const first = adNumbers[0];
                         const last = adNumbers[adNumbers.length - 1];
                         adRange = `Annexures ${annexurePrefix(projectData.courtType)}-${first} to ${annexurePrefix(projectData.courtType)}-${last}`;
                     }
                 }
                 customPrayer = `Permit the Petitioner(s) to place on record the additional document(s) marked as ${adRange}; and`;
                prayerParagraphs.push(new Paragraph({ children: [smartTextRun(customPrayer)], style: "Normal" }));
                
                const createAdAnnexureText = (pNumber: number, annex: Annexure): (TextRun | string)[] => {
                    const annexureLabel = `Annexure ${annexurePrefix(projectData.courtType)}-${pNumber}`;
                    const parts: (TextRun | string)[] = [
                        smartTextRun({ text: `${annexureLabel} (pp.___ to ___)`, bold: true }),
                        convertToSmartQuotes(` is a ${annex.copyType || '[description]'} of`)
                    ];
                    if (annex.title) parts.push(convertToSmartQuotes(` ${annex.title}`));
                    if (annex.date) parts.push(convertToSmartQuotes(` dated ${annex.date}`));
                    if (annex.customText) parts.push(convertToSmartQuotes(` ${annex.customText}`));
                    
                    // Auto-append period if user forgot (trim trailing whitespace first)
                    const lastPart = parts[parts.length - 1];
                    if (typeof lastPart === 'string') {
                        const trimmed = lastPart.trimEnd();
                        parts[parts.length - 1] = trimmed.match(/[.!?]$/) ? trimmed : trimmed + '.';
                    }
                    
                    return parts;
                };

                const adAnnexureRows = adAnnexures.map((annex, index) => {
                    const pNumber = annexureNumberingMap.get(annex.id);
                    if (!pNumber) return null;
                    
                    const partsArray = createAdAnnexureText(pNumber, annex);
                    const textRuns = partsArray.map(part => 
                        typeof part === 'string' ? smartTextRun(part) : part
                    );

                    return new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                                borders: noBorders, width: { size: 10, type: WidthType.PERCENTAGE },
                            }),
                            new TableCell({
                                children: [new Paragraph({ children: textRuns, style: "Normal" })],
                                borders: noBorders, width: { size: 90, type: WidthType.PERCENTAGE },
                            }),
                        ],
                    });
                }).filter((row): row is TableRow => row !== null);

                const adAnnexuresTable = new Table({
                    width: { size: 91.66, type: WidthType.PERCENTAGE },
                    columnWidths: [1000, 9000],
                    rows: adAnnexureRows, borders: noBorders,
                    indent: { size: 720, type: WidthType.DXA },
                });

                customTextParagraphs = [
                    new Paragraph({
                        text: `This application seeks permission to place on record the following additional facts and documents, which are necessary and proper for the adjudication of the accompanying ${iaDocShort}:`,
                        numbering: nextNumbering(),
                    }),
                    adAnnexuresTable,
                ];
                newListSegment(); // the annexures table interrupts the numbering

                // Append user-provided grounds/averments as numbered paragraphs after the annexures table
                const adGrounds = (projectData.standardIas as any).additionalDocumentsGrounds || [];
                adGrounds
                    .filter((g: any) => g.particulars && g.particulars.trim() !== '')
                    .forEach((g: any) => {
                        const { paragraphs, numbering } = parseHtml(g.particulars, undefined, { reference: currentListRef, level: 0 });
                        if (numbering.length > 0) allNumberingConfigs.push(...numbering);
                        countNumbered(paragraphs);
                        paragraphs.forEach(p => {
                            customTextParagraphs.push(p);
                        });
                    });

                break;
            case "exemptionOfficialTranslation":
                const allAnnexuresForTranslation: Annexure[] = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
                const annexureNumberingMapForTranslation = new Map<string, number>();
                let pCounterForTranslation = 1;
                allAnnexuresForTranslation.filter(annex => !annex.isAdditionalDocument).forEach(annex => annexureNumberingMapForTranslation.set(annex.id, pCounterForTranslation++));
                allAnnexuresForTranslation.filter(annex => annex.isAdditionalDocument).forEach(annex => annexureNumberingMapForTranslation.set(annex.id, pCounterForTranslation++));

                const translatedAnnexures = allAnnexuresForTranslation
                    .filter(annex => annex.copyType === 'translated copy' || annex.copyType === 'true and translated copy')
                    .map(annex => annexureNumberingMapForTranslation.get(annex.id))
                    .filter(Boolean)
                    .map(pNumber => `${annexurePrefix(projectData.courtType)}-${pNumber}`);
                
                let annexureList = projectData.standardIas.exemptionOfficialTranslation.reason || 'the annexures';
                 if (translatedAnnexures.length > 0) {
                    const last = translatedAnnexures.pop();
                    annexureList = translatedAnnexures.length > 0
                        ? `Annexures ${translatedAnnexures.join(', ')} and ${last}`
                        : `Annexure ${last}`;
                }

                iaTitle = `Application for exemption from filing Official Translation(s) of ${annexureList}`;
                customPrayer = `Grant exemption to the Petitioner(s) from filing Official Translation(s) of ${annexureList}; and`;
                prayerParagraphs.push(new Paragraph({ children: [smartTextRun(customPrayer)], style: "Normal" }));
                const otUserReason = (projectData.standardIas.exemptionOfficialTranslation.userReason || '').trim();
                const otBody = `This application seeks exemption from filing Official Translation(s) of ${annexureList}. ${otUserReason ? otUserReason + ' ' : ''}It is prayed that in view of the urgency and the facts and circumstances of this case, exemption from filing Official Translation(s) may be granted.`;
                customTextParagraphs = [new Paragraph({ children: [smartTextRun(otBody)], numbering: nextNumbering() })];
                break;
            case "suspensionOfSentence":
                iaTitle = standardIaList.find(ia => ia.id === iaIdentifier)?.title || iaTitle;
                customPrayer = `Suspend the sentence imposed upon the Petitioner by${ioText} and direct the Petitioner to be released on bail during the pendency of the present Appeal; and`;
                prayerParagraphs.push(new Paragraph({ children: [smartTextRun(customPrayer)], style: "Normal" }));
                const suspensionGrounds = projectData.standardIas.suspensionOfSentence?.grounds || [];

                const suspensionAnnexureMap = new Map<string, number>();
                let suspCounter = 1;
                suspensionGrounds.forEach(g => {
                    if (g.annexures) {
                        g.annexures.forEach(annex => {
                            suspensionAnnexureMap.set(annex.id, suspCounter++);
                        });
                    }
                });

                const suspensionGroundsRows = suspensionGrounds
                    .filter(g => g.particulars.trim() !== '')
                    .map((g, index) => {
                        const { paragraphs, numbering } = parseHtml(g.particulars);
                        if (numbering.length > 0) allNumberingConfigs.push(...numbering);
                        if (g.annexures && g.annexures.length > 0) {
                            g.annexures.forEach(annex => {
                                const aNumber = suspensionAnnexureMap.get(annex.id);
                                if (aNumber) {
                                    const annexureTextParts = createIaAnnexureText(aNumber, annex);
                                    const textRuns = annexureTextParts.map(part =>
                                        typeof part === 'string' ? smartTextRun(part) : part
                                    );
                                    paragraphs.push(new Paragraph({ children: textRuns, style: "Normal" }));
                                }
                            });
                        }
                        return new TableRow({
                            children: [
                                new TableCell({
                                    children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                                    borders: noBorders, width: { size: 10, type: WidthType.PERCENTAGE },
                                }),
                                new TableCell({ children: paragraphs, borders: noBorders, width: { size: 90, type: WidthType.PERCENTAGE } }),
                            ],
                        });
                    });

                const suspensionGroundsTable = new Table({
                    width: { size: 91.66, type: WidthType.PERCENTAGE },
                    columnWidths: [800, 9200],
                    rows: suspensionGroundsRows, borders: noBorders,
                    indent: { size: 720, type: WidthType.DXA },
                });

                customTextParagraphs = [
                    new Paragraph({
                        text: `The present application is filed by the Petitioner(s) under S.389 of the Code of Criminal Procedure, 1973 seeking suspension of sentence imposed on them by${ioText}.`,
                        numbering: nextNumbering(),
                    }),
                    suspensionGroundsTable
                ];
                newListSegment(); // the grounds table interrupts the numbering
                break;
            case "exemptionFromSurrendering":
                iaTitle = standardIaList.find(ia => ia.id === iaIdentifier)?.title || iaTitle;
                customPrayer = `Grant exemption to the Petitioner(s) from surrendering pursuant to${ioText}; and`;
                prayerParagraphs.push(new Paragraph({ children: [smartTextRun(customPrayer)], style: "Normal" }));
                const surrenderingGrounds = projectData.standardIas.exemptionFromSurrendering?.grounds || [];
                
                // Build annexure numbering map for surrendering grounds
                const surrenderingAnnexureMap = new Map<string, number>();
                let sCounter = 1;
                surrenderingGrounds.forEach(g => {
                    if (g.annexures) {
                        g.annexures.forEach(annex => {
                            surrenderingAnnexureMap.set(annex.id, sCounter++);
                        });
                    }
                });
                
                const surrenderingGroundsRows = surrenderingGrounds
                    .filter(g => g.particulars.trim() !== '')
                    .map((g, index) => {
                        const { paragraphs, numbering } = parseHtml(g.particulars);
                        if (numbering.length > 0) allNumberingConfigs.push(...numbering);
                        
                        // Add annexure sentences for this ground
                        if (g.annexures && g.annexures.length > 0) {
                            g.annexures.forEach(annex => {
                                const aNumber = surrenderingAnnexureMap.get(annex.id);
                                if (aNumber) {
                                    const annexureTextParts = createIaAnnexureText(aNumber, annex);
                                    const textRuns = annexureTextParts.map(part => 
                                        typeof part === 'string' ? smartTextRun(part) : part
                                    );
                                    paragraphs.push(new Paragraph({ children: textRuns, style: "Normal" }));
                                }
                            });
                        }
                        
                        return new TableRow({
                            children: [
                                new TableCell({
                                    children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                                    borders: noBorders, width: { size: 10, type: WidthType.PERCENTAGE },
                                }),
                                new TableCell({ children: paragraphs, borders: noBorders, width: { size: 90, type: WidthType.PERCENTAGE } }),
                            ],
                        });
                    });

                const surrenderingGroundsTable = new Table({
                    width: { size: 91.66, type: WidthType.PERCENTAGE },
                    columnWidths: [800, 9200],
                    rows: surrenderingGroundsRows, borders: noBorders,
                    indent: { size: 720, type: WidthType.DXA },
                });
                
                customTextParagraphs = [
                    new Paragraph({
                        text: `This application, seeking exemption from surrendering pursuant to${ioText}, is preferred on the following grounds:`,
                        numbering: nextNumbering(),
                    }),
                    surrenderingGroundsTable
                ];
                newListSegment(); // the grounds table interrupts the numbering
                break;
        }
    } else {
        // Handle custom IAs
        const customIa = projectData.customIas.find(ia => ia.id === iaIdentifier);
        if (customIa) {
            iaTitle = customIa.title;

            // Build annexure numbering map for custom IA grounds
            const customAnnexureMap = new Map<string, number>();
            let cCounter = 1;
            customIa.grounds.forEach(g => {
                if (g.annexures) {
                    g.annexures.forEach(annex => {
                        customAnnexureMap.set(annex.id, cCounter++);
                    });
                }
            });

            // Handle Grounds
            const groundsRows = customIa.grounds
                .filter(g => g.particulars.trim() !== '')
                .map((g, index) => {
                    const { paragraphs, numbering } = parseHtml(g.particulars);
                    if (numbering.length > 0) allNumberingConfigs.push(...numbering);
                    
                    // Add annexure sentences for this ground
                    if (g.annexures && g.annexures.length > 0) {
                        g.annexures.forEach(annex => {
                            const aNumber = customAnnexureMap.get(annex.id);
                            if (aNumber) {
                                const annexureTextParts = createIaAnnexureText(aNumber, annex);
                                const textRuns = annexureTextParts.map(part => 
                                    typeof part === 'string' ? smartTextRun(part) : part
                                );
                                paragraphs.push(new Paragraph({ children: textRuns, style: "Normal" }));
                            }
                        });
                    }
                    
                    return new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                                borders: noBorders, width: { size: 8, type: WidthType.PERCENTAGE },
                            }),
                            new TableCell({ children: paragraphs, borders: noBorders, width: { size: 92, type: WidthType.PERCENTAGE } }),
                        ],
                    });
                });

            const groundsTable = new Table({
                width: { size: 91.66, type: WidthType.PERCENTAGE },
                columnWidths: [800, 9200],
                rows: groundsRows, borders: noBorders,
                indent: { size: 720, type: WidthType.DXA },
            });

            const para2Extra = (customIa.para2 || '').trim();
            const para2Text = para2Extra
                ? `The present application is being filed by the Petitioner(s) ${para2Extra}`
                : `The present application is being filed by the Petitioner(s)`;

            customTextParagraphs = [
                new Paragraph({
                    text: convertToSmartQuotes(para2Text),
                    numbering: nextNumbering(),
                }),
                new Paragraph({
                    text: `The present application is filed on the following grounds:`,
                    numbering: nextNumbering(),
                }),
                groundsTable
            ];
            newListSegment(); // the grounds table interrupts the numbering

            // Handle Prayers
            customIa.prayers.forEach(p => {
                 const { paragraphs } = parseHtml(p.particulars);
                 prayerParagraphs.push(...paragraphs);
            });
        }
    }

    const uniqueNumberingConfigs = [
        ...allNumberingConfigs.filter((v, i, a) => a.findIndex(t => t.reference === v.reference) === i),
        ...listSegments.map(seg => makeIaListConfig(seg.reference, seg.start)),
    ];

    const prayerTableRows = prayerParagraphs.map((p, index) => {
        return new TableRow({
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
            ]
        });
    });
    
    // Add the "any other order" prayer for standard IAs
    if (standardIa) {
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
            ]
        }));
    }

    const prayerTable = new Table({
        width: { size: 91.66, type: WidthType.PERCENTAGE },
        columnWidths: [800, 9200],
        rows: prayerTableRows,
        borders: noBorders,
        indent: { size: 720, type: WidthType.DXA },
    });

    const doc = new Document({
        numbering: {
            config: uniqueNumberingConfigs,
        },
        styles: getDefaultStyles(),
        sections: [{
            properties: { page: { margin: getSlpMargins() } },
            children: [
                ...createIaHeader(projectData.caseType),
                ...createPartiesHeader(petHeader, resHeader),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [smartTextRun({ text: iaTitle.toUpperCase(), bold: true })]
                }),
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
                    ]
                }),
                 new Paragraph({
                    alignment: AlignmentType.LEFT,
                    children: [ smartTextRun({ text: "It is most respectfully submitted that:", bold: true }) ]
                }),
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
                        smartTextRun({ text: ": In view of the foregoing averments, it is most respectfully prayed that this Hon'ble Court may be pleased to:" })
                    ],
                    numbering: nextNumbering(),
                }),
                prayerTable,
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [smartTextRun({ text: "And for this act of kindness, the humble Petitioner(s) shall ever pray.", italics: true })]
                }),
                new Paragraph(""),
                ...createFiledByTable(advocate.filingDate, advocate.aorName || "[AoR Name]", { includeSignature }),
            ]
        }]
    });

    const b64string = await Packer.toBase64String(doc);
    const fileName = `${getShortIaTitle(iaIdentifier, iaTitle)}.docx`;
    return { success: true, docx: b64string, fileName: fileName };
}

export async function generateFilingMemoDocx(projectData: DraftoProject, includeSignature = false) {
    const petHeader = getPartyHeader(projectData.petitioners);
    const resHeader = getPartyHeader(projectData.respondents);
    const iaList = getIaList(projectData);
    const allAnnexures = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
    const lastAnnexureNumber = allAnnexures.length;

    const memoRows = [
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: "1.", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: mainDocumentParticular(projectData), spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            ]
        }),
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: "2.", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: annexureRangeText(lastAnnexureNumber, false, annexurePrefix(projectData.courtType)), spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            ]
        }),
        ...iaList.map((ia, index) => new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: `${index + 3}.`, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: ia.title, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            ]
        })),
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: `${iaList.length + 3}.`, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "Vakalatnama(s)", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            ]
        })
    ];

    const doc = new Document({
        styles: getDefaultStyles(),
        sections: [{
            properties: { page: { margin: getSlpMargins() } },
            children: [
                ...createSlpHeader(projectData.caseType, ` ${calculateIoText(projectData)}`, getSlpLayout().headerStyle, appealHeaderArg(projectData)),
                ...createPartiesHeader(petHeader, resHeader),
                new Paragraph({
                    text: "FILING MEMO",
                    alignment: AlignmentType.CENTER,
                    bold: true,
                }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    columnWidths: [10, 60, 15, 15].map(v => v * 100),
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph({ text: "S. No.", bold: true, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                                new TableCell({ children: [new Paragraph({ text: "Particulars", bold: true, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                                new TableCell({ children: [new Paragraph({ text: "Copies", bold: true, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                                new TableCell({ children: [new Paragraph({ text: "Court Fee", bold: true, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                            ],
                        }),
                        ...memoRows,
                    ]
                }),
                new Paragraph(""),
                ...createFiledByTable(projectData.advocate.filingDate, projectData.advocate.aorName || "[AoR Name]", { includeSignature }),
            ],
        }]
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `MoP.docx` };
}

export async function generateVakalatnamaDocx(projectData: DraftoProject) {
    const petHeader = getPartyHeader(projectData.petitioners);
    const resHeader = getPartyHeader(projectData.respondents);
    const { caseType, advocate } = projectData;
    // The Supreme Court Writ Petition tool shares this generator. It is the same
    // court, so only the jurisdiction line, the petition description and the
    // executant's descriptor differ from an SLP.
    const isScWp = isScWpFamily(projectData.courtType);
    const isApp = isAppeal(projectData.courtType);
    const vakalatnamaDocNoun = isScWp ? 'Writ Petition' : isApp ? 'Appeal' : 'Special Leave Petition';
    const aorName = advocate.aorName || "[AoR Name]";
    const currentDate = format(new Date(), "dd.MM.yyyy");
    const currentYear = new Date().getFullYear();

    const validPetitioners = projectData.petitioners.filter(p => p.name.trim() !== '');

    if (validPetitioners.length === 0) {
        return { success: false, message: "No petitioners found to generate Vakalatnama." };
    }

    // The deponent may execute on behalf of a petitioner in a representative
    // capacity (Authorised Representative / Pairokar / Legal Guardian / PoA
    // Holder). deponent.role names the petitioner it attaches to ("… of the
    // Petitioner" / "… of Petitioner No. 1") — both resolve to the first
    // petitioner's vakalatnama; the others are executed by the petitioners
    // themselves. When the role is plainly "Petitioner"/"Petitioner No. 1", the
    // petitioner signs directly (unchanged behaviour).
    const depRole = projectData.deponent?.role || '';
    const depName = projectData.deponent?.name?.trim() || '';
    const isRepRole = !!depRole && depRole !== 'Petitioner' && depRole !== 'Petitioner No. 1';
    // Executant for a given petitioner index: name + descriptor used both in the
    // opening ("I, <name>, <descriptor> …") and the signature block.
    const executantFor = (index: number, petitionerName: string, petitionerPosition: string) => {
        if (index === 0 && isRepRole && depName) {
            return { name: depName, descriptor: depRole, onBehalf: petitionerName };
        }
        return { name: petitionerName, descriptor: `${petitionerPosition} in this ${vakalatnamaDocNoun}`, onBehalf: '' };
    };

    const vakalatnamaStyles = {
        paragraphStyles: [{
            id: "VakaNormal",
            name: "VakaNormal",
            basedOn: "Normal",
            next: "Normal",
            run: { font: "Times New Roman", size: 22 }, // 11pt
            paragraph: { spacing: { after: 0, line: 240 } }, // Single line spacing
        }],
    };

    const noBorders = {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    };

    const sections: ISectionOptions[] = [];

    validPetitioners.forEach((petitioner, index) => {
        const petitionerPosition = validPetitioners.length === 1 ? "Petitioner" : `Petitioner No. ${index + 1}`;
        const executant = executantFor(index, petitioner.name, petitionerPosition);
        // Opening clause. A representative executant reads "I, <rep name>, <the
        // Authorised Representative of the Petitioner…>, hereby appoint…"; a
        // petitioner reads "I, <name>, Petitioner No. N in this SLP, hereby…".
        const openingIntro = `I, ${executant.name}, ${executant.descriptor}, hereby appoint and retain `;
        const openingClose = `, Advocate on Record of the Supreme Court, to act and appear for me in this petition and, on my behalf, to conduct and prosecute the same and all proceedings that may be taken in respect of any application connected with the same or any decree/order passed therein, including proceedings in taxation and application for review, to file and obtain return of documents, and to deposit and receive money on my behalf in the said petition and in any application for review, and to represent me and to take all necessary steps on my behalf in the above matter. I agree to ratify all acts done by the aforesaid Advocate in pursuance of this authority.`;
        // Signature label: representative shows "<rep name> (<capacity>)"; a
        // petitioner shows "<name> (Petitioner No. N)".
        const signatureLabel = executant.onBehalf
            ? `${executant.name} (${executant.descriptor})`
            : `${petitioner.name} (${petitionerPosition})`;
        const children: (Paragraph | Table)[] = [
            new Paragraph({ text: "IN THE SUPREME COURT OF INDIA", alignment: AlignmentType.CENTER, style: "VakaNormal" }),
            new Paragraph({ text: `${caseType} ${isScWp ? 'Original' : 'Appellate'} Jurisdiction`, alignment: AlignmentType.CENTER, style: "VakaNormal" }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                style: "VakaNormal",
                children: [
                    smartTextRun({
                        // Wording mirrors createScWpHeader() so the vakalatnama
                        // describes the petition exactly as the petition does.
                        text: isScWp
                            ? `Writ Petition (${caseType === "Criminal" ? "Crl." : "Civil"}) No. _______ of ${currentYear}`
                            : isApp
                                ? `${appealTitle(caseType)} No. _______ of ${currentYear}`
                                : `Special Leave Petition (${caseType}) No. _______ of ${currentYear}`,
                        bold: true,
                    }),
                ],
            }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            ...createPartiesHeader(petHeader, resHeader).map(p => {
                if (p instanceof Paragraph) {
                    p.properties.style = "VakaNormal";
                }
                return p;
            }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            new Paragraph({ children: [smartTextRun({ text: "VAKALATNAMA", bold: true })], alignment: AlignmentType.CENTER, style: "VakaNormal" }),
            new Paragraph({
                children: [
                    smartTextRun({ text: convertToSmartQuotes(openingIntro) }),
                    smartTextRun({ text: aorName, bold: true }),
                    smartTextRun({ text: convertToSmartQuotes(openingClose) }),
                ],
                style: "VakaNormal",
                alignment: AlignmentType.JUSTIFIED,
            }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                columnWidths: [5000, 5000],
                borders: noBorders,
                rows: [new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ text: `Date: ${currentDate}`, style: "VakaNormal" })], borders: noBorders }),
                        new TableCell({
                            children: [
                                new Paragraph({
                                    children: [smartTextRun({ text: signatureLabel, bold: true })],
                                    style: "VakaNormal",
                                    alignment: AlignmentType.RIGHT
                                })
                            ],
                            borders: noBorders
                        }),
                    ],
                })],
            }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            new Paragraph({ text: "☐ This Vakalatnama has been signed by the Petitioner(s) in my presence. I have identified the Petitioner(s) and accepted this Vakalatnama.", style: "VakaNormal" }),
            new Paragraph({ text: "☐ This Vakalatnama has not been signed by the Petitioner(s) in my presence. However, I have satisfied myself as to the due execution of this Vakalatnama and accepted it. The Petitioner(s) have been identified by the following Notary/Advocate: _______________.", style: "VakaNormal" }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            new Paragraph({ 
                children: [
                    smartTextRun({ text: aorName, bold: true }),
                    smartTextRun({ text: `, Advocate on Record (AoR Code: ${advocate.aorCode || '______'})`, bold: true }),
                ],
                style: "VakaNormal" 
            }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            new Paragraph({ text: "MEMO OF APPEARANCE", bold: true, alignment: AlignmentType.CENTER, style: "VakaNormal" }),
            new Paragraph({ text: "To,", style: "VakaNormal" }),
            new Paragraph({ text: "    The Registrar,", style: "VakaNormal" }),
            new Paragraph({ text: "    Supreme Court of India", style: "VakaNormal" }),
            new Paragraph({ text: "    New Delhi", style: "VakaNormal" }),
            new Paragraph({ text: "Sir,", style: "VakaNormal" }),
            new Paragraph({ text: "    Please enter my appearance on behalf on the Petitioner(s) in the aforesaid matter.", style: "VakaNormal" }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                columnWidths: [5000, 5000],
                borders: noBorders,
                rows: [new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ text: `Date: ${currentDate}`, style: "VakaNormal" })], borders: noBorders }),
                        new TableCell({
                            children: [
                                new Paragraph({ 
                                    children: [smartTextRun({ text: aorName, bold: true })], 
                                    style: "VakaNormal", 
                                    alignment: AlignmentType.RIGHT 
                                }),
                                new Paragraph({ text: "Advocate for the Petitioner(s)", style: "VakaNormal", alignment: AlignmentType.RIGHT }),
                            ],
                            borders: noBorders,
                        }),
                    ],
                })],
            }),
        ];

        if (index < validPetitioners.length - 1) {
            children.push(new Paragraph({ children: [new PageBreak()] }));
        }

        sections.push({
            properties: { page: { margin: getSlpMargins() } },
            children,
        });
    });

    const doc = new Document({
        styles: vakalatnamaStyles,
        sections: sections,
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `Vakalatnama.docx` };
}

export async function generateAffidavitsDocx(projectData: DraftoProject) {
    // Same affidavit, named for the document it supports.
    const affidavitDocNoun = isAppeal(projectData.courtType) ? 'Appeal' : 'Special Leave Petition';
    const affidavitBodyNoun = isAppeal(projectData.courtType) ? 'Appeal' : 'petition for Special Leave to Appeal';
    const { deponent, petitioners, caseType } = projectData;
    const petHeader = getPartyHeader(projectData.petitioners);
    const resHeader = getPartyHeader(projectData.respondents);
    const ioText = ` ${calculateIoText(projectData)}`;
    const allAnnexures = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
    const nonAdAnnexures = allAnnexures.filter(annex => !annex.isAdditionalDocument);
    const lastNonAdPNumber = nonAdAnnexures.length;
    
    const docs = [];

    const affidavitNumbering = {
        reference: "affidavit-numbering",
        levels: [{
            level: 0,
            format: "decimal" as const,
            text: "%1.",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
    };

    const presentlyAtPart = deponent.location?.trim() ? `, presently at ${deponent.location.trim()}` : '';
    const deponentIntro = `I, ${deponent.name || '[Name]'}, ${deponent.relationship} ${deponent.fatherName || '[Father/Husband Name]'}, aged ${deponent.age || '__'} years, resident of ${deponent.address || '[Address]'}${presentlyAtPart}, do hereby solemnly state and affirm as under:`;

    // 1. SLP Affidavit
    const slpAffidavitChildren = [
        ...createSlpHeader(caseType, ioText, getSlpLayout().headerStyle, appealHeaderArg(projectData)),
        new Paragraph(""),
        ...createPartiesHeader(petHeader, resHeader),
        new Paragraph({ children: [new TextRun({ text: "AFFIDAVIT", bold: true })], alignment: AlignmentType.CENTER }),
        new Paragraph(deponentIntro),
        new Paragraph({
            text: `I am the ${deponent.role || '[Role]'} in the present case. As such, I am fully conversant with the facts of the case and hence capable to swear to this Affidavit${petitioners.length > 1 ? " on behalf of myself and the other Petitioner(s) as well" : ""}.`,
            numbering: { reference: "affidavit-numbering", level: 0 }
        }),
        new Paragraph({
            text: `I have read and understood the contents of the accompanying ${affidavitDocNoun} including Synopsis and List of Dates from Page B to Page ___ and ${affidavitBodyNoun} at Paragraphs 1 to 8, and the contents of all accompanying applications/ IAs. I say that the contents thereof are true and correct to the best of my knowledge and belief.`,
            numbering: { reference: "affidavit-numbering", level: 0 }
        }),
        new Paragraph({
            text: `${annexureRangeText(lastNonAdPNumber, affidavitWantsBlankAnnexureRange(), annexurePrefix(projectData.courtType))} to the petition and all annexures to the accompanying applications/IAs are true/translated copies of their respective originals.`,
            numbering: { reference: "affidavit-numbering", level: 0 }
        }),
        new Paragraph({ children: [new TextRun({ text: "DEPONENT", bold: true })], alignment: AlignmentType.RIGHT }),
        new Paragraph({ children: [new TextRun({ text: "VERIFICATION", bold: true })] }),
        new Paragraph(`Verified at ${deponent.location || '_______'} on this ___ day of _______ that the contents of the above affidavit are true and correct to the best of my knowledge and no part of it is false and nothing material has been concealed therefrom.`),
        new Paragraph({ children: [new TextRun({ text: "DEPONENT", bold: true })], alignment: AlignmentType.RIGHT }),
    ];
    
    const slpAffidavitDoc = new Document({
        styles: getDefaultStyles(),
        numbering: { config: [affidavitNumbering] },
        sections: [{ properties: { page: { margin: getSlpMargins() } }, children: slpAffidavitChildren }]
    });
    docs.push({
        fileName: `Affidavit-SLP.docx`,
        doc: slpAffidavitDoc
    });

    // 2. IA Affidavits
    const iaList = getIaList(projectData);
    iaList.forEach((ia, index) => {
        const iaAffidavitChildren = [
            ...createIaHeader(caseType),
            new Paragraph(""),
            ...createPartiesHeader(petHeader, resHeader),
            new Paragraph({ children: [new TextRun({ text: "AFFIDAVIT", bold: true })], alignment: AlignmentType.CENTER }),
            new Paragraph(deponentIntro),
            new Paragraph({
                text: `I am the ${deponent.role || '[Role]'} in the present case. As such, I am fully conversant with the facts of the case and hence capable to swear to this Affidavit${petitioners.length > 1 ? " on behalf of myself and the other Petitioner(s) as well" : ""}.`,
                numbering: { reference: "affidavit-numbering", level: 0 }
            }),
            new Paragraph({
                text: "I have read and understood the contents of the accompanying application. I say that the contents thereof are true and correct to the best of my knowledge and belief.",
                numbering: { reference: "affidavit-numbering", level: 0 }
            }),
            new Paragraph({
                text: "All annexures to the accompanying application are true/translated copies of their respective originals.",
                numbering: { reference: "affidavit-numbering", level: 0 }
            }),
            new Paragraph({ children: [new TextRun({ text: "DEPONENT", bold: true })], alignment: AlignmentType.RIGHT }),
            new Paragraph({ children: [new TextRun({ text: "VERIFICATION", bold: true })] }),
            new Paragraph(`Verified at ${deponent.location || '_______'} on this ___ day of _______ that the contents of the above affidavit are true and correct to the best of my knowledge and no part of it is false and nothing material has been concealed therefrom.`),
            new Paragraph({ children: [new TextRun({ text: "DEPONENT", bold: true })], alignment: AlignmentType.RIGHT }),
        ];

        const iaAffidavitDoc = new Document({
            styles: getDefaultStyles(),
            numbering: { config: [affidavitNumbering] },
            sections: [{ properties: { page: { margin: getSlpMargins() } }, children: iaAffidavitChildren }]
        });
        docs.push({
            fileName: `Affidavit-IA-${index + 1}.docx`,
            doc: iaAffidavitDoc
        });
    });

    const generatedDocs = await Promise.all(
        docs.map(async ({ fileName, doc }) => {
            const b64string = await Packer.toBase64String(doc);
            return { success: true, docx: b64string, fileName };
        })
    );

    return { success: true, documents: generatedDocs };
}

// Derive the main serial number (1, 2, 3…) from a checklist item's `name`
// (e.g. "q13_a" → 13). Mirrors the on-screen Advocate's Checklist tab so the
// printed paperbook shows the same numbering.
const getChecklistMainNumber = (name: string): number | null => {
    const match = name.match(/^q(\d+)_/);
    return match ? parseInt(match[1], 10) : null;
};

// ── Trailing blank-page trimming (system-generated sections only) ──────────────
// Word/LibreOffice append a mandatory empty paragraph after a section-ending
// table; combined with paragraph spacing this can spill onto a fresh, content-
// less page that then gets paginated, corrupting downstream page ranges. We trim
// such pages, but ONLY from system-generated PDFs and ONLY when a page carries no
// visible marks at all. Everything is fail-safe: any uncertainty keeps the page,
// so legitimate content (including blank pages inside user-uploaded scans, which
// are never passed here) is never removed.

// True only if the content stream paints something a reader would see: text,
// images (XObjects / inline images), filled/stroked paths, or shadings. Pure
// state operators (q/Q/cm/gs), text objects with no shown glyphs (BT…ET), and
// path construction without painting (re, m, l, c, W n) are NOT visible marks.
const contentHasVisibleMarks = (s: string): boolean => {
    // Multi-char show/paint operators, as standalone tokens.
    if (/(?:^|[\s)\]>])(?:Tj|TJ|Do|sh|BI)(?=[\s/\[<(]|$)/.test(s)) return true;
    // Text-show shorthands ' and "
    if (/(?:^|[\s)\]>])(?:'|")(?=[\s/\[<(]|$)/.test(s)) return true;
    // Path painting operators: f F f* B B* b b* S s (whitespace-delimited tokens)
    if (/(?:^|\s)(?:f\*|b\*|B\*|f|F|B|b|S|s)(?=\s|$)/.test(s)) return true;
    return false;
};

const isPdfPageBlank = (page: any): boolean => {
    try {
        const ctx = page.doc.context;
        let contents = page.node.Contents ? page.node.Contents() : page.node.get(PDFName.of('Contents'));
        if (!contents) return true; // no content object at all → blank
        contents = ctx.lookup(contents);

        const streams: any[] = [];
        if (contents instanceof PDFArray) {
            for (let i = 0; i < contents.size(); i++) streams.push(ctx.lookup(contents.get(i)));
        } else {
            streams.push(contents);
        }

        for (const st of streams) {
            if (!(st instanceof PDFRawStream)) return false; // unknown encoding → keep (not blank)
            const decoded = decodePDFRawStream(st).decode();
            const text = new TextDecoder('latin1').decode(decoded);
            if (contentHasVisibleMarks(text)) return false;
        }
        return true;
    } catch {
        return false; // any error → keep the page
    }
};

// Remove content-less trailing pages from a system-generated section. Never drops
// the final remaining page, and stops at the first non-blank page from the end.
const trimTrailingBlankPages = (pdf: PDFDocument): number => {
    let removed = 0;
    while (pdf.getPageCount() > 1) {
        const lastIndex = pdf.getPageCount() - 1;
        if (!isPdfPageBlank(pdf.getPage(lastIndex))) break;
        pdf.removePage(lastIndex);
        removed++;
    }
    return removed;
};

export async function generateAdvocateChecklistDocx(projectData: DraftoProject, includeSignature = false) {
    const isScWp = isScWpFamily(projectData.courtType);
    const { checklist } = projectData;
    // Point 1 reads "SLP (Crl.)" in a criminal SLP, "SLP (C)" otherwise.
    const checklistQueries = getChecklistQueries(projectData.caseType);

    // Checklist-specific formatting (font size / line spacing / paragraph spacing)
    const cf = isScWp ? getScWpChecklistFormatting() : getChecklistFormatting();
    const of = isScWp ? getScWpOutputFormatting() : getOutputFormatting();
    const checklistStyles = {
        paragraphStyles: [
            {
                id: "Normal",
                name: "Normal",
                basedOn: "Normal",
                next: "Normal",
                quickFormat: true,
                run: { font: of.font, size: Math.round(cf.sizePt * 2) },
                paragraph: {
                    spacing: { line: Math.round(cf.lineSpacing * 240), after: 0, before: 0 },
                    alignment: AlignmentType.JUSTIFIED,
                },
            },
        ],
    };
    // Per-cell paragraph spacing, derived from the user's checklist setting.
    const checklistCellSpacing = {
        before: Math.round(cf.paraSpacingPt * 20), // pt → twips
        after: Math.round(cf.paraSpacingPt * 20),
    };

    const rows = checklistQueries.map((item, index) => {
        // Display-only lead-in rows (e.g. the PIL preamble) have no answer field.
        const answer = item.header ? "" : String(checklist[item.name as keyof typeof checklist] ?? "");
        // The visible sub-label like "(i)" / "(a)" (if any) and the question body.
        const questionLabel = item.label.replace(/^\(\w+\)\s*/, '');
        const subMatch = item.label.match(/^\((.*?)\)/);
        const subLabel = subMatch ? subMatch[0] : "";

        // Show the main number (1, 2, 3…) only on the first row of each group,
        // matching the on-screen checklist tab.
        const mainNumber = getChecklistMainNumber(item.name);
        const prevNumber = index > 0 ? getChecklistMainNumber(checklistQueries[index - 1].name) : null;
        const showMain = mainNumber !== null && mainNumber !== prevNumber;
        const numberLabel = [showMain ? `${mainNumber}.` : "", subLabel].filter(Boolean).join(" ");

        return new TableRow({
            children: [
                new TableCell({
                    children: [new Paragraph({ text: numberLabel, alignment: AlignmentType.CENTER, spacing: checklistCellSpacing })],
                    width: { size: 10, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: defaultCellMargins,
                }),
                new TableCell({
                    children: [new Paragraph({ text: questionLabel, spacing: checklistCellSpacing })],
                    width: { size: 75, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: defaultCellMargins,
                }),
                new TableCell({
                    children: [new Paragraph({ text: answer, alignment: AlignmentType.CENTER, spacing: checklistCellSpacing })],
                    width: { size: 15, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: defaultCellMargins,
                }),
            ],
        });
    });

    // Checklist top/left margins are user-configurable (default 1", vs the 1.5"
    // used elsewhere); right/bottom follow the shared SLP/SC WP margins.
    const baseMargins = isScWp ? getScWpMargins() : getSlpMargins();
    const checklistMargins = {
        ...baseMargins,
        top: Math.round(cf.marginTopInches * 1440),
        left: Math.round(cf.marginLeftInches * 1440),
    };

    const doc = new Document({
        styles: checklistStyles,
        sections: [{
            properties: { page: { margin: checklistMargins } },
            children: [
                new Paragraph({
                    children: [
                        smartTextRun({
                            text: "ADVOCATE'S CHECKLIST",
                            bold: true,
                        }),
                    ],
                    alignment: AlignmentType.CENTER,
                }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    columnWidths: [1000, 7500, 1500],
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    children: [new Paragraph({
                                        children: [smartTextRun({ text: "S. No.", bold: true })],
                                        alignment: AlignmentType.CENTER,
                                        spacing: checklistCellSpacing
                                    })],
                                    verticalAlign: VerticalAlign.CENTER,
                                    margins: defaultCellMargins
                                }),
                                new TableCell({
                                    children: [new Paragraph({
                                        children: [smartTextRun({ text: "Question", bold: true })],
                                        alignment: AlignmentType.CENTER,
                                        spacing: checklistCellSpacing
                                    })],
                                    verticalAlign: VerticalAlign.CENTER,
                                    margins: defaultCellMargins
                                }),
                                new TableCell({
                                    children: [new Paragraph({
                                        children: [smartTextRun({ text: "Answer", bold: true })],
                                        alignment: AlignmentType.CENTER,
                                        spacing: checklistCellSpacing
                                    })],
                                    verticalAlign: VerticalAlign.CENTER,
                                    margins: defaultCellMargins
                                }),
                            ],
                        }),
                        ...rows,
                    ],
                }),
                // Declaration, immediately after the 15-point table (text only).
                // Only printed when the advocate has ticked the attestation in the app.
                ...(checklist.declarationVerified ? [
                    new Paragraph({ text: "" }),
                    new Paragraph({
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: checklistCellSpacing,
                        children: [
                            smartTextRun({ text: "Declaration: ", bold: true }),
                            smartTextRun(convertToSmartQuotes(CHECKLIST_DECLARATION)),
                        ],
                    }),
                ] : []),
                // Two blank lines to leave room for the signature image above the
                // "Filed by" name (the signature is a floating overlay).
                new Paragraph({ text: "" }),
                new Paragraph({ text: "" }),
                // "Filed by" block (with AoR signature, if configured), matching the
                // checklist's own formatting.
                ...createFiledByTable(
                    projectData.advocate.filingDate,
                    projectData.advocate.aorName || "[AoR Name]",
                    { fontSizePt: cf.sizePt, lineSpacing: cf.lineSpacing, paraSpacingPt: cf.paraSpacingPt, includeSignature, isScWp }
                ),
            ],
        }],
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `Checklist.docx` };
}

// PDF conversion via Electron main process (IPC)
// The actual conversion logic (Python/AppleScript) runs in electron/ipc/pdf-converter.js
async function convertDocxToPdf(docxBuffer: Uint8Array): Promise<{ pdf: PDFDocument, pageCount: number }> {
    const result = await ipcConvertDocxToPdf(docxBuffer);
    if (!result.success || !result.pdfBase64) {
        throw new Error(result.error || 'PDF conversion failed');
    }
    const pdfBytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
    const pdfDoc = await PDFDocument.load(pdfBytes);
    // Drop content-less trailing pages (e.g. an empty paragraph after a section's
    // final table that spills onto a fresh page). Doing it here keeps the page
    // counts used for the Index page-ranges consistent with the merged paperbook.
    const trimmed = trimTrailingBlankPages(pdfDoc);
    if (trimmed > 0) console.log(`[PDF Conversion] Trimmed ${trimmed} trailing blank page(s)`);
    const pageCount = pdfDoc.getPageCount();
    console.log(`[PDF Conversion] Successfully converted (${pageCount} pages)`);
    return { pdf: pdfDoc, pageCount };
}
export async function generatePdf(formData: FormData, signal?: AbortSignal, onProgress?: (label: string) => void) {
    const fileMetasString = formData.get('fileMetas') as string;
    const projectDataString = formData.get('projectData') as string;
    const settingsString = formData.get('settings') as string | null;

    if (!fileMetasString || !projectDataString) {
        return { success: false, message: "File metadata or project data is missing." };
    }
    const fileMetas: {id: string, label: string, useSystem: boolean, fileName?: string}[] = JSON.parse(fileMetasString);
    const projectData: DraftoProject = JSON.parse(projectDataString);
    const isScWp = isScWpFamily(projectData.courtType);

    // Parse settings (with defaults if not provided)
    const rawSettings = settingsString ? JSON.parse(settingsString) : { annexureLabelBackground: false };
    const settings = {
        ...rawSettings,
        annexureLabelSize: (isScWp ? rawSettings.scWpAnnexureLabelSize : undefined) ?? rawSettings.annexureLabelSize ?? 14,
        annexureLabelMarginPt: (isScWp ? rawSettings.scWpAnnexureLabelMarginPt : undefined) ?? rawSettings.annexureLabelMarginPt ?? 14.4,
        annexureLabelBackground: isScWp ? (rawSettings.scWpAnnexureLabelBackground ?? rawSettings.annexureLabelBackground ?? false) : (rawSettings.annexureLabelBackground ?? false),
        pageNumberSizePt: (isScWp ? rawSettings.scWpPageNumberSizePt : undefined) ?? rawSettings.pageNumberSizePt ?? 20,
        pageNumberMarginTopPt: (isScWp ? rawSettings.scWpPageNumberMarginTopPt : undefined) ?? rawSettings.pageNumberMarginTopPt ?? 54,
        pageNumberMarginRightPt: (isScWp ? rawSettings.scWpPageNumberMarginRightPt : undefined) ?? rawSettings.pageNumberMarginRightPt ?? 54,
        volumeSplitThreshold: (isScWp ? rawSettings.scWpVolumeSplitThreshold : undefined) ?? rawSettings.volumeSplitThreshold ?? 400,
        volumeStepSize: (isScWp ? rawSettings.scWpVolumeStepSize : undefined) ?? rawSettings.volumeStepSize ?? 200,
        maxComponentSplitPages: (isScWp ? rawSettings.scWpMaxComponentSplitPages : undefined) ?? rawSettings.maxComponentSplitPages ?? 50,
        minVolumeTailPages: (isScWp ? rawSettings.scWpMinVolumeTailPages : undefined) ?? rawSettings.minVolumeTailPages ?? 20,
        minVolumeHeadPages: (isScWp ? rawSettings.scWpMinVolumeHeadPages : undefined) ?? rawSettings.minVolumeHeadPages ?? 20,
        separateVolumePdfs: (isScWp ? rawSettings.scWpSeparateVolumePdfs : undefined) ?? rawSettings.separateVolumePdfs ?? true,
        aorSignaturePng: isScWp ? (rawSettings.scWpAorSignaturePng || rawSettings.aorSignaturePng) : rawSettings.aorSignaturePng,
        aorSignatureW: isScWp ? (rawSettings.scWpAorSignatureW || rawSettings.aorSignatureW) : rawSettings.aorSignatureW,
        aorSignatureH: isScWp ? (rawSettings.scWpAorSignatureH || rawSettings.aorSignatureH) : rawSettings.aorSignatureH,
        placeSignatureInPaperbook: isScWp ? (rawSettings.scWpPlaceSignatureInPaperbook ?? rawSettings.placeSignatureInPaperbook) : rawSettings.placeSignatureInPaperbook,
        placeTrueCopyText: isScWp ? (rawSettings.scWpPlaceTrueCopyText ?? rawSettings.placeTrueCopyText) : rawSettings.placeTrueCopyText,
        signatureSizePx: (isScWp ? rawSettings.scWpSignatureSizePx : undefined) ?? rawSettings.signatureSizePx ?? 120,
        trueCopyPosition: (isScWp ? rawSettings.scWpTrueCopyPosition : undefined) ?? rawSettings.trueCopyPosition ?? 'left',
        trueCopyBackground: isScWp ? (rawSettings.scWpTrueCopyBackground ?? rawSettings.trueCopyBackground ?? false) : (rawSettings.trueCopyBackground ?? false),
        trueCopyMarginXPt: (isScWp ? rawSettings.scWpTrueCopyMarginXPt : undefined) ?? rawSettings.trueCopyMarginXPt ?? 36,
        trueCopyMarginBottomPt: (isScWp ? rawSettings.scWpTrueCopyMarginBottomPt : undefined) ?? rawSettings.trueCopyMarginBottomPt ?? 36,
    };

    // Determine which optional criminal docs actually have files attached
    const optionalDocIds = new Set<string>();
    for (const id of OPTIONAL_CRIMINAL_DOC_IDS) {
        if (formData.get(id) instanceof File) optionalDocIds.add(id);
    }

    const mergedPdf = await PDFDocument.create();
    const failedDocs: {label: string; reason: string}[] = [];

    // Helper function to generate bookmark text that matches the Index in CI
    const getBookmarkText = (meta: {id: string, label: string}): string | null => {
        // Non-paginated items
        if (meta.id === 'advocateChecklist') return 'Checklist';
        if (meta.id === 'refiling') return 'Refiling Declaration';
        if (meta.id === 'ci') return null; // Cover Page and Index - no bookmark needed
        if (meta.id === 'or') return 'Office Report';
        
        // Paginated items
        if (meta.id === 'lp') return 'Listing Proforma';
        if (meta.id === 'slod') return 'Synopsis and List of Dates';
        
        // Impugned Orders
        if (meta.id.startsWith('impugnedOrder_')) {
            const orderId = meta.id.substring('impugnedOrder_'.length);
            const order = projectData.impugnedOrders?.find(o => o.id === orderId);
            if (order) {
                const courtName = order.court === 'Other' ? order.customCourt : order.court;
                const orderDate = order.date ? format(new Date(order.date), "dd.MM.yyyy") : '[date]';
                const singleIoText = `the Impugned ${order.type || '[Order Type]'}`;
                return `Impugned ${order.type || '[Order Type]'}: True copy of ${singleIoText} dated ${orderDate} passed by the ${courtName || '[Court]'} in ${order.caseNumber || '[Case No.]'}`;
            }
        }
        
        if (meta.id === 'slp') {
            return isScWp
                ? 'Writ Petition under Article 32 of the Constitution of India, with supporting affidavit'
                : mainDocumentParticular(projectData);
        }
        if (meta.id === 'slpAffidavit') return null; // Part of SLP
        
        if (isAppendixComponentId(meta.id)) {
            const items = getActiveAppendixItems(projectData);
            const itemId = appendixItemIdFromComponentId(meta.id);
            const index = items.findIndex(i => i.id === itemId);
            if (index >= 0) return appendixIndexText(items[index], index, items.length);
            return null;
        }
        
        // Annexures
        if (meta.id.startsWith('annexure_')) {
            const match = meta.label.match(/Annexure (P-\d+): (.+)/);
            if (match) {
                const annexureNum = match[1];
                const rest = match[2];
                // The merge label carries only the title and date, so the user's
                // own words for the annexure are added here — the Index has
                // always shown them, the bookmark never did. Not on a typed or
                // translated copy, whose label already ends with "(Typed Copy)".
                if (meta.id.endsWith('_typed')) {
                    return `Annexure ${annexureNum}: ${rest}`;
                }
                const annexId = meta.id.substring('annexure_'.length);
                const annex = (projectData.listOfDates || [])
                    .flatMap(lod => lod.annexures || [])
                    .find(a => a.id === annexId);
                const extra = (annex?.customText || '').trim();
                return `Annexure ${annexureNum}: ${rest}${extra ? ` ${extra}` : ''}`;
            }
        }

        // IA Annexures
        if (meta.id.startsWith('ia_annexure_')) {
            const match = meta.label.match(/Annexure (A-\d+): (.+)/);
            if (match) {
                const annexureNum = match[1];
                const rest = match[2];
                return `Annexure ${annexureNum}: ${rest}`;
            }
        }

        // Certified Copy Receipt
        if (meta.id === 'certified_copy_receipt') {
            const receiptDate = projectData.standardIas?.exemptionCertifiedCopy?.receiptDate;
            const dateText = receiptDate ? ` dated ${format(new Date(receiptDate), 'dd.MM.yyyy')}` : '';
            return `Annexure-A: True copy of the Receipt of application for certified copy${dateText}`;
        }
        
        // IAs
        if (meta.id.startsWith('ia_') && !meta.id.startsWith('ia_affidavit_') && !meta.id.startsWith('ia_annexure_')) {
            const iaId = meta.id.substring(3);
            const ia = (isScWp ? getScWpIaList(projectData) : getIaList(projectData)).find(i => i.id === iaId);
            if (ia) {
                return `${ia.prefix}: ${ia.title}`;
            }
        }
        
        if (meta.id.startsWith('ia_affidavit_')) return null; // Part of IA
        
        if (meta.id === 'custodyCertificate') return 'Custody Certificate';
        if (meta.id === 'proofOfService') return 'Proof of Service';
        if (meta.id === 'firDetails') return 'FIR Details';
        if (meta.id === 'memoOfParties') return 'Memo of Parties';
        if (meta.id === 'filingMemo') return 'Filing Memo';
        if (meta.id === 'vakalatnama') return 'Vakalatnama(s)';
        
        return null;
    };

    // The part of a page a reader actually sees: the CropBox clipped to the
    // MediaBox. Uploaded PDFs — statute extracts and downloaded judgments above
    // all — are frequently cropped, or have a MediaBox that does not start at
    // the origin. Anchoring a stamp to the raw page size then puts it outside
    // the visible area and the page comes back apparently unstamped, which is
    // why an uploaded Appendix carried no page numbers while the rest of the
    // paper-book did.
    const visibleFrame = (page: any) => {
        const media = page.getMediaBox();
        const crop = page.getCropBox();
        const x0 = Math.max(media.x, crop.x);
        const y0 = Math.max(media.y, crop.y);
        const x1 = Math.min(media.x + media.width, crop.x + crop.width);
        const y1 = Math.min(media.y + media.height, crop.y + crop.height);
        // A CropBox that does not overlap the MediaBox at all is malformed;
        // fall back to the MediaBox rather than stamping into nowhere.
        if (!(x1 > x0) || !(y1 > y0)) {
            return { x: media.x, y: media.y, width: media.width, height: media.height };
        }
        return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    };

    // Helper function to add header to first page of annexure
    const addAnnexureHeader = async (pdf: PDFDocument, headerText: string) => {
        if (pdf.getPageCount() === 0) return;

        const firstPage = pdf.getPage(0);
        const { x: frameX, y: frameY, width, height } = visibleFrame(firstPage);
        const rotation = pageRotation(firstPage);
        
        // Load Times New Roman Bold font
        const font = await pdf.embedFont(StandardFonts.TimesRomanBold);
        const fontSize = Math.min(24, Math.max(10, (settings as any).annexureLabelSize ?? 14));
        const textWidth = font.widthOfTextAtSize(headerText, fontSize);

        // Position header proportionally: base margin (user-configurable), scaled with font size
        const topMargin = (settings as any).annexureLabelMarginPt ?? 14.4; // default 0.2 inch = 14.4 points
        
        // Adjust coordinates based on rotation
        let headerX, headerY, rotationAngle;
        
        if (rotation === 180) {
            // Page is rotated 180 degrees - flip coordinates
            headerX = width - ((width - textWidth) / 2);
            headerY = topMargin;
            rotationAngle = 180;
        } else if (rotation === 90) {
            // Page is rotated 90 degrees clockwise
            headerX = topMargin + fontSize;
            headerY = (height + textWidth) / 2;
            rotationAngle = 90;
        } else if (rotation === 270) {
            // Page is rotated 270 degrees (90 counter-clockwise)
            headerX = width - topMargin - fontSize;
            headerY = (height - textWidth) / 2;
            rotationAngle = 270;
        } else {
            // Normal orientation (0 degrees)
            headerX = (width - textWidth) / 2;
            headerY = height - topMargin - fontSize;
            rotationAngle = 0;
        }

        // Shift into the visible frame (a no-op on a page that starts at the
        // origin and is not cropped).
        headerX += frameX;
        headerY += frameY;

        // Draw white background rectangle (all rotation angles)
        if (settings.annexureLabelBackground) {
            const padding = 4;

            if (rotation === 0) {
                // Normal: text flows right, ascent goes up
                firstPage.drawRectangle({
                    x: headerX - padding,
                    y: headerY - padding,
                    width: textWidth + (padding * 2),
                    height: fontSize + (padding * 2),
                    color: rgb(1, 1, 1),
                });
            } else if (rotation === 90) {
                // CCW 90°: text advances downward (−y), ascent goes right (+x)
                // Text spans y: [headerY − textWidth, headerY], x: [headerX, headerX + fontSize]
                firstPage.drawRectangle({
                    x: headerX - padding,
                    y: headerY - textWidth - padding,
                    width: fontSize + (padding * 2),
                    height: textWidth + (padding * 2),
                    color: rgb(1, 1, 1),
                });
            } else if (rotation === 270) {
                // 270° (CW 90°): text advances upward (+y), ascent goes left (−x)
                // Text spans y: [headerY, headerY + textWidth], x: [headerX − fontSize, headerX]
                firstPage.drawRectangle({
                    x: headerX - fontSize - padding,
                    y: headerY - padding,
                    width: fontSize + (padding * 2),
                    height: textWidth + (padding * 2),
                    color: rgb(1, 1, 1),
                });
            } else if (rotation === 180) {
                // 180°: text advances left (−x), ascent goes down (−y)
                // Text spans x: [headerX − textWidth, headerX], y: [headerY − fontSize, headerY]
                firstPage.drawRectangle({
                    x: headerX - textWidth - padding,
                    y: headerY - fontSize - padding,
                    width: textWidth + (padding * 2),
                    height: fontSize + (padding * 2),
                    color: rgb(1, 1, 1),
                });
            }
        }
        
        // Draw text
        firstPage.drawText(headerText, {
            x: headerX,
            y: headerY,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0),
            rotate: degrees(rotationAngle),
        });
    };

    // Stamp the "True Copy" mark (small AoR signature above the words "True Copy")
    // at the visual bottom-left of EVERY page of an annexure PDF. Rotation-aware:
    // anchors are derived from the page's visual frame so the stamp reads correctly
    // regardless of how a scanned annexure is rotated. (Beta feature.)
    const addTrueCopyStamp = async (pdf: PDFDocument) => {
        const s = settings as any;
        if (!s.placeTrueCopyText || !s.aorSignaturePng || !s.aorSignatureW || !s.aorSignatureH) return;
        const pageCount = pdf.getPageCount();
        if (pageCount === 0) return;

        let sigImage;
        try {
            const base64 = String(s.aorSignaturePng).split(',').pop() || '';
            sigImage = await pdf.embedPng(base64ToBuffer(base64));
        } catch {
            return; // not a valid PNG — skip silently
        }
        const font = await pdf.embedFont(StandardFonts.TimesRomanBold);

        const marginX = (s.trueCopyMarginXPt ?? 36);          // horizontal margin (default 0.5 inch)
        const marginBottom = (s.trueCopyMarginBottomPt ?? 36); // bottom margin (default 0.5 inch)
        const fontSize = 9;
        const gap = 3;
        const text = 'True Copy';
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        // "very small": half the configured Filed-by width, converted px -> pt (×0.75)
        const imgW = (s.signatureSizePx ?? 120) * 0.5 * 0.75;
        const imgH = imgW * (s.aorSignatureH / s.aorSignatureW);
        const isCentre = s.trueCopyPosition === 'center';
        const wantsBg = !!s.trueCopyBackground;

        for (let i = 0; i < pageCount; i++) {
            const page = pdf.getPage(i);
            const { x: frameX, y: frameY, width, height } = visibleFrame(page);
            const rotation = pageRotation(page);

            // Visual bottom-left corner (cx,cy) and the visual right/up unit vectors,
            // expressed in unrotated page coordinates.
            let cx, cy, rx, ry, ux, uy;
            if (rotation === 90) {
                cx = width; cy = 0;      rx = 0;  ry = 1;  ux = -1; uy = 0;
            } else if (rotation === 180) {
                cx = width; cy = height; rx = -1; ry = 0;  ux = 0;  uy = -1;
            } else if (rotation === 270) {
                cx = 0;     cy = height; rx = 0;  ry = -1; ux = 1;  uy = 0;
            } else {
                cx = 0;     cy = 0;      rx = 1;  ry = 0;  ux = 0;  uy = 1;
            }
            // Shift into the visible frame (see visibleFrame).
            cx += frameX;
            cy += frameY;

            // Width of the visible page along the visual "right" axis
            const visualWidth = (rotation === 90 || rotation === 270) ? height : width;

            // Offsets along the visual right axis (left edge of each element).
            // Left mode: hug the margin. Centre mode: centre each element on the page.
            const textRightOff = isCentre ? (visualWidth - textWidth) / 2 : marginX;
            const imgRightOff  = isCentre ? (visualWidth - imgW) / 2      : marginX;
            // Offsets along the visual up axis (distance above the bottom edge).
            const textUpOff = marginBottom;                       // text baseline
            const imgUpOff  = marginBottom + fontSize + gap;       // image sits above the text

            // Convert (alongRight, alongUp) in the visual frame to mediabox (x,y).
            const toXY = (aRight: number, aUp: number) => ({
                x: cx + aRight * rx + aUp * ux,
                y: cy + aRight * ry + aUp * uy,
            });

            // White background behind the whole stamp (mirrors annexure label / page number behaviour)
            if (wantsBg) {
                const pad = 3;
                const rOffMin = Math.min(textRightOff, imgRightOff) - pad;
                const rOffMax = Math.max(textRightOff + textWidth, imgRightOff + imgW) + pad;
                const upMin = textUpOff - fontSize * 0.25 - pad;            // just below the baseline
                const upMax = imgUpOff + imgH + pad;                        // top of the image
                const rectAnchor = toXY(rOffMin, upMin);
                page.drawRectangle({
                    x: rectAnchor.x,
                    y: rectAnchor.y,
                    width: rOffMax - rOffMin,
                    height: upMax - upMin,
                    color: rgb(1, 1, 1),
                    rotate: degrees(rotation),
                });
            }

            const textAnchor = toXY(textRightOff, textUpOff);
            const imgAnchor = toXY(imgRightOff, imgUpOff);

            page.drawImage(sigImage, { x: imgAnchor.x, y: imgAnchor.y, width: imgW, height: imgH, rotate: degrees(rotation) });
            page.drawText(text, { x: textAnchor.x, y: textAnchor.y, size: fontSize, font, color: rgb(0, 0, 0), rotate: degrees(rotation) });
        }
    };

    // Helper function to convert number to alphabetical format (B, C, D... Z, AA, AB, etc.)
    const numberToAlphabet = (num: number): string => {
        let result = '';
        let n = num;
        while (n > 0) {
            const remainder = (n - 1) % 26;
            result = String.fromCharCode(65 + remainder) + result;
            n = Math.floor((n - 1) / 26);
        }
        return result;
    };

    // Helper function to parse page range string from Index
    const parsePageRange = (rangeStr: string): { start: number, end: number, isAlphabetical: boolean } | null => {
        if (!rangeStr) return null;
        
        // Check if it's alphabetical (contains letters)
        if (/[A-Z]/i.test(rangeStr)) {
            // Handle alphabetical ranges like "B" or "B-D"
            const parts = rangeStr.split('-').map(s => s.trim());
            if (parts.length === 1) {
                // Single page like "B"
                return { start: parts[0].charCodeAt(0) - 65 + 1, end: parts[0].charCodeAt(0) - 65 + 1, isAlphabetical: true };
            } else if (parts.length === 2) {
                // Range like "B-D"
                return { 
                    start: parts[0].charCodeAt(0) - 65 + 1, 
                    end: parts[1].charCodeAt(0) - 65 + 1, 
                    isAlphabetical: true 
                };
            }
        } else {
            // Handle numeric ranges like "1" or "1-5"
            const parts = rangeStr.split('-').map(s => s.trim());
            if (parts.length === 1) {
                // Single page like "1"
                const num = parseInt(parts[0]);
                return { start: num, end: num, isAlphabetical: false };
            } else if (parts.length === 2) {
                // Range like "1-5"
                return { 
                    start: parseInt(parts[0]), 
                    end: parseInt(parts[1]), 
                    isAlphabetical: false 
                };
            }
        }
        
        return null;
    };

    // Helper function to add numeric page numbers to all pages of a PDF
    const addPageNumbers = async (pdf: PDFDocument, startingPageNumber: number): Promise<number> => {
        const pageCount = pdf.getPageCount();
        if (pageCount === 0) return 0;
        
        // Load Times New Roman Bold font
        const font = await pdf.embedFont(StandardFonts.TimesRomanBold);
        const fontSize = (settings as any).pageNumberSizePt ?? 20;

        // Position: user-configurable distance from top and right (default 0.75 inch)
        const topMargin = (settings as any).pageNumberMarginTopPt ?? 54;
        const rightMargin = (settings as any).pageNumberMarginRightPt ?? 54;

        for (let i = 0; i < pageCount; i++) {
            const page = pdf.getPage(i);
            const { x: frameX, y: frameY, width, height } = visibleFrame(page);
            const rotation = pageRotation(page);
            const pageNumber = startingPageNumber + i;
            const pageText = pageNumber.toString();
            const textWidth = font.widthOfTextAtSize(pageText, fontSize);
            
            // Adjust coordinates based on rotation
            let x, y, rotationAngle;
            
            if (rotation === 180) {
                // Page is rotated 180 degrees
                x = rightMargin;
                y = topMargin;
                rotationAngle = 180;
            } else if (rotation === 90) {
                // Page is rotated 90 degrees clockwise
                x = topMargin + fontSize;
                y = rightMargin + textWidth;
                rotationAngle = 90;
            } else if (rotation === 270) {
                // Page is rotated 270 degrees (90 counter-clockwise)
                x = width - topMargin - fontSize;
                y = height - rightMargin - textWidth;
                rotationAngle = 270;
            } else {
                // Normal orientation (0 degrees)
                x = width - rightMargin - textWidth;
                y = height - topMargin - fontSize;
                rotationAngle = 0;
            }

            // Shift into the visible frame (a no-op on a page that starts at
            // the origin and is not cropped).
            x += frameX;
            y += frameY;

            // Draw white background behind numeric page number
            if (settings.annexureLabelBackground) {
                const padding = 4;
                if (rotation === 0) {
                    page.drawRectangle({ x: x - padding, y: y - padding, width: textWidth + padding * 2, height: fontSize + padding * 2, color: rgb(1, 1, 1) });
                } else if (rotation === 180) {
                    page.drawRectangle({ x: x - textWidth - padding, y: y - fontSize - padding, width: textWidth + padding * 2, height: fontSize + padding * 2, color: rgb(1, 1, 1) });
                } else if (rotation === 90) {
                    page.drawRectangle({ x: x - padding, y: y - textWidth - padding, width: fontSize + padding * 2, height: textWidth + padding * 2, color: rgb(1, 1, 1) });
                } else if (rotation === 270) {
                    page.drawRectangle({ x: x - fontSize - padding, y: y - padding, width: fontSize + padding * 2, height: textWidth + padding * 2, color: rgb(1, 1, 1) });
                }
            }

            page.drawText(pageText, {
                x,
                y,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0),
                rotate: degrees(rotationAngle),
            });
        }
        
        return pageCount; // Return number of pages processed
    };

    // Helper function to add alphabetical page numbers to all pages of a PDF
    const addAlphabeticalPageNumbers = async (pdf: PDFDocument, startingLetterIndex: number): Promise<number> => {
        const pageCount = pdf.getPageCount();
        if (pageCount === 0) return 0;
        
        // Load Times New Roman Bold font
        const font = await pdf.embedFont(StandardFonts.TimesRomanBold);
        const fontSize = (settings as any).pageNumberSizePt ?? 20;

        // Position: user-configurable distance from top and right (default 0.75 inch)
        const topMargin = (settings as any).pageNumberMarginTopPt ?? 54;
        const rightMargin = (settings as any).pageNumberMarginRightPt ?? 54;

        for (let i = 0; i < pageCount; i++) {
            const page = pdf.getPage(i);
            const { x: frameX, y: frameY, width, height } = visibleFrame(page);
            const rotation = pageRotation(page);
            const letterIndex = startingLetterIndex + i;
            const pageText = numberToAlphabet(letterIndex);
            const textWidth = font.widthOfTextAtSize(pageText, fontSize);
            
            // Adjust coordinates based on rotation
            let x, y, rotationAngle;
            
            if (rotation === 180) {
                // Page is rotated 180 degrees
                x = rightMargin;
                y = topMargin;
                rotationAngle = 180;
            } else if (rotation === 90) {
                // Page is rotated 90 degrees clockwise
                x = topMargin + fontSize;
                y = rightMargin + textWidth;
                rotationAngle = 90;
            } else if (rotation === 270) {
                // Page is rotated 270 degrees (90 counter-clockwise)
                x = width - topMargin - fontSize;
                y = height - rightMargin - textWidth;
                rotationAngle = 270;
            } else {
                // Normal orientation (0 degrees)
                x = width - rightMargin - textWidth;
                y = height - topMargin - fontSize;
                rotationAngle = 0;
            }

            // Shift into the visible frame (see visibleFrame).
            x += frameX;
            y += frameY;

            page.drawText(pageText, {
                x,
                y,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0),
                rotate: degrees(rotationAngle),
            });
        }
        
        return pageCount; // Return number of pages processed
    };

    // Helper function to add A-prefixed page numbers (A1, A2, A3...) for Listing Proforma
    const addAPrefixedPageNumbers = async (pdf: PDFDocument): Promise<number> => {
        const pageCount = pdf.getPageCount();
        if (pageCount === 0) return 0;
        
        // Load Times New Roman Bold font
        const font = await pdf.embedFont(StandardFonts.TimesRomanBold);
        const fontSize = (settings as any).pageNumberSizePt ?? 20;

        // Position: user-configurable distance from top and right (default 0.75 inch)
        const topMargin = (settings as any).pageNumberMarginTopPt ?? 54;
        const rightMargin = (settings as any).pageNumberMarginRightPt ?? 54;

        for (let i = 0; i < pageCount; i++) {
            const page = pdf.getPage(i);
            const { x: frameX, y: frameY, width, height } = visibleFrame(page);
            const pageNumber = i + 1; // 1, 2, 3...
            const pageText = `A${pageNumber}`; // A1, A2, A3...
            const textWidth = font.widthOfTextAtSize(pageText, fontSize);

            // Check page rotation and adjust coordinates accordingly (same
            // anchors as the numeric and alphabetical stamps)
            const rotation = pageRotation(page);
            let x = width - rightMargin - textWidth;
            let y = height - topMargin - fontSize;
            let rotationAngle = 0;

            if (rotation === 180) {
                // Page is upside down - flip coordinates and rotate text
                x = rightMargin;
                y = topMargin;
                rotationAngle = 180;
            } else if (rotation === 90) {
                // Page is rotated 90 degrees clockwise
                x = topMargin + fontSize;
                y = rightMargin + textWidth;
                rotationAngle = 90;
            } else if (rotation === 270) {
                // Page is rotated 270 degrees clockwise (90 counter-clockwise)
                x = width - topMargin - fontSize;
                y = height - rightMargin - textWidth;
                rotationAngle = 270;
            }

            // Shift into the visible frame (see visibleFrame).
            x += frameX;
            y += frameY;

            page.drawText(pageText, {
                x,
                y,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0),
                rotate: degrees(rotationAngle),
            });
        }
        
        return pageCount; // Return number of pages processed
    };

    // Track page numbering states
    let numericNumberingStarted = false;
    let currentNumericPage = 1;
    let alphabeticalNumberingStarted = false;
    let currentAlphabeticalIndex = 2; // Start at B (A=1, B=2)

    // Track bookmarks for the outline
    interface BookmarkEntry {
        title: string;
        pageIndex: number;
        isPaginated: boolean;
        startPageNum?: number; // Printed page number (for paginated bookmarks)
        endPageNum?: number;   // Printed page number (for paginated bookmarks)
        isAlphabetical?: boolean; // True if page numbers are alphabetical (A, B, C...)
        isAPrefixed?: boolean;    // True if page numbers are A1, A2, A3… (the Listing Proforma)
    }
    const bookmarks: BookmarkEntry[] = [];

    // Apply a list of BookmarkEntry objects to a PDFDocument (entries already have remapped pageIndex)
    const applyBookmarksToPdf = async (pdf: PDFDocument, entries: BookmarkEntry[]) => {
        if (entries.length === 0) return;
        try {
            const ctx = pdf.context;
            const pdfPages = pdf.getPages();
            const items: PDFRef[] = [];

            for (const bm of entries) {
                if (bm.pageIndex < 0 || bm.pageIndex >= pdfPages.length) continue;
                const pageRef = pdfPages[bm.pageIndex].ref;
                const pageHeight = pdfPages[bm.pageIndex].getHeight();

                let title = bm.title;
                if (bm.isPaginated && bm.startPageNum !== undefined && bm.endPageNum !== undefined) {
                    let suffix: string;
                    if (bm.isAPrefixed) {
                        suffix = bm.startPageNum === bm.endPageNum
                            ? ` [p.A${bm.startPageNum}]`
                            : ` [pp.A${bm.startPageNum}-A${bm.endPageNum}]`;
                    } else if (bm.isAlphabetical) {
                        const s = numberToAlphabet(bm.startPageNum);
                        const e = numberToAlphabet(bm.endPageNum);
                        suffix = s === e ? ` [p.${s}]` : ` [pp.${s}-${e}]`;
                    } else {
                        suffix = bm.startPageNum === bm.endPageNum
                            ? ` [p.${bm.startPageNum}]`
                            : ` [pp.${bm.startPageNum}-${bm.endPageNum}]`;
                    }
                    title = `${bm.title}${suffix}`;
                }

                const d = PDFDict.withContext(ctx);
                d.set(PDFName.of('Title'), PDFString.of(title));
                const dest = PDFArray.withContext(ctx);
                dest.push(pageRef); dest.push(PDFName.of('XYZ'));
                dest.push(PDFNumber.of(0)); dest.push(PDFNumber.of(pageHeight)); dest.push(PDFNumber.of(0));
                d.set(PDFName.of('Dest'), dest);
                items.push(ctx.register(d));
            }

            if (items.length === 0) return;

            for (let i = 0; i < items.length; i++) {
                const d = ctx.lookup(items[i]) as PDFDict;
                if (i > 0) d.set(PDFName.of('Prev'), items[i - 1]);
                if (i < items.length - 1) d.set(PDFName.of('Next'), items[i + 1]);
            }

            const outlines = PDFDict.withContext(ctx);
            outlines.set(PDFName.of('Type'), PDFName.of('Outlines'));
            outlines.set(PDFName.of('First'), items[0]);
            outlines.set(PDFName.of('Last'), items[items.length - 1]);
            outlines.set(PDFName.of('Count'), PDFNumber.of(items.length));
            const outlinesRef = ctx.register(outlines);
            for (const ref of items) { (ctx.lookup(ref) as PDFDict).set(PDFName.of('Parent'), outlinesRef); }
            (ctx.lookup(ctx.trailerInfo.Root) as PDFDict).set(PDFName.of('Outlines'), outlinesRef);
        } catch (e) {
            console.warn('[PDF GEN] Volume bookmark application failed:', e);
        }
    };

    // ===== PASS 1: Generate all documents and count pages =====
    console.log('[PDF GEN] Pass 1: Generating all documents and counting pages...');
    onProgress?.("Analysing the documents…");

    // Store page counts for each document
    interface DocPageInfo {
        id: string;
        pageCount: number;
        shouldCombineWithNext: boolean; // For SLP+Affidavit, IA+Affidavit, Annexure+Typed
    }
    const docPageCounts: Map<string, DocPageInfo> = new Map();
    
    for (const meta of fileMetas) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        onProgress?.(`Preparing ${meta.label || 'documents'}…`);
        try {
            let docxBuffer: Uint8Array | null = null;
            
            if (!meta.useSystem) {
                // User uploaded file - load it
                const userFile: File | null = formData.get(meta.id) as File | null;
                if (userFile) {
                    const fileBuffer = await userFile.arrayBuffer();
                    if (fileBuffer.byteLength > 0) {
                        // Load PDF directly to count pages
                        const pdf = await PDFDocument.load(fileBuffer);
                        // An annexure and its typed/translated copy share one
                        // Index row, so the pair must be counted as one item.
                        // Annexures are always uploads, so this has to be worked
                        // out here as well as on the system-generated path —
                        // omitting it made the Index short by the length of
                        // every translated copy, and shifted everything after it.
                        docPageCounts.set(meta.id, {
                            id: meta.id,
                            pageCount: pdf.getPageCount(),
                            shouldCombineWithNext: pairedWithNext(meta.id, fileMetas),
                        });
                        continue;
                    }
                }
            } else {
                // System-generated document
                const iaIdentifier = meta.id.startsWith('ia_') ? meta.id.substring(3) : '';
                let result;
                
                // Skip CI for now - we'll regenerate it in Pass 2 with page ranges
                if (meta.id === 'ci') {
                    result = isScWp
                        ? await generateScWpCiDocx(projectData, undefined, undefined, optionalDocIds)
                        : await generateCiDocx(projectData, undefined, undefined, optionalDocIds);
                } else if (meta.id === 'or') {
                    result = await generateOrDocx(projectData, true);
                } else if (meta.id === 'cior') {
                    // Legacy support - generate CI only
                    result = isScWp
                        ? await generateScWpCiDocx(projectData, undefined, undefined, optionalDocIds)
                        : await generateCiDocx(projectData, undefined, undefined, optionalDocIds);
                } else if (meta.id === 'refiling') {
                    result = await generateRefilingDocx(projectData, true);
                } else if (isAppendixComponentId(meta.id)) {
                    result = await generateAppendixDocx(projectData, appendixItemIdFromComponentId(meta.id));
                } else {
                    switch (meta.id) {
                        case 'lp': result = await generateLpDocx(projectData, true); break;
                        case 'slod':
                            result = isScWp
                                ? await generateScWpSlodDocx(projectData)
                                : await generateSlodDocx(projectData);
                            break;
                        case 'slp':
                            result = isScWp
                                ? await generateScWpPetitionDocx(projectData, true)
                                : await generateSlpDocx(projectData, true);
                            break;
                        case 'filingMemo':
                            result = isScWp
                                ? await generateScWpFilingMemoDocx(projectData, true)
                                : await generateFilingMemoDocx(projectData, true);
                            break;
                        case 'advocateChecklist': result = await generateAdvocateChecklistDocx(projectData, true); break;
                        default:
                            if (iaIdentifier && !meta.id.startsWith('ia_affidavit_')) {
                                result = isScWp
                                    ? await generateScWpIaDocx(projectData, iaIdentifier, undefined, undefined, true)
                                    : await generateIaDocx(projectData, iaIdentifier, undefined, undefined, true);
                            }
                            break;
                    }
                }
                
                if (result && result.success && result.docx) {
                    docxBuffer = base64ToBuffer(result.docx);
                }
            }
            
            if (docxBuffer) {
                // Convert DOCX to PDF and count pages
                const { pageCount } = await convertDocxToPdf(docxBuffer);
                
                // Determine if this document should be combined with the next one
                let shouldCombine = false;
                if (meta.id === 'slp' || meta.id.startsWith('ia_') && !meta.id.startsWith('ia_affidavit_')) {
                    shouldCombine = true; // SLP and IA will combine with their affidavits
                } else if (meta.id.startsWith('annexure_')) {
                    // The next item may be this annexure's other copy.
                    shouldCombine = pairedWithNext(meta.id, fileMetas);
                }
                
                docPageCounts.set(meta.id, {
                    id: meta.id,
                    pageCount,
                    shouldCombineWithNext: shouldCombine
                });
            }
        } catch (error) {
            console.warn(`[PDF GEN] Pass 1 - Failed to count pages for ${meta.id}:`, error);
            // Continue with other documents
        }
    }
    
    console.log('[PDF GEN] Pass 1 complete. Document page counts:', Array.from(docPageCounts.entries()));
    
    // ===== Calculate Page Ranges for Index =====
    console.log('[PDF GEN] Calculating page ranges for Index...');
    
    // Map from S.No. (Index row number) to page range string
    const indexPageRanges = new Map<number, string>();
    
    // Map from document ID to its Index S.No. (for bookmark page ranges)
    const docIdToIndexSNo = new Map<string, number>();
    
    // S.No. 1-8 are non-paginated (Court Fees, O/R, LP, Cover, Index, Report, Defect, Note)
    // S.No. 9 is Synopsis (needs B-X format)
    // S.No. 10+ are other documents (need numeric ranges)
    
    let sNo = isScWp ? 8 : 9; // Start from Synopsis (Row 8 in SC WP, Row 9 in SLP)
    let currentAlphabetIndex = 2; // B
    let currentNumericPageNum = 1;
    let hasSeenImpugnedOrder = false; // Track when we switch to numeric
    
    for (const meta of fileMetas) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        const pageInfo = docPageCounts.get(meta.id);
        if (!pageInfo) continue;
        
        // Skip certain items that don't get their own Index entry
        if (meta.id === 'advocateChecklist' || meta.id === 'refiling' || meta.id === 'ci' || meta.id === 'or' || meta.id === 'lp') {
            continue; // These are handled separately in CI generation
        }
        
        // Skip items that are combined with previous (affidavits and typed/translated copies)
        if (meta.id === 'slpAffidavit' || meta.id.startsWith('ia_affidavit_') || isSecondOfPair(meta.id, fileMetas)) {
            continue;
        }
        
        // Store the mapping from document ID to S.No.
        docIdToIndexSNo.set(meta.id, sNo);
        
        let totalPages = pageInfo.pageCount;
        
        // Add next item's pages if should combine
        if (pageInfo.shouldCombineWithNext) {
            const currentIndex = fileMetas.findIndex(m => m.id === meta.id);
            if (currentIndex >= 0 && currentIndex < fileMetas.length - 1) {
                const nextMeta = fileMetas[currentIndex + 1];
                const nextPageInfo = docPageCounts.get(nextMeta.id);
                if (nextPageInfo) {
                    totalPages += nextPageInfo.pageCount;
                }
            }
        }
        
        if (meta.id === 'slod') {
            // Synopsis: B-<last letter>
            const lastLetterIndex = currentAlphabetIndex + totalPages - 1;
            // Handle single page case
            if (totalPages === 1) {
                indexPageRanges.set(sNo, `B`);
            } else {
                indexPageRanges.set(sNo, `B-${numberToAlphabet(lastLetterIndex)}`);
            }
            currentAlphabetIndex = lastLetterIndex + 1;
        } else {
            // Check if we've reached numeric start (Impugned Order in SLP, slp in SC WP)
            if (isScWp ? meta.id === 'slp' : meta.id.startsWith('impugnedOrder_')) {
                hasSeenImpugnedOrder = true;
            }
            
            // All documents after Synopsis use numeric ranges (starting from Impugned Order / Writ Petition)
            if (hasSeenImpugnedOrder && totalPages > 0) {
                const endPage = currentNumericPageNum + totalPages - 1;
                // Handle single page case
                if (totalPages === 1) {
                    indexPageRanges.set(sNo, `${currentNumericPageNum}`);
                } else {
                    indexPageRanges.set(sNo, `${currentNumericPageNum}-${endPage}`);
                }
                currentNumericPageNum = endPage + 1;
            }
        }
        
        sNo++;
    }
    
    // Listing Proforma: Row 2 in SC WP, Row 3 in SLP
    const lpPageCount = Math.max(1, docPageCounts.get('lp')?.pageCount ?? 2);
    if (isScWp) {
        indexPageRanges.set(2, lpPageCount === 1 ? 'A1' : `A1-A${lpPageCount}`);
    } else {
        indexPageRanges.set(3, lpPageCount === 1 ? 'A1' : `A1-A${lpPageCount}`);
    }

    console.log('[PDF GEN] Index page ranges calculated:', Array.from(indexPageRanges.entries()));
    
    // ===== Calculate Annexure Page Ranges for List of Dates =====
    console.log('[PDF GEN] Calculating annexure page ranges for List of Dates...');
    
    // Map from annexure ID to its page range in the final PDF
    const annexurePageRanges = new Map<string, {start: number, end: number}>();
    
    // Reset to track page numbers for annexures (both P-annexures and A-annexures)
    let annexurePageNum = 1;
    let trackingAnnexures = false;
    
    for (const meta of fileMetas) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        const pageInfo = docPageCounts.get(meta.id);
        if (!pageInfo) continue;
        
        // Start tracking page numbers when we hit the first Impugned Order (or slp in SC WP)
        if (isScWp ? meta.id === 'slp' : meta.id.startsWith('impugnedOrder_')) {
            trackingAnnexures = true;
        }
        
        if (trackingAnnexures && (meta.id.startsWith('annexure_') || meta.id.startsWith('ia_annexure_'))) {
            // Both copies of an annexure share one entry, keyed on the annexure
            // itself; the copy placed second is folded into the first one's range.
            const baseAnnexureId = annexureBaseId(meta.id);

            if (!isSecondOfPair(meta.id, fileMetas)) {
                let totalPages = pageInfo.pageCount;

                // Add the other copy when it follows immediately.
                if (pairedWithNext(meta.id, fileMetas)) {
                    const partnerId = partnerIdOf(meta.id);
                    const partnerPageInfo = partnerId ? docPageCounts.get(partnerId) : undefined;
                    if (partnerPageInfo) {
                        totalPages += partnerPageInfo.pageCount;
                    }
                }
                
                const startPage = annexurePageNum;
                const endPage = annexurePageNum + totalPages - 1;
                
                annexurePageRanges.set(baseAnnexureId, {
                    start: startPage,
                    end: endPage
                });
                
                annexurePageNum = endPage + 1;
            }
            // The second copy of a pair is already counted above
        } else if (trackingAnnexures && pageInfo.pageCount > 0) {
            // Track pages for non-annexure documents after Impugned Order
            let totalPages = pageInfo.pageCount;
            
            // Add next item's pages if should combine
            if (pageInfo.shouldCombineWithNext) {
                const currentIndex = fileMetas.findIndex(m => m.id === meta.id);
                if (currentIndex >= 0 && currentIndex < fileMetas.length - 1) {
                    const nextMeta = fileMetas[currentIndex + 1];
                    if (!nextMeta.id.startsWith('annexure_')) {
                        const nextPageInfo = docPageCounts.get(nextMeta.id);
                        if (nextPageInfo) {
                            totalPages += nextPageInfo.pageCount;
                        }
                    }
                }
            }
            
            // Skip combined items
            if (!isSecondOfPair(meta.id, fileMetas) && !meta.id.startsWith('ia_affidavit_') && meta.id !== 'slpAffidavit') {
                annexurePageNum += totalPages;
            }
        }
    }
    
    console.log('[PDF GEN] Annexure page ranges calculated:', Array.from(annexurePageRanges.entries()));

    // ===== Volume-splitting detection =====
    const totalNumericPages = currentNumericPageNum - 1;
    const volSplitThreshold  = (settings as any).volumeSplitThreshold  ?? 400;
    const volStepSize        = (settings as any).volumeStepSize        ?? 200;
    const maxCompSplitPages  = (settings as any).maxComponentSplitPages ?? 50;
    const minVolTailPages    = (settings as any).minVolumeTailPages     ?? 20;
    const minVolHeadPages    = (settings as any).minVolumeHeadPages     ?? 20;
    const separateVolumePdfs = (settings as any).separateVolumePdfs    ?? true;

    const numVolumes = calcNumVolumes(totalNumericPages, volSplitThreshold, volStepSize);
    const isVolumeSplitting = numVolumes > 1;

    // Build ordered list of numeric components for split-point calculation
    const numericComponents = buildNumericComponents(fileMetas, docPageCounts, docIdToIndexSNo, isScWp);

    // Calculate split points
    const splitPoints: SplitPoint[] = [];
    if (isVolumeSplitting) {
        for (let v = 1; v < numVolumes; v++) {
            const targetPage = Math.round(v * totalNumericPages / numVolumes) + 1;
            const { page, isIntra, componentId } = findActualSplitPage(targetPage, numericComponents, maxCompSplitPages, minVolTailPages, minVolHeadPages);
            splitPoints.push({ splitNumericPage: page, isIntraComponent: isIntra, componentId, vol1: v, vol2: v + 1 });
        }
    }

    // Build sNo → volume mapping
    const sNoToVolume = new Map<number, number>();
    const splitSNos   = new Map<number, { v1: number; v2: number; splitPage: number }>();

    // Pre-numeric items always in Volume I (up to row 8 in SC WP, row 9 in SLP)
    const firstNumericSno = isScWp ? 9 : 10;
    for (let sno = 1; sno < firstNumericSno; sno++) sNoToVolume.set(sno, 1);

    if (isVolumeSplitting) {
        for (const [sno, rangeStr] of indexPageRanges) {
            if (sno < firstNumericSno) continue;
            const parsed = parsePageRange(rangeStr);
            if (!parsed || parsed.isAlphabetical) { sNoToVolume.set(sno, 1); continue; }

            let startVol = 1;
            for (const sp of splitPoints) {
                if (parsed.start >= sp.splitNumericPage) startVol = sp.vol2;
            }
            let endVol = 1;
            for (const sp of splitPoints) {
                if (parsed.end >= sp.splitNumericPage) endVol = sp.vol2;
            }

            if (startVol === endVol) {
                sNoToVolume.set(sno, startVol);
            } else {
                sNoToVolume.set(sno, startVol);
                // Find the split point that bisects this item
                const bisectSp = splitPoints.find(sp =>
                    sp.splitNumericPage > parsed.start && sp.splitNumericPage <= parsed.end
                );
                if (bisectSp) {
                    splitSNos.set(sno, { v1: startVol, v2: endVol, splitPage: bisectSp.splitNumericPage });
                }
            }
        }
    }

    // Build per-volume page range overrides for split items
    const volumePageRanges = new Map<number, Map<number, string>>();
    for (let v = 1; v <= numVolumes; v++) volumePageRanges.set(v, new Map());

    if (isVolumeSplitting) {
        for (const [sno, splitInfo] of splitSNos) {
            const fullRange = indexPageRanges.get(sno);
            if (!fullRange) continue;
            const parsed = parsePageRange(fullRange);
            if (!parsed || parsed.isAlphabetical) continue;
            volumePageRanges.get(splitInfo.v1)!.set(sno, `${parsed.start}-${splitInfo.splitPage - 1}`);
            volumePageRanges.get(splitInfo.v2)!.set(sno, `${splitInfo.splitPage}-${parsed.end}`);
        }
    }

    // Build the particularsList for volume CI generation (same logic as inside generateCiDocx)
    // We need it ahead of time so we can pass it to generateCiDocx with volumeOptions
    let ciParticularsListForVolume: (string | (TextRun | string)[])[] = [];
    if (isVolumeSplitting) {
        if (isScWp) {
            const _iaList = getScWpIaList(projectData);
            const _pl: (string | (TextRun | string)[])[] = [
                'Court Fees',
                'Listing Proforma',
                'Cover Page of Paper Book',
                'Index of Record of Proceedings',
                'Limitation Report prepared by the Registry',
                'Defect List',
                'Note Sheet',
                'Synopsis and List of Dates',
                'Writ Petition under Article 32 of the Constitution of India, with supporting affidavit',
            ];
            const _appendixItems = getActiveAppendixItems(projectData);
            _appendixItems.forEach((item, index) => {
                _pl.push([
                    smartTextRun({ text: appendixLabel(index, _appendixItems.length), bold: true }),
                    convertToSmartQuotes(`: ${appendixBodyText(item)}`),
                ]);
            });
            const _orderedAnnexures = wpAnnexureOrderFromLods(projectData.listOfDates || []);
            _orderedAnnexures.forEach(({ annex, pNumber }) => {
                _pl.push(createAnnexureText(pNumber, annex, true, annexurePrefix(projectData.courtType)));
            });
            const _allIaAnn: any[] = [];
            (projectData.customIas || []).forEach(cia => cia.grounds?.forEach(g => g.annexures?.forEach(a => _allIaAnn.push({ ...a, iaId: cia.id }))));
            const _iaAnnMap = new Map<string, number>();
            let _ac = 1;
            _allIaAnn.forEach(a => _iaAnnMap.set(a.id, _ac++));
            _iaList.forEach(ia => {
                _pl.push([smartTextRun({ text: ia.prefix, bold: true }), convertToSmartQuotes(`: ${ia.title}`)]);
                _allIaAnn.filter(a => a.iaId === ia.id).forEach(a => { const n = _iaAnnMap.get(a.id); if (n) _pl.push(createIaAnnexureText(n, a, true)); });
            });
            _pl.push('Filing Memo', 'Vakalatnama(s)');
            ciParticularsListForVolume = _pl;
        } else {
            // Temporarily call generateCiDocx without volumeOptions to get the particularsList
            // We reconstruct it here instead to avoid double-generation overhead
            const _iaList = getIaList(projectData);
            const _pl: (string | (TextRun | string)[])[] = [
                'Court Fees', 'O/R on Limitation', 'Listing Proforma',
                'Cover Page of Paper Book', 'Index of Record of Proceedings',
                'Limitation Report prepared by the Registry', 'Defect List', 'Note Sheet',
                'Synopsis and List of Dates',
            ];
            if (projectData.impugnedOrders && projectData.impugnedOrders.length > 0) {
                [...projectData.impugnedOrders].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(order => {
                    const cn = order.court === 'Other' ? order.customCourt : order.court;
                    const od = order.date ? format(new Date(order.date), 'dd.MM.yyyy') : '[date]';
                    _pl.push(`Impugned ${order.type || '[Order Type]'}: True copy of the Impugned ${order.type || '[Order Type]'} dated ${od} passed by the ${cn || '[Court]'} in ${order.caseNumber || '[Case No.]'}`);
                });
            } else {
                _pl.push('Impugned [Order Type]: True copy of [Impugned Order Details]');
            }
            _pl.push(mainDocumentParticular(projectData));
            // Same rows as the Index itself — see generateCiDocx.
            const _appendixItems = getActiveAppendixItems(projectData);
            _appendixItems.forEach((item, index) => {
                _pl.push([
                    smartTextRun({ text: appendixLabel(index, _appendixItems.length), bold: true }),
                    convertToSmartQuotes(`: ${appendixBodyText(item)}`),
                ]);
            });
            const _allAnnexures: Annexure[] = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
            const _nonAd = _allAnnexures.filter(a => !a.isAdditionalDocument);
            const _ad    = _allAnnexures.filter(a => a.isAdditionalDocument);
            const _annexMap = new Map<string, number>();
            let _pc = 1;
            _nonAd.forEach(a => _annexMap.set(a.id, _pc++));
            _ad.forEach(a => _annexMap.set(a.id, _pc++));
            _nonAd.forEach(a => { const n = _annexMap.get(a.id); if (n) _pl.push(createAnnexureText(n, a, true, annexurePrefix(projectData.courtType))); });
            if (_ad.length > 0) {
                const adIa = _iaList.find(ia => ia.id === 'additionalDocuments');
                if (adIa) {
                    _pl.push([smartTextRun({ text: adIa.prefix, bold: true }), convertToSmartQuotes(`: ${adIa.title}`)]);
                    _ad.forEach(a => { const n = _annexMap.get(a.id); if (n) _pl.push(createAnnexureText(n, a, true, annexurePrefix(projectData.courtType))); });
                }
            }
            const _allIaAnn: any[] = [];
            if (projectData.standardIas?.condonationOfDelay?.active)
                projectData.standardIas.condonationOfDelay.grounds?.forEach(g => g.annexures?.forEach(a => _allIaAnn.push({ ...a, iaId: 'condonationOfDelay' })));
            if (projectData.standardIas?.exemptionFromSurrendering?.active)
                projectData.standardIas.exemptionFromSurrendering.grounds?.forEach(g => g.annexures?.forEach(a => _allIaAnn.push({ ...a, iaId: 'exemptionFromSurrendering' })));
            if (projectData.standardIas?.suspensionOfSentence?.active)
                projectData.standardIas.suspensionOfSentence.grounds?.forEach(g => g.annexures?.forEach(a => _allIaAnn.push({ ...a, iaId: 'suspensionOfSentence' })));
            if (projectData.customIas) projectData.customIas.forEach(cia => cia.grounds?.forEach(g => g.annexures?.forEach(a => _allIaAnn.push({ ...a, iaId: cia.id }))));
            const _iaAnnMap = new Map<string, number>();
            let _ac = 1;
            _allIaAnn.forEach(a => _iaAnnMap.set(a.id, _ac++));
            _iaList.filter(ia => ia.id !== 'additionalDocuments').forEach(ia => {
                _pl.push([smartTextRun({ text: ia.prefix, bold: true }), convertToSmartQuotes(`: ${ia.title}`)]);
                _allIaAnn.filter(a => a.iaId === ia.id).forEach(a => { const n = _iaAnnMap.get(a.id); if (n) _pl.push(createIaAnnexureText(n, a, true)); });
                if (ia.id === 'exemptionCertifiedCopy' && projectData.standardIas?.exemptionCertifiedCopy?.hasApplied === 'yes') {
                    const rd = projectData.standardIas.exemptionCertifiedCopy.receiptDate;
                    const dt = rd ? ` dated ${format(new Date(rd), 'dd.MM.yyyy')}` : '';
                    _pl.push([smartTextRun({ text: 'Annexure-A', bold: true }), convertToSmartQuotes(`: True copy of the Receipt of application for certified copy${dt}.`)]);
                }
            });
            if (projectData.caseType === 'Criminal') {
                if (!optionalDocIds || optionalDocIds.has('custodyCertificate')) _pl.push('Custody Certificate');
                if (!optionalDocIds || optionalDocIds.has('firDetails'))         _pl.push('FIR Details');
                if (!optionalDocIds || optionalDocIds.has('proofOfService'))     _pl.push('Proof of Service');
            }
            _pl.push('Memo of Parties', 'Filing Memo', 'Vakalatnama(s)');
            ciParticularsListForVolume = _pl;
        }
    }

    // ===== PASS 2: Main document processing with page ranges =====
    console.log('[PDF GEN] Pass 2: Processing documents with calculated page ranges...');
    onProgress?.(isVolumeSplitting ? "Assembling the paper book (splitting into volumes)…" : "Assembling the paper book…");

    // Track content page indices for volume splitting
    // contentPagesSoFar counts pages added to mergedPdf in this pass (excl. CI in volume mode)
    let contentPagesSoFar = 0;
    const componentMergedPdfStart = new Map<string, number>(); // id → start page index in mergedPdf

    for (const meta of fileMetas) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

        // In volume mode skip CI entirely — we generate volume-specific CIs after this pass
        if (isVolumeSplitting && meta.id === 'ci') continue;

        let pdfToMerge: PDFDocument | null = null;

        try {
            if (!meta.useSystem) {
                let userFile: File | null = formData.get(meta.id) as File | null;
                if(userFile) {
                    const fileBuffer = await userFile.arrayBuffer();
                    if (fileBuffer.byteLength > 0) {
                        pdfToMerge = await PDFDocument.load(fileBuffer);
                    } else {
                        throw new Error("Uploaded file is empty.");
                    }
                } else if (OPTIONAL_CRIMINAL_DOC_IDS.has(meta.id) || meta.id.startsWith('ia_affidavit_')) {
                    // Optional docs the user chose not to attach (Custody Certificate /
                    // FIR Details, and IA affidavits) — skip them rather than failing.
                    continue;
                } else {
                    throw new Error("File not found in form data.");
                }
            } else { // meta.useSystem is true
                let result;
                const iaIdentifier = meta.id.startsWith('ia_') ? meta.id.substring(3) : '';

                switch (meta.id) {
                    case 'ci':
                        // Regenerate CI with calculated page ranges
                        result = isScWp
                            ? await generateScWpCiDocx(projectData, indexPageRanges, undefined, optionalDocIds)
                            : await generateCiDocx(projectData, indexPageRanges, undefined, optionalDocIds);
                        break;
                    case 'or':
                        result = await generateOrDocx(projectData, true);
                        break;
                    case 'cior':
                        // Legacy support - generate CI with page ranges
                        result = isScWp
                            ? await generateScWpCiDocx(projectData, indexPageRanges, undefined, optionalDocIds)
                            : await generateCiDocx(projectData, indexPageRanges, undefined, optionalDocIds);
                        break;
                    case 'refiling': result = await generateRefilingDocx(projectData, true); break;
                    case 'lp': result = await generateLpDocx(projectData, true); break;
                    case 'slod':
                        // Regenerate SLOD with calculated annexure page ranges
                        result = isScWp
                            ? await generateScWpSlodDocx(projectData, annexurePageRanges)
                            : await generateSlodDocx(projectData, annexurePageRanges);
                        break;
                    case 'slp':
                        result = isScWp
                            ? await generateScWpPetitionDocx(projectData, true, annexurePageRanges)
                            : await generateSlpDocx(projectData, true, annexurePageRanges);
                        break;
                    case 'filingMemo':
                        result = isScWp
                            ? await generateScWpFilingMemoDocx(projectData, true)
                            : await generateFilingMemoDocx(projectData, true);
                        break;
                    case 'advocateChecklist': result = await generateAdvocateChecklistDocx(projectData, true); break;
                    default:
                        if (isAppendixComponentId(meta.id)) {
                            result = await generateAppendixDocx(projectData, appendixItemIdFromComponentId(meta.id));
                        } else if (iaIdentifier && !meta.id.startsWith('ia_affidavit_')) {
                            result = isScWp
                                ? await generateScWpIaDocx(projectData, iaIdentifier, undefined, annexurePageRanges, true)
                                : await generateIaDocx(projectData, iaIdentifier, undefined, annexurePageRanges, true);
                        }
                        break;
                }

                if (result && result.success && result.docx) {
                    // Convert DOCX to PDF via Electron IPC
                    try {
                        const docxBuffer = Uint8Array.from(atob(result.docx), c => c.charCodeAt(0));
                        const { pdf } = await convertDocxToPdf(docxBuffer);
                        pdfToMerge = pdf;
                        console.log(`[PDF GEN] ${meta.id} converted successfully`);
                    } catch (conversionError) {
                        console.error(`[PDF GEN] Error for ${meta.id}:`, conversionError);
                        throw new Error(`PDF conversion failed: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}.`);
                    }
                } else {
                    throw new Error('DOCX generation failed.');
                }
            }

            if (pdfToMerge) {
                // Check if this is the Synopsis to start alphabetical numbering
                if (meta.id === 'slod' && !alphabeticalNumberingStarted) {
                    alphabeticalNumberingStarted = true;
                }
                
                // Check if this is the first Impugned Order (or slp in SC WP) to switch to numeric numbering
                const isNumericStart = isScWp ? meta.id === 'slp' : meta.id.startsWith('impugnedOrder_');
                if (isNumericStart && !numericNumberingStarted) {
                    numericNumberingStarted = true;
                    alphabeticalNumberingStarted = false; // Stop alphabetical numbering
                    currentNumericPage = 1;
                }
                
                // Add appropriate page numbers based on current state
                if (meta.id === 'lp') {
                    // Special handling for Listing Proforma: Add A1, A2, A3... page numbers
                    await addAPrefixedPageNumbers(pdfToMerge);
                } else if (numericNumberingStarted) {
                    // Numeric numbering (1, 2, 3...)
                    const pagesAdded = await addPageNumbers(pdfToMerge, currentNumericPage);
                    currentNumericPage += pagesAdded;
                } else if (alphabeticalNumberingStarted) {
                    // Alphabetical numbering (B, C, D...)
                    const pagesAdded = await addAlphabeticalPageNumbers(pdfToMerge, currentAlphabeticalIndex);
                    currentAlphabeticalIndex += pagesAdded;
                }
                // else: No numbering (before Synopsis)
                
                // Check if this is an annexure and add header if needed
                if (meta.id.startsWith('annexure_')) {
                    let headerText = '';
                    
                    // Check if this is a typed or translated copy
                    if (meta.id.endsWith('_typed')) {
                        // Extract the annexure number from the label
                        // Label format: "Annexure P-X: Title (Typed Copy)" or "(Translated Copy)"
                        const match = meta.label.match(/Annexure (P-\d+).*\((Typed|Translated) Copy\)/);
                        if (match) {
                            const annexureNum = match[1]; // e.g., "P-1"
                            const copyType = match[2]; // "Typed" or "Translated"
                            headerText = `${copyType} Copy of Annexure ${annexureNum}`;
                        }
                    } else {
                        // Regular annexure
                        // Label format: "Annexure P-X: Title"
                        const match = meta.label.match(/Annexure (P-\d+)/);
                        if (match) {
                            headerText = `Annexure ${match[1]}`;
                        }
                    }
                    
                    if (headerText) {
                        await addAnnexureHeader(pdfToMerge, headerText);
                    }
                }

                // Check if this is an IA annexure and add header if needed
                if (meta.id.startsWith('ia_annexure_')) {
                    // Label format: "Annexure A-X: Title"
                    const match = meta.label.match(/Annexure (A-\d+)/);
                    if (match) {
                        const headerText = `Annexure ${match[1]}`;
                        await addAnnexureHeader(pdfToMerge, headerText);
                    }
                }

                // Each Appendix document carries its own label on its first page —
                // "Appendix" on its own when there is only one, "Appendix-A",
                // "Appendix-B" … when there are several, matching its Index row.
                // No True Copy stamp: an Appendix is not a copy of a record.
                // (A typed-out Appendix already prints that heading as text, so
                // only uploaded PDFs are stamped.)
                if (isAppendixComponentId(meta.id) && !meta.useSystem) {
                    const items = getActiveAppendixItems(projectData);
                    const itemId = appendixItemIdFromComponentId(meta.id);
                    const index = items.findIndex(i => i.id === itemId);
                    if (index >= 0) {
                        await addAnnexureHeader(pdfToMerge, appendixLabel(index, items.length));
                    }
                }

                // Check if this is the certified copy receipt and add header
                if (meta.id === 'certified_copy_receipt') {
                    await addAnnexureHeader(pdfToMerge, 'Annexure-A');
                }

                // Stamp "True Copy" + small AoR signature on every annexure page (Beta)
                if (meta.id.startsWith('annexure_') || meta.id.startsWith('ia_annexure_') || meta.id === 'certified_copy_receipt') {
                    await addTrueCopyStamp(pdfToMerge);
                }

                const totalPagesBefore = mergedPdf.getPageCount();
                componentMergedPdfStart.set(meta.id, totalPagesBefore);
                const copiedPages = await mergedPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
                contentPagesSoFar = mergedPdf.getPageCount();
                
                // Add bookmarks
                if (copiedPages.length > 0) {
                    const bookmarkText = getBookmarkText(meta);
                    
                    // Special handling for CI: Add Cover Page and Index as separate bookmarks
                    if (meta.id === 'ci' && copiedPages.length >= 2) {
                        // Cover page, then the (blank) Index of Record of
                        // Proceedings, then the Index itself.
                        bookmarks.push({
                            title: 'Cover Page',
                            pageIndex: totalPagesBefore,
                            isPaginated: false
                        });
                        bookmarks.push({
                            title: 'Record of Proceedings',
                            pageIndex: totalPagesBefore + 1,
                            isPaginated: false
                        });
                        bookmarks.push({
                            title: 'Index',
                            pageIndex: totalPagesBefore + 2,
                            isPaginated: false
                        });
                    } else if (meta.id === 'or') {
                        // Office Report always has page A (fixed)
                        bookmarks.push({
                            title: 'Office Report',
                            pageIndex: totalPagesBefore,
                            isPaginated: true,
                            startPageNum: 1, // A = 1
                            endPageNum: 1,   // A = 1 (single page)
                            isAlphabetical: true
                        });
                    } else if (meta.id === 'cior' && copiedPages.length >= 2) {
                        // Legacy CIOR support (combined file)
                        bookmarks.push({
                            title: 'Cover Page',
                            pageIndex: totalPagesBefore,
                            isPaginated: false
                        });
                        bookmarks.push({
                            title: 'Record of Proceedings',
                            pageIndex: totalPagesBefore + 1,
                            isPaginated: false
                        });
                        bookmarks.push({
                            title: 'Index',
                            pageIndex: totalPagesBefore + 2,
                            isPaginated: false
                        });
                        // Office Report starts on the next page after Index
                        if (copiedPages.length >= 4) {
                            // Office Report always has page A (fixed)
                            bookmarks.push({
                                title: 'Office Report',
                                pageIndex: totalPagesBefore + 3,
                                isPaginated: true,
                                startPageNum: 1, // A = 1
                                endPageNum: 1,   // A = 1 (single page)
                                isAlphabetical: true
                            });
                        }
                    } else if (bookmarkText) {
                        // Look up this document's S.No. in the Index
                        const sNo = docIdToIndexSNo.get(meta.id);
                        
                        // Determine if this bookmark should be paginated
                        const isPaginated = numericNumberingStarted || alphabeticalNumberingStarted;
                        
                        let startPageNum: number | undefined;
                        let endPageNum: number | undefined;
                        let isAlphabetical = false;
                        let isAPrefixed = false;
                        
                        // Special handling for specific documents
                        if (meta.id === 'lp') {
                            // Listing Proforma: A1 to however many pages it runs
                            // to. Its pages are stamped A1, A2, A3… so the
                            // bookmark reads the same way — it used to say
                            // "pp.A-B", numbering them like the Synopsis.
                            startPageNum = 1;
                            endPageNum = Math.max(1, docPageCounts.get('lp')?.pageCount ?? 2);
                            isAPrefixed = true;
                        } else if (meta.id === 'slod') {
                            // Synopsis and List of Dates: Use Index S.No. 8 (SC WP) or 9 (SLP) range (B-X)
                            const synopsisRange = indexPageRanges.get(isScWp ? 8 : 9);
                            if (synopsisRange) {
                                const parsed = parsePageRange(synopsisRange);
                                if (parsed) {
                                    startPageNum = parsed.start;
                                    endPageNum = parsed.end;
                                    isAlphabetical = parsed.isAlphabetical;
                                }
                            }
                        } else if (isPaginated && sNo !== undefined) {
                            // Use the page range from Index calculation
                            const rangeStr = indexPageRanges.get(sNo);
                            if (rangeStr) {
                                const parsed = parsePageRange(rangeStr);
                                if (parsed) {
                                    startPageNum = parsed.start;
                                    endPageNum = parsed.end;
                                    isAlphabetical = parsed.isAlphabetical;
                                }
                            }
                        }
                        
                        bookmarks.push({
                            title: bookmarkText,
                            pageIndex: totalPagesBefore,
                            isPaginated: isPaginated,
                            startPageNum,
                            endPageNum,
                            isAlphabetical,
                            isAPrefixed
                        });
                    }
                }
            } else {
                throw new Error("PDF document to merge was null.");
            }
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            failedDocs.push({ label: meta.label, reason });
        }
    }
    
    if (failedDocs.length > 0) {
        const errorList = failedDocs.map(f => `- ${f.label}: ${f.reason}`).join('\n');
        return { 
            success: false, 
            message: `Could not generate the full PDF because the following documents failed:\n${errorList}`
        };
    }
    
    if (mergedPdf.getPageCount() === 0) {
        return { success: false, message: "No PDF files were provided or generated to merge." };
    }

    // Create PDF Outline (Bookmarks)
    if (bookmarks.length > 0) {
        try {
            const context = mergedPdf.context;
            const pages = mergedPdf.getPages();
            
            // Create outline items (bookmarks)
            const outlineItems: PDFRef[] = [];
            
            for (let i = 0; i < bookmarks.length; i++) {
                const bookmark = bookmarks[i];
                const pageRef = pages[bookmark.pageIndex].ref;
                const pageHeight = pages[bookmark.pageIndex].getHeight();
                
                // Generate bookmark title with page numbers for paginated items
                let bookmarkTitle = bookmark.title;
                if (bookmark.isPaginated && bookmark.startPageNum !== undefined && bookmark.endPageNum !== undefined) {
                    // Format page range
                    let pageRangeSuffix: string;

                    if (bookmark.isAPrefixed) {
                        // A1, A2, A3… (the Listing Proforma)
                        pageRangeSuffix = bookmark.startPageNum === bookmark.endPageNum
                            ? ` [p.A${bookmark.startPageNum}]`
                            : ` [pp.A${bookmark.startPageNum}-A${bookmark.endPageNum}]`;
                    } else if (bookmark.isAlphabetical) {
                        // Convert numbers to letters (1=A, 2=B, 3=C, etc.)
                        const startLetter = numberToAlphabet(bookmark.startPageNum);
                        const endLetter = numberToAlphabet(bookmark.endPageNum);
                        
                        if (bookmark.startPageNum === bookmark.endPageNum) {
                            // Single page
                            pageRangeSuffix = ` [p.${startLetter}]`;
                        } else {
                            // Page range
                            pageRangeSuffix = ` [pp.${startLetter}-${endLetter}]`;
                        }
                    } else {
                        // Numeric page numbers
                        if (bookmark.startPageNum === bookmark.endPageNum) {
                            // Single page
                            pageRangeSuffix = ` [p.${bookmark.startPageNum}]`;
                        } else {
                            // Page range
                            pageRangeSuffix = ` [pp.${bookmark.startPageNum}-${bookmark.endPageNum}]`;
                        }
                    }
                    
                    bookmarkTitle = `${bookmark.title}${pageRangeSuffix}`;
                }
                
                const outlineDict = PDFDict.withContext(context);
                outlineDict.set(PDFName.of('Title'), PDFString.of(bookmarkTitle));
                
                // Create destination array
                const destArray = PDFArray.withContext(context);
                destArray.push(pageRef);
                destArray.push(PDFName.of('XYZ'));
                destArray.push(PDFNumber.of(0));
                destArray.push(PDFNumber.of(pageHeight));
                destArray.push(PDFNumber.of(0));
                
                outlineDict.set(PDFName.of('Dest'), destArray);
                
                const ref = context.register(outlineDict);
                outlineItems.push(ref);
            }
            
            // Set Prev and Next references
            for (let i = 0; i < outlineItems.length; i++) {
                const itemDict = context.lookup(outlineItems[i]) as PDFDict;
                
                if (i > 0) {
                    itemDict.set(PDFName.of('Prev'), outlineItems[i - 1]);
                }
                if (i < outlineItems.length - 1) {
                    itemDict.set(PDFName.of('Next'), outlineItems[i + 1]);
                }
            }
            
            // Create the Outlines dictionary (root of the outline tree)
            const outlinesDict = PDFDict.withContext(context);
            outlinesDict.set(PDFName.of('Type'), PDFName.of('Outlines'));
            outlinesDict.set(PDFName.of('First'), outlineItems[0]);
            outlinesDict.set(PDFName.of('Last'), outlineItems[outlineItems.length - 1]);
            outlinesDict.set(PDFName.of('Count'), PDFNumber.of(bookmarks.length));
            
            const outlinesRef = context.register(outlinesDict);
            
            // Set Parent reference for all outline items
            for (const itemRef of outlineItems) {
                const itemDict = context.lookup(itemRef) as PDFDict;
                itemDict.set(PDFName.of('Parent'), outlinesRef);
            }
            
            // Add Outlines to the catalog
            const catalog = context.lookup(context.trailerInfo.Root) as PDFDict;
            catalog.set(PDFName.of('Outlines'), outlinesRef);
        } catch (bookmarkError) {
            console.warn('[PDF GEN] Failed to create bookmarks:', bookmarkError);
            // Continue without bookmarks rather than failing
        }
    }

    // ===== Volume splitting: assemble per-volume PDFs =====
    if (isVolumeSplitting) {
        // Helper: convert PDF document to base64
        const pdfToBase64 = async (pdf: PDFDocument): Promise<string> => {
            const bytes = await pdf.save();
            let b = '';
            for (let i = 0; i < bytes.byteLength; i++) b += String.fromCharCode(bytes[i]);
            return btoa(b);
        };

        // Helper: add a continuation label at bottom-right of a page
        const addContinuationLabel = async (pdf: PDFDocument, pageIndex: number, text: string) => {
            if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) return;
            const page = pdf.getPage(pageIndex);
            const { width, height } = page.getSize();
            const font = await pdf.embedFont(StandardFonts.TimesRomanBold);
            const fontSize = 16;
            const textWidth = font.widthOfTextAtSize(text, fontSize);
            const margin = 40;
            page.drawText(text, {
                x: width - margin - textWidth,
                y: margin,
                size: fontSize,
                font,
                color: rgb(0, 0, 0),
            });
        };

        // Determine the PDF page index of the first numeric page
        // (everything before the first impugned order/Writ Petition in mergedPdf in volume mode)
        let preNumericPageCount = 0;
        for (const meta of fileMetas) {
            if (meta.id === 'ci') continue;
            if (isScWp ? meta.id === 'slp' : meta.id.startsWith('impugnedOrder_')) break;
            const info = docPageCounts.get(meta.id);
            if (info) preNumericPageCount += info.pageCount;
        }

        // Split points as PDF page indices in mergedPdf (which excludes CI in volume mode)
        const splitPdfIndices = splitPoints.map(sp => preNumericPageCount + sp.splitNumericPage - 1);

        // Add continuation labels for intra-component splits
        for (let i = 0; i < splitPoints.length; i++) {
            const sp = splitPoints[i];
            if (!sp.isIntraComponent) continue;
            const splitPdfIdx = splitPdfIndices[i];
            const nextVolRoman = toRomanNumeral(sp.vol2);
            const prevVolRoman = toRomanNumeral(sp.vol1);
            await addContinuationLabel(mergedPdf, splitPdfIdx - 1, `Continued in Volume ${nextVolRoman}...`);
            await addContinuationLabel(mergedPdf, splitPdfIdx,     `...Continued from Volume ${prevVolRoman}`);
        }

        // Assemble volume boundaries [start, end) as PDF page indices in mergedPdf
        const volumeBoundaries: { start: number; end: number }[] = [];
        for (let v = 1; v <= numVolumes; v++) {
            const start = v === 1 ? 0 : splitPdfIndices[v - 2];
            const end   = v === numVolumes ? mergedPdf.getPageCount() : splitPdfIndices[v - 1];
            volumeBoundaries.push({ start, end });
        }

        // Generate each volume
        // volumeResults carries the bookmark entries so consolidation can remap them
        const volumeResults: { pdf: string; volumeNum: number; label: string; bookmarkEntries: BookmarkEntry[] }[] = [];
        const voBase: Omit<CiVolumeOptions, 'volumeNum'> = {
            totalVolumes: numVolumes,
            particularsList: ciParticularsListForVolume,
            sNoToVolume,
            splitSNos,
            pageRanges: indexPageRanges,
            volumePageRanges,
        };

        // Checklist page count — the checklist is always first in fileMetas and in mergedPdf (volume mode)
        const checklistPageCount = docPageCounts.get('advocateChecklist')?.pageCount ?? 0;

        for (let v = 1; v <= numVolumes; v++) {
            const { start, end } = volumeBoundaries[v - 1];

            // Generate CI for this volume
            const ciResult = isScWp
                ? await generateScWpCiDocx(projectData, indexPageRanges, { ...voBase, volumeNum: v }, optionalDocIds)
                : await generateCiDocx(projectData, indexPageRanges, { ...voBase, volumeNum: v }, optionalDocIds);
            if (!ciResult.success || !ciResult.docx) {
                return { success: false, message: `Failed to generate CI for Volume ${v}` };
            }
            const ciDocxBuffer = base64ToBuffer(ciResult.docx);
            const { pdf: ciPdf } = await convertDocxToPdf(ciDocxBuffer);
            const ciPageCount = ciPdf.getPageCount();

            // ── Assemble volPdf in the correct order ─────────────────────────
            // Correct page order: Checklist → CI → rest of content
            // In mergedPdf (volume mode, CI skipped), the layout is:
            //   [checklistPages][OR][LP][SLOD][numeric content…]
            // For Volume I we prepend the checklist *before* the CI.
            // For Volume II+, there is no checklist section.
            const volPdf = await PDFDocument.create();

            const contentStart = v === 1 ? 0   : start;  // full range incl. checklist for Vol I
            const contentEnd   = end;

            if (v === 1 && checklistPageCount > 0) {
                // 1. Checklist (before CI)
                const clPages = await volPdf.copyPages(mergedPdf, Array.from({ length: checklistPageCount }, (_, i) => i));
                clPages.forEach(p => volPdf.addPage(p));
            }

            // 2. CI
            const ciPages = await volPdf.copyPages(ciPdf, ciPdf.getPageIndices());
            ciPages.forEach(p => volPdf.addPage(p));

            // 3. Rest of content (skip the checklist block for Volume I — already added above)
            const restStart = v === 1 ? checklistPageCount : start;
            if (contentEnd > restStart) {
                const restIndices = Array.from({ length: contentEnd - restStart }, (_, i) => restStart + i);
                const restPages = await volPdf.copyPages(mergedPdf, restIndices);
                restPages.forEach(p => volPdf.addPage(p));
            }
            // ─────────────────────────────────────────────────────────────────

            // ── Bookmarks ────────────────────────────────────────────────────
            // Page offsets in volPdf:
            //   Vol I:   [0..clCount-1] = Checklist
            //            [clCount..clCount+ciCount-1] = CI
            //            [clCount+ciCount..] = rest of content (OR, LP, SLOD, numeric…)
            //   Vol II+: [0..ciCount-1] = CI
            //            [ciCount..] = numeric content
            const ciStartInVol = v === 1 ? checklistPageCount : 0;

            const volBookmarkEntries: BookmarkEntry[] = [];

            // Checklist bookmark (Volume I only) — stays at position 0
            if (v === 1) {
                for (const bm of bookmarks) {
                    if (bm.pageIndex < checklistPageCount) {
                        volBookmarkEntries.push({ ...bm }); // pageIndex unchanged
                    }
                }
            }

            // CI bookmarks
            // Volume I: cover page, the blank Index of Record of Proceedings,
            // the Master Index, then Volume I's own index. Volume II onwards
            // have no record of proceedings, so their index follows the cover.
            volBookmarkEntries.push({ title: 'Cover Page', pageIndex: ciStartInVol, isPaginated: false });
            const ropPages = v === 1 ? 1 : 0;
            if (ropPages) {
                volBookmarkEntries.push({ title: 'Record of Proceedings', pageIndex: ciStartInVol + 1, isPaginated: false });
            }
            if (ciPageCount >= 2 + ropPages) {
                const idxTitle = v === 1 ? 'Master Index' : `Index – Volume ${toRomanNumeral(v)}`;
                volBookmarkEntries.push({ title: idxTitle, pageIndex: ciStartInVol + 1 + ropPages, isPaginated: false });
            }
            if (v === 1 && ciPageCount >= 3 + ropPages) {
                volBookmarkEntries.push({ title: `Index – Volume ${toRomanNumeral(1)}`, pageIndex: ciStartInVol + 2 + ropPages, isPaginated: false });
            }

            // Content bookmarks (non-checklist): remap mergedPdf index P → volPdf index
            //   Vol I:  ciStartInVol + ciPageCount + (P - checklistPageCount)  [for P >= checklistPageCount]
            //   Vol II+: ciPageCount + (P - start)
            for (const bm of bookmarks) {
                if (v === 1 && bm.pageIndex < checklistPageCount) continue; // already handled above
                if (bm.pageIndex >= contentStart && bm.pageIndex < contentEnd) {
                    const remappedIdx = ciStartInVol + ciPageCount + (bm.pageIndex - restStart);
                    volBookmarkEntries.push({ ...bm, pageIndex: remappedIdx });
                }
            }

            await applyBookmarksToPdf(volPdf, volBookmarkEntries);
            // ─────────────────────────────────────────────────────────────────

            const label = `Volume ${toRomanNumeral(v)}`;
            const volBase64 = await pdfToBase64(volPdf);
            volumeResults.push({ pdf: volBase64, volumeNum: v, label, bookmarkEntries: volBookmarkEntries });
        }

        // If consolidated: merge all volumes and carry the full detailed bookmarks
        if (!separateVolumePdfs) {
            const consolidated = await PDFDocument.create();
            const allEntries: BookmarkEntry[] = [];

            for (const vr of volumeResults) {
                const vPdf = await PDFDocument.load(Uint8Array.from(atob(vr.pdf), c => c.charCodeAt(0)));
                const startIdx = consolidated.getPageCount();

                // For Vol II+, add a "VOLUME X" section-header bookmark before the per-volume entries
                if (vr.volumeNum > 1) {
                    allEntries.push({ title: `VOLUME ${toRomanNumeral(vr.volumeNum)}`, pageIndex: startIdx, isPaginated: false });
                }

                // Remap all per-volume bookmarks into the consolidated page space
                for (const bm of vr.bookmarkEntries) {
                    allEntries.push({ ...bm, pageIndex: startIdx + bm.pageIndex });
                }

                const pages = await consolidated.copyPages(vPdf, vPdf.getPageIndices());
                pages.forEach(p => consolidated.addPage(p));
            }

            await applyBookmarksToPdf(consolidated, allEntries);
            const consolidatedBase64 = await pdfToBase64(consolidated);
            return { success: true, pdf: consolidatedBase64, volumes: undefined, annexureFirstPages: firstPagesOf(annexurePageRanges) };
        }

        return { success: true, volumes: volumeResults.map(({ bookmarkEntries: _, ...rest }) => rest), annexureFirstPages: firstPagesOf(annexurePageRanges) };
    }

    const pdfBytes = await mergedPdf.save();
    // Convert Uint8Array to base64 without Buffer (browser-safe)
    let binary = '';
    for (let i = 0; i < pdfBytes.byteLength; i++) binary += String.fromCharCode(pdfBytes[i]);
    const pdfBase64 = btoa(binary);

    return { success: true, pdf: pdfBase64, annexureFirstPages: firstPagesOf(annexurePageRanges) };
}

// Annexure-id → first paper-book page, for the quick briefing note.
function firstPagesOf(ranges: Map<string, { start: number; end: number }>): Record<string, number> {
    const out: Record<string, number> = {};
    ranges.forEach((v, k) => { out[k] = v.start; });
    return out;
}

    

import { format } from "date-fns";
import type { DraftoProject, Annexure } from "./schema";
import { isAppeal } from "./court-family";
import { annexureRowsOf } from "./wp/facts-mode";
import { getIaList } from "./ia-list-utils";
import { getScWpIaList } from "./sc-wp/sc-wp-actions";

/**
 * Truncates an annexure title to a short, readable phrase (~30-35 characters max).
 * Strips verbose prefixes ("True copy of", leading "the") and capitalizes the first character.
 */
export function shortAnnexureTitle(raw: string): string {
  let s = (raw || "").trim();
  // Strip common verbose prefixes
  s = s.replace(/^(?:true\s+copy\s+of(?:\s+the)?|copy\s+of(?:\s+the)?|photocopy\s+of(?:\s+the)?)\s+/i, "");
  // Strip leading "the" (case-insensitive)
  s = s.replace(/^the\s+/i, "").trim();
  s = s.replace(/\.+$/, "").trim();
  if (s) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (s.length > 35) {
    const words = s.split(/\s+/).slice(0, 5).join(" ");
    s = words.length < s.length ? `${words}…` : words;
    if (s.length > 38) s = s.slice(0, 35).trim() + "…";
  }
  return s || "Document";
}

/**
 * Inspects a compiled SLoD PDF's text page-by-page to find the 0-based page index
 * where the "LIST OF DATES" section actually begins. Returns -1 if not found.
 * Uses lazy dynamic import so pdfjs-dist never interferes with app startup or React context.
 */
export async function findLodPageOffset(pdfBytes: Uint8Array): Promise<number> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.js");
    const workerUrl = await import("pdfjs-dist/legacy/build/pdf.worker.min.js?url");
    if (pdfjsLib?.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.default || workerUrl;
    }
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdf = await loadingTask.promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((it: any) => it.str || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (/LIST\s+OF\s+DATES/i.test(pageText)) {
        return i - 1; // 0-based offset
      }
    }
  } catch (err) {
    console.warn("findLodPageOffset with dynamic pdfjs failed:", err);
  }
  return -1;
}

/**
 * Maps standard Supreme Court & High Court IAs to concise abbreviations.
 */
export function shortIaTitle(iaId: string, fullTitle?: string): string {
  switch (iaId) {
    case "exemptionCertifiedCopy":
      return "IA-CC";
    case "additionalDocuments":
      return "IA-AD";
    case "stayGrounds":
    case "exemptionCustodyCertificate":
      return "IA-Stay";
    case "condonationOfDelay":
      return "IA-Delay";
    case "condonationOfDelayInRefiling":
      return "IA-Delay Refiling";
    case "permissionToAppeal":
    case "permissionToFileSlp":
      return "IA-Permission to File";
    case "exemptionFromSurrendering":
      return "IA-Surrender";
    case "exemptionOfficialTranslation":
      return "IA-OT";
    default: {
      if (fullTitle) {
        let t = fullTitle
          .replace(/^(?:application\s+for|application\s+seeking|application\s+under|an\s+application\s+for|an\s+application\s+seeking)\s+/i, "")
          .trim();
        const words = t.split(/\s+/).slice(0, 4).join(" ");
        return `IA: ${words}`;
      }
      return "IA";
    }
  }
}

/**
 * Formats a date value (Date, ISO string, or formatted string) to dd.MM.yyyy.
 */
export function toDisplayDate(val: any): string {
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

/**
 * Generates a concise bookmark title for the Hearing / Short-Bookmarks copy.
 * Returns null if the item should be excluded from short bookmarks (e.g. front matter, affidavits).
 */
export function getShortBookmarkTitle(
  meta: { id: string; label: string },
  projectData: DraftoProject,
  pageDisplay?: string | number
): string | null {
  const atPage = pageDisplay !== undefined && pageDisplay !== "" ? ` @${pageDisplay}` : "";

  // Synopsis is handled separately to allow splitting into Synopsis @B and List of Dates @D
  if (meta.id === "slod") {
    return `Synopsis${atPage}`;
  }

  // Impugned Orders: Date Impugned @Page
  if (meta.id.startsWith("impugnedOrder_")) {
    const orderId = meta.id.substring("impugnedOrder_".length);
    const order = projectData.impugnedOrders?.find((o) => o.id === orderId);
    const d = toDisplayDate(order?.date);
    const datePrefix = d ? `${d} ` : "";
    return `${datePrefix}Impugned${atPage}`;
  }

  // Main Petition
  if (meta.id === "slp") {
    let name = "SLP";
    if (isAppeal(projectData.courtType)) name = "Appeal";
    else if (projectData.courtType === "WritPetitionSC" || projectData.courtType === "WritPetitionDHC") name = "Writ Petition";
    else if (projectData.courtType === "WritPetitionPIL") name = "Writ Petition (PIL)";
    else if (projectData.courtType === "OriginalApplicationCAT") name = "OA";
    return `${name}${atPage}`;
  }

  // Annexures: Date Description @Page (or Date Description (Typed) @Page)
  if (meta.id.startsWith("annexure_")) {
    const isTyped = meta.id.endsWith("_typed");
    const annexId = isTyped ? meta.id.slice("annexure_".length, -"_typed".length) : meta.id.slice("annexure_".length);
    const annex = annexureRowsOf(projectData)
      .flatMap((lod) => lod.annexures || [])
      .find((a) => a.id === annexId);

    const d = toDisplayDate(annex?.date);
    const datePrefix = d ? `${d} ` : "";
    const shortDesc = shortAnnexureTitle(annex?.title || annex?.description || annex?.customText || "");
    const typedSuffix = isTyped ? " (Typed)" : "";
    return `${datePrefix}${shortDesc}${typedSuffix}${atPage}`;
  }

  // IA Annexures
  if (meta.id.startsWith("ia_annexure_")) {
    return `IA Annexure${atPage}`;
  }

  // Certified Copy Receipt
  if (meta.id === "certified_copy_receipt") {
    return `Receipt-CC${atPage}`;
  }

  // IAs
  if (meta.id.startsWith("ia_") && !meta.id.startsWith("ia_affidavit_") && !meta.id.startsWith("ia_annexure_")) {
    const iaId = meta.id.substring(3);
    const isScWp = projectData.courtType === "WritPetitionSC" || projectData.courtType === "WritPetitionPIL";
    const ia = (isScWp ? getScWpIaList(projectData) : getIaList(projectData)).find((i) => i.id === iaId);
    const code = shortIaTitle(iaId, ia?.title);
    return `${code}${atPage}`;
  }

  // Tail documents
  if (meta.id === "custodyCertificate") return `Custody Certificate${atPage}`;
  if (meta.id === "proofOfService") return `Proof of Service${atPage}`;
  if (meta.id === "memoOfParties") return `Memo of Parties${atPage}`;
  if (meta.id === "vakalatnama") return `Vakalatnama${atPage}`;

  // Everything else (Checklist, Cover Page, Index, Record of Proceedings, Office Report, Listing Proforma, Affidavits) is omitted
  return null;
}

// ── Facts mode & engine (HC, CAT, SC WP, Statutory Appeal) ────────────────
//
// 1. Facts are always stored and edited as a row-by-row table (`factsRows`),
//    never as a giant monolithic BadhiyaBox.
// 2. The user can choose whether to mark annexures in the List of Dates or in
//    the Facts table (`annexureMode: "lod" | "facts"`).
// 3. "Populate from List of Dates" transposes LoD rows into Facts rows
//    ("On <date>, <event>" + lowercasing rule).
// 4. `resolveFactsHtml` resolves the Facts table into clean HTML `<ol><li>...</li></ol>`
//    with annexure sentences properly nested INSIDE the paragraph block so DOCX
//    and PDF exports preserve the full sentence with zero truncation.

import type { Annexure, DraftoProject } from "@/lib/schema";
import { factsAnnexureSentenceHtml } from "./wp-facts";
import { wpAnnexureOrderFromLods } from "./wp-annexures";
import { isScWpFamily } from "@/lib/court-family";
import { getFactsHeadingStyle, headingLabelFor } from "@/lib/grounds-headings";

type LodRow = DraftoProject["listOfDates"][number];

/** Where annexures are currently marked: "lod" (List of Dates) or "facts" (Facts table). */
export function annexureModeOf(project: DraftoProject): "lod" | "facts" {
  if (project?.courtType === "OriginalApplicationCAT") {
    return (project as any).oa?.annexureMode || "lod";
  }
  return (project as any).wp?.annexureMode || "lod";
}

/** Form field path for the annexure mode switch. */
export function annexureModePath(courtType: string | undefined): string {
  return courtType === "OriginalApplicationCAT" ? "oa.annexureMode" : "wp.annexureMode";
}

/** The Facts table rows for this project, whichever document type it is. */
export function factsRowsOf(project: DraftoProject): LodRow[] {
  const rows =
    project?.courtType === "OriginalApplicationCAT"
      ? (project as any).oa?.factsRows
      : (project as any).wp?.factsRows;
  return Array.isArray(rows) ? rows : [];
}

/** Where the Facts table lives in the form, for the table component. */
export function factsRowsPath(courtType: string | undefined): string {
  return courtType === "OriginalApplicationCAT" ? "oa.factsRows" : "wp.factsRows";
}

/** Where legacy monolithic facts live in the form. */
export function legacyFactsPath(courtType: string | undefined): string {
  return courtType === "OriginalApplicationCAT" ? "oa.facts" : "wp.facts";
}

/**
 * Kept for backward compatibility. In the new architecture, Facts is always a table.
 * Returns true if annexures are marked in Facts, or if factsRows has entries.
 */
export function separateFactsMode(project: DraftoProject): boolean {
  if (!project) return false;
  return annexureModeOf(project) === "facts" || factsRowsOf(project).length > 0;
}

/**
 * The rows that carry the authoritative annexures.
 * If annexureMode is "facts", returns factsRows.
 * Otherwise returns listOfDates.
 */
export function annexureRowsOf(project: DraftoProject): LodRow[] {
  if (!project) return [];
  const mode = annexureModeOf(project);
  if (mode === "facts") {
    const facts = factsRowsOf(project);
    if (facts.length > 0) return facts;
  }
  return project.listOfDates || [];
}

/**
 * Safely inserts an annexure sentence inside the closing tag of the last block
 * (typically `</p>`). If no block tag is present, wraps the whole block in `<p>`.
 * This prevents Word DOCX and PDF engines from dropping trailing inline runs.
 */
export function appendSentenceToHtml(html: string, sentence: string): string {
  if (!sentence) return html;
  const h = (html || "").trim();
  if (!h) return `<p>${sentence}</p>`;
  const m = h.match(/^([\s\S]*)(<\/(?:p|div|h[1-6])>\s*)$/i);
  if (m) return `${m[1]} ${sentence}${m[2]}`;
  if (/<\/(?:table|ol|ul|blockquote)>\s*$/i.test(h)) return `${h}<p>${sentence}</p>`;
  return `<p>${h} ${sentence}</p>`;
}

/**
 * The Facts section as HTML — the shape document generators consume.
 * Each table row becomes one <li>, with its annexure sentences appended
 * inside the paragraph block. The impugned order's sentence is left out
 * (it belongs in Para 1 / Impugned Order section).
 */
export function resolveFactsHtml(project: DraftoProject, prefix: string = "P"): string {
  const stored =
    project?.courtType === "OriginalApplicationCAT"
      ? (project as any).oa?.facts || ""
      : (project as any).wp?.facts || "";

  const rows = factsRowsOf(project);
  if (rows.length === 0) return stored;

  const mode = annexureModeOf(project);
  const pMap = new Map(wpAnnexureOrderFromLods(annexureRowsOf(project)).map((e) => [e.annex.id, e]));
  const lodMap = new Map((project.listOfDates || []).map((l) => [l.id, l]));

  const factsHeadingStyle = getFactsHeadingStyle(project);
  const blocks: string[] = [];
  const items: string[] = [];
  let currentListStart = 1;
  let runningFactCount = 0;

  const regimeAttr = isScWpFamily(project.courtType) ? ' data-regime="lower-alpha"' : '';

  const flushItems = () => {
    if (items.length === 0) return;
    const startAttr = currentListStart > 1 ? ` start="${currentListStart}"` : '';
    blocks.push(`<ol${regimeAttr}${startAttr}>${items.map((i) => `<li>${i}</li>`).join("")}</ol>`);
    items.length = 0;
  };

  const escapeXml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];

    if (row.isHeading) {
      const headingText = (row.heading || "").trim();
      if (!headingText) continue;
      flushItems();
      const label = headingLabelFor(rows as any, rowIndex, factsHeadingStyle);
      blocks.push(`<h2>${label} ${escapeXml(headingText)}</h2>`);
      currentListStart = runningFactCount + 1;
      continue;
    }

    // If annexures are marked in LoD, fallback to matching LoD row's annexures if row has none
    const rowAnnexes = (row.annexures && row.annexures.length > 0)
      ? row.annexures
      : (mode === "lod" ? lodMap.get(row.id)?.annexures || [] : []);

    const annexes = rowAnnexes.filter((a: Annexure) => !a.isImpugnedOrder);
    let html = (row.event || "").trim();
    if (!html && annexes.length === 0) continue;

    const pageRangeText = isScWpFamily(project.courtType) ? "(pp.___ to ___)" : undefined;
    for (const annex of annexes) {
      const entry = pMap.get(annex.id);
      if (!entry) continue;
      const sentence = factsAnnexureSentenceHtml(entry.pNumber, annex, prefix, pageRangeText);
      html = appendSentenceToHtml(html, sentence);
    }

    if (html) {
      if (!/^\s*<(?:p|div|h[1-6]|table|blockquote|ol|ul)\b/i.test(html)) {
        html = `<p>${html}</p>`;
      }
      items.push(html);
      runningFactCount++;
    }
  }

  flushItems();

  if (blocks.length === 0) return stored;
  return blocks.join("\n");
}

/**
 * Build Facts rows from the List of Dates — "On <date>, <event>", one row each.
 * If annexureMode is "lod", copies annexures from LoD so sentences preview.
 * If annexureMode is "facts", preserves existing annexures on the Facts rows.
 */
export function factsRowsFromLod(project: DraftoProject, existingFactsRows: LodRow[] = []): LodRow[] {
  const mode = annexureModeOf(project);
  const existingMap = new Map(existingFactsRows.map((r) => [r.id, r]));
  const out: LodRow[] = [];

  for (const lod of project.listOfDates || []) {
    const text = (lod.event || "").trim();
    const hasAnnex = (lod.annexures || []).length > 0;
    if (!text && !hasAnnex) continue;

    const existingRow = existingMap.get(lod.id);
    const annexures = mode === "lod"
      ? (lod.annexures ? [...lod.annexures] : [])
      : (existingRow?.annexures ? [...existingRow.annexures] : []);

    out.push({
      id: lod.id,
      date: "",
      event: transposeToSentence(lod.date || "", text),
      annexures,
    } as LodRow);
  }
  return out;
}

/**
 * Append-only transposition: adds rows for List-of-Dates entries that are not
 * yet present in `existingRows` (by id), without modifying existing rows.
 */
export function appendNewLodRowsToFactsRows(project: DraftoProject, existingRows: LodRow[] = []): LodRow[] {
  const mode = annexureModeOf(project);
  const existingIds = new Set(existingRows.map((r) => r.id));
  const toAppend: LodRow[] = [];

  for (const lod of project.listOfDates || []) {
    const text = (lod.event || "").trim();
    const hasAnnex = (lod.annexures || []).length > 0;
    if ((!text && !hasAnnex) || existingIds.has(lod.id)) continue;

    toAppend.push({
      id: lod.id,
      date: "",
      event: transposeToSentence(lod.date || "", text),
      annexures: mode === "lod" ? (lod.annexures ? [...lod.annexures] : []) : [],
    } as LodRow);
  }

  return [...existingRows, ...toAppend];
}

/**
 * Converts legacy monolithic facts HTML (from BadhiyaBox <ol><li>...</li></ol>)
 * into row items for backward compatibility when opening older projects.
 */
export function convertFactsHtmlToRows(html: string): LodRow[] {
  if (!html || !html.trim()) return [];

  const liMatches = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
  if (liMatches.length > 0) {
    return liMatches.map((m) => {
      let inner = m[1].trim();
      if (!/^\s*<p\b/i.test(inner)) inner = `<p>${inner}</p>`;
      return {
        id: `fact_${Math.random().toString(36).slice(2, 10)}`,
        date: "",
        event: inner,
        annexures: [],
      };
    });
  }

  const pMatches = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  if (pMatches.length > 0) {
    return pMatches.map((m) => ({
      id: `fact_${Math.random().toString(36).slice(2, 10)}`,
      date: "",
      event: `<p>${m[1].trim()}</p>`,
      annexures: [],
    }));
  }

  return [{
    id: `fact_${Math.random().toString(36).slice(2, 10)}`,
    date: "",
    event: `<p>${html.trim()}</p>`,
    annexures: [],
  }];
}

/** Lowercase the first real letter, stepping over any leading tags. */
function lowerFirstLetter(html: string): string {
  return html.replace(/^(\s*(?:<[^>]+>\s*)*)([A-Z])/, (_m, tags, ch) => `${tags}${ch.toLowerCase()}`);
}

/** True when the markup holds no actual text. */
function isBlankHtml(html: string): boolean {
  return !(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

/**
 * "12.03.2021" + "<p>The order was passed.</p>" → "<p>On 12.03.2021, the order
 * was passed.</p>"
 */
export function transposeToSentence(date: string, html: string): string {
  const d = (date || "").trim();
  const t = (html || "").trim();
  if (!d || isBlankHtml(t)) return t;

  const open = t.match(/^<p(?:\s[^>]*)?>/i);
  if (open) {
    const rest = t.slice(open[0].length);
    return `${open[0]}On ${d}, ${lowerFirstLetter(rest)}`;
  }
  return `<p>On ${d}, ${lowerFirstLetter(t)}</p>`;
}

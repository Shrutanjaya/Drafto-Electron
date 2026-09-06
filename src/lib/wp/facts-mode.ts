// ── Facts mode (HC and CAT) ──────────────────────────────────────────────────
// Two ways of working, chosen once in Settings per document type.
//
// "Reproduce the List of Dates in the Facts" (the default, and how Drafto has
// always worked): one annexure-bearing List of Dates, and the Facts are a
// transposition of it — "On <date>, <event>" plus the annexure sentences.
//
// Separate Facts (the alternative): a concise List of Dates carrying only dates
// and particulars, and a Facts table of its own — the same table as the List of
// Dates minus the date column, annexures and all. The List of Dates section of
// the document comes from the first; the Facts paragraphs and EVERY annexure
// (including the Index) come from the second.
//
// One module decides which, so the choice lands in exactly three places: where
// annexures come from, where the Facts text comes from, and what the workspace
// draws.

import type { Annexure, DraftoProject } from "@/lib/schema";
import { factsAnnexureSentenceHtml } from "./wp-facts";
import { wpAnnexureOrderFromLods } from "./wp-annexures";

type LodRow = DraftoProject["listOfDates"][number];

/** Read the per-document-type setting. Defaults to the historical behaviour. */
function factsFromLodSetting(courtType: string | undefined): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem("drafto-settings");
    if (!raw) return true;
    const s = JSON.parse(raw);
    if (courtType === "OriginalApplicationCAT") return s.oaFactsFromLod ?? true;
    if (courtType === "WritPetitionDHC") return s.wpFactsFromLod ?? true;
    return true;
  } catch {
    return true;
  }
}

/** The Facts table rows for this project, whichever document type it is. */
export function factsRowsOf(project: DraftoProject): LodRow[] {
  const rows =
    project.courtType === "OriginalApplicationCAT"
      ? (project as any).oa?.factsRows
      : (project as any).wp?.factsRows;
  return Array.isArray(rows) ? rows : [];
}

/** Where the Facts table lives in the form, for the table component. */
export function factsRowsPath(courtType: string | undefined): string {
  return courtType === "OriginalApplicationCAT" ? "oa.factsRows" : "wp.factsRows";
}

/**
 * True when this project keeps its Facts separate from the List of Dates.
 *
 * Only ever true for the HC and CAT tools — the SLP has no Facts section — and
 * only when the user has turned the Settings option off.
 */
export function separateFactsMode(project: DraftoProject): boolean {
  const ct = project?.courtType;
  if (ct !== "WritPetitionDHC" && ct !== "OriginalApplicationCAT") return false;
  return !factsFromLodSetting(ct);
}

/**
 * The rows that carry the annexures.
 *
 * In separate-Facts mode that is the Facts table. The fallback matters: a
 * project drafted before the switch still has its annexures on the List of
 * Dates, and must keep generating correctly until they are moved across.
 */
export function annexureRowsOf(project: DraftoProject): LodRow[] {
  if (!separateFactsMode(project)) return project.listOfDates || [];
  const facts = factsRowsOf(project);
  const hasAnnexures = facts.some((r) => (r.annexures || []).length > 0);
  if (hasAnnexures) return facts;
  // Nothing on the Facts table yet — fall back so an existing project is not
  // silently stripped of its annexures the moment the setting is flipped.
  const lodHasAnnexures = (project.listOfDates || []).some((r) => (r.annexures || []).length > 0);
  return lodHasAnnexures ? project.listOfDates || [] : facts;
}

/**
 * The Facts section as HTML — the shape both generators already consume, so
 * neither the WP nor the OA document layer needs to know this mode exists.
 *
 * In separate-Facts mode each table row becomes one <li>, with its annexure
 * sentences appended exactly as the transposition does. The impugned order's
 * own sentence is left out: it prints in Para 1, not in the Facts.
 */
export function resolveFactsHtml(project: DraftoProject, prefix: string = "P"): string {
  const stored =
    project.courtType === "OriginalApplicationCAT"
      ? (project as any).oa?.facts || ""
      : (project as any).wp?.facts || "";
  if (!separateFactsMode(project)) return stored;

  const rows = factsRowsOf(project);
  if (rows.length === 0) return stored; // nothing typed yet — keep what is there

  const pMap = new Map(wpAnnexureOrderFromLods(annexureRowsOf(project)).map((e) => [e.annex.id, e]));
  const items: string[] = [];
  for (const row of rows) {
    const annexes = (row.annexures || []).filter((a: Annexure) => !a.isImpugnedOrder);
    // The row text is already rich text; unwrap a lone wrapping paragraph so the
    // <li> does not gain an extra block. Anything with several paragraphs is
    // left alone — unwrapping it would run them together.
    let html = unwrapLoneParagraph(row.event || "");
    if (!html && annexes.length === 0) continue;
    const pageRangeText = project.courtType === "WritPetitionSC" ? "(pp.___ to ___)" : undefined;
    for (const annex of annexes) {
      const entry = pMap.get(annex.id);
      if (!entry) continue;
      html = `${html} ${factsAnnexureSentenceHtml(entry.pNumber, annex, prefix, pageRangeText)}`.trim();
    }
    if (html) items.push(html);
  }
  if (items.length === 0) return "";
  return `<ol>${items.map((i) => `<li>${i}</li>`).join("")}</ol>`;
}

/**
 * Build Facts rows from the List of Dates — "On <date>, <event>", one row each.
 * Annexures are NOT carried: in this mode the List of Dates has none, and they
 * are attached on the Facts table itself.
 *
 * The exception is a project drafted before the switch, whose annexures are
 * still on the List of Dates; those come across so nothing is lost.
 */
export function factsRowsFromLod(project: DraftoProject): LodRow[] {
  const carryAnnexures = (project.listOfDates || []).some((r) => (r.annexures || []).length > 0);
  const out: LodRow[] = [];
  for (const lod of project.listOfDates || []) {
    const text = (lod.event || "").trim();
    const hasAnnex = (lod.annexures || []).length > 0;
    if (!text && !hasAnnex) continue;
    out.push({
      id: `item_${Math.random().toString(36).slice(2, 10)}`,
      date: "",
      event: transposeToSentence(lod.date || "", text),
      annexures: carryAnnexures ? lod.annexures || [] : [],
    } as LodRow);
  }
  return out;
}

/** Strip one wrapping <p>…</p>, but only when it wraps the whole row. */
function unwrapLoneParagraph(html: string): string {
  const t = (html || "").trim();
  const m = t.match(/^<p(?:\s[^>]*)?>([\s\S]*)<\/p>$/i);
  if (!m) return t;
  if (/<\/p\s*>/i.test(m[1])) return t; // more than one paragraph
  return m[1].trim();
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
 *
 * The prefix goes INSIDE the first paragraph rather than wrapping the row.
 * Wrapping would put a <p> inside a <p>, which the editor renders as a break
 * after the date and another after the text.
 */
function transposeToSentence(date: string, html: string): string {
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

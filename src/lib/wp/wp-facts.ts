// Facts engine — deterministically transposes the List of Dates into the Facts
// section prose, inserting annexure sentences (which, in a WP, live in Facts and
// NOT in the List of Dates). Pure & DOM-free so it can be unit-tested.
//
// LoD row  "01.01.2006  The Petitioner was appointed…"
//   →      "On 01.01.2006, the Petitioner was appointed… Annexure P-1 is a true
//           copy of … dated …."
//
// Inline formatting in the LoD event (bold/italic case citations etc.) is
// PRESERVED — only block structure is flattened, so each row still becomes one
// flowing numbered paragraph.
//
// The AI assistant ("Mayur") can later refine this prose, but this deterministic
// pass is the dependable default and offline fallback.

import type { DraftoProject, Annexure } from "@/lib/schema";
import { wpAnnexureOrder, annexLabel } from "./wp-annexures";

function stripHtml(html: string): string {
  return (html || "")
    .replace(/<\s*br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "’")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Flatten block structure to a single flowing inline-HTML string, keeping
// inline formatting tags (<b>/<strong>/<i>/<em>/<u>/…) intact. Also used by
// the petition generator to run the reliefs together inside Para 1.
export function inlineHtml(html: string): string {
  return (html || "")
    .replace(/<\s*br\s*\/?\s*>/gi, " ")
    .replace(/<\/?(?:p|div|ol|ul|li|h[1-6]|blockquote|table|thead|tbody|tr|td|th)\b[^>]*>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// First words that read naturally lowercased after a leading date phrase
// (e.g. "The Petitioner" → "on …, the Petitioner"). Proper nouns are left as-is.
const LEAD_LOWERCASE = new Set([
  "The", "A", "An", "This", "That", "These", "Those",
  "It", "He", "She", "They", "His", "Her", "Their", "Its",
]);

// Words that already introduce the date themselves — used as typed, not prefixed.
const DATE_CONNECTIVE = /^(from|till|until|since|by|between|during|in|on|upto|up\s?to|after|before|as\s?on|as\s?of|w\.?\s?e\.?\s?f\.?|on\s?or\s?about|around|circa|throughout)\b/i;

// Turn a date field into a leading clause:
//   "01.01.2006"            → "On 01.01.2006, "
//   "1968"                  → "In 1968, "
//   "1968-1994" / "1968 to 1994" → "From 1968 to 1994, "
//   "01.01.1968 - 31.12.1994"    → "From 01.01.1968 to 31.12.1994, "
//   "Till 1994" / "From X to Y"  → used verbatim (already phrased) + ", "
//   ""                      → ""
export function datePhrase(date: string): string {
  const d = (date || "").trim();
  if (!d) return "";
  // Already a connective phrase ("From…", "Till…", "Since…") → use as typed.
  if (DATE_CONNECTIVE.test(d)) return `${d.charAt(0).toUpperCase()}${d.slice(1)}, `;
  // Year–year range.
  let m = d.match(/^(\d{4})\s*(?:[-–—]|to)\s*(\d{4})$/i);
  if (m) return `From ${m[1]} to ${m[2]}, `;
  // Full-date–full-date range (dot/slash dates, dash- or "to"-separated).
  m = d.match(/^(\d{1,2}[./]\d{1,2}[./]\d{2,4})\s*(?:[-–—]|to)\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})$/i);
  if (m) return `From ${m[1]} to ${m[2]}, `;
  // Generic "X to Y" range (e.g. "Jan 2006 to Mar 2007").
  m = d.match(/^(.+?)\s+to\s+(.+)$/i);
  if (m) return `From ${m[1].trim()} to ${m[2].trim()}, `;
  // Single bare year.
  if (/^\d{4}$/.test(d)) return `In ${d}, `;
  // Single full date.
  return `On ${d}, `;
}

// Plain-text transposition (kept for tests and non-HTML callers).
export function transposeEvent(date: string, eventText: string): string {
  const phrase = datePhrase(date);
  let body = (eventText || "").trim();
  if (phrase && body) {
    const m = body.match(/^(\S+)([\s\S]*)$/);
    if (m && LEAD_LOWERCASE.has(m[1])) {
      body = m[1].charAt(0).toLowerCase() + m[1].slice(1) + m[2];
    }
  }
  return (phrase + body).trim();
}

// Structure-preserving transposition. The flattening one below reduces a whole
// List-of-Dates entry to a single line: paragraph breaks, line breaks, lists,
// quotes and tables all become spaces. This keeps them, putting the date phrase
// inside the first paragraph (so the fact still opens "On 01.01.2026, …") and
// leaving everything after it as the user wrote it.
//
// A block the date cannot sensibly lead — an entry that opens with a table or a
// list — gets the phrase as its own short paragraph instead.
const LEADING_BLOCK = /^\s*<(p|div|h[1-6])\b[^>]*>/i;

export function transposeEventHtmlKeepingStructure(date: string, eventHtml: string): string {
  const phrase = datePhrase(date);
  const html = (eventHtml || "").trim();
  if (!html) return "";
  if (!phrase) return html;

  const lead = html.match(LEADING_BLOCK);
  if (!lead) {
    // Either bare inline text, or an entry opening with a table/list.
    if (/^\s*<(ol|ul|table|blockquote)\b/i.test(html)) {
      return `<p>${escapeHtml(phrase.replace(/,\s*$/, ":"))}</p>${html}`;
    }
    return lowercaseLeadWord(escapeHtml(phrase) + html, phrase.length);
  }
  const at = lead[0].length;
  return lowercaseLeadWord(html.slice(0, at) + escapeHtml(phrase) + html.slice(at), at + phrase.length);
}

// The first word after the date phrase reads better lowercased ("On 1.1.2026,
// the Petitioner…"), but only for the words that are not proper nouns.
function lowercaseLeadWord(html: string, from: number): string {
  const m = html.slice(from).match(/^((?:<[^>]+>|\s)*)([A-Za-z]+)/);
  if (!m || !LEAD_LOWERCASE.has(m[2])) return html;
  const at = from + m[1].length;
  return html.slice(0, at) + m[2].charAt(0).toLowerCase() + m[2].slice(1) + html.slice(at + m[2].length);
}

// Appends a sentence INSIDE the last paragraph so it reads as part of the fact;
// after a table or a list, where there is no sentence to join, it becomes a
// short paragraph of its own.
export function appendSentenceToLastBlock(html: string, sentence: string): string {
  if (!sentence) return html;
  const m = html.match(/^([\s\S]*)(<\/(?:p|div|h[1-6])>\s*)$/i);
  if (m) return `${m[1]} ${sentence}${m[2]}`;
  if (/<\/(?:table|ol|ul|blockquote)>\s*$/i.test(html)) return `${html}<p>${sentence}</p>`;
  return `${html} ${sentence}`.trim();
}

// HTML-preserving transposition: prepends the date phrase and lowercases the
// first visible word (which may sit inside inline tags like <b>The</b>).
export function transposeEventHtml(date: string, eventHtml: string): string {
  const phrase = datePhrase(date);
  let body = inlineHtml(eventHtml);
  if (phrase && body) {
    const m = body.match(/^((?:<[^>]+>|\s)*)([A-Za-z]+)/);
    if (m && LEAD_LOWERCASE.has(m[2])) {
      body =
        body.slice(0, m[1].length) +
        m[2].charAt(0).toLowerCase() + m[2].slice(1) +
        body.slice(m[1].length + m[2].length);
    }
  }
  return (escapeHtml(phrase) + body).trim();
}

// The user's own words for an annexure, added after the date wherever the
// annexure is described — the Index, the Facts and the paper-book bookmark —
// exactly as the Supreme Court tool has always done. Returns the sentence with
// a single full stop at the end, whether or not the user typed one.
export function withAnnexureCustomText(sentence: string, annex: { customText?: string }): string {
  const extra = (annex.customText || "").trim();
  const base = sentence.replace(/\s*$/, "").replace(/\.$/, "");
  if (!extra) return `${base}.`;
  return /[.!?]$/.test(extra) ? `${base} ${extra}` : `${base} ${extra}.`;
}

// Facts-style annexure sentence (not the colon Index style), split into the
// "Annexure P-N" label and the rest so renderers can bold the label.
export function factsAnnexureSentenceParts(
  pNumber: number,
  annex: Annexure,
  prefix: string = "P",
  pageRangeText?: string
): { label: string; rest: string } {
  const baseLabel = annexLabel(pNumber, annex, prefix);
  const label = pageRangeText ? `${baseLabel} ${pageRangeText}` : baseLabel;
  const dated = annex.date ? ` dated ${annex.date}` : "";
  const body = annex.isColly
    ? ` are true copies of ${annex.title || "[description]"}${dated}`
    : ` is a ${annex.copyType || "true copy"} of ${annex.title || "[description]"}${dated}`;
  return { label, rest: withAnnexureCustomText(body, annex) };
}

export function factsAnnexureSentence(
  pNumber: number,
  annex: Annexure,
  prefix: string = "P",
  pageRangeText?: string
): string {
  const { label, rest } = factsAnnexureSentenceParts(pNumber, annex, prefix, pageRangeText);
  return label + rest;
}

// HTML form with the label in bold, for the generated Facts paragraphs.
export function factsAnnexureSentenceHtml(
  pNumber: number,
  annex: Annexure,
  prefix: string = "P",
  pageRangeText?: string
): string {
  const { label, rest } = factsAnnexureSentenceParts(pNumber, annex, prefix, pageRangeText);
  return `<b>${escapeHtml(label)}</b>${escapeHtml(rest)}`;
}

// Injects real annexure page numbers (or placeholders) into Facts HTML.
export function injectAnnexurePageRangesIntoFacts(
  factsHtml: string,
  projectData: DraftoProject,
  annexurePageRanges?: Map<string, { start: number; end: number }>,
  prefix: string = "P"
): string {
  if (!factsHtml) return "";
  let updated = factsHtml;
  const ordered = wpAnnexureOrder(projectData);
  for (const { annex, pNumber } of ordered) {
    const pr = annexurePageRanges?.get(annex.id);
    const prText = pr
      ? pr.start === pr.end
        ? `(p.${pr.start})`
        : `(pp.${pr.start} to ${pr.end})`
      : "(pp.___ to ___)";

    const basePattern = `Annexure\\s+${prefix}-${pNumber}(?!\\d)(?:\\s*\\(Colly\\))?`;

    // 1. Existing page range inside tag or plain: e.g. "Annexure P-2 (pp.___ to ___)" or "<b>Annexure P-2 (pp.___ to ___)</b>"
    const regexParenInsideOrPlain = new RegExp(`(${basePattern})\\s*\\(pp?\\.?[^)]*\\)`, "gi");
    updated = updated.replace(regexParenInsideOrPlain, `$1 ${prText}`);

    // 2. Existing page range outside tag: e.g. "<b>Annexure P-2</b> (pp.___ to ___)" -> "<b>Annexure P-2 (pp.___ to ___)</b>"
    const regexParenOutside = new RegExp(`(${basePattern})\\s*(</(?:b|strong)>)\\s*\\(pp?\\.?[^)]*\\)`, "gi");
    updated = updated.replace(regexParenOutside, `$1 ${prText}$2`);

    // 3. No existing page range, inside tag: e.g. "<b>Annexure P-2</b>" -> "<b>Annexure P-2 (pp.___ to ___)</b>"
    const regexTagNoParen = new RegExp(`(${basePattern})\\s*(</(?:b|strong)>)(?!\\s*\\(pp?\\.?[^)]*\\))`, "gi");
    updated = updated.replace(regexTagNoParen, `$1 ${prText}$2`);

    // 4. No existing page range, plain text: e.g. "Annexure P-2 is a true copy" -> "Annexure P-2 (pp.___ to ___) is a true copy"
    const regexPlainNoParen = new RegExp(`(${basePattern})(?!\\s*(?:\\(Colly\\))?\\s*(?:</(?:b|strong)>)?\\s*\\(pp?\\.?[^)]*\\))`, "gi");
    updated = updated.replace(regexPlainNoParen, `$1 ${prText}`);
  }
  return updated;
}

// One transposed <li> (inner HTML) for a LoD row, or null when the row is empty.
function factsItem(project: DraftoProject, lod: DraftoProject["listOfDates"][number], pMap: Map<string, { annex: Annexure; pNumber: number }>, prefix: string = "P"): string | null {
  // Both tools now render the Facts as a real list and emit an item's further
  // paragraphs, lists, quotes and tables as blocks of their own, so an entry
  // can be carried across whole rather than flattened to a single line.
  const keepStructure = true;
  // The impugned order's annexure sentence prints in Para 1 of the petition,
  // NOT in Facts — only the other annexures get their sentence here. (The IO
  // still holds P-1, so the remaining sentences cite P-2 onwards.)
  const annexes = (lod.annexures || []).filter(a => !a.isImpugnedOrder);
  let sentence = keepStructure
    ? transposeEventHtmlKeepingStructure(lod.date || "", lod.event || "")
    : transposeEventHtml(lod.date || "", lod.event || "");
  if (!sentence && annexes.length === 0) return null;
  const pageRangeText = project.courtType === "WritPetitionSC" ? "(pp.___ to ___)" : undefined;
  for (const annex of annexes) {
    const entry = pMap.get(annex.id);
    if (!entry) continue;
    const annexSentence = factsAnnexureSentenceHtml(entry.pNumber, annex, prefix, pageRangeText);
    sentence = keepStructure
      ? appendSentenceToLastBlock(sentence, annexSentence)
      : `${sentence} ${annexSentence}`.trim();
  }
  return sentence || null;
}

function pMapOf(project: DraftoProject) {
  return new Map(wpAnnexureOrder(project).map(e => [e.annex.id, e]));
}

// Ids of the LoD rows that would produce a Facts paragraph right now.
export function transposableLodIds(project: DraftoProject): string[] {
  const pMap = pMapOf(project);
  return (project.listOfDates || [])
    .filter(lod => factsItem(project, lod, pMap) !== null)
    .map(lod => lod.id);
}

// Fingerprint of everything the transposition reads from the LoD — used to
// detect Facts gone stale after later LoD edits (dates, text, annexures).
export function lodFingerprint(project: DraftoProject): string {
  const pMap = pMapOf(project);
  return (project.listOfDates || [])
    .map(lod => {
      const annexes = (lod.annexures || [])
        .map(a => `${a.id}|${pMap.get(a.id)?.pNumber ?? "?"}|${a.title}|${a.date}|${a.copyType}|${a.isColly ? 1 : 0}`)
        .join("^");
      return `${lod.id}|${lod.date}|${stripHtml(lod.event || "")}|${annexes}`;
    })
    .join("~");
}

// Build the Facts section HTML (an ordered list, one item per LoD row) from the
// project's List of Dates and the annexures attached to each row.
export function transposeLodToFacts(project: DraftoProject, prefix: string = "P"): string {
  const pMap = pMapOf(project);
  const items: string[] = [];
  for (const lod of project.listOfDates || []) {
    const item = factsItem(project, lod, pMap, prefix);
    if (item !== null) items.push(item);
  }
  if (items.length === 0) return "";
  const regimeAttr = project.courtType === "WritPetitionSC" ? ' data-regime="lower-alpha"' : '';
  return `<ol${regimeAttr}>${items.map(i => `<li>${i}</li>`).join("")}</ol>`;
}

// Append-only transposition: paragraphs for LoD rows NOT in `doneIds` are added
// to the end of the existing (possibly hand-edited) Facts HTML, inside its
// trailing list when one exists. Returns the new HTML and the appended row ids.
export function appendNewLodRowsToFacts(
  project: DraftoProject,
  factsHtml: string,
  doneIds: string[],
  prefix: string = "P",
): { html: string; appendedIds: string[] } {
  const done = new Set(doneIds || []);
  const pMap = pMapOf(project);
  const additions: { id: string; item: string }[] = [];
  for (const lod of project.listOfDates || []) {
    if (done.has(lod.id)) continue;
    const item = factsItem(project, lod, pMap, prefix);
    if (item !== null) additions.push({ id: lod.id, item });
  }
  if (additions.length === 0) return { html: factsHtml, appendedIds: [] };

  const lis = additions.map(a => `<li>${a.item}</li>`).join("");
  const html = (factsHtml || "").trim();
  const m = html.match(/^([\s\S]*)(<\/ol>\s*)$/i);
  const regimeAttr = project.courtType === "WritPetitionSC" ? ' data-regime="lower-alpha"' : '';
  const merged = m ? `${m[1]}${lis}${m[2]}` : html ? `${html}<ol${regimeAttr}>${lis}</ol>` : `<ol${regimeAttr}>${lis}</ol>`;
  return { html: merged, appendedIds: additions.map(a => a.id) };
}

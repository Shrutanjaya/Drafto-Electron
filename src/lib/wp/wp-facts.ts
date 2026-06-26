// Facts engine — deterministically transposes the List of Dates into the Facts
// section prose, inserting annexure sentences (which, in a WP, live in Facts and
// NOT in the List of Dates). Pure & DOM-free so it can be unit-tested.
//
// LoD row  "01.01.2006  The Petitioner was appointed…"
//   →      "On 01.01.2006, the Petitioner was appointed… Annexure P-1 is a true
//           copy of … dated …."
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

// First words that read naturally lowercased after a leading date phrase
// (e.g. "The Petitioner" → "on …, the Petitioner"). Proper nouns are left as-is.
const LEAD_LOWERCASE = new Set([
  "The", "A", "An", "This", "That", "These", "Those",
  "It", "He", "She", "They", "His", "Her", "Their", "Its",
]);

// "01.01.2006" → "On 01.01.2006, ";  "1968" → "In 1968, ";  "" → "".
export function datePhrase(date: string): string {
  const d = (date || "").trim();
  if (!d) return "";
  if (/^\d{4}$/.test(d)) return `In ${d}, `;
  return `On ${d}, `;
}

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

// Facts-style annexure sentence (not the colon Index style).
export function factsAnnexureSentence(pNumber: number, annex: Annexure): string {
  const label = annexLabel(pNumber, annex);
  const dated = annex.date ? ` dated ${annex.date}` : "";
  if (annex.isColly) {
    return `${label} are true copies of ${annex.title || "[description]"}${dated}.`;
  }
  const copy = annex.copyType || "true copy";
  return `${label} is a ${copy} of ${annex.title || "[description]"}${dated}.`;
}

// Build the Facts section HTML (an ordered list, one item per LoD row) from the
// project's List of Dates and the annexures attached to each row.
export function transposeLodToFacts(project: DraftoProject): string {
  const pMap = new Map(wpAnnexureOrder(project).map(e => [e.annex.id, e]));
  const items: string[] = [];

  for (const lod of project.listOfDates || []) {
    const text = stripHtml(lod.event || "");
    const annexes = lod.annexures || [];
    if (!text && annexes.length === 0) continue;

    let sentence = transposeEvent(lod.date || "", text);
    for (const annex of annexes) {
      const entry = pMap.get(annex.id);
      if (!entry) continue;
      sentence = `${sentence} ${factsAnnexureSentence(entry.pNumber, annex)}`.trim();
    }
    items.push(escapeHtml(sentence));
  }

  if (items.length === 0) return "";
  return `<ol>${items.map(i => `<li>${i}</li>`).join("")}</ol>`;
}

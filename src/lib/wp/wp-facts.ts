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

// Read Word tracked changes (revisions) out of a .docx the client returned, and
// map each change back onto a Drafto field so it can be applied to the project.
//
// A .docx is a zip; revisions live in word/document.xml as <w:ins>, <w:del>,
// <w:moveTo>, and <w:moveFrom>. Using DOMParser we reconstruct two versions of
// each changed paragraph:
//   • original — with insertions/moveTo removed and deletions/moveFrom kept
//   • accepted — with insertions/moveTo kept and deletions/moveFrom removed
// Matching & replacement normalize smart quotes and non-breaking spaces, extract
// contextual diff snippets when generated prefixes/suffixes wrap a field, and
// map character offsets back onto HTML text nodes so inline formatting tags
// (<b>, <i>, <u>) never break replacement.

import JSZip from "jszip";
import { buildSearchableFields, type SearchGroup } from "./find-replace";

export interface TrackedChange {
  id: string;
  original: string;
  accepted: string;
  /** Minimal changed original span with brief surrounding context (for generated-prefix resilience). */
  diffOriginal?: string;
  /** Corresponding replacement for `diffOriginal`. */
  diffAccepted?: string;
  /** Preceding paragraph text when `original` is empty (newly inserted paragraph). */
  anchorBefore?: string;
  authors: string[];
}

export interface MatchedChange extends TrackedChange {
  // The Drafto field this change was located in (undefined = no match found).
  path?: string;
  group?: SearchGroup;
  isHtml?: boolean;
  /** True when the matched change is a brand-new paragraph insertion after `path`. */
  isNewParagraph?: boolean;
}

const normalizeQuotesAndSpaces = (s: string): string =>
  (s || "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u00A0/g, " ");

const collapse = (s: string): string => normalizeQuotesAndSpaces(s).replace(/\s+/g, " ").trim();

const decodeHtmlEntities = (s: string): string =>
  s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const stripHtml = (s: string): string => collapse(decodeHtmlEntities(s.replace(/<[^>]*>/g, " ")));

// Recursively extract text from a <w:p> DOM node under either "accepted" or "original" mode.
function extractParaText(node: Node, mode: "original" | "accepted"): string {
  if (node.nodeType === 3 /* TEXT_NODE */) return node.nodeValue || "";
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return "";
  const el = node as Element;
  const local = el.localName;

  if (mode === "accepted") {
    if (local === "del" || local === "moveFrom" || local === "delText") return "";
  } else {
    if (local === "ins" || local === "moveTo") return "";
  }

  if (local === "tab") return " ";
  if (local === "br" || local === "cr") return " ";

  let out = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    out += extractParaText(el.childNodes[i], mode);
  }
  return out;
}

// Compute a minimal diff with up to ~28 chars of surrounding context on each side
// so matching works even when the exported paragraph wraps a field with generated
// prefixes/suffixes (e.g. "On 12.03.2021, ... Annexure P-1").
function computeContextualDiff(orig: string, acc: string): { diffOriginal: string; diffAccepted: string } | null {
  if (!orig || !acc || orig === acc) return null;
  let prefix = 0;
  const minLen = Math.min(orig.length, acc.length);
  while (prefix < minLen && orig[prefix] === acc[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    orig[orig.length - 1 - suffix] === acc[acc.length - 1 - suffix]
  ) {
    suffix++;
  }

  // Snap context outwards by ~28 chars (to word boundary if possible)
  const ctxBeforeStart = Math.max(0, prefix - 28);
  const ctxAfterOrigEnd = Math.min(orig.length, orig.length - suffix + 28);
  const ctxAfterAccEnd = Math.min(acc.length, acc.length - suffix + 28);

  const diffOriginal = orig.slice(ctxBeforeStart, ctxAfterOrigEnd).trim();
  const diffAccepted = acc.slice(ctxBeforeStart, ctxAfterAccEnd).trim();
  if (!diffOriginal || diffOriginal === diffAccepted) return null;
  return { diffOriginal, diffAccepted };
}

const REVISION_TAGS = new Set(["ins", "del", "moveTo", "moveFrom"]);

function collectParaRevisions(p: Element): { hasRevision: boolean; authors: string[] } {
  let hasRevision = false;
  const authors = new Set<string>();
  const walk = (el: Element) => {
    if (REVISION_TAGS.has(el.localName)) {
      hasRevision = true;
      const author = el.getAttribute("w:author") || el.getAttribute("author");
      if (author) authors.add(author);
    }
    for (let i = 0; i < el.children.length; i++) {
      walk(el.children[i]);
    }
  };
  walk(p);
  return { hasRevision, authors: Array.from(authors) };
}

export async function parseTrackedChanges(buffer: ArrayBuffer): Promise<TrackedChange[]> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) return [];
  const xml = await entry.async("string");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const paras = Array.from(doc.getElementsByTagName("*")).filter((el) => el.localName === "p");

  const changes: TrackedChange[] = [];
  let idx = 0;
  let lastOriginalPara = "";

  for (const p of paras) {
    const { hasRevision, authors } = collectParaRevisions(p);
    const original = collapse(extractParaText(p, "original"));
    const accepted = collapse(extractParaText(p, "accepted"));

    if (!hasRevision || accepted === original) {
      if (original) lastOriginalPara = original;
      continue;
    }

    const ctxDiff = computeContextualDiff(original, accepted);
    changes.push({
      id: `tc_${idx++}`,
      original,
      accepted,
      ...(ctxDiff ? { diffOriginal: ctxDiff.diffOriginal, diffAccepted: ctxDiff.diffAccepted } : {}),
      ...(!original && lastOriginalPara ? { anchorBefore: lastOriginalPara } : {}),
      authors,
    });
    if (original) lastOriginalPara = original;
  }
  return changes;
}

// Locate each change in the project's fields.
// 1. Try matching the full `original` against normalized field plain text (shortest wins).
// 2. Fallback to `diffOriginal` (handles generated prefixes/suffixes).
// 3. For newly inserted paragraphs (`original === ""`), match `anchorBefore` so the new
//    paragraph can be appended to the preceding field.
export function matchChanges(values: unknown, changes: TrackedChange[]): MatchedChange[] {
  const fields = buildSearchableFields(values as any);
  const getVal = (path: string): string | undefined => {
    const v = path.split(".").reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), values);
    return typeof v === "string" ? v : undefined;
  };

  const prepared = fields
    .map((f) => {
      const raw = getVal(f.path);
      if (raw == null) return null;
      const hay = f.isHtml ? stripHtml(raw) : collapse(raw);
      return { path: f.path, group: f.group, isHtml: f.isHtml, hay, len: hay.length };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const findBest = (needle: string) => {
    if (!needle) return null;
    let best: (typeof prepared)[number] | null = null;
    for (const f of prepared) {
      if (!f.hay.includes(needle)) continue;
      if (!best || f.len < best.len) best = f;
    }
    return best;
  };

  return changes.map((c) => {
    const fullNeedle = collapse(c.original);
    if (!fullNeedle) {
      if (c.anchorBefore) {
        const anchorMatch = findBest(collapse(c.anchorBefore));
        if (anchorMatch) {
          return {
            ...c,
            path: anchorMatch.path,
            group: anchorMatch.group,
            isHtml: anchorMatch.isHtml,
            isNewParagraph: true,
          };
        }
      }
      return { ...c };
    }

    const exact = findBest(fullNeedle);
    if (exact) {
      return { ...c, path: exact.path, group: exact.group, isHtml: exact.isHtml };
    }

    if (c.diffOriginal) {
      const partial = findBest(collapse(c.diffOriginal));
      if (partial) {
        return { ...c, path: partial.path, group: partial.group, isHtml: partial.isHtml };
      }
    }

    return { ...c };
  });
}

// Offset-aware replacement inside HTML: maps normalized plain-text character positions
// back onto raw HTML offsets so inline tags (<b>, <i>, <u>) never break matching or get lost.
function replaceNormalizedInHtml(html: string, needle: string, replacement: string): string | null {
  const normNeedle = collapse(needle);
  if (!normNeedle) return null;

  // Build normalized plain text while recording raw [start, end) of each emitted char
  let plain = "";
  const rawPos: { start: number; end: number }[] = [];
  let inTag = false;
  let i = 0;

  while (i < html.length) {
    const ch = html[i];
    if (ch === "<") {
      inTag = true;
      i++;
      continue;
    }
    if (inTag) {
      if (ch === ">") inTag = false;
      i++;
      continue;
    }

    // Handle HTML entities
    if (ch === "&") {
      const semi = html.indexOf(";", i);
      if (semi !== -1 && semi - i <= 8) {
        const ent = html.slice(i, semi + 1);
        const decoded = normalizeQuotesAndSpaces(decodeHtmlEntities(ent));
        if (decoded === " ") {
          if (plain.length > 0 && plain[plain.length - 1] !== " ") {
            plain += " ";
            rawPos.push({ start: i, end: semi + 1 });
          }
          i = semi + 1;
          continue;
        }
        for (const dCh of decoded) {
          plain += dCh;
          rawPos.push({ start: i, end: semi + 1 });
        }
        i = semi + 1;
        continue;
      }
    }

    const normCh = normalizeQuotesAndSpaces(ch);
    if (/\s/.test(normCh)) {
      if (plain.length > 0 && plain[plain.length - 1] !== " ") {
        plain += " ";
        rawPos.push({ start: i, end: i + 1 });
      }
    } else {
      plain += normCh;
      rawPos.push({ start: i, end: i + 1 });
    }
    i++;
  }

  const trimmedPlain = plain.trimEnd();
  const matchIdx = trimmedPlain.indexOf(normNeedle);
  if (matchIdx < 0) return null;

  // Narrow down to only the changed inner span between normNeedle and replacement
  // so surrounding formatting tags are preserved intact!
  const normRepl = normalizeQuotesAndSpaces(replacement).replace(/\s+/g, " ").trim();
  let p = 0;
  const minLen = Math.min(normNeedle.length, normRepl.length);
  while (p < minLen && normNeedle[p] === normRepl[p]) p++;

  let s = 0;
  while (
    s < minLen - p &&
    normNeedle[normNeedle.length - 1 - s] === normRepl[normRepl.length - 1 - s]
  ) {
    s++;
  }

  const diffStartInPlain = matchIdx + p;
  const diffEndInPlain = matchIdx + normNeedle.length - s; // exclusive
  const diffRepl = normRepl.slice(p, normRepl.length - s);

  if (diffStartInPlain === diffEndInPlain) {
    // Pure insertion at diffStartInPlain
    const anchor = rawPos[Math.min(diffStartInPlain, rawPos.length - 1)];
    const insertAt = diffStartInPlain >= rawPos.length ? anchor.end : anchor.start;
    return html.slice(0, insertAt) + escapeHtml(diffRepl) + html.slice(insertAt);
  }

  const rawStart = rawPos[diffStartInPlain].start;
  const rawEnd = rawPos[diffEndInPlain - 1].end;
  // Preserve any HTML tags inside [rawStart, rawEnd) by keeping them before/after?
  // Removing only text inside [rawStart, rawEnd) keeps opening/closing tags balanced!
  const slice = html.slice(rawStart, rawEnd);
  const tagsOnly = (slice.match(/<[^>]+>/g) || []).join("");
  return html.slice(0, rawStart) + escapeHtml(diffRepl) + tagsOnly + html.slice(rawEnd);
}

function replaceNormalizedInPlain(value: string, needle: string, replacement: string): string | null {
  const normNeedle = collapse(needle);
  if (!normNeedle) return null;
  const normVal = normalizeQuotesAndSpaces(value);
  const idx = normVal.indexOf(normNeedle);
  if (idx >= 0) {
    return value.slice(0, idx) + replacement + value.slice(idx + normNeedle.length);
  }
  return null;
}

// Apply one matched change to its field's value (text-only replace; tags kept).
export function applyChangeToValue(value: string, isHtml: boolean, change: MatchedChange): string {
  if (change.isNewParagraph && change.accepted) {
    if (isHtml) {
      return `${value.trimEnd()}<p>${escapeHtml(change.accepted)}</p>`;
    }
    return value ? `${value}\n${change.accepted}` : change.accepted;
  }

  const candidates: Array<[string, string]> = [[change.original, change.accepted]];
  if (change.diffOriginal && change.diffAccepted !== undefined) {
    candidates.push([change.diffOriginal, change.diffAccepted]);
  }

  for (const [needle, repl] of candidates) {
    if (isHtml) {
      const updated = replaceNormalizedInHtml(value, needle, repl);
      if (updated !== null) return updated;
    } else {
      const updated = replaceNormalizedInPlain(value, needle, repl);
      if (updated !== null) return updated;
    }
  }
  return value;
}

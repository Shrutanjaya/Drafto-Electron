// Read Word tracked changes (revisions) out of a .docx the client returned, and
// map each change back onto a Drafto field so it can be applied to the project.
//
// A .docx is a zip; revisions live in word/document.xml as <w:ins>/<w:del>. For
// each paragraph that carries a revision we reconstruct two versions of its text:
//   • original — with insertions removed and deletions kept  (i.e. reject all)
//   • accepted — with insertions kept and deletions removed   (i.e. accept all)
// A change is then "replace `original` with `accepted`" — which we locate by
// finding the Drafto field whose current text contains `original`, and apply with
// the same text-only find/replace the Find & Replace tool uses (so HTML tags in
// rich fields are never touched).

import JSZip from "jszip";
import { buildSearchableFields, replaceValue, type SearchGroup } from "./find-replace";

export interface TrackedChange {
  id: string;
  original: string;
  accepted: string;
  authors: string[];
}

export interface MatchedChange extends TrackedChange {
  // The Drafto field this change was located in (undefined = no match found).
  path?: string;
  group?: SearchGroup;
  isHtml?: boolean;
}

const decodeXml = (s: string): string =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'");

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();
const stripHtml = (s: string): string => collapse(s.replace(/<[^>]*>/g, " "));

// Pull the visible text out of a run fragment. `includeDel` keeps <w:delText>
// (deleted) text; <w:t> (normal + inserted) is always kept.
function runText(xml: string, includeDel: boolean): string {
  let out = "";
  const re = /<w:(t|delText)\b[^>]*>([\s\S]*?)<\/w:(?:t|delText)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] === "delText" && !includeDel) continue;
    out += m[2];
  }
  return collapse(decodeXml(out));
}

export async function parseTrackedChanges(buffer: ArrayBuffer): Promise<TrackedChange[]> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) return [];
  const xml = await entry.async("string");
  const paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];

  const changes: TrackedChange[] = [];
  let i = 0;
  for (const p of paras) {
    if (!/<w:(ins|del)\b/.test(p)) continue;
    const authors = Array.from(
      new Set((p.match(/w:author="([^"]*)"/g) || []).map((a) => decodeXml(a.slice(10, -1))))
    ).filter(Boolean);
    // accepted = reject nothing: drop <w:del> blocks, keep the rest (incl. <w:ins>).
    const accepted = runText(p.replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, ""), false);
    // original = as the user last had it: drop <w:ins> blocks, keep deletions.
    const original = runText(p.replace(/<w:ins\b[^>]*>[\s\S]*?<\/w:ins>/g, ""), true);
    if (accepted === original) continue;
    changes.push({ id: `tc_${i++}`, original, accepted, authors });
  }
  return changes;
}

// Locate each change in the project's fields. A change matches the field whose
// text contains its `original` fragment; when several match, the shortest field
// wins (most specific). Returns the changes annotated with their target field.
export function matchChanges(values: unknown, changes: TrackedChange[]): MatchedChange[] {
  const fields = buildSearchableFields(values as any);
  const getVal = (path: string): string | undefined => {
    const v = path.split(".").reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), values);
    return typeof v === "string" ? v : undefined;
  };

  return changes.map((c) => {
    const needle = collapse(c.original);
    if (!needle) return { ...c };
    let best: { path: string; group: SearchGroup; isHtml: boolean; len: number } | null = null;
    for (const f of fields) {
      const raw = getVal(f.path);
      if (raw == null) continue;
      const hay = f.isHtml ? stripHtml(raw) : collapse(raw);
      if (!hay.includes(needle)) continue;
      if (!best || hay.length < best.len) best = { path: f.path, group: f.group, isHtml: f.isHtml, len: hay.length };
    }
    return best ? { ...c, path: best.path, group: best.group, isHtml: best.isHtml } : { ...c };
  });
}

// Apply one matched change to its field's value (text-only replace; tags kept).
export function applyChangeToValue(value: string, isHtml: boolean, change: TrackedChange): string {
  return replaceValue(value, isHtml, change.original, change.accepted, { caseSensitive: true });
}

// ── Drafto AI knowledge: proposed-patch validation & preview ─────────────────
// The LLM proposes field values; nothing it returns is trusted. Everything is
// validated against the field catalog (allow-listed paths + per-field type/enum
// rules) before it can become a "suggested" change, and the user reviews a
// before/after preview before anything is written to the form. This module is
// pure (no React, no form instance) so it is easy to reason about and test.

import {
  FIELD_CATALOG,
  getFieldDescriptor,
  type CatalogEntry,
  type FieldKind,
  type LeafField,
} from "./field-catalog";
import { jsonrepair } from "jsonrepair";
import { stripHtml } from "./clean-html";

// The raw shape we ask the LLM to emit (see drafto-knowledge.ts).
export interface RawOperation {
  path: string;
  value?: unknown; // scalar entries
  items?: Record<string, unknown>[]; // list entries
}
export interface RawProposal {
  operations?: RawOperation[];
  message?: string; // optional assistant note shown alongside the suggestions
  documents?: unknown[]; // optional document-map (validated in document-map.ts)
}

// A validated, safe-to-apply operation.
// A validated leaf value, or — for a nested-list column — an array of validated
// sub-rows. The type is recursive to allow arbitrarily nested list columns.
export type SafeLeafValue = string | boolean | number | SafeRow[];
export type SafeRow = Record<string, SafeLeafValue>;

export interface SafeScalarOp {
  kind: "scalar";
  path: string;
  label: string;
  tab: string;
  value: string | boolean | number;
}
export interface SafeListOp {
  kind: "list";
  path: string;
  label: string;
  tab: string;
  items: SafeRow[];
}
export type SafeOp = SafeScalarOp | SafeListOp;

export interface RejectedOp {
  path: string;
  reason: string;
}

export interface ValidationResult {
  valid: SafeOp[];
  rejected: RejectedOp[];
  message?: string;
  hadTruncatedItem?: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

// Coerce + check a single leaf value against its declared kind. Returns the
// cleaned value or an error string.
function coerceLeaf(
  value: unknown,
  kind: FieldKind,
  enumValues: readonly string[] | undefined,
  label: string
): { ok: true; value: string | boolean | number } | { ok: false; reason: string } {
  switch (kind) {
    case "boolean": {
      if (typeof value === "boolean") return { ok: true, value };
      if (typeof value === "string") {
        const lower = value.toLowerCase().trim();
        if (lower === "true" || lower === "yes") return { ok: true, value: true };
        if (lower === "false" || lower === "no") return { ok: true, value: false };
      }
      if (value === "true" || value === "false") return { ok: true, value: value === "true" };
      return { ok: false, reason: `${label}: expected true/false` };
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n)) return { ok: true, value: n };
      return { ok: false, reason: `${label}: expected a number` };
    }
    case "enum": {
      const s = (typeof value === "string" ? stripHtml(value) : String(value)).trim();
      if (enumValues && enumValues.includes(s)) return { ok: true, value: s };
      // Case-insensitive fallback
      const matching = enumValues?.find((e) => e.toLowerCase() === s.toLowerCase());
      if (matching) return { ok: true, value: matching };
      return { ok: false, reason: `${label}: "${s}" is not one of ${enumValues?.join(" / ")}` };
    }
    case "date": {
      const s = (typeof value === "string" ? stripHtml(value) : String(value)).trim();
      if (ISO_DATE.test(s) && !Number.isNaN(Date.parse(s))) return { ok: true, value: s };
      return { ok: false, reason: `${label}: expected an ISO date (yyyy-mm-dd)` };
    }
    case "text":
    case "longtext":
    default: {
      if (typeof value === "string") return { ok: true, value };
      if (value == null) return { ok: false, reason: `${label}: missing value` };
      return { ok: true, value: String(value) };
    }
  }
}

function validateListItem(
  raw: Record<string, unknown>,
  fields: LeafField[],
  path: string
): { ok: true; item: SafeRow } | { ok: false; reason: string } {
  const item: SafeRow = {};
  for (const f of fields) {
    if (!(f.key in raw) || raw[f.key] == null || raw[f.key] === "") continue; // partial rows allowed
    if (f.itemFields) {
      // Nested-list column (e.g. petitioners within a common-order group).
      const rawRows = raw[f.key];
      if (!Array.isArray(rawRows)) {
        return { ok: false, reason: `${path}.${f.key}: expected an array of rows` };
      }
      const rows: SafeRow[] = [];
      for (const rawRow of rawRows) {
        const res = validateListItem((rawRow ?? {}) as Record<string, unknown>, f.itemFields, `${path}.${f.key}`);
        if (!res.ok) return { ok: false, reason: res.reason };
        if (Object.keys(res.item).length > 0) rows.push(res.item);
      }
      item[f.key] = rows;
      continue;
    }
    const res = coerceLeaf(raw[f.key], f.kind, f.enumValues, `${path}.${f.key}`);
    if (!res.ok) return { ok: false, reason: res.reason };
    item[f.key] = res.value;
  }
  return { ok: true, item };
}

/**
 * Normalizes list row items emitted by models that might be bare strings,
 * or use slight key variations (e.g. "question", "text", "ground" instead of "particulars").
 */
function normalizeListItems(items: unknown[], desc: CatalogEntry): Record<string, unknown>[] {
  const primaryKey = desc.itemFields?.[0]?.key || "particulars";
  return items
    .map((it): Record<string, unknown> | null => {
      if (typeof it === "string") {
        return { [primaryKey]: it };
      }
      if (it && typeof it === "object" && !Array.isArray(it)) {
        const obj = { ...(it as Record<string, unknown>) };
        if (!("particulars" in obj)) {
          if ("question" in obj) obj.particulars = obj.question;
          else if ("ground" in obj) obj.particulars = obj.ground;
          else if ("text" in obj) obj.particulars = obj.text;
          else if ("prayer" in obj) obj.particulars = obj.prayer;
        }
        return obj;
      }
      return null;
    })
    .filter((it): it is Record<string, unknown> => it !== null);
}

/**
 * Normalizes scalar values where the model wrapped a string/number in a sub-object
 * like { text: "..." } or { content: "..." } or provided an array of paragraphs.
 */
function normalizeScalarValue(val: unknown): unknown {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.value === "string" || typeof obj.value === "boolean" || typeof obj.value === "number") return obj.value;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
    if (typeof obj.html === "string") return obj.html;
  }
  if (Array.isArray(val) && val.every((item) => typeof item === "string")) {
    return val.join("\n");
  }
  return val;
}

/**
 * Recursively unwrap nested objects emitted by LLMs into individual dotted leaf operations.
 * For example, if an LLM emits:
 * { path: "listingProforma", value: { general: { mainCategory: "..." }, legalProvisions: [...] } }
 * or { path: "deponent", value: { name: "...", relationship: "son of" } }
 * this flattens them into exact catalog paths like "listingProforma.general.mainCategory", "deponent.name", etc.
 */
function flattenRawOps(rawOps: RawOperation[]): RawOperation[] {
  const result: RawOperation[] = [];

  function expand(path: string, val: unknown) {
    if (val === null || val === undefined) return;
    const desc = getFieldDescriptor(path);
    if (desc) {
      if (desc.isList) {
        const rawItems = Array.isArray(val) ? val : [];
        result.push({ kind: "list", path, items: normalizeListItems(rawItems, desc) });
      } else {
        result.push({ kind: "scalar", path, value: normalizeScalarValue(val) });
      }
      return;
    }
    // If it's an array without a matching descriptor, we cannot unpack further
    if (Array.isArray(val)) {
      result.push({ kind: "list", path, items: val as Record<string, unknown>[] });
      return;
    }
    // If it's an object, recurse into subkeys
    if (typeof val === "object") {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        const subPath = path ? `${path}.${k}` : k;
        expand(subPath, v);
      }
      return;
    }
    // Primitive but unrecognized path
    result.push({ kind: "scalar", path, value: val });
  }

  for (const op of rawOps) {
    if (!op || typeof op.path !== "string") continue;
    const desc = getFieldDescriptor(op.path);
    if (desc) {
      if (desc.isList) {
        const rawItems = Array.isArray(op.items)
          ? op.items
          : Array.isArray(op.value)
          ? op.value
          : [];
        result.push({ kind: "list", path: op.path, items: normalizeListItems(rawItems, desc) });
      } else {
        result.push({ kind: "scalar", path: op.path, value: normalizeScalarValue(op.value) });
      }
    } else if (typeof op.value === "object" && op.value !== null) {
      expand(op.path, op.value);
    } else {
      result.push(op);
    }
  }

  return result;
}

function isTruncatedFragment(item: SafeRow, path: string): boolean {
  if (path === "grounds") {
    if (item.isHeading) return false;
    const clean = String(item.particulars || "").replace(/<[^>]*>/g, "").trim();
    if (clean.length < 25) return true;
    if (/^(FOR\s+THAT|BECAUSE|THAT|GROUND\s+[A-Z0-9]+)\s*$/i.test(clean)) return true;
    if (/\b(that|the|and|with|by|under|in|of|or)\s*$/i.test(clean)) return true;
  }
  if (path === "questionsOfLaw") {
    if (item.isHeading) return false;
    const clean = String(item.particulars || "").replace(/<[^>]*>/g, "").trim();
    if (clean.length < 25) return true;
    if (/^Whether\s*$/i.test(clean)) return true;
  }
  if (path.includes("interimReliefGrounds")) {
    const clean = String(item.particulars || "").replace(/<[^>]*>/g, "").trim();
    if (clean.length < 25) return true;
  }
  return false;
}

// Validate a whole LLM proposal against the catalog.
export function validateProposal(raw: RawProposal): ValidationResult {
  const valid: SafeOp[] = [];
  const rejected: RejectedOp[] = [];
  let hadTruncatedItem = false;
  const rawOps = Array.isArray(raw?.operations) ? raw.operations : [];
  const ops = flattenRawOps(rawOps);

  for (const op of ops) {
    const path = op?.path;
    if (typeof path !== "string") {
      rejected.push({ path: String(path), reason: "missing path" });
      continue;
    }
    const desc: CatalogEntry | undefined = getFieldDescriptor(path);
    if (!desc) {
      rejected.push({ path, reason: "not a fillable field (the assistant can only edit known fields)" });
      continue;
    }

    if (desc.isList) {
      if (!Array.isArray(op.items)) {
        rejected.push({ path, reason: "expected an items array for a list field" });
        continue;
      }
      const items: SafeRow[] = [];
      let failed: string | null = null;
      for (let idx = 0; idx < op.items.length; idx++) {
        const rawItem = op.items[idx];
        const res = validateListItem(rawItem ?? {}, desc.itemFields ?? [], path);
        if (!res.ok) {
          failed = res.reason;
          break;
        }
        if (Object.keys(res.item).length > 0) {
          if (idx === op.items.length - 1 && isTruncatedFragment(res.item, path)) {
            rejected.push({
              path,
              reason: `discarded truncated fragment: "${String(res.item.particulars || "").slice(0, 30)}…"`,
            });
            hadTruncatedItem = true;
            continue;
          }
          items.push(res.item);
        }
      }
      if (failed) {
        rejected.push({ path, reason: failed });
        continue;
      }
      valid.push({ kind: "list", path, label: desc.label, tab: desc.tab, items });
    } else {
      const res = coerceLeaf(op.value, desc.kind ?? "text", desc.enumValues, desc.label);
      if (!res.ok) {
        rejected.push({ path, reason: res.reason });
        continue;
      }
      valid.push({ kind: "scalar", path, label: desc.label, tab: desc.tab, value: res.value });
    }
  }

  return {
    valid,
    rejected,
    message: typeof raw?.message === "string" ? raw.message : undefined,
    hadTruncatedItem,
  };
}

// ── Human-readable preview for the suggest-before-write review ───────────────

export interface ScalarChangePreview {
  kind: "scalar";
  path: string;
  label: string;
  tab: string;
  before: string;
  after: string;
}
export interface ListChangePreview {
  kind: "list";
  path: string;
  label: string;
  tab: string;
  beforeCount: number;
  afterRows: string[]; // one short line per proposed row
}
export type ChangePreview = ScalarChangePreview | ListChangePreview;

function getAtPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function shortText(v: unknown, max = 80): string {
  const s = v == null ? "" : String(v);
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

// Build a preview of what each valid op would change, against the current form
// values. Used to render the review list before applying.
export function buildPreview(currentValues: unknown, ops: SafeOp[]): ChangePreview[] {
  return ops.map((op): ChangePreview => {
    if (op.kind === "scalar") {
      return {
        kind: "scalar",
        path: op.path,
        label: op.label,
        tab: op.tab,
        before: shortText(getAtPath(currentValues, op.path)) || "(empty)",
        after: shortText(op.value) || "(empty)",
      };
    }
    const existing = getAtPath(currentValues, op.path);
    const beforeCount = Array.isArray(existing) ? existing.length : 0;
    const afterRows = op.items.map((it) => {
      const parts = Object.entries(it).map(([k, v]) =>
        Array.isArray(v) ? `${k}: ${v.length} row(s)` : `${k}: ${shortText(v, 40)}`
      );
      return parts.join(" · ");
    });
    return { kind: "list", path: op.path, label: op.label, tab: op.tab, beforeCount, afterRows };
  });
}

// Total catalog size — handy for the system prompt / diagnostics.
export const CATALOG_FIELD_COUNT = FIELD_CATALOG.length;

// ── Extracting the proposal from the model's free-text reply ─────────────────

/**
 * Normalizes any parsed JSON output into a standard RawProposal structure:
 * 1. Already has `operations` array -> returns as-is.
 * 2. An array of operations [ { path: "...", ... } ] -> wraps into { operations }.
 * 3. A key-value dictionary where keys are field paths (e.g. { synopsis: "...", questionsOfLaw: [...] })
 *    -> converts each key into a scalar or list operation.
 */
function normalizeProposal(raw: unknown): RawProposal | null {
  if (!raw || typeof raw !== "object") return null;

  // Case 1: If raw is an array of operations: [ { path: "...", ... } ]
  if (Array.isArray(raw)) {
    if (
      raw.length > 0 &&
      typeof raw[0] === "object" &&
      raw[0] !== null &&
      ("path" in raw[0] || "particulars" in raw[0] || "isHeading" in raw[0])
    ) {
      return { operations: raw as RawOperation[] };
    }
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Case 2: Standard proposal with operations array
  if (Array.isArray(obj.operations)) {
    return obj as RawProposal;
  }

  // Case 3: Documents map proposal
  if ("documents" in obj && Array.isArray(obj.documents)) {
    return obj as RawProposal;
  }

  // Case 4: Key-value map where keys are known fields or prefixes:
  // e.g. { synopsis: "...", questionsOfLaw: [...], grounds: [...] }
  const operations: RawOperation[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key === "message" || key === "explanation" || key === "status") continue;
    const desc = getFieldDescriptor(key);
    if (desc) {
      if (desc.isList) {
        const items = Array.isArray(val)
          ? (val as Record<string, unknown>[])
          : [];
        operations.push({ kind: "list", path: key, items });
      } else {
        operations.push({ kind: "scalar", path: key, value: val });
      }
    } else if (
      key === "deponent" ||
      key === "listingProforma" ||
      key === "interimRelief" ||
      key === "interim" ||
      key === "general" ||
      key === "specialCategories" ||
      key === "parties" ||
      key === "impugned"
    ) {
      // Parent prefix (flattenRawOps will unpack it)
      operations.push({ kind: "scalar", path: key, value: val });
    } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
      operations.push({ kind: "list", path: key, items: val as Record<string, unknown>[] });
    }
  }

  if (operations.length > 0) {
    return {
      operations,
      message: typeof obj.message === "string" ? obj.message : undefined,
    };
  }

  // If object only has a message string
  if (typeof obj.message === "string" && obj.message.trim()) {
    return { operations: [], message: obj.message };
  }

  return null;
}

// Parse JSON that may be malformed in the usual LLM ways (unescaped quotes and
// newlines inside string values, trailing commas, etc.). Tries strict parse
// first, then `jsonrepair` — which reliably fixes the quote/newline-heavy rich
// text our drafts produce.
function tryParse(c: string): RawProposal | null {
  const trimmed = c.trim();
  try {
    const parsed = JSON.parse(trimmed);
    const norm = normalizeProposal(parsed);
    if (norm) return norm;
  } catch { /* fall through to repair */ }
  try {
    const parsed = JSON.parse(jsonrepair(trimmed));
    const norm = normalizeProposal(parsed);
    if (norm) return norm;
  } catch { /* unparseable even after repair */ }
  return null;
}

// Pull the JSON proposal out of the assistant's text. Tries, in order: a
// ```json fenced block, any fenced block, the whole string, then the widest
// {...} substring — each both as-is and lightly repaired. Returns null if
// nothing parseable is found.
export function extractProposal(text: string, targetPath?: string): RawProposal | null {
  if (!text) return null;
  const candidates: string[] = [];
  const jsonFence = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonFence) candidates.push(jsonFence[1]);
  const anyFence = text.match(/```\s*([\s\S]*?)```/);
  if (anyFence) candidates.push(anyFence[1]);
  candidates.push(text);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) candidates.push(text.slice(arrStart, arrEnd + 1));

  for (const c of candidates) {
    const parsed = tryParse(c);
    if (parsed) return parsed;
  }

  // Fallback recovery if model generated content without valid JSON wrapper:
  if (targetPath) {
    // If the text looks like an attempt at JSON (contains ``` or {"operations" or "path":)
    if (/```|\{"operations"|"path":|"value":/i.test(text)) {
      if (targetPath === "synopsis") {
        const valMatch =
          text.match(/"path"\s*:\s*"synopsis"[\s\S]*?"value"\s*:\s*"([\s\S]*?)(?:"\s*\}|"$|$)/i) ||
          text.match(/"synopsis"\s*:\s*"([\s\S]*?)(?:"\s*\}|"$|$)/i);
        if (valMatch && valMatch[1]) {
          const val = valMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t")
            .trim();
          if (val.length > 20 && !/\{"operations"|"kind":|"path":/i.test(val)) {
            return {
              operations: [{ kind: "scalar", path: "synopsis", value: val }],
            };
          }
        }
      }
      // If it contains JSON markers, NEVER return the raw unparsed JSON string!
      return null;
    }

    const cleanText = stripJsonBlock(text).trim();
    if (cleanText.length > 20 && !/\{"operations"|"kind":|"path":|```/i.test(cleanText)) {
      if (targetPath === "synopsis" && cleanText.length > 30) {
        return {
          operations: [{ kind: "scalar", path: "synopsis", value: cleanText }],
        };
      }
      if (targetPath === "questionsOfLaw") {
        const qLines = cleanText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(
            (l) =>
              l.length > 15 &&
              (/whether/i.test(l) || /\?$/.test(l) || /^(\d+[\.\)]|\([a-z0-9]+\)|[a-z]\.)/i.test(l))
          );
        if (qLines.length > 0) {
          const items = qLines.map((q) => ({
            particulars: q.replace(/^(\d+[\.\)]|\([A-Za-z0-9]+\)|[A-Za-z]\.|\bQUESTION\s+[A-Z0-9]+:?|[-*•])\s*/i, "").trim(),
            isHeading: false,
            heading: "",
          }));
          return { operations: [{ kind: "list", path: "questionsOfLaw", items }] };
        }
      }
      if (targetPath === "grounds") {
        const gLines = cleanText
          .split(/\r?\n\s*\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 20);
        if (gLines.length > 0) {
          const items = gLines.map((g) => ({
            particulars: g.replace(/^(\d+\.|\([A-Za-z0-9]+\)|[-*•])\s*/, "").trim(),
            isHeading: false,
            heading: "",
          }));
          return { operations: [{ kind: "list", path: "grounds", items }] };
        }
      }
    }
  }

  return null;
}

// Extract the complete top-level objects from an array `"key": [ {…}, {…}, …`
// inside possibly-INCOMPLETE JSON (e.g. output cut off mid-generation). Returns
// only the objects that fully closed; stops at the first incomplete one. String
// quoting/escaping is respected so braces inside values don't fool the scanner.
function extractCompleteArrayObjects(text: string, key: string): unknown[] {
  const out: unknown[] = [];
  const keyMatch = text.match(new RegExp(`"${key}"\\s*:\\s*\\[`));
  if (!keyMatch || keyMatch.index === undefined) return out;
  let i = text.indexOf("[", keyMatch.index);
  if (i < 0) return out;
  i++;
  const n = text.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(text[i])) i++; // skip whitespace/commas
    if (i >= n || text[i] === "]") break; // end of array (or text)
    if (text[i] !== "{") break; // unexpected token
    const start = i;
    let depth = 0, inStr = false, esc = false, complete = false;
    for (; i < n; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { i++; complete = true; break; }
      }
    }
    if (!complete) break; // ran out mid-object → stop here
    const objStr = text.slice(start, i);
    try {
      out.push(JSON.parse(objStr));
    } catch {
      try {
        out.push(JSON.parse(jsonrepair(objStr)));
      } catch {
        break;
      }
    }
  }
  return out;
}

// Best-effort recovery from a partial/cut-off reply: pull whatever operations and
// documents had fully completed. Returns null if nothing usable was recovered.
export function extractPartialProposal(text: string): RawProposal | null {
  if (!text) return null;
  const operations = extractCompleteArrayObjects(text, "operations") as RawOperation[];
  const documents = extractCompleteArrayObjects(text, "documents");
  if (operations.length === 0 && documents.length === 0) return null;
  return { operations, documents };
}

// The human-readable part of the reply, with any fenced JSON block removed.
// Handles both complete (closed by ```) and unclosed (cut off mid-generation) code blocks.
export function stripJsonBlock(text: string): string {
  return text
    .replace(/```json[\s\S]*?(?:```|$)/gi, "")
    .replace(/```[\s\S]*?(?:```|$)/g, "")
    .trim();
}

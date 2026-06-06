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
      if (value === "true" || value === "false") return { ok: true, value: value === "true" };
      return { ok: false, reason: `${label}: expected true/false` };
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n)) return { ok: true, value: n };
      return { ok: false, reason: `${label}: expected a number` };
    }
    case "enum": {
      const s = String(value);
      if (enumValues && enumValues.includes(s)) return { ok: true, value: s };
      return { ok: false, reason: `${label}: "${s}" is not one of ${enumValues?.join(" / ")}` };
    }
    case "date": {
      const s = String(value).trim();
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

// Validate a whole LLM proposal against the catalog.
export function validateProposal(raw: RawProposal): ValidationResult {
  const valid: SafeOp[] = [];
  const rejected: RejectedOp[] = [];
  const ops = Array.isArray(raw?.operations) ? raw.operations : [];

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
      for (const rawItem of op.items) {
        const res = validateListItem(rawItem ?? {}, desc.itemFields ?? [], path);
        if (!res.ok) {
          failed = res.reason;
          break;
        }
        if (Object.keys(res.item).length > 0) items.push(res.item);
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

  return { valid, rejected, message: typeof raw?.message === "string" ? raw.message : undefined };
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

function looksLikeProposal(o: unknown): o is RawProposal {
  return !!o && typeof o === "object" && ("operations" in (o as object) || "message" in (o as object) || "documents" in (o as object));
}

// Parse JSON that may be malformed in the usual LLM ways (unescaped quotes and
// newlines inside string values, trailing commas, etc.). Tries strict parse
// first, then `jsonrepair` — which reliably fixes the quote/newline-heavy rich
// text our drafts produce.
function tryParse(c: string): RawProposal | null {
  const trimmed = c.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (looksLikeProposal(parsed)) return parsed;
  } catch { /* fall through to repair */ }
  try {
    const parsed = JSON.parse(jsonrepair(trimmed));
    if (looksLikeProposal(parsed)) return parsed;
  } catch { /* unparseable even after repair */ }
  return null;
}

// Pull the JSON proposal out of the assistant's text. Tries, in order: a
// ```json fenced block, any fenced block, the whole string, then the widest
// {...} substring — each both as-is and lightly repaired. Returns null if
// nothing parseable is found.
export function extractProposal(text: string): RawProposal | null {
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

  for (const c of candidates) {
    const parsed = tryParse(c);
    if (parsed) return parsed;
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
export function stripJsonBlock(text: string): string {
  return text
    .replace(/```json\s*[\s\S]*?```/gi, "")
    .replace(/```\s*[\s\S]*?```/g, "")
    .trim();
}

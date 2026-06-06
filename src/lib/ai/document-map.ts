// ── Document Map: validation + date matching for the split-and-attach flow ────
// Claude proposes a "document map" (which pages of which source PDF are which
// document); Drafto validates it here, then cuts + attaches deterministically.
// Pure module (no React / no Node) so it is easy to test.

export type DocType =
  | "annexure"
  | "ia_annexure"
  | "affidavit"
  | "vakalatnama"
  | "custody_certificate"
  | "fir_details"
  | "other";

export const DOC_TYPES: DocType[] = [
  "annexure",
  "ia_annexure",
  "affidavit",
  "vakalatnama",
  "custody_certificate",
  "fir_details",
  "other",
];

// Mirrors annexureSchema.copyType.
export const COPY_TYPES = [
  "true copy",
  "typed copy",
  "true and typed copy",
  "translated copy",
  "true and translated copy",
] as const;
export type CopyType = (typeof COPY_TYPES)[number];

export interface RawDocument {
  sourceFile?: string;
  startPage?: number;
  endPage?: number;
  type?: string;
  title?: string;
  date?: string;
  isAdditionalDocument?: boolean;
  copyType?: string;
}

export interface SafeDocument {
  sourceFile: string;
  startPage: number; // 1-indexed, inclusive
  endPage: number;   // 1-indexed, inclusive
  type: DocType;
  title: string;
  date: string;       // as written by the model (free text)
  dateISO: string | null; // normalised yyyy-mm-dd, or null if unparseable
  isAdditionalDocument: boolean;
  copyType: CopyType;
}

export interface RejectedDocument {
  label: string;
  reason: string;
}

export interface DocMapValidation {
  valid: SafeDocument[];
  rejected: RejectedDocument[];
}

export interface SourceFileInfo {
  name: string;
  pageCount: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Normalise a free-text date to canonical yyyy-mm-dd, or null if it can't be
// parsed. Handles dd.mm.yyyy / dd-mm-yyyy / dd/mm/yyyy, yyyy-mm-dd, and worded
// dates like "12 March 2021", "12th March, 2021", "March 12, 2021".
export function normalizeDate(input: string | undefined | null): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // yyyy-mm-dd (or yyyy/mm/dd)
  let m = s.match(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${pad(+mo)}-${pad(+d)}`;
  }

  // dd[sep]mm[sep]yyyy
  m = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  if (m) {
    const [, d, mo, y] = m;
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return `${y}-${pad(+mo)}-${pad(+d)}`;
  }

  // "12 March 2021" / "12th March, 2021"
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})\b/);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${pad(mo)}-${pad(+m[1])}`;
  }

  // "March 12, 2021"
  m = s.match(/\b([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${pad(mo)}-${pad(+m[2])}`;
  }

  return null;
}

function asInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isInteger(n) ? n : null;
}

// Validate a proposed document map against the actual source files + page counts.
export function validateDocumentMap(
  rawDocs: RawDocument[] | undefined,
  files: SourceFileInfo[]
): DocMapValidation {
  const valid: SafeDocument[] = [];
  const rejected: RejectedDocument[] = [];
  const byName = new Map(files.map((f) => [f.name, f.pageCount]));
  const docs = Array.isArray(rawDocs) ? rawDocs : [];

  docs.forEach((d, i) => {
    const label = d?.title || `Document ${i + 1}`;
    const sourceFile = typeof d?.sourceFile === "string" ? d.sourceFile : "";
    if (!byName.has(sourceFile)) {
      rejected.push({ label, reason: `unknown source file "${sourceFile}"` });
      return;
    }
    const pageCount = byName.get(sourceFile)!;
    const start = asInt(d.startPage);
    const end = asInt(d.endPage);
    if (start == null || end == null) {
      rejected.push({ label, reason: "missing/invalid page numbers" });
      return;
    }
    if (start < 1 || end < start || end > pageCount) {
      rejected.push({ label, reason: `pages ${start}-${end} out of range (file has ${pageCount} pages)` });
      return;
    }
    const type = (DOC_TYPES as string[]).includes(String(d.type)) ? (d.type as DocType) : "other";
    const copyType = (COPY_TYPES as readonly string[]).includes(String(d.copyType))
      ? (d.copyType as CopyType)
      : "true copy";

    valid.push({
      sourceFile,
      startPage: start,
      endPage: end,
      type,
      title: (d.title || "").trim(),
      date: (d.date || "").trim(),
      dateISO: normalizeDate(d.date),
      isAdditionalDocument: !!d.isAdditionalDocument,
      copyType,
    });
  });

  // Flag overlapping page ranges within the same source file (not fatal).
  const bySource = new Map<string, SafeDocument[]>();
  for (const v of valid) {
    if (!bySource.has(v.sourceFile)) bySource.set(v.sourceFile, []);
    bySource.get(v.sourceFile)!.push(v);
  }
  for (const [src, list] of bySource) {
    const sorted = [...list].sort((a, b) => a.startPage - b.startPage);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startPage <= sorted[i - 1].endPage) {
        rejected.push({
          label: `${src}`,
          reason: `overlapping page ranges (${sorted[i - 1].startPage}-${sorted[i - 1].endPage} and ${sorted[i].startPage}-${sorted[i].endPage})`,
        });
      }
    }
  }

  return { valid, rejected };
}

// ── The "Needs you" report ───────────────────────────────────────────────────
// What Mayur could not finish, collected across every pass of a run and shown
// as one list grouped by tab. The reasons are a closed set: a free-text excuse
// is not actionable, and "I could not find it" and "you must decide" call for
// completely different responses from the user.

import type { DraftMode } from "./field-catalog";
import { sectionById } from "./sections";

export type GapReason = "not-in-documents" | "documents-disagree" | "needs-your-decision" | "assumed";

export interface Gap {
  /** Section this came out of — used to group and to jump to the tab. */
  sectionId: string;
  sectionLabel: string;
  tab: string;
  field: string;
  reason: GapReason;
  detail: string;
}

export const GAP_REASON_LABEL: Record<GapReason, string> = {
  "not-in-documents": "Not in the documents",
  "documents-disagree": "The documents disagree",
  "needs-your-decision": "Needs your decision",
  assumed: "Assumed — please check",
};

/** Ordering: things that block filing first, assumptions last. */
const REASON_RANK: Record<GapReason, number> = {
  "needs-your-decision": 0,
  "documents-disagree": 1,
  "not-in-documents": 2,
  assumed: 3,
};

function normaliseReason(v: unknown): GapReason {
  const s = String(v ?? "").toLowerCase().trim();
  if (s.includes("disagree") || s.includes("conflict")) return "documents-disagree";
  if (s.includes("decision") || s.includes("instruct")) return "needs-your-decision";
  if (s.includes("assum")) return "assumed";
  return "not-in-documents";
}

/** Pull the gaps out of one pass's reply. Tolerant of a model that improvises. */
export function extractGaps(mode: DraftMode, sectionId: string, raw: unknown): Gap[] {
  const sec = sectionById(mode, sectionId);
  const arr = Array.isArray((raw as any)?.gaps) ? (raw as any).gaps : [];
  const out: Gap[] = [];
  for (const g of arr) {
    const field = typeof g?.field === "string" ? g.field.trim() : "";
    const detail = typeof g?.detail === "string" ? g.detail.trim() : "";
    if (!field && !detail) continue;
    out.push({
      sectionId,
      sectionLabel: sec?.label ?? sectionId,
      tab: sec?.tab ?? "",
      field: field || "—",
      reason: normaliseReason(g?.reason),
      detail: detail || "No further detail given.",
    });
  }
  return out;
}

/** Group for display: by tab, most blocking first within each. */
export function groupGaps(gaps: Gap[]): { tab: string; gaps: Gap[] }[] {
  const order: string[] = [];
  const map = new Map<string, Gap[]>();
  for (const g of gaps) {
    const key = g.tab || "Other";
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(g);
  }
  return order.map((tab) => ({
    tab,
    gaps: map.get(tab)!.slice().sort((a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason]),
  }));
}

/** One-line summary for the end of a run. */
export function summariseGaps(gaps: Gap[]): string {
  if (gaps.length === 0) return "Nothing outstanding.";
  const blocking = gaps.filter((g) => g.reason !== "assumed").length;
  const assumed = gaps.length - blocking;
  const bits: string[] = [];
  if (blocking) bits.push(`${blocking} thing${blocking === 1 ? "" : "s"} Mayur could not fill`);
  if (assumed) bits.push(`${assumed} assumption${assumed === 1 ? "" : "s"} to check`);
  return bits.join(", ") + ".";
}

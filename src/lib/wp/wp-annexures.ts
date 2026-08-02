// Lightweight annexure ordering/labelling for WP — no docx imports, so the
// Facts engine (and tests) can use it without pulling in the document layer.

import type { DraftoProject, Annexure, CustomIa, IaAnnexure } from "@/lib/schema";

// Ordered annexures with their P-numbers. Impugned-order annexures sort first
// (P-1…), then the remaining annexures in List-of-Dates order. The array form
// is shared with the UI numbering (LoD table / annexure dialog) so on-screen
// P-numbers always match the generated documents.
export function wpAnnexureOrderFromLods(listOfDates: { annexures?: Annexure[] }[]): { annex: Annexure; pNumber: number }[] {
  const all: Annexure[] = (listOfDates || []).flatMap(lod => lod.annexures || []);
  const io = all.filter(a => a.isImpugnedOrder);
  const rest = all.filter(a => !a.isImpugnedOrder);
  return [...io, ...rest].map((annex, i) => ({ annex, pNumber: i + 1 }));
}

export function wpAnnexureOrder(project: DraftoProject): { annex: Annexure; pNumber: number }[] {
  return wpAnnexureOrderFromLods(project.listOfDates || []);
}

export function annexLabel(pNumber: number, annex: Annexure, prefix: string = "P"): string {
  return `Annexure ${prefix}-${pNumber}${annex.isColly ? " (Colly)" : ""}`;
}

// ── Custom-CM annexures (A-series) ──────────────────────────────────────────
// Each custom CM's annexures are its own: numbering restarts at A-1 per CM
// (they are annexures to that application, not to the petition), in ground
// order then attachment order — matching the numbers the grounds table shows.

export interface CmAnnexEntry { annex: IaAnnexure; aNumber: number; groundId: string }

export function cmAnnexureOrder(cm: CustomIa): CmAnnexEntry[] {
  const out: CmAnnexEntry[] = [];
  for (const g of cm.grounds || []) {
    for (const annex of g.annexures || []) out.push({ annex, aNumber: out.length + 1, groundId: g.id });
  }
  return out;
}

export function cmAnnexLabel(aNumber: number): string {
  return `Annexure A-${aNumber}`;
}

// Prose sentence appended to the CM ground paragraph ("Annexure A-1 is a true
// copy of … dated ….").
export function cmAnnexBodySentence(aNumber: number, annex: IaAnnexure): string {
  const dated = annex.date ? ` dated ${annex.date}` : "";
  return `${cmAnnexLabel(aNumber)} is a true copy of ${annex.title || "[description]"}${dated}.`;
}

// Index/bookmark description (colon style; the bold label is rendered
// separately).
export function cmAnnexIndexText(annex: IaAnnexure): string {
  const dated = annex.date ? ` dated ${annex.date}` : "";
  return `A true copy of ${annex.title || "[description]"}${dated}.`;
}

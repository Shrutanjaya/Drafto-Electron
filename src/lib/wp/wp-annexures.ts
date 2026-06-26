// Lightweight annexure ordering/labelling for WP — no docx imports, so the
// Facts engine (and tests) can use it without pulling in the document layer.

import type { DraftoProject, Annexure } from "@/lib/schema";

// Ordered annexures with their P-numbers. Impugned-order annexures sort first
// (P-1…), then the remaining annexures in List-of-Dates order.
export function wpAnnexureOrder(project: DraftoProject): { annex: Annexure; pNumber: number }[] {
  const all: Annexure[] = (project.listOfDates || []).flatMap(lod => lod.annexures || []);
  const io = all.filter(a => a.isImpugnedOrder);
  const rest = all.filter(a => !a.isImpugnedOrder);
  return [...io, ...rest].map((annex, i) => ({ annex, pNumber: i + 1 }));
}

export function annexLabel(pNumber: number, annex: Annexure): string {
  return `Annexure P-${pNumber}${annex.isColly ? " (Colly)" : ""}`;
}

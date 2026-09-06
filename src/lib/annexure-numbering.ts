// ── Which number an annexure carries ────────────────────────────────────────
// The number is never stored and never typed. It is derived from where the
// annexure sits — its position in its own date's list, and that date's position
// in the List of Dates — plus the group rule of the tool in hand: in the
// Supreme Court SLP an "additional document" sorts after everything else; in
// the Delhi HC writ and the CAT original application the impugned order sorts
// to the front (P-1 / A-1).
//
// The dialogs, the on-screen tables and the generated documents all read this
// one function, so the number a lawyer sees while dragging is the number the
// paper-book will carry, and the two can never drift apart.

import type { Annexure } from "@/lib/schema";
import { wpAnnexureOrderFromLods } from "@/lib/wp/wp-annexures";

export interface AnnexureRow {
  annexures?: Annexure[];
}

export function annexureNumbering(rows: AnnexureRow[], courtType?: string): Map<string, number> {
  if (courtType === "WritPetitionDHC" || courtType === "OriginalApplicationCAT") {
    return new Map<string, number>(wpAnnexureOrderFromLods(rows || []).map(e => [e.annex.id, e.pNumber]));
  }

  const all: Annexure[] = (rows || []).flatMap(row => row?.annexures || []);
  const map = new Map<string, number>();
  let counter = 1;
  all.filter(annex => !annex.isAdditionalDocument).forEach(annex => map.set(annex.id, counter++));
  all.filter(annex => annex.isAdditionalDocument).forEach(annex => map.set(annex.id, counter++));
  return map;
}

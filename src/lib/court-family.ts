/**
 * Court-type families.
 *
 * Some document types are copies of another: the Supreme Court Appeal is the
 * SLP tool with an appeal cover and a Facts section, and the PIL writ petition
 * is the Article 32 writ petition with PIL-specific wording. Shared components
 * (the header's export menu, the PDF dialog, the annexure dialog) branch on the
 * FAMILY rather than on a single court type, so a copied tool inherits every
 * behaviour of its parent automatically and only its deliberate differences
 * have to be written down.
 *
 * Test with these helpers rather than comparing courtType directly. A bare
 * `courtType === "WritPetitionSC"` silently excludes the PIL variant, which is
 * how a copied tool quietly loses half its features.
 */

import type { DraftoProject } from "@/lib/schema";

export type ProjectCourtType = DraftoProject["courtType"];

/** The Supreme Court Article 32 writ petition and its PIL variant. */
export function isScWpFamily(courtType?: ProjectCourtType | string): boolean {
  return courtType === "WritPetitionSC" || courtType === "WritPetitionPIL";
}

/** The special leave petition and the statutory appeal copied from it. */
export function isSlpFamily(courtType?: ProjectCourtType | string): boolean {
  return courtType === "SLP" || courtType === "Appeal";
}

/** The statutory appeal specifically — where it differs from the SLP. */
export function isAppeal(courtType?: ProjectCourtType | string): boolean {
  return courtType === "Appeal";
}

/**
 * The letter an annexure label carries: the statutory appeal uses the A-series
 * ("Annexure A-1"), every other Supreme Court document the P-series. Only the
 * letter differs — the NUMBERING rules are untouched, so an appeal still sorts
 * additional documents last and keeps the impugned order out of the series.
 */
export function annexurePrefix(courtType?: ProjectCourtType | string): string {
  return isAppeal(courtType) ? "A" : "P";
}

/** The PIL writ specifically — where it differs from the Article 32 writ. */
export function isPil(courtType?: ProjectCourtType | string): boolean {
  return courtType === "WritPetitionPIL";
}

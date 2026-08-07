import type { PDFPage } from "pdf-lib";

/**
 * A page's rotation, as one of 0, 90, 180 or 270.
 *
 * A PDF page may be stored sideways with a flag telling the reader to turn it
 * when displaying, which is what most scanners produce. The page then looks
 * perfectly straight to the user while carrying a rotation of 90 or 270, and
 * anything stamped onto it — the page number, the annexure label, the True Copy
 * mark — has to be turned to match, or it prints on its side.
 *
 * The catch is that the flag is allowed to be ANY multiple of 90, including
 * negative values and values past 360: -90 and 450 mean exactly what 270 and 90
 * mean. Scanners write those, and so does "rotate, then save" in several PDF
 * apps. Comparing the raw number against 90/180/270 silently misses them, and
 * the stamp lands as though the page were upright.
 *
 * So every rotation check in Drafto goes through here. The rounding is belt and
 * braces against a malformed file carrying something that is not a clean
 * multiple of 90.
 */
export function pageRotation(page: PDFPage): 0 | 90 | 180 | 270 {
  const raw = Number(page.getRotation()?.angle) || 0;
  const snapped = Math.round(raw / 90) * 90;
  return (((snapped % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}

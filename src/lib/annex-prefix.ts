// Annexure label prefix by document type. The Supreme Court (SLP) and Delhi HC
// (writ) use "P-"; the CAT Original Application uses "A-". Keep the UI and the
// generated documents reading from this single source.
export function annexPrefixFor(courtType?: string): string {
  return courtType === "OriginalApplicationCAT" ? "A" : "P";
}

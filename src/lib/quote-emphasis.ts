// ── Emphasis labels on quoted blocks ─────────────────────────────────────────
// Where a drafter emphasises words inside an extract, convention requires them
// to say so — "(emphasis supplied)" if the emphasis is theirs, "(emphasis in
// original)" if it was already there, or something more particular such as
// "(italics supplied, underlining original)".
//
// The label belongs to the quote, so it is carried on the block itself as
// data-emphasis: it moves, copies and saves with the quote, and no setting
// elsewhere can contradict it. On export it prints on its own line, outside the
// closing quotation mark.

export const EMPHASIS_PRESETS = [
  "emphasis supplied",
  "emphasis added",
  "emphasis in original",
  "italics supplied",
] as const;

// What goes into the document, given whatever is stored on the block. The
// parentheses are added on export, so a user who types their own are not
// doubled up.
export function normaliseEmphasisLabel(raw: string | null | undefined): string {
  const text = (raw || "").trim();
  if (!text) return "";
  return text.replace(/^\(+\s*/, "").replace(/\s*\)+$/, "").trim();
}

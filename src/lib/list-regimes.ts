// ── Numbered-list regimes ────────────────────────────────────────────────────
// A numbered list in the editor can follow one of several regimes: which glyph
// each level of the list uses. "1. → a. → i." is the traditional one; drafters
// who start their sub-paragraphs at "a." or "i." need the others.
//
// The regime is carried on the list itself, as `data-regime` on the top-level
// <ol>, so it travels with the text: it survives saving, reloading, copying
// between fields and Find & Replace, and no setting elsewhere can contradict it.
// A list without the attribute is the traditional regime, which is exactly what
// every list written before this existed becomes.
//
// This file is the ONE place the levels are defined. The editor's own display
// (globals.css) and the .docx output (html-to-docx.ts) both follow it, so what
// the screen shows and what Word prints cannot drift apart.

// docx level formats, in level order (level 0 first).
export type DocxListFormat = "decimal" | "lowerLetter" | "lowerRoman" | "upperLetter" | "upperRoman";

// The CSS list-style-type matching each docx format.
export const CSS_FOR_FORMAT: Record<DocxListFormat, string> = {
  decimal: "decimal",
  lowerLetter: "lower-alpha",
  lowerRoman: "lower-roman",
  upperLetter: "upper-alpha",
  upperRoman: "upper-roman",
};

// A short human label for one level, for the menu preview.
const PREVIEW: Record<DocxListFormat, string> = {
  decimal: "1.",
  lowerLetter: "a.",
  lowerRoman: "i.",
  upperLetter: "A.",
  upperRoman: "I.",
};

export interface ListRegime {
  id: string;
  // Five levels deep, which is as far as the editor and the generators go.
  levels: DocxListFormat[];
}

export const LIST_REGIMES: ListRegime[] = [
  // The traditional regime, and the one every existing list already uses.
  { id: "decimal", levels: ["decimal", "lowerLetter", "lowerRoman", "upperLetter", "upperRoman"] },
  { id: "lower-alpha", levels: ["lowerLetter", "lowerRoman", "decimal", "upperLetter", "upperRoman"] },
  { id: "lower-roman", levels: ["lowerRoman", "lowerLetter", "decimal", "upperLetter", "upperRoman"] },
  { id: "upper-alpha", levels: ["upperLetter", "lowerLetter", "lowerRoman", "decimal", "upperRoman"] },
  { id: "upper-roman", levels: ["upperRoman", "upperLetter", "lowerLetter", "lowerRoman", "decimal"] },
];

export const DEFAULT_LIST_REGIME = "decimal";

export function listRegime(id: string | null | undefined): ListRegime {
  return LIST_REGIMES.find(r => r.id === id) || LIST_REGIMES[0];
}

// "1. → a. → i." — the first three levels, which is what the menu shows.
export function regimePreview(regime: ListRegime): string {
  return regime.levels.slice(0, 3).map(f => PREVIEW[f]).join(" → ");
}

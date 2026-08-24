// ── Headings inside the Grounds ──────────────────────────────────────────────
// A long list of grounds often needs to be grouped under headings ("I. ON
// LIMITATION", "II. ON MERITS"). All three tools share ONE grounds list, so a
// heading is stored as a row of that same list, marked as a heading, rather
// than as a separate list of headings with positions: it then drags, reorders
// and deletes along with everything else, and there is no position bookkeeping
// to go stale.
//
// Two rules the whole app depends on, so they live here and nowhere else:
//   • Ground lettering counts ONLY grounds. A heading never consumes a letter,
//     so A, B, C run continuously across headings and any reference to
//     "Grounds A to F" stays true.
//   • A heading's own number (I, II, III …) is written as literal text, never
//     as a Word list, so it cannot collide with — or be renumbered by — any of
//     the document's real numbering.

import { TextRun, Tab } from "docx";
import { smartTextRun } from "./docx-helpers";
import type { DraftoProject } from "./schema";
import { enumLabel, type EnumStyle } from "./wp/wp-numbering";

export type { EnumStyle };

export interface GroundsHeadingStyle {
  numbering: EnumStyle;
  bold: boolean;
  italics: boolean;
  underline: boolean;
  smallCaps: boolean;
  allCaps: boolean;
}

export const DEFAULT_GROUNDS_HEADING_STYLE: GroundsHeadingStyle = {
  numbering: "upper-roman",
  bold: true,
  italics: false,
  underline: false,
  smallCaps: false,
  allCaps: false,
};

// The style/formatting is one choice for the whole Grounds section — a sequence
// in mixed styles would be wrong, and it keeps the editor uncluttered.
export function getGroundsHeadingStyle(project: Partial<DraftoProject> | undefined): GroundsHeadingStyle {
  const s = (project as any)?.groundsHeadingStyle;
  return { ...DEFAULT_GROUNDS_HEADING_STYLE, ...(s || {}) };
}

export const HEADING_STYLE_OPTIONS: { value: EnumStyle; label: string }[] = [
  { value: "upper-roman", label: "I, II, III" },
  { value: "lower-roman", label: "i, ii, iii" },
  { value: "upper-alpha", label: "A, B, C" },
  { value: "lower-alpha", label: "a, b, c" },
  { value: "decimal", label: "1, 2, 3" },
];

// A row of a grounds list. Only `isHeading` rows carry `heading` text; ordinary
// grounds carry rich-text `particulars` as they always have.
export interface GroundsRow {
  id?: string;
  particulars?: string;
  isHeading?: boolean;
  heading?: string;
}

export const isGroundsHeading = (row: GroundsRow | undefined): boolean => !!row?.isHeading;

// Does this row have anything worth printing?
const hasText = (html?: string) => !!(html || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim();
export const groundsRowHasContent = (row: GroundsRow): boolean =>
  isGroundsHeading(row) ? !!(row.heading || "").trim() : hasText(row.particulars);

export type GroundsEntry =
  | { kind: "heading"; row: GroundsRow; rowIndex: number; label: string; text: string }
  | { kind: "ground"; row: GroundsRow; rowIndex: number; ordinal: number };

/**
 * The grounds list resolved into what the document will actually contain:
 * empty rows dropped, headings numbered in their own sequence, grounds carrying
 * a running zero-based ordinal that ignores headings.
 *
 * Every generator (SLP, Writ Petition, CAT) and the editor read this, so the
 * letters on screen and the letters in the document cannot drift apart.
 */
export function groundsSequence(
  rows: GroundsRow[] | undefined,
  style: GroundsHeadingStyle = DEFAULT_GROUNDS_HEADING_STYLE,
): GroundsEntry[] {
  const out: GroundsEntry[] = [];
  let headingNo = 0;
  let ordinal = 0;
  (rows || []).forEach((row, rowIndex) => {
    if (!groundsRowHasContent(row)) return;
    if (isGroundsHeading(row)) {
      out.push({
        kind: "heading",
        row,
        rowIndex,
        label: `${enumLabel(headingNo, style.numbering)}.`,
        text: (row.heading || "").trim(),
      });
      headingNo++;
    } else {
      out.push({ kind: "ground", row, rowIndex, ordinal });
      ordinal++;
    }
  });
  return out;
}

// The label a heading row shows in the editor, computed over the rows as they
// stand (so it updates live as headings are added, moved or removed).
export function headingLabelFor(rows: GroundsRow[] | undefined, rowIndex: number, style: GroundsHeadingStyle): string {
  const entry = groundsSequence(rows, style).find(e => e.rowIndex === rowIndex);
  if (entry && entry.kind === "heading") return entry.label;
  // A heading with no text yet still needs a number to show: count the headings
  // with content before it, since that is the number it will take.
  let n = 0;
  (rows || []).forEach((row, i) => {
    if (i < rowIndex && isGroundsHeading(row) && groundsRowHasContent(row)) n++;
  });
  return `${enumLabel(n, style.numbering)}.`;
}

/**
 * The gap between a heading's number and its title, in twips.
 *
 * It has to clear the WIDEST number in the section — "VIII." needs a good deal
 * more room than "I." — because a number that overruns the gap pushes its own
 * title along and that heading stops lining up with the rest. The same gap is
 * used for every heading in the section, so they align as one block, and it
 * stays at half an inch until a number actually needs more.
 */
export function groundsHeadingHang(entries: GroundsEntry[]): number {
  const BASE = 720;   // 0.5" — fits any single letter, digit, or "II."
  const STEP = 180;   // 0.125" for each further character
  const MAX = 1800;   // 1.25"
  const widest = entries.reduce((n, e) => (e.kind === "heading" ? Math.max(n, e.label.length) : n), 0);
  return Math.min(MAX, BASE + Math.max(0, widest - 3) * STEP);
}

/**
 * The runs of a heading: its number, a tab, then the title.
 *
 * The tab is what makes the hanging indent work. Paired with
 * `indent: { left: X, hanging: X }` the number sits out at the left and the
 * title starts at X on EVERY line, so a heading that runs to three or four
 * lines forms a clean block instead of wrapping back under its own number.
 */
export function groundsHeadingRuns(label: string, text: string, style: GroundsHeadingStyle): TextRun[] {
  return [
    smartTextRun({ text: label, ...headingRunProps(style) }),
    // Left unformatted on purpose: an underlined heading should not carry the
    // rule across the gap between the number and the title.
    new TextRun({ children: [new Tab()] }),
    smartTextRun({ text, ...headingRunProps(style) }),
  ];
}

// docx run properties for a heading, from the section's formatting choice.
export function headingRunProps(style: GroundsHeadingStyle) {
  return {
    bold: style.bold,
    italics: style.italics,
    ...(style.underline ? { underline: { type: "single" as const } } : {}),
    smallCaps: style.smallCaps,
    allCaps: style.allCaps,
  };
}

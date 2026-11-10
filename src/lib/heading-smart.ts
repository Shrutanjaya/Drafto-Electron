import type { Editor } from "@tiptap/react";
import type { Transaction } from "@tiptap/pm/state";
import type { EnumStyle } from "@/lib/wp/wp-numbering";
import { getHeadingSettings } from "./heading-settings";

// Roman numeral conversion
const ROMAN_NUMERALS: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
];

export function toRoman(num: number): string {
  if (num <= 0) return "I";
  let result = "";
  for (const [val, roman] of ROMAN_NUMERALS) {
    while (num >= val) {
      result += roman;
      num -= val;
    }
  }
  return result;
}

export function fromRoman(str: string): number {
  const romanMap: Record<string, number> = {
    I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000,
    i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000,
  };
  const upper = str.toUpperCase().trim();
  let total = 0;
  let prev = 0;
  for (let i = upper.length - 1; i >= 0; i--) {
    const curr = romanMap[upper[i]] || 0;
    if (curr < prev) {
      total -= curr;
    } else {
      total += curr;
      prev = curr;
    }
  }
  return total > 0 ? total : 1;
}

export function formatHeadingNumber(ordinalZeroBased: number, style: EnumStyle | "none"): string {
  if (style === "none") return "";
  const num = ordinalZeroBased + 1;
  switch (style) {
    case "upper-roman":
      return `${toRoman(num)}.`;
    case "lower-roman":
      return `${toRoman(num).toLowerCase()}.`;
    case "upper-alpha":
      return `${String.fromCharCode(65 + (ordinalZeroBased % 26))}.`;
    case "lower-alpha":
      return `${String.fromCharCode(97 + (ordinalZeroBased % 26))}.`;
    case "decimal":
    default:
      return `${num}.`;
  }
}

/**
 * Matches any recognized heading numbering prefix at the start of a heading string.
 * Supported patterns:
 * - Roman numerals: "I. ", "II. ", "III. ", "IV. ", etc. (case-insensitive)
 * - Single letter: "A. ", "B. ", "a. ", "b. ", etc.
 * - Digits: "1. ", "2. ", "10. ", etc.
 * Returns rawMatch (including trailing whitespace) and the remaining text.
 */
export function matchHeadingPrefix(text: string): { rawMatch: string; remainingText: string } | null {
  // Check Roman numerals first (e.g. "I. ", "II. ", "iv. ")
  const romanMatch = text.match(/^(?:M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{1,3}))\.(?:\s+|$)/i);
  if (romanMatch) {
    return {
      rawMatch: romanMatch[0],
      remainingText: text.slice(romanMatch[0].length),
    };
  }
  // Check single alpha letter (e.g. "A. ", "B. ", "a. ")
  const alphaMatch = text.match(/^[A-Za-z]\.(?:\s+|$)/);
  if (alphaMatch) {
    return {
      rawMatch: alphaMatch[0],
      remainingText: text.slice(alphaMatch[0].length),
    };
  }
  // Check decimal digits (e.g. "1. ", "2. ")
  const decimalMatch = text.match(/^\d+\.(?:\s+|$)/);
  if (decimalMatch) {
    return {
      rawMatch: decimalMatch[0],
      remainingText: text.slice(decimalMatch[0].length),
    };
  }
  return null;
}

/**
 * Extracts ordinal (zero-based) from an existing heading prefix string.
 * Kept for backward compatibility.
 */
export function extractOrdinalFromHeadingText(text: string, style: EnumStyle | "none"): number | null {
  if (style === "none") return null;
  const trimmed = text.trim();
  
  if (style === "upper-roman") {
    const match = trimmed.match(/^([IVXLCDM]+)\./i);
    if (match) return fromRoman(match[1]) - 1;
  } else if (style === "lower-roman") {
    const match = trimmed.match(/^([ivxlcdm]+)\./i);
    if (match) return fromRoman(match[1]) - 1;
  } else if (style === "upper-alpha") {
    const match = trimmed.match(/^([A-Z])\./);
    if (match) return match[1].charCodeAt(0) - 65;
  } else if (style === "lower-alpha") {
    const match = trimmed.match(/^([a-z])\./);
    if (match) return match[1].charCodeAt(0) - 97;
  } else if (style === "decimal") {
    const match = trimmed.match(/^(\d+)\./);
    if (match) return parseInt(match[1], 10) - 1;
  }
  return null;
}

/**
 * Smartly finds the next heading number for a level (1, 2, or 3) by inspecting
 * the document before the current selection.
 */
export function getSmartNextHeadingPrefix(editor: Editor, level: 1 | 2 | 3): string {
  const settings = getHeadingSettings();
  const levelKey = `h${level}` as "h1" | "h2" | "h3";
  const config = settings[levelKey];
  if (config.numbering === "none") return "";

  const { state } = editor;
  const { $from } = state.selection;
  const cursorDocPos = $from.pos;

  let precedingHeadingsCount = 0;
  let lastOrdinal: number | null = null;

  state.doc.descendants((node, pos) => {
    if (pos >= cursorDocPos) return false;
    if (node.type.name === "heading" && node.attrs.level === level) {
      precedingHeadingsCount++;
      const text = node.textContent || "";
      const parsed = extractOrdinalFromHeadingText(text, config.numbering);
      if (parsed !== null) {
        lastOrdinal = parsed;
      }
    }
    return true;
  });

  const nextOrdinal = lastOrdinal !== null ? lastOrdinal + 1 : precedingHeadingsCount;
  return formatHeadingNumber(nextOrdinal, config.numbering);
}

/**
 * Renumbers all headings of the specified level across the document in order,
 * ensuring continuous and consecutive sequence (I, II, III... or A, B, C...).
 * Modifications are applied in reverse document order to maintain stable position offsets.
 */
export function renumberHeadingsInTr(tr: Transaction, targetLevel?: 1 | 2 | 3): void {
  const settings = getHeadingSettings();
  const levels: (1 | 2 | 3)[] = targetLevel ? [targetLevel] : [1, 2, 3];

  for (const lvl of levels) {
    const levelKey = `h${lvl}` as "h1" | "h2" | "h3";
    const config = settings[levelKey];
    const style = config.numbering;

    // Collect all headings of this level in document order
    const headings: { pos: number; textContent: string }[] = [];
    tr.doc.descendants((node, pos) => {
      if (node.type.name === "heading" && node.attrs.level === lvl) {
        headings.push({ pos, textContent: node.textContent });
      }
      return true;
    });

    // Process from bottom to top (reverse order) so pos of earlier headings is not altered
    for (let index = headings.length - 1; index >= 0; index--) {
      const heading = headings[index];
      const expectedPrefix = style !== "none" ? `${formatHeadingNumber(index, style)} ` : "";
      
      const currentPrefixInfo = matchHeadingPrefix(heading.textContent);
      const currentPrefixRaw = currentPrefixInfo ? currentPrefixInfo.rawMatch : "";

      if (currentPrefixRaw === expectedPrefix) {
        // Already has the exact expected prefix
        continue;
      }

      const contentStart = heading.pos + 1;
      const currentPrefixEnd = contentStart + currentPrefixRaw.length;

      if (currentPrefixRaw.length > 0) {
        tr.delete(contentStart, currentPrefixEnd);
      }
      if (expectedPrefix.length > 0) {
        tr.insertText(expectedPrefix, contentStart);
      }
    }
  }
}

/**
 * Applies or toggles a heading at the current position with smart numbering.
 * - When toggling OFF an existing heading: strips its numbering prefix and restores
 *   the text back to normal font, then renumbers any remaining headings.
 * - When applying a heading: strips any old prefix, sets heading level, and renumbers
 *   all headings of that level across the document so the sequence remains continuous.
 */
export function applySmartHeading(editor: Editor, level: 1 | 2 | 3): void {
  const { state, view } = editor;
  const { selection } = state;
  const { from, to, empty, $from } = selection;

  // Identify all textblocks overlapping the selection
  const blocksToUpdate: { pos: number; node: any }[] = [];
  if (empty) {
    let blockDepth = $from.depth;
    while (blockDepth > 0 && !$from.node(blockDepth).isTextblock) {
      blockDepth--;
    }
    if (blockDepth >= 0 && $from.node(blockDepth).isTextblock) {
      blocksToUpdate.push({ pos: $from.before(blockDepth), node: $from.node(blockDepth) });
    }
  } else {
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.isTextblock) {
        blocksToUpdate.push({ pos, node });
        return false;
      }
      return true;
    });
  }

  if (blocksToUpdate.length === 0) return;

  const tr = state.tr;
  const paragraphType = state.schema.nodes.paragraph;
  const headingType = state.schema.nodes.heading;

  // Check if ALL targeted blocks are already a heading of this level
  const allAlreadyThisHeading = blocksToUpdate.every(
    (b) => b.node.type.name === "heading" && b.node.attrs.level === level
  );

  if (allAlreadyThisHeading) {
    // ── TOGGLE OFF: restore to paragraph and strip the heading numbering prefix ──
    // Process in reverse order so node positions remain stable
    for (let i = blocksToUpdate.length - 1; i >= 0; i--) {
      const b = blocksToUpdate[i];
      const prefixInfo = matchHeadingPrefix(b.node.textContent);
      if (prefixInfo) {
        tr.delete(b.pos + 1, b.pos + 1 + prefixInfo.rawMatch.length);
      }
      tr.setNodeMarkup(b.pos, paragraphType);
    }

    // Renumber remaining headings of this level across the document
    renumberHeadingsInTr(tr, level);
  } else {
    // ── APPLY HEADING: convert block to heading of this level and strip any old prefix ──
    const previousLevels = new Set<1 | 2 | 3>();
    for (const b of blocksToUpdate) {
      if (b.node.type.name === "heading" && b.node.attrs.level !== level) {
        previousLevels.add(b.node.attrs.level as 1 | 2 | 3);
      }
    }

    // Process in reverse order so node positions remain stable
    for (let i = blocksToUpdate.length - 1; i >= 0; i--) {
      const b = blocksToUpdate[i];
      const prefixInfo = matchHeadingPrefix(b.node.textContent);
      if (prefixInfo) {
        tr.delete(b.pos + 1, b.pos + 1 + prefixInfo.rawMatch.length);
      }
      tr.setNodeMarkup(b.pos, headingType, { level });
    }

    // Renumber all headings of this level (which inserts the appropriate numbering prefix)
    renumberHeadingsInTr(tr, level);

    // If any block was previously a heading of another level, renumber that level too
    for (const prevLevel of previousLevels) {
      renumberHeadingsInTr(tr, prevLevel);
    }
  }

  // Restore selection mapped through the transaction
  tr.setSelection(selection.map(tr.doc, tr.mapping));
  view.dispatch(tr);
  editor.commands.focus();
}

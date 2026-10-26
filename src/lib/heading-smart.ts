import type { Editor } from "@tiptap/react";
import type { EnumStyle } from "@/lib/wp/wp-numbering";
import { getHeadingSettings, type HeadingLevelStyle } from "./heading-settings";

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
 * Extracts ordinal (zero-based) from an existing heading prefix string.
 * e.g. "III. Overview" -> 2
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
    if (pos >= cursorDocPos) return false; // only look before cursor
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
 * Applies or toggles a heading at the current position with smart numbering.
 */
export function applySmartHeading(editor: Editor, level: 1 | 2 | 3): void {
  const isAlreadyThisHeading = editor.isActive("heading", { level });
  
  if (isAlreadyThisHeading) {
    // Toggle back to paragraph
    editor.chain().focus().setParagraph().run();
    return;
  }

  const prefix = getSmartNextHeadingPrefix(editor, level);
  const { state } = editor;
  const { from, to, empty } = state.selection;

  if (empty) {
    // Check if the current line/paragraph already has some text
    const $from = state.selection.$from;
    const parentText = $from.parent.textContent;

    if (!parentText.trim()) {
      // Empty line: convert to heading and insert prefix + space
      editor
        .chain()
        .focus()
        .setHeading({ level })
        .insertContent(prefix ? `${prefix} ` : "")
        .run();
    } else {
      // Line already has text: check if it already has a prefix
      const hasPrefix = prefix && parentText.trim().startsWith(prefix);
      if (hasPrefix) {
        editor.chain().focus().setHeading({ level }).run();
      } else {
        // Prepend prefix to existing text
        const blockStart = $from.start();
        editor
          .chain()
          .focus()
          .setHeading({ level })
          .insertContentAt(blockStart, prefix ? `${prefix} ` : "")
          .run();
      }
    }
  } else {
    // Text is selected: set heading and prepend prefix if not present
    const selectedText = state.doc.textBetween(from, to, " ");
    const hasPrefix = prefix && selectedText.trim().startsWith(prefix);
    if (hasPrefix || !prefix) {
      editor.chain().focus().setHeading({ level }).run();
    } else {
      editor
        .chain()
        .focus()
        .setHeading({ level })
        .insertContentAt(from, `${prefix} `)
        .run();
    }
  }
}

// Enumeration labels for WP sub-paragraphs. Letter styles cycle single →
// doubling → tripling (a…z, aa…zz, aaa…zzz); roman/decimal continue naturally.
// Phase 6 wires per-section style selection (Facts / Grounds / Prayers) to this.

export type EnumStyle =
  | "lower-alpha"
  | "upper-alpha"
  | "lower-roman"
  | "upper-roman"
  | "decimal";

function toRoman(n: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ["m", "cm", "d", "cd", "c", "xc", "l", "xl", "x", "ix", "v", "iv", "i"];
  let out = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { out += syms[i]; n -= vals[i]; }
  }
  return out;
}

// docx multi-level numbering formats. Level 1 is the chosen style; deeper levels
// follow a fixed, collision-free cascade (used for the Facts <ol> in the docx).
export type DocxNumFormat = "decimal" | "lowerLetter" | "lowerRoman" | "upperLetter" | "upperRoman";

export function cascadeFor(style: EnumStyle): DocxNumFormat[] {
  switch (style) {
    case "lower-alpha": return ["lowerLetter", "lowerRoman", "decimal", "upperLetter", "upperRoman"];
    case "lower-roman": return ["lowerRoman", "lowerLetter", "decimal", "upperLetter", "upperRoman"];
    case "upper-alpha": return ["upperLetter", "lowerLetter", "lowerRoman", "decimal", "upperRoman"];
    case "upper-roman": return ["upperRoman", "upperLetter", "lowerLetter", "lowerRoman", "decimal"];
    case "decimal":     return ["decimal", "lowerLetter", "lowerRoman", "upperLetter", "upperRoman"];
  }
}

// `index0` is zero-based.
export function enumLabel(index0: number, style: EnumStyle): string {
  switch (style) {
    case "decimal":
      return String(index0 + 1);
    case "lower-roman":
      return toRoman(index0 + 1);
    case "upper-roman":
      return toRoman(index0 + 1).toUpperCase();
    case "lower-alpha":
    case "upper-alpha": {
      const cycle = Math.floor(index0 / 26) + 1; // 1=single, 2=double, 3=triple…
      const letter = String.fromCharCode(97 + (index0 % 26)); // a-z
      const s = letter.repeat(cycle);
      return style === "upper-alpha" ? s.toUpperCase() : s;
    }
  }
}

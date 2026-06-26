// Reads the per-section WP sub-paragraph numbering styles from Settings
// (drafto-settings → wpNumbering). Like the SLP output-formatting reader in
// actions.ts, this reads localStorage directly so the generators don't depend on
// the settings-dialog React module.

import type { EnumStyle } from "./wp-numbering";

export interface WpNumbering {
  facts: EnumStyle;
  grounds: EnumStyle;
  prayers: EnumStyle;
}

// Styles offered in the UI (decimal is supported by the engine but not exposed
// as a choice, since legal sub-paras are lettered/roman).
export const WP_NUMBER_STYLES: { value: EnumStyle; label: string }[] = [
  { value: "lower-alpha", label: "a, b, c" },
  { value: "lower-roman", label: "i, ii, iii" },
  { value: "upper-alpha", label: "A, B, C" },
  { value: "upper-roman", label: "I, II, III" },
];

export const DEFAULT_WP_NUMBERING: WpNumbering = {
  facts: "lower-alpha",
  grounds: "lower-alpha",
  prayers: "lower-alpha",
};

// "Filed by" advocate defaults — set once in Settings, pre-filled into every new
// writ petition so they needn't be re-entered per petition.
export interface WpFiledBy {
  name: string;
  firm: string;
  address: string;
  enrolmentNo: string;
  email: string;
  phone: string;
}

export const DEFAULT_WP_FILED_BY: WpFiledBy = { name: "", firm: "", address: "", enrolmentNo: "", email: "", phone: "" };

export function getWpFiledBy(): WpFiledBy {
  if (typeof window === "undefined") return { ...DEFAULT_WP_FILED_BY };
  try {
    const raw = window.localStorage.getItem("drafto-settings");
    const s = (raw ? JSON.parse(raw)?.wpFiledBy : null) ?? {};
    return {
      name: s.name || "", firm: s.firm || "", address: s.address || "",
      enrolmentNo: s.enrolmentNo || "", email: s.email || "", phone: s.phone || "",
    };
  } catch {
    return { ...DEFAULT_WP_FILED_BY };
  }
}

const VALID: EnumStyle[] = ["lower-alpha", "lower-roman", "upper-alpha", "upper-roman", "decimal"];

export function getWpNumbering(): WpNumbering {
  if (typeof window === "undefined") return DEFAULT_WP_NUMBERING;
  try {
    const raw = window.localStorage.getItem("drafto-settings");
    if (!raw) return DEFAULT_WP_NUMBERING;
    const s = (JSON.parse(raw)?.wpNumbering ?? {}) as Partial<WpNumbering>;
    const pick = (v: unknown, d: EnumStyle): EnumStyle => (VALID.includes(v as EnumStyle) ? (v as EnumStyle) : d);
    return {
      facts: pick(s.facts, DEFAULT_WP_NUMBERING.facts),
      grounds: pick(s.grounds, DEFAULT_WP_NUMBERING.grounds),
      prayers: pick(s.prayers, DEFAULT_WP_NUMBERING.prayers),
    };
  } catch {
    return DEFAULT_WP_NUMBERING;
  }
}

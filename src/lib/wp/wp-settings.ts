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

// ── Page margins (inches) for WP documents ──────────────────────────────────
export interface WpMarginsIn { top: number; right: number; bottom: number; left: number }
export const DEFAULT_WP_MARGINS_IN: WpMarginsIn = { top: 1.5, right: 1, bottom: 1, left: 1.5 };

const clampIn = (v: unknown, d: number) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? Math.min(3, Math.max(0.2, n)) : d;
};

export function getWpMarginsIn(): WpMarginsIn {
  const d = { ...DEFAULT_WP_MARGINS_IN };
  if (typeof window === "undefined") return d;
  try {
    const s = JSON.parse(window.localStorage.getItem("drafto-settings") || "{}");
    return {
      top: clampIn(s.wpMarginTopIn, d.top),
      right: clampIn(s.wpMarginRightIn, d.right),
      bottom: clampIn(s.wpMarginBottomIn, d.bottom),
      left: clampIn(s.wpMarginLeftIn, d.left),
    };
  } catch {
    return d;
  }
}

// ── Output text formatting for WP documents ─────────────────────────────────
// Mirrors the SLP output formatting (font / size / line spacing / after-para
// spacing) plus a before-paragraph spacing, all WP-specific.
export interface WpOutputFormatting { font: string; sizePt: number; lineSpacing: number; beforePt: number; afterPt: number }
export const DEFAULT_WP_OUTPUT: WpOutputFormatting = { font: "Times New Roman", sizePt: 14, lineSpacing: 1.5, beforePt: 0, afterPt: 12 };

export function getWpOutputFormatting(): WpOutputFormatting {
  const d = { ...DEFAULT_WP_OUTPUT };
  if (typeof window === "undefined") return d;
  try {
    const s = JSON.parse(window.localStorage.getItem("drafto-settings") || "{}");
    return {
      font: s.wpOutputFont || d.font,
      sizePt: s.wpOutputFontSizePt ?? d.sizePt,
      lineSpacing: s.wpOutputLineSpacing ?? d.lineSpacing,
      beforePt: s.wpOutputParaBeforePt ?? d.beforePt,
      afterPt: s.wpOutputParaAfterPt ?? d.afterPt,
    };
  } catch {
    return d;
  }
}

// ── "Filed by" advocate-details layout ──────────────────────────────────────
// The lines under the advocate's name are user-designable: their ORDER, which
// consecutive items share one line (" | "-separated), and per-item formatting.

export type WpFiledByItemId = "firm" | "address" | "enrolmentNo" | "email" | "phone";
export type WpFiledByCaps = "none" | "allCaps" | "smallCaps";
export interface WpFiledByLayoutItem {
  id: WpFiledByItemId;
  bold: boolean;
  italics: boolean;
  underline: boolean;
  caps: WpFiledByCaps;
  // When true, this item and the NEXT one print on the same line, " | "-separated.
  joinWithNext: boolean;
}

export const WP_FILED_BY_ITEM_LABELS: Record<WpFiledByItemId, string> = {
  firm: "Firm / Chamber",
  address: "Address",
  enrolmentNo: "Enrolment No.",
  email: "Email",
  phone: "Phone",
};

// Defaults reproduce the historical output: firm and address on their own
// lines, then "Enrl. No.: … | email | phone" on one line, all plain.
export const DEFAULT_WP_FILED_BY_LAYOUT: WpFiledByLayoutItem[] = [
  { id: "firm", bold: false, italics: false, underline: false, caps: "none", joinWithNext: false },
  { id: "address", bold: false, italics: false, underline: false, caps: "none", joinWithNext: false },
  { id: "enrolmentNo", bold: false, italics: false, underline: false, caps: "none", joinWithNext: true },
  { id: "email", bold: false, italics: false, underline: false, caps: "none", joinWithNext: true },
  { id: "phone", bold: false, italics: false, underline: false, caps: "none", joinWithNext: false },
];

const FB_IDS: WpFiledByItemId[] = ["firm", "address", "enrolmentNo", "email", "phone"];
const FB_CAPS: WpFiledByCaps[] = ["none", "allCaps", "smallCaps"];

// Coerce any saved value into a complete, valid layout: invalid entries drop,
// duplicates dedupe, missing items append with defaults.
export function normalizeWpFiledByLayout(raw: unknown): WpFiledByLayoutItem[] {
  const out: WpFiledByLayoutItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const r of raw as any[]) {
      const id = r?.id as WpFiledByItemId;
      if (!FB_IDS.includes(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        bold: !!r.bold,
        italics: !!r.italics,
        underline: !!r.underline,
        caps: FB_CAPS.includes(r.caps) ? r.caps : "none",
        joinWithNext: !!r.joinWithNext,
      });
    }
  }
  for (const d of DEFAULT_WP_FILED_BY_LAYOUT) if (!seen.has(d.id)) out.push({ ...d });
  return out;
}

export function getWpFiledByLayout(): WpFiledByLayoutItem[] {
  if (typeof window === "undefined") return normalizeWpFiledByLayout(null);
  try {
    const s = JSON.parse(window.localStorage.getItem("drafto-settings") || "{}");
    return normalizeWpFiledByLayout(s.wpFiledByLayout);
  } catch {
    return normalizeWpFiledByLayout(null);
  }
}

// Group the layout into printed lines: consecutive joinWithNext items share one
// line; items whose value is empty drop out; an all-empty line prints nothing.
// Pure — shared by the docx generator and the settings preview.
export function wpFiledByLines(
  layout: WpFiledByLayoutItem[],
  values: Record<WpFiledByItemId, string>,
): { text: string; item: WpFiledByLayoutItem }[][] {
  const lines: { text: string; item: WpFiledByLayoutItem }[][] = [];
  let current: { text: string; item: WpFiledByLayoutItem }[] = [];
  for (const item of layout) {
    const v = (values[item.id] || "").trim();
    if (v) current.push({ text: v, item });
    if (!item.joinWithNext) {
      if (current.length) lines.push(current);
      current = [];
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

// ── "Filed by" table geometry ───────────────────────────────────────────────
// Left-column share of the Filed-by table (percent); the advocate details take
// the rest. Also anchors the floating signature's horizontal offset.
export const DEFAULT_WP_FILED_BY_LEFT_PCT = 40;

export function getWpFiledByLeftPct(): number {
  if (typeof window === "undefined") return DEFAULT_WP_FILED_BY_LEFT_PCT;
  try {
    const s = JSON.parse(window.localStorage.getItem("drafto-settings") || "{}");
    const n = s.wpFiledByLeftPct;
    return isFinite(n) ? Math.min(70, Math.max(10, Math.round(n))) : DEFAULT_WP_FILED_BY_LEFT_PCT;
  } catch {
    return DEFAULT_WP_FILED_BY_LEFT_PCT;
  }
}

// ── PDF stamping (annexure labels / page numbers / True Copy) ───────────────
// Mirrors the SLP paperbook stamps, WP-keyed. The True Copy mark reuses the WP
// advocate signature (independent of the Filed-by placement toggle, like SLP).

export type WpStampFont = "times" | "helvetica" | "courier";
export type WpAnnexureLabelPosition = "center" | "right";
export type WpTrueCopyPosition = "left" | "center";

export interface WpStampSettings {
  font: WpStampFont;
  pageNumberSizePt: number;
  pageNumberMarginTopPt: number;
  pageNumberMarginRightPt: number;
  annexureLabelSizePt: number;
  annexureLabelMarginPt: number;
  annexureLabelPosition: WpAnnexureLabelPosition;
  stampBackground: boolean; // white bg behind labels & page numbers
  trueCopy: boolean;
  trueCopyPosition: WpTrueCopyPosition;
  trueCopyBackground: boolean;
  trueCopyMarginXPt: number;
  trueCopyMarginBottomPt: number;
  // Signature for the True Copy mark (raw settings; null when not configured).
  signaturePngBase64: string | null;
  signatureAspect: number;      // natural H ÷ W
  signatureHalfWidthPt: number; // half the Filed-by signature width, px → pt
}

export const DEFAULT_WP_STAMPS: WpStampSettings = {
  font: "times",
  pageNumberSizePt: 20,
  pageNumberMarginTopPt: 54,
  pageNumberMarginRightPt: 54,
  annexureLabelSizePt: 14,
  annexureLabelMarginPt: 14.4,
  annexureLabelPosition: "center",
  stampBackground: false,
  trueCopy: false,
  trueCopyPosition: "left",
  trueCopyBackground: false,
  trueCopyMarginXPt: 36,
  trueCopyMarginBottomPt: 36,
  signaturePngBase64: null,
  signatureAspect: 0,
  signatureHalfWidthPt: 45,
};

export function getWpStampSettings(): WpStampSettings {
  const d = { ...DEFAULT_WP_STAMPS };
  if (typeof window === "undefined") return d;
  try {
    const s = JSON.parse(window.localStorage.getItem("drafto-settings") || "{}");
    const num = (v: unknown, dv: number, min: number, max: number) => {
      const n = typeof v === "number" ? v : parseFloat(String(v));
      return isFinite(n) ? Math.min(max, Math.max(min, n)) : dv;
    };
    const hasSig = !!(s.wpSignaturePng && s.wpSignatureW && s.wpSignatureH);
    return {
      font: ["times", "helvetica", "courier"].includes(s.wpStampFont) ? s.wpStampFont : d.font,
      pageNumberSizePt: num(s.wpPageNumberSizePt, d.pageNumberSizePt, 8, 48),
      pageNumberMarginTopPt: num(s.wpPageNumberMarginTopPt, d.pageNumberMarginTopPt, 0, 216),
      pageNumberMarginRightPt: num(s.wpPageNumberMarginRightPt, d.pageNumberMarginRightPt, 0, 216),
      annexureLabelSizePt: num(s.wpAnnexureLabelSizePt, d.annexureLabelSizePt, 8, 32),
      annexureLabelMarginPt: num(s.wpAnnexureLabelMarginPt, d.annexureLabelMarginPt, 0, 216),
      annexureLabelPosition: s.wpAnnexureLabelPosition === "right" ? "right" : "center",
      stampBackground: !!s.wpStampBackground,
      trueCopy: !!s.wpPlaceTrueCopyText && hasSig,
      trueCopyPosition: s.wpTrueCopyPosition === "center" ? "center" : "left",
      trueCopyBackground: !!s.wpTrueCopyBackground,
      trueCopyMarginXPt: num(s.wpTrueCopyMarginXPt, d.trueCopyMarginXPt, 0, 216),
      trueCopyMarginBottomPt: num(s.wpTrueCopyMarginBottomPt, d.trueCopyMarginBottomPt, 0, 216),
      signaturePngBase64: hasSig ? String(s.wpSignaturePng).split(",").pop() || null : null,
      signatureAspect: hasSig ? s.wpSignatureH / s.wpSignatureW : 0,
      signatureHalfWidthPt: num(s.wpSignatureSizePx, 120, 24, 480) * 0.5 * 0.75, // px → pt
    };
  } catch {
    return d;
  }
}

// Advocate-signature settings for the WP "Filed by" blocks (separate from the
// SLP AoR signature — the WP advocate may be a different person). Returns null
// when no signature is configured or the "place in paperbook" toggle is off.
// Like the SLP behavior, the signature is embedded ONLY on the PDF-generation
// path — plain .docx exports never carry it.
export function getWpFiledBySignature(): { data: Uint8Array; widthPx: number; heightPx: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("drafto-settings");
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.wpPlaceSignatureInPaperbook || !s.wpSignaturePng || !s.wpSignatureW || !s.wpSignatureH) return null;
    const base64 = String(s.wpSignaturePng).split(",").pop() || "";
    const bin = atob(base64);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    const widthPx = Math.max(24, Math.round(s.wpSignatureSizePx ?? 120));
    const heightPx = Math.max(1, Math.round(widthPx * (s.wpSignatureH / s.wpSignatureW)));
    return { data, widthPx, heightPx };
  } catch {
    return null;
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

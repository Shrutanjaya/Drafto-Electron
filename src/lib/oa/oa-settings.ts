// Settings readers for the CAT Original Application. The OA reuses the WP
// "Filed by" shapes (advocate fields, layout items, column split, signature) but
// stores them under its own `oa*` keys so the two document types are configured
// independently.

import {
  DEFAULT_WP_FILED_BY,
  normalizeWpFiledByLayout,
  type WpFiledBy,
  type WpFiledByLayoutItem,
} from "@/lib/wp/wp-settings";

const KEY = "drafto-settings";

function readSettings(): any {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function getOaFiledBy(): WpFiledBy {
  const s = readSettings().oaFiledBy ?? {};
  return {
    name: s.name || "", firm: s.firm || "", address: s.address || "",
    enrolmentNo: s.enrolmentNo || "", email: s.email || "", phone: s.phone || "",
  };
}

export function getOaFiledByLayout(): WpFiledByLayoutItem[] {
  return normalizeWpFiledByLayout(readSettings().oaFiledByLayout);
}

export const DEFAULT_OA_FILED_BY_LEFT_PCT = 40;
export function getOaFiledByLeftPct(): number {
  const n = readSettings().oaFiledByLeftPct;
  return isFinite(n) ? Math.min(70, Math.max(10, Math.round(n))) : DEFAULT_OA_FILED_BY_LEFT_PCT;
}

/** Advocate signature for the OA Filed-by block (PDF path only). */
export function getOaSignature(): { data: Uint8Array; widthPx: number; heightPx: number } | null {
  const s = readSettings();
  try {
    if (!s.oaPlaceSignatureInPaperbook || !s.oaSignaturePng || !s.oaSignatureW || !s.oaSignatureH) return null;
    const base64 = String(s.oaSignaturePng).split(",").pop() || "";
    const bin = atob(base64);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    const widthPx = Math.max(24, Math.round(s.oaSignatureSizePx ?? 120));
    const heightPx = Math.max(1, Math.round(widthPx * (s.oaSignatureH / s.oaSignatureW)));
    return { data, widthPx, heightPx };
  } catch {
    return null;
  }
}

export { DEFAULT_WP_FILED_BY as DEFAULT_OA_FILED_BY };

// ── Paper-book stamp settings (annexure labels, pagination, True Copy) ───────
// Mirrors the WP stamp settings but under `oa*` keys so CAT is independent.
import type { WpStampSettings } from "@/lib/wp/wp-settings";

export const DEFAULT_OA_STAMPS: WpStampSettings = {
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

export function getOaStampSettings(): WpStampSettings {
  const d = { ...DEFAULT_OA_STAMPS };
  const s = readSettings();
  try {
    const num = (v: unknown, dv: number, min: number, max: number) => {
      const n = typeof v === "number" ? v : parseFloat(String(v));
      return isFinite(n) ? Math.min(max, Math.max(min, n)) : dv;
    };
    const hasSig = !!(s.oaSignaturePng && s.oaSignatureW && s.oaSignatureH);
    return {
      font: ["times", "helvetica", "courier"].includes(s.oaStampFont) ? s.oaStampFont : d.font,
      pageNumberSizePt: num(s.oaPageNumberSizePt, d.pageNumberSizePt, 8, 48),
      pageNumberMarginTopPt: num(s.oaPageNumberMarginTopPt, d.pageNumberMarginTopPt, 0, 216),
      pageNumberMarginRightPt: num(s.oaPageNumberMarginRightPt, d.pageNumberMarginRightPt, 0, 216),
      annexureLabelSizePt: num(s.oaAnnexureLabelSizePt, d.annexureLabelSizePt, 8, 32),
      annexureLabelMarginPt: num(s.oaAnnexureLabelMarginPt, d.annexureLabelMarginPt, 0, 216),
      annexureLabelPosition: s.oaAnnexureLabelPosition === "right" ? "right" : "center",
      stampBackground: !!s.oaStampBackground,
      trueCopy: !!s.oaPlaceTrueCopyText && hasSig,
      trueCopyPosition: s.oaTrueCopyPosition === "center" ? "center" : "left",
      trueCopyBackground: !!s.oaTrueCopyBackground,
      trueCopyMarginXPt: num(s.oaTrueCopyMarginXPt, d.trueCopyMarginXPt, 0, 216),
      trueCopyMarginBottomPt: num(s.oaTrueCopyMarginBottomPt, d.trueCopyMarginBottomPt, 0, 216),
      signaturePngBase64: hasSig ? String(s.oaSignaturePng).split(",").pop() || null : null,
      signatureAspect: hasSig ? s.oaSignatureH / s.oaSignatureW : 0,
      signatureHalfWidthPt: num(s.oaSignatureSizePx, 120, 24, 480) * 0.5 * 0.75,
    };
  } catch {
    return d;
  }
}

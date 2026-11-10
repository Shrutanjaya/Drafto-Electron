import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { TINOS_BOLD_BASE64, PAGELLA_BOLD_BASE64 } from "./fonts-embedded";

export type StampFontChoice = "times" | "helvetica" | "courier" | "tinos" | "palatino";

// Lazily load fontkit only when custom fonts are embedded
let fontkitPromise: Promise<any> | null = null;
async function getFontkit() {
  if (!fontkitPromise) {
    fontkitPromise = import("@pdf-lib/fontkit").then((m) => m.default || m);
  }
  return fontkitPromise;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Embeds the requested stamp font into a pdf-lib PDFDocument.
 * For standard PDF fonts (times, helvetica, courier), embeds the standard 14 font.
 * For custom fonts (tinos, palatino / TeX Gyre Pagella), registers fontkit and
 * embeds the bundled font binary with subsetting enabled for minimal output size.
 */
export async function embedStampFont(pdf: PDFDocument, choice?: StampFontChoice | string | null): Promise<PDFFont> {
  const c = (choice || "times").toLowerCase();

  if (c === "helvetica" || c === "arial") {
    return pdf.embedFont(StandardFonts.HelveticaBold);
  }
  if (c === "courier") {
    return pdf.embedFont(StandardFonts.CourierBold);
  }
  if (c === "tinos") {
    try {
      const fk = await getFontkit();
      pdf.registerFontkit(fk);
      const fontBytes = base64ToUint8Array(TINOS_BOLD_BASE64);
      return await pdf.embedFont(fontBytes, { subset: true });
    } catch (err) {
      console.warn("[embedStampFont] Failed to embed Tinos font, falling back to TimesRomanBold:", err);
      return pdf.embedFont(StandardFonts.TimesRomanBold);
    }
  }
  if (c === "palatino" || c === "pagella") {
    try {
      const fk = await getFontkit();
      pdf.registerFontkit(fk);
      const fontBytes = base64ToUint8Array(PAGELLA_BOLD_BASE64);
      return await pdf.embedFont(fontBytes, { subset: true });
    } catch (err) {
      console.warn("[embedStampFont] Failed to embed Pagella/Palatino font, falling back to TimesRomanBold:", err);
      return pdf.embedFont(StandardFonts.TimesRomanBold);
    }
  }

  // Default: Times New Roman Bold
  return pdf.embedFont(StandardFonts.TimesRomanBold);
}

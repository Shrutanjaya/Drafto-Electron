import { ipcInvoke } from "./index";

export interface ConvertResult {
  success: boolean;
  pdfBase64?: string;
  error?: string;
}

/**
 * Convert a DOCX buffer to PDF via the Electron main process.
 * Replaces the Server Action convertWithDocx2Pdf() + convertDocxToPdf().
 */
export async function convertDocxToPdf(docxBuffer: Buffer | Uint8Array): Promise<ConvertResult> {
  const docxBase64 = Buffer.from(docxBuffer).toString("base64");
  return ipcInvoke<ConvertResult>("convert-docx-to-pdf", { docxBase64 });
}

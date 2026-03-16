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
export async function convertDocxToPdf(docxBuffer: Uint8Array): Promise<ConvertResult> {
  let binary = '';
  for (let i = 0; i < docxBuffer.byteLength; i++) binary += String.fromCharCode(docxBuffer[i]);
  const docxBase64 = btoa(binary);
  return ipcInvoke<ConvertResult>("convert-docx-to-pdf", { docxBase64 });
}

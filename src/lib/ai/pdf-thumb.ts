// ── First-page thumbnails for the document-map review ───────────────────────
// Renders one page of a source PDF to a small PNG data URL (in the renderer,
// using pdf.js + the browser canvas) so the user can visually verify each
// proposed split before committing.

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
// Vite bundles the worker and gives us a URL to it.
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.js?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export interface ThumbRequest {
  id: string;
  sourcePath: string;
  page: number; // 1-indexed
}

// Render the requested page of each item to a PNG data URL. Source PDFs are
// loaded once per path. Returns { id -> dataURL } (missing on failure).
export async function renderThumbnails(items: ThumbRequest[], maxWidth = 132): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const byPath = new Map<string, ThumbRequest[]>();
  for (const it of items) {
    if (!byPath.has(it.sourcePath)) byPath.set(it.sourcePath, []);
    byPath.get(it.sourcePath)!.push(it);
  }

  for (const [sourcePath, list] of byPath) {
    let bytes: Uint8Array;
    try {
      const f = await window.electron?.readFileByPath?.(sourcePath);
      if (!f?.data) continue;
      bytes = base64ToBytes(f.data);
    } catch {
      continue;
    }

    let pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]> | null = null;
    try {
      pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    } catch {
      continue;
    }

    for (const it of list) {
      try {
        const pageNum = Math.min(Math.max(1, it.page), pdf.numPages);
        const page = await pdf.getPage(pageNum);
        const base = page.getViewport({ scale: 1 });
        const scale = maxWidth / base.width;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport }).promise;
        out[it.id] = canvas.toDataURL("image/png");
        page.cleanup?.();
      } catch {
        /* skip this thumbnail */
      }
    }
    try {
      // @ts-expect-error cleanup/destroy exist on the proxy
      pdf.cleanup?.();
      // @ts-expect-error
      pdf.destroy?.();
    } catch {
      /* ignore */
    }
  }

  return out;
}

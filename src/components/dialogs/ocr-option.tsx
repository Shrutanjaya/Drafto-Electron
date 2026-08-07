"use client";

// ── "Run OCR on the merged PDF" ──────────────────────────────────────────────
// Shared by the SLP, writ-petition and Original-Application paper-book dialogs
// so the wording, the platform note and the behaviour cannot drift apart.
//
// OCR runs the bundled Tesseract + Python pipeline, which ships on Windows
// only; on a Mac the box is disabled and says so. (Mayur reads scanned pages on
// macOS through the system recogniser, but that is a different job — this makes
// the finished paper-book itself text-searchable.)

import { Checkbox } from "@/components/ui/checkbox";

export function OcrOption({
  checked,
  onChange,
  disabled,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const isMac = typeof window !== "undefined" && (window as any).electron?.platform === "darwin";
  return (
    <div className="flex items-start space-x-2">
      <Checkbox
        id="enable-ocr"
        checked={checked && !isMac}
        onCheckedChange={(v) => onChange(v as boolean)}
        disabled={disabled || isMac}
        className="mt-0.5"
      />
      <label htmlFor="enable-ocr" className="text-xs leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        <span className="font-medium">Run OCR on the merged PDF</span>
        <span className="block text-[11px] text-muted-foreground">
          {isMac
            ? "Unavailable on macOS — generate on Windows to make scanned pages text-searchable."
            : "Makes scanned/image pages text-searchable. Use only if your uploads include scanned documents — it takes much longer."}
        </span>
      </label>
    </div>
  );
}

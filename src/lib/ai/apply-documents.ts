// ── Attach split documents into the form (Phase 1: P-annexures) ──────────────
// Runs after the user approves the document map and Drafto has split the files.
// Annexures are placed against the List-of-Dates row whose date matches the
// annexure's date (the chronological hard rule); if no such row exists, a row is
// created at the correct chronological position with a description from the
// annexure title. Other document types (affidavit/vakalatnama/…) are reported
// back as not-yet-attached (Phase 2/3).

import type { UseFormReturn, FieldValues } from "react-hook-form";
import { lodTableItemSchema, annexureSchema } from "@/lib/schema";
import { normalizeDate, type SafeDocument } from "./document-map";

export interface AttachableDoc {
  doc: SafeDocument;
  filePath: string;
  // A File object for the split PDF. Drafto's clip-icon UI keys off the
  // annexure's `.file` (not `.filePath`), so we set both — mirroring what the
  // upload dialog does — for the attachment to register and persist.
  file?: File;
}

export interface AttachSummary {
  annexuresAttached: number;
  rowsCreated: number;
  deferred: { title: string; type: string }[]; // recognised but not attached in Phase 1
}

interface LodRow {
  date?: string;
  event?: string;
  annexures?: unknown[];
  [k: string]: unknown;
}

// Insert a row so the List of Dates stays in date order. Rows whose date can't
// be parsed don't constrain placement.
function insertChronologically(rows: LodRow[], newRow: LodRow, newISO: string | null) {
  if (!newISO) {
    rows.push(newRow);
    return;
  }
  let idx = rows.length;
  for (let i = 0; i < rows.length; i++) {
    const iso = normalizeDate(rows[i].date);
    if (iso && iso > newISO) {
      idx = i;
      break;
    }
  }
  rows.splice(idx, 0, newRow);
}

export function applyDocuments(form: UseFormReturn<FieldValues>, docs: AttachableDoc[]): AttachSummary {
  const summary: AttachSummary = { annexuresAttached: 0, rowsCreated: 0, deferred: [] };
  const values = form.getValues();
  // Deep-ish clone of the rows we'll mutate (rows + their annexures arrays).
  const lod: LodRow[] = (Array.isArray(values.listOfDates) ? values.listOfDates : []).map((r: LodRow) => ({
    ...r,
    annexures: Array.isArray(r.annexures) ? [...r.annexures] : [],
  }));

  for (const { doc, filePath, file } of docs) {
    if (doc.type !== "annexure") {
      summary.deferred.push({ title: doc.title || "(untitled)", type: doc.type });
      continue;
    }

    const annex = annexureSchema.parse({
      filePath,
      title: doc.title,
      date: doc.date,
      copyType: doc.copyType,
      isAdditionalDocument: doc.isAdditionalDocument,
    }) as Record<string, unknown>;
    // The clip icon / attachment state is driven by `.file`; set it too.
    if (file) annex.file = file;

    let row = doc.dateISO ? lod.find((r) => normalizeDate(r.date) === doc.dateISO) : undefined;
    if (!row) {
      row = lodTableItemSchema.parse({
        date: doc.date,
        event: doc.title || "Document",
        annexures: [],
      }) as LodRow;
      insertChronologically(lod, row, doc.dateISO);
      summary.rowsCreated++;
    }
    (row.annexures as unknown[]).push(annex);
    summary.annexuresAttached++;
  }

  form.setValue("listOfDates", lod, { shouldDirty: true, shouldTouch: true });
  return summary;
}

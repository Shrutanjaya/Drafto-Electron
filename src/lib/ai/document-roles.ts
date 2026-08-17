// ── What each source document is ─────────────────────────────────────────────
// A label on a source document earns its keep twice: it tells Mayur how to read
// the document, and it says which slot of the paper-book the file belongs in.
// Only one label ever has to be set by hand — the order under challenge — because
// everything in the draft hangs off it and a wrong guess reads perfectly while
// being entirely wrong.

import type { DraftMode } from "./field-catalog";

export interface DocumentRole {
  id: string;
  label: string;
  /** Read for drafting, or filed into the paper-book untouched? */
  read: boolean;
  /** The one role a run should not start without. */
  required?: boolean;
  hint?: string;
}

const COMMON: DocumentRole[] = [
  { id: "impugned", label: "Order under challenge", read: true, required: true, hint: "Everything is drafted against this" },
  { id: "earlier-order", label: "Earlier order of the court below", read: true },
  { id: "pleading", label: "Pleading from the court below", read: true },
  { id: "parties", label: "Memo / list of parties", read: true },
  { id: "annexure", label: "Annexure", read: true },
  { id: "translated", label: "Typed / translated copy of an annexure", read: true },
  { id: "my-draft", label: "My own draft of a section", read: true, hint: "Transcribed as written, not rewritten" },
  { id: "reference", label: "Reference material (judgments, statutes)", read: true, hint: "For the grounds only — never as facts" },
  { id: "affidavit", label: "Affidavit (signed)", read: false },
  { id: "vakalatnama", label: "Vakalatnama (signed)", read: false },
  { id: "court-fee", label: "Court fee", read: false },
  { id: "proof-of-service", label: "Proof of service", read: false },
];

const SLP_ONLY: DocumentRole[] = [
  { id: "cc-receipt", label: "Certified copy receipt", read: true },
  { id: "custody", label: "Custody certificate", read: false },
  { id: "fir", label: "FIR / charge-sheet details", read: true },
  { id: "appendix", label: "Appendix material (statutes, judgments)", read: false },
  { id: "ia-annexure", label: "Application annexure (A-series)", read: true },
];

const WP_ONLY: DocumentRole[] = [
  { id: "representation", label: "Representation / legal notice", read: true },
  { id: "rejection", label: "Reply / rejection by the authority", read: true },
  { id: "cm-annexure", label: "CM application annexure", read: true },
];

const OA_ONLY: DocumentRole[] = [
  { id: "representation", label: "Statutory representation & its outcome", read: true, hint: "Establishes exhaustion of remedies" },
  { id: "service-record", label: "Service record extract", read: true },
  { id: "last-page", label: "Last page (signed)", read: false },
  { id: "authority-letter", label: "Authority letter", read: false },
];

export function rolesFor(mode: DraftMode): DocumentRole[] {
  const extra = mode === "WritPetitionDHC" ? WP_ONLY : mode === "OriginalApplicationCAT" ? OA_ONLY : SLP_ONLY;
  // The order under challenge stays first; the rest follow, doc-type extras
  // before the filing paperwork.
  const [impugned, ...rest] = COMMON;
  return [impugned, ...extra.filter((r) => r.read), ...rest, ...extra.filter((r) => !r.read)];
}

export function roleLabel(mode: DraftMode, id: string): string {
  return rolesFor(mode).find((r) => r.id === id)?.label ?? id;
}

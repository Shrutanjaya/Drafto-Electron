// ── Preset quick-action prompts ──────────────────────────────────────────────
// One-click instructions the user can fire instead of phrasing a prompt. Each
// `prompt` is a complete, carefully-worded instruction; the Master Instructions
// (always in the system prompt) enforce the style/nomenclature/formatting/
// completeness rules, so these can stay focused on WHAT to fill.
//
// `needsFolder` marks actions that draft/extract from the source documents (so
// the UI can hint when no folder is selected).

import type { Effort } from "./estimate";

export interface Preset {
  id: string;
  label: string;
  group: "Fill" | "Draft" | "Annexures";
  prompt: string;
  effort: Effort;
  needsFolder?: boolean;
}

export const PRESETS: Preset[] = [
  // ── Fill (factual fields) ──
  {
    id: "memo",
    label: "Fill the Memo of Parties",
    group: "Fill",
    effort: "medium",
    needsFolder: true,
    prompt:
      "Fill up the Memo of Parties from the source documents: every petitioner and every respondent, in order, with each party's name (in Title Case), full address, and exact numbered designation in the court below (e.g. \"Petitioner No. 1\", \"Respondent No. 3\"). Do not omit anyone.",
  },
  {
    id: "impugned",
    label: "Fill the Impugned Order details",
    group: "Fill",
    effort: "small",
    needsFolder: true,
    prompt:
      "Fill up the Impugned Order details from the source documents: the order type, its date, the case number in the court below, the court that passed it, and a concise one-line effect of the order.",
  },
  {
    id: "deponent",
    label: "Fill the Deponent details",
    group: "Fill",
    effort: "small",
    needsFolder: true,
    prompt: "Fill up the Deponent details from the source documents (name, relationship, father/husband's name, address, age and role).",
  },
  {
    id: "listing",
    label: "Fill the Listing Proforma",
    group: "Fill",
    effort: "small",
    needsFolder: true,
    prompt:
      "Fill up the Listing Proforma general details from the source documents: the parties' phone numbers and emails (if available), and the main and sub category of the matter.",
  },

  // ── Draft (substantive content) ──
  {
    id: "synopsis",
    label: "Draft the Synopsis",
    group: "Draft",
    effort: "large",
    needsFolder: true,
    prompt: "Draft the Synopsis for this SLP based on the source documents, written with the overall intent of challenging the Impugned Order.",
  },
  {
    id: "lod",
    label: "Draft the List of Dates",
    group: "Draft",
    effort: "large",
    needsFolder: true,
    prompt:
      "Draft the List of Dates & Events for this SLP based on the source documents — a complete chronological table of the material events, each with its date and a particulars entry, oriented towards challenging the Impugned Order.",
  },
  {
    id: "grounds",
    label: "Draft the Grounds",
    group: "Draft",
    effort: "large",
    needsFolder: true,
    prompt:
      "Draft the Grounds for this SLP based on the source documents. Each ground must challenge the Impugned Order (frame the criticism around the Impugned Order, never the court). Do not number the grounds.",
  },
  {
    id: "qol",
    label: "Draft the Questions of Law",
    group: "Draft",
    effort: "medium",
    needsFolder: true,
    prompt: "Draft the Questions of Law for this SLP based on the source documents. Do not number them.",
  },
  {
    id: "interim",
    label: "Draft the Interim Relief",
    group: "Draft",
    effort: "medium",
    needsFolder: true,
    prompt:
      "Mark that interim relief is sought, and draft both the Grounds for Interim Relief (prima facie case, balance of convenience, irreparable injury, as applicable) and the Prayers for Interim Relief, based on the source documents.",
  },

  // ── Annexures ──
  {
    id: "annexures",
    label: "Split & mark the Annexures",
    group: "Annexures",
    effort: "medium",
    needsFolder: true,
    prompt:
      "Identify every document in the source PDFs that should be annexed with this SLP (each document that formed part of the High Court record), and produce the documents map — for each, its source file, page range, a short title and its date — so Drafto can split and attach them. Mark anything not part of the High Court record as an Additional Document. Do not assign annexure numbers.",
  },
];

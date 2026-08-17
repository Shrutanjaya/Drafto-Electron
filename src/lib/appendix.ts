// ── Appendix helpers (Supreme Court SLP) ─────────────────────────────────────
// An SLP may carry more than one Appendix document, and an Appendix is not
// limited to statutory provisions: it can equally be a judgment or any other
// material. Every attached document becomes its own row in the Index
// (Appendix-A, Appendix-B …) with its own page range, and its own component in
// the paper-book merge.
//
// Everything that reads the Appendix — the dialog, the Index, the bookmarks,
// the paper-book merge and the DOCX export — goes through this module, so the
// row list and the merged pages can never drift apart.

import type { DraftoProject } from "./schema";

export type AppendixKind = "provisions" | "judgment" | "custom";

export interface AppendixItem {
  id: string;
  kind: AppendixKind;
  description: string;
  useManual: boolean;
  manualEntry: string;
  file?: unknown;
  filePath?: string;
  indexTextOverride: string;
}

export const APPENDIX_KIND_LABELS: Record<AppendixKind, string> = {
  provisions: "Statutory provisions",
  judgment: "Judgment",
  custom: "Something else",
};

// The prompt shown against the description box for each kind.
export const APPENDIX_DESCRIPTION_LABELS: Record<AppendixKind, string> = {
  provisions: "Provisions of",
  judgment: "Judgment in",
  custom: "This Appendix contains",
};

export const APPENDIX_DESCRIPTION_PLACEHOLDERS: Record<AppendixKind, string> = {
  provisions: "Indian Penal Code, 1860 and Bharatiya Nyaya Sanhita, 2023",
  judgment: "Vishaka v. State of Rajasthan, (1997) 6 SCC 241",
  custom: "Chart of the disputed transactions",
};

export function makeAppendixItem(partial: Partial<AppendixItem> = {}): AppendixItem {
  const item: AppendixItem = {
    id: `apx_${Math.random().toString(36).slice(2, 10)}`,
    kind: "provisions",
    description: "",
    useManual: false,
    manualEntry: "",
    indexTextOverride: "",
    ...partial,
  };
  // A judgment goes on record as a copy of the court's own document: it is
  // always uploaded, never typed out.
  if (item.kind === "judgment") item.useManual = false;
  return item;
}

// A, B, C … Z, AA, AB … (matches the Index labels).
export function appendixLetter(index: number): string {
  let result = "";
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

// "Appendix" on its own when there is only one document; "Appendix-A",
// "Appendix-B" … as soon as there are several.
export function appendixLabel(index: number, total: number): string {
  return total > 1 ? `Appendix-${appendixLetter(index)}` : "Appendix";
}

// The wording of the Index row after the label, derived from what the document
// is — unless the user has edited it, in which case their text wins.
export function appendixBodyText(item: AppendixItem): string {
  const override = (item.indexTextOverride || "").trim();
  if (override) return override;
  const description = (item.description || "").trim();
  switch (item.kind) {
    case "judgment":
      return `True copy of the judgment in ${description || "[case name / citation]"}`;
    case "custom":
      return description || "[Appendix Description]";
    case "provisions":
    default:
      return `Relevant provisions of the ${description || "[Appendix Description]"}`;
  }
}

// The full Index row, e.g. "Appendix-B: True copy of the judgment in …".
export function appendixIndexText(item: AppendixItem, index: number, total: number): string {
  return `${appendixLabel(index, total)}: ${appendixBodyText(item)}`;
}

// A document is attached when it has either an uploaded PDF or typed text.
export function appendixHasContent(item: AppendixItem): boolean {
  return item.useManual ? !!(item.manualEntry || "").trim() : !!item.file;
}

// Every Appendix row the user has created, including empty ones (the dialog
// edits this list). Projects saved before the multi-document Appendix are
// folded into a single row here, so nothing else in the app has to know about
// the legacy fields.
export function getAppendixItems(project: Partial<DraftoProject> | undefined): AppendixItem[] {
  const items = (project as any)?.appendixItems as AppendixItem[] | undefined;
  if (items && items.length > 0) return items.map((i) => makeAppendixItem(i));

  const legacyFile = (project as any)?.appendixFile;
  const legacyManual = ((project as any)?.appendixManualEntry || "").trim();
  const legacyDescription = ((project as any)?.appendixDescription || "").trim();
  const useManual = !!(project as any)?.useManualAppendix;
  if (!legacyFile && !legacyManual && !legacyDescription) return [];

  return [
    makeAppendixItem({
      id: "apx_legacy",
      kind: "provisions",
      description: legacyDescription,
      useManual,
      manualEntry: (project as any)?.appendixManualEntry || "",
      file: legacyFile,
      filePath: (project as any)?.appendixFilePath,
    }),
  ];
}

// The documents that actually go into the paper-book: the Appendix is switched
// on and the row has something attached. The Index rows, the merge components
// and the page ranges are all built from this list, in this order.
export function getActiveAppendixItems(project: Partial<DraftoProject> | undefined): AppendixItem[] {
  if (!project?.wantsAppendix) return [];
  return getAppendixItems(project).filter(appendixHasContent);
}

// Merge-component id for an Appendix document (one per attached document).
export const appendixComponentId = (item: AppendixItem) => `appendix_${item.id}`;
export const isAppendixComponentId = (id: string) => id.startsWith("appendix_");
export const appendixItemIdFromComponentId = (id: string) => id.substring("appendix_".length);

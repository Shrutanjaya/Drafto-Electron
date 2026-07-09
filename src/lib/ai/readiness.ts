// Filing-readiness model for Mayur (Phase 2). A pure, derived view over the form
// values: which parts of the SLP are drafted, what's still missing, and the single
// most useful next step. No side effects — recomputed from form values on render.

export interface ReadinessSection {
  id: string;
  label: string;
  done: boolean;
  missing: string[];
  // Preset id (from presets.ts) that best advances this section, if any.
  presetId?: string;
}

export interface Readiness {
  sections: ReadinessSection[];
  doneCount: number;
  total: number;
  percent: number;
  // The first not-done section — Mayur's "next step" suggestion.
  next: ReadinessSection | null;
}

const filled = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
const anyRowFilled = (arr: unknown, key: string): boolean =>
  Array.isArray(arr) && arr.some((r) => filled((r as Record<string, unknown>)?.[key]));

// Rich-text emptiness: TipTap serialises an empty editor as "<p></p>"; strip tags.
const htmlHasText = (v: unknown): boolean =>
  typeof v === "string" && v.replace(/<[^>]*>/g, "").trim().length > 0;

export function computeReadiness(values: any): Readiness {
  const v = values || {};
  const io = Array.isArray(v.impugnedOrders) ? v.impugnedOrders[0] : undefined;
  const dep = v.deponent || {};

  const sections: ReadinessSection[] = [
    {
      id: "impugned",
      label: "Impugned order",
      presetId: "impugned",
      ...check([
        [filled(io?.caseNumber), "case number"],
        [filled(io?.effect), "what the High Court did"],
        [!!io?.date, "order date"],
        [filled(io?.court) || filled(io?.customCourt), "High Court"],
      ]),
    },
    {
      id: "parties",
      label: "Parties",
      presetId: "memo",
      ...check([
        [anyRowFilled(v.petitioners, "name"), "petitioner(s)"],
        [anyRowFilled(v.respondents, "name"), "respondent(s)"],
      ]),
    },
    {
      id: "deponent",
      label: "Deponent",
      presetId: "deponent",
      ...check([
        [filled(dep.name), "name"],
        [filled(dep.fatherName), "parent's/husband's name"],
        [filled(dep.address), "address"],
        [filled(dep.age), "age"],
      ]),
    },
    {
      id: "synopsis",
      label: "Synopsis",
      presetId: "synopsis",
      ...check([[htmlHasText(v.synopsis), "synopsis"]]),
    },
    {
      id: "lod",
      label: "List of dates",
      presetId: "lod",
      ...check([[anyRowFilled(v.listOfDates, "event"), "dates & events"]]),
    },
    {
      id: "grounds",
      label: "Grounds",
      presetId: "grounds-qol",
      ...check([[anyRowFilled(v.grounds, "particulars"), "grounds"]]),
    },
    {
      id: "qol",
      label: "Questions of law",
      presetId: "grounds-qol",
      ...check([[anyRowFilled(v.questionsOfLaw, "particulars"), "questions of law"]]),
    },
    {
      id: "listing",
      label: "Listing proforma",
      presetId: "listing",
      ...check([
        [filled(v.listingProforma?.general?.mainCategory), "main category"],
      ]),
    },
  ];

  // Interim relief only counts when the user has opted into it.
  if (v.wantsInterimRelief) {
    sections.splice(7, 0, {
      id: "interim",
      label: "Interim relief",
      presetId: "interim",
      ...check([[anyRowFilled(v.interimReliefPrayers, "particulars"), "interim prayer"]]),
    });
  }

  const doneCount = sections.filter((s) => s.done).length;
  const total = sections.length;
  return {
    sections,
    doneCount,
    total,
    percent: total ? Math.round((doneCount / total) * 100) : 0,
    next: sections.find((s) => !s.done) || null,
  };
}

// Turn a list of [ok, label] checks into { done, missing }.
function check(items: [boolean, string][]): { done: boolean; missing: string[] } {
  const missing = items.filter(([ok]) => !ok).map(([, label]) => label);
  return { done: missing.length === 0, missing };
}

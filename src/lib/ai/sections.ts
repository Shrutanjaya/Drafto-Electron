// ── The section registry ─────────────────────────────────────────────────────
// ONE list per document type, from which everything else is derived: the
// pick-list in Mayur's panel, the readiness view, the prompt for each drafting
// pass, and the gap report. Adding a document type means writing one entry here;
// adding a field to a section means editing one line.
//
// A "section" is a drafting unit as a lawyer thinks of it — the Grounds, the
// List of Dates, the Memo of Parties — not a database field. Each one knows
// which fields it owns, how to tell whether it has been written yet, what it
// needs to read first, and how to draft it.

import type { DraftMode } from "./field-catalog";
import type { Effort } from "./estimate";

export interface Section {
  id: string;
  /** Shown in the pick-list. */
  label: string;
  /** Which tab of the app it lives on — groups the pick-list. */
  tab: string;
  /** One line under the label in the pick-list. */
  hint?: string;
  /** Field paths this section owns. Used for the overwrite check and the diff. */
  paths: string[];
  /** Sections whose current contents should be read before drafting this one. */
  dependsOn?: string[];
  /** True when the section normally needs the source documents. */
  needsDocuments?: boolean;
  /** How much work it is — drives the time estimate and the model choice. */
  effort: Effort;
  /** Preferred model when the user has not chosen one. */
  model?: "haiku" | "sonnet" | "opus";
  /** The drafting playbook — appended to the master instructions for this pass. */
  playbook: string;
  /**
   * Whether the section already has content. Deliberately per-section rather
   * than generic: "the Grounds are written" means something different from
   * "the deponent is filled in".
   */
  isFilled: (v: any) => boolean;
}

// ── Fill-detection helpers ───────────────────────────────────────────────────
const text = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
const html = (v: unknown): boolean =>
  typeof v === "string" && v.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
const rows = (arr: unknown, key: string): boolean =>
  Array.isArray(arr) && arr.some((r) => html((r as any)?.[key]));
const named = (arr: unknown): boolean =>
  Array.isArray(arr) && arr.some((r) => text((r as any)?.name));

// ── Shared playbook fragments ────────────────────────────────────────────────
const NO_NUMBERING = "Do NOT number or letter the items — Drafto numbers them.";

// ─────────────────────────────────────────────────────────────────────────────
// SLP — Supreme Court
// ─────────────────────────────────────────────────────────────────────────────
const SLP_SECTIONS: Section[] = [
  {
    id: "parties",
    label: "Memo of Parties",
    tab: "Preliminary",
    hint: "Petitioners and respondents, with addresses",
    paths: ["petitioners", "respondents"],
    needsDocuments: true,
    effort: "medium",
    model: "haiku",
    isFilled: (v) => named(v?.petitioners) && named(v?.respondents),
    playbook:
      "Fill the Petitioners and Respondents from the memo of parties in the paper-book below.\n" +
      "- The SLP Petitioners are the parties challenging the Impugned Order; the Respondents are the rest, in the same order as below.\n" +
      "- Name in Title Case, full address, and the party's exact designation with number in the court below (e.g. \"Respondent No. 3\").\n" +
      "- If it is not clear who is challenging the order, say so rather than guessing.",
  },
  {
    id: "impugned",
    label: "Impugned Order details",
    tab: "Preliminary",
    hint: "Court, case number, date, and what it did",
    paths: ["impugnedOrders", "caseType"],
    needsDocuments: true,
    effort: "small",
    model: "haiku",
    isFilled: (v) => Array.isArray(v?.impugnedOrders) && v.impugnedOrders.some((o: any) => text(o?.caseNumber)),
    playbook:
      "Fill the Impugned Order details from the order being challenged.\n" +
      "- Court, case number exactly as it appears, date, and the order type.\n" +
      "- The \"effect\" field states in one sentence what the order did to the Petitioner.\n" +
      "- Set caseType to Criminal only if the proceeding below was criminal.",
  },
  {
    id: "deponent",
    label: "Deponent",
    tab: "Preliminary",
    hint: "Who swears the affidavit",
    paths: ["deponent"],
    dependsOn: ["parties"],
    effort: "small",
    model: "haiku",
    isFilled: (v) => text(v?.deponent?.name),
    playbook:
      "Fill the deponent from the parties and the documents: name, parent's/husband's name, age, address, and relationship to the Petitioner.\n" +
      "- Normally the first Petitioner. For an organisation, the authorised officer.",
  },
  {
    id: "lod",
    label: "List of Dates & Events",
    tab: "SLP",
    hint: "The chronology, with annexures attached to each event",
    paths: ["listOfDates"],
    needsDocuments: true,
    dependsOn: ["impugned"],
    effort: "large",
    model: "sonnet",
    isFilled: (v) => rows(v?.listOfDates, "event"),
    playbook:
      "Draft the List of Dates & Events — the chronological spine of the SLP.\n" +
      "- One row per event, earliest first, ending with the Impugned Order.\n" +
      "- Attach each document relied on as an annexure to the row for the event it evidences. Put the annexure's description in the annexure entry, never in the event text.\n" +
      "- The Impugned Order itself is NEVER an annexure.\n" +
      "- Keep each event to a sentence or two; the detail belongs in the Synopsis and Grounds.",
  },
  {
    id: "synopsis",
    label: "Synopsis",
    tab: "SLP",
    hint: "The narrative of the case",
    paths: ["synopsis"],
    dependsOn: ["lod", "impugned"],
    effort: "medium",
    model: "sonnet",
    isFilled: (v) => html(v?.synopsis),
    playbook:
      "Draft the Synopsis: a flowing narrative of what happened, what the Impugned Order held, and why it is wrong.\n" +
      "- Written to persuade, not to summarise neutrally.\n" +
      "- No headings, no bullet points — continuous prose in paragraphs.",
  },
  {
    id: "qol",
    label: "Questions of Law",
    tab: "SLP",
    hint: "The substantial questions for the Court",
    paths: ["questionsOfLaw"],
    dependsOn: ["synopsis", "lod", "grounds"],
    effort: "medium",
    model: "sonnet",
    isFilled: (v) => rows(v?.questionsOfLaw, "particulars"),
    playbook:
      "Draft the Questions of Law that arise for this Hon'ble Court's consideration.\n" +
      "- Each must be a genuine question of law, phrased as a question, arising from the Impugned Order.\n" +
      "- Substantial questions only — not questions of fact, not repetitions of the grounds.\n" +
      `- ${NO_NUMBERING}`,
  },
  {
    id: "grounds",
    label: "Grounds",
    tab: "SLP",
    hint: "Why the Impugned Order cannot stand",
    paths: ["grounds"],
    dependsOn: ["synopsis", "lod"],
    effort: "large",
    model: "sonnet",
    isFilled: (v) => rows(v?.grounds, "particulars"),
    playbook:
      "Draft the Grounds on which the Impugned Order is challenged.\n" +
      "- Each ground is a self-contained argument, taken without prejudice to the others.\n" +
      "- Attack the Impugned Order, never the court that passed it.\n" +
      "- Lead with the strongest. Cite authority only where you are confident of the citation.\n" +
      `- ${NO_NUMBERING}`,
  },
  {
    id: "interim",
    label: "Interim Relief",
    tab: "SLP",
    hint: "Grounds and prayers for interim relief",
    paths: ["interimReliefGrounds", "interimReliefPrayers"],
    dependsOn: ["grounds"],
    effort: "medium",
    model: "sonnet",
    isFilled: (v) => rows(v?.interimReliefGrounds, "particulars") || rows(v?.interimReliefPrayers, "particulars"),
    playbook:
      "Draft the grounds and prayers for interim relief — but only if the material discloses urgency or irreparable prejudice.\n" +
      "- If it does not, leave both empty and say so; an unnecessary stay application weakens the petition.\n" +
      `- ${NO_NUMBERING}`,
  },
  {
    id: "ias",
    label: "Applications (IAs)",
    tab: "Applications",
    hint: "Condonation of delay, exemption, and the rest",
    paths: ["standardIas", "customIas"],
    dependsOn: ["lod", "impugned"],
    effort: "medium",
    model: "sonnet",
    isFilled: (v) =>
      rows(v?.standardIas?.condonationOfDelay?.grounds, "particulars") ||
      (Array.isArray(v?.customIas) && v.customIas.length > 0),
    playbook:
      "Fill the applications that this SLP needs.\n" +
      "- Work out from the dates whether the SLP is beyond limitation (90 days from the Impugned Order); if so, activate condonation of delay and draft its grounds.\n" +
      "- Draft grounds only for applications that are actually needed. Do not activate an application speculatively.",
  },
  {
    id: "listing",
    label: "Listing Proforma",
    tab: "Listing Proforma",
    hint: "The particulars the Registry needs",
    paths: ["listingProforma"],
    dependsOn: ["impugned", "parties", "qol"],
    effort: "medium",
    model: "haiku",
    isFilled: (v) => text(v?.listingProforma?.natureOfMatter) || text(v?.listingProforma?.subjectCategory),
    playbook:
      "Fill the Listing Proforma from what is already in the project.\n" +
      "- Nature of the matter, subject category, the statutes and sections involved, and the valuation where applicable.\n" +
      "- These are factual particulars for the Registry — take them from the record, never invent a category.",
  },
  {
    id: "checklist",
    label: "Advocate's Checklist",
    tab: "Advocate's Checklist",
    hint: "The 15 answers — the declaration stays yours",
    paths: ["checklist"],
    dependsOn: ["lod", "listing"],
    effort: "small",
    model: "haiku",
    isFilled: (v) => text(v?.checklist?.q1_form28),
    playbook:
      "Answer the Advocate's Checklist from the state of the project.\n" +
      "- Answer Yes / No / NA on the facts as they actually stand — never answer Yes to make the paper-book look complete.\n" +
      "- NEVER touch checklist.declarationVerified. That declaration is the advocate's personal attestation to the Registry and only they may tick it.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Writ Petition — Delhi High Court
// ─────────────────────────────────────────────────────────────────────────────
const WP_SECTIONS: Section[] = [
  {
    id: "parties",
    label: "Parties",
    tab: "Preliminary",
    hint: "Petitioners and respondents, with service designations",
    paths: ["petitioners", "respondents"],
    needsDocuments: true,
    effort: "medium",
    model: "haiku",
    isFilled: (v) => named(v?.petitioners) && named(v?.respondents),
    playbook:
      "Fill the Petitioners and Respondents.\n" +
      "- Government respondents carry a \"through\" designation — \"Through the Secretary, Ministry of …\".\n" +
      "- Name in Title Case, full address.",
  },
  {
    id: "basis",
    label: "Nature of the writ",
    tab: "Preliminary",
    hint: "Article basis, and whether an order is challenged",
    paths: ["wp.articleBasis", "caseType"],
    needsDocuments: true,
    effort: "small",
    model: "haiku",
    isFilled: (v) => text(v?.wp?.articleBasis),
    playbook:
      "Determine whether this is a writ against a specific order (mark that order's annexure isImpugnedOrder) or against action/inaction, and set the Article basis (226, 227, or both).",
  },
  {
    id: "deponent",
    label: "Deponent",
    tab: "Preliminary",
    hint: "Who swears the affidavit",
    paths: ["deponent"],
    dependsOn: ["parties"],
    effort: "small",
    model: "haiku",
    isFilled: (v) => text(v?.deponent?.name),
    playbook: "Fill the deponent — normally the first Petitioner: name, parent's/husband's name, age, address, relationship.",
  },
  {
    id: "lod",
    label: "List of Dates & Events",
    tab: "Petition",
    hint: "The chronology, with annexures",
    paths: ["listOfDates"],
    needsDocuments: true,
    dependsOn: ["basis"],
    effort: "large",
    model: "sonnet",
    isFilled: (v) => rows(v?.listOfDates, "event"),
    playbook:
      "Draft the List of Dates & Events, earliest first.\n" +
      "- Attach each document relied on as an annexure to the row for the event it evidences.\n" +
      "- In an impugned-order writ, the impugned order IS annexed.",
  },
  {
    id: "synopsis",
    label: "Synopsis",
    tab: "Petition",
    hint: "The narrative of the case",
    paths: ["synopsis"],
    dependsOn: ["lod"],
    effort: "medium",
    model: "sonnet",
    isFilled: (v) => html(v?.synopsis),
    playbook: "Draft the Synopsis as continuous persuasive prose — what happened, what is complained of, and why relief is due.",
  },
  {
    id: "facts",
    label: "Facts",
    tab: "Petition",
    hint: "Para-wise narration",
    paths: ["wp.facts"],
    dependsOn: ["lod"],
    effort: "large",
    model: "sonnet",
    isFilled: (v) => html(v?.wp?.facts),
    playbook:
      "Draft the Facts as an HTML ordered list — <ol><li>…</li></ol>, one <li> per numbered paragraph.\n" +
      "- Follow the chronology of the List of Dates, citing each annexure where it belongs.",
  },
  {
    id: "grounds",
    label: "Grounds",
    tab: "Petition",
    hint: "Why the relief should issue",
    paths: ["grounds"],
    dependsOn: ["facts", "lod"],
    effort: "large",
    model: "sonnet",
    isFilled: (v) => rows(v?.grounds, "particulars"),
    playbook:
      "Draft the Grounds — each a self-contained argument, taken without prejudice.\n" +
      "- Attack the impugned order or action, never the court or officer.\n" +
      `- ${NO_NUMBERING}`,
  },
  {
    id: "reliefs",
    label: "Reliefs",
    tab: "Petition",
    hint: "What is prayed for",
    paths: ["wp.reliefs"],
    dependsOn: ["grounds", "basis"],
    effort: "small",
    model: "sonnet",
    isFilled: (v) => rows(v?.wp?.reliefs, "particulars"),
    playbook:
      "Draft the Reliefs, one per row.\n" +
      "- In an impugned-order writ the first must seek to quash and set aside the impugned order, citing its annexure.\n" +
      "- The LAST row must be the residuary prayer.\n" +
      "- Supply each relief's own punctuation: \"; and\" between, a full stop at the end.\n" +
      `- ${NO_NUMBERING}`,
  },
  {
    id: "cms",
    label: "CM Applications",
    tab: "Applications",
    hint: "Stay, exemption, and bespoke applications",
    paths: ["wp.cms", "wp.customCms"],
    dependsOn: ["grounds"],
    effort: "medium",
    model: "sonnet",
    isFilled: (v) => v?.wp?.cms?.stay?.active === true || (Array.isArray(v?.wp?.customCms) && v.wp.customCms.length > 0),
    playbook:
      "Fill only the CM applications this petition actually needs, drafting their grounds and prayers.\n" +
      "- A stay application only where the material discloses urgency.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Original Application — Central Administrative Tribunal
// ─────────────────────────────────────────────────────────────────────────────
const OA_SECTIONS: Section[] = [
  {
    id: "parties",
    label: "Applicants & Respondents",
    tab: "Preliminary",
    hint: "With service designations for the department",
    paths: ["petitioners", "respondents"],
    needsDocuments: true,
    effort: "medium",
    model: "haiku",
    isFilled: (v) => named(v?.petitioners) && named(v?.respondents),
    playbook:
      "Fill the Applicants and Respondents.\n" +
      "- The Applicant is the government servant (or dependant) aggrieved.\n" +
      "- Respondents are the Union/State and its officers, each \"Through\" the officer heading the department concerned.\n" +
      "- Every sentence you draft elsewhere must call them the Applicant, never the Petitioner.",
  },
  {
    id: "deponent",
    label: "Deponent",
    tab: "Preliminary",
    hint: "Who swears the affidavit",
    paths: ["deponent"],
    dependsOn: ["parties"],
    effort: "small",
    model: "haiku",
    isFilled: (v) => text(v?.deponent?.name),
    playbook: "Fill the deponent — normally the first Applicant: name, parent's/husband's name, age, address.",
  },
  {
    id: "lod",
    label: "List of Dates & Events",
    tab: "Application",
    hint: "The chronology — the spine of the OA",
    paths: ["listOfDates"],
    needsDocuments: true,
    effort: "large",
    model: "sonnet",
    isFilled: (v) => rows(v?.listOfDates, "event"),
    playbook:
      "Draft the List of Dates & Events, earliest first, with each document annexed to the row it evidences.\n" +
      "- Include the statutory representation and its rejection — they establish exhaustion of remedies under Section 20.\n" +
      "- The impugned order/office memorandum IS annexed in an OA.\n" +
      "- The Facts (Para 4) are generated from these rows, so make each event a complete sentence.",
  },
  {
    id: "jurisdiction",
    label: "Jurisdiction & limitation",
    tab: "Application",
    hint: "Paras 2 and 3 — the threshold paragraphs",
    paths: ["oa.jurisdictionCause", "oa.jurisdictionCauseNote", "oa.jurisdictionPosted", "oa.jurisdictionPostedNote", "oa.limitation", "oa.delayDays", "oa.limitationNote"],
    dependsOn: ["lod"],
    effort: "small",
    model: "sonnet",
    isFilled: (v) => text(v?.oa?.limitationNote) || v?.oa?.limitation === "delay",
    playbook:
      "Settle the two threshold paragraphs from the dates.\n" +
      "- Para 2: assert the cause of action arose within this Bench's jurisdiction, and/or that the Applicant is posted within it. At least one must hold.\n" +
      "- Para 3: Section 21 gives one year from the final order or from rejection of the representation. Set noDelay, delay (with the days and the explanation), or abundantCaution.\n" +
      "- If you set delay, also propose a condonation application.",
  },
  {
    id: "synopsis",
    label: "Synopsis",
    tab: "Application",
    hint: "The narrative of the case",
    paths: ["synopsis"],
    dependsOn: ["lod"],
    effort: "medium",
    model: "sonnet",
    isFilled: (v) => html(v?.synopsis),
    playbook: "Draft the Synopsis as continuous prose: the Applicant's service history, what was done to them, the remedy sought and refused, and why relief is due.",
  },
  {
    id: "grounds",
    label: "Grounds",
    tab: "Application",
    hint: "Why the relief should be granted",
    paths: ["grounds"],
    dependsOn: ["lod", "synopsis"],
    effort: "large",
    model: "sonnet",
    isFilled: (v) => rows(v?.grounds, "particulars"),
    playbook:
      "Draft the Grounds — each a self-contained argument.\n" +
      "- Service matters turn on rules and orders: identify the rule, the office memorandum or the circular breached, and say how.\n" +
      "- Articles 14 and 16 where the treatment is discriminatory or arbitrary.\n" +
      `- ${NO_NUMBERING}`,
  },
  {
    id: "reliefs",
    label: "Reliefs",
    tab: "Application",
    hint: "Paras 1 and 8 — what the Tribunal is asked to do",
    paths: ["oa.reliefs"],
    dependsOn: ["grounds"],
    effort: "small",
    model: "sonnet",
    isFilled: (v) => rows(v?.oa?.reliefs, "particulars"),
    playbook:
      "Draft the Reliefs, one per row.\n" +
      "- The first normally seeks to quash the impugned order/office memorandum, citing its annexure.\n" +
      "- Do NOT add the residuary prayer — Drafto appends it.\n" +
      `- ${NO_NUMBERING}`,
  },
  {
    id: "interim",
    label: "Interim relief",
    tab: "Application",
    hint: "Para 9 — NIL unless needed",
    paths: ["oa.interimNil", "oa.interimReliefs"],
    dependsOn: ["grounds"],
    effort: "small",
    model: "sonnet",
    isFilled: (v) => v?.oa?.interimNil === false && rows(v?.oa?.interimReliefs, "particulars"),
    playbook:
      "Only where the material discloses urgency: set oa.interimNil false and draft the interim reliefs. Otherwise leave it NIL and say so.",
  },
  {
    id: "mas",
    label: "Miscellaneous Applications",
    tab: "Applications",
    hint: "Condonation, exemption, transfer",
    paths: ["oa.mas"],
    dependsOn: ["jurisdiction"],
    effort: "medium",
    model: "sonnet",
    isFilled: (v) => Array.isArray(v?.oa?.mas) && v.oa.mas.length > 0,
    playbook:
      "Draft only the applications this OA actually needs — condonation where there is delay, exemption where a document cannot be filed, a Petition for Transfer where neither jurisdiction limb holds.\n" +
      "- Each needs a title, a praying paragraph, grounds and prayers.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────

const REGISTRY: Record<DraftMode, Section[]> = {
  SLP: SLP_SECTIONS,
  WritPetitionDHC: WP_SECTIONS,
  OriginalApplicationCAT: OA_SECTIONS,
};

export function sectionsFor(mode: DraftMode): Section[] {
  return REGISTRY[mode] ?? [];
}

export function sectionById(mode: DraftMode, id: string): Section | undefined {
  return sectionsFor(mode).find((s) => s.id === id);
}

/** The sections, grouped by tab in registry order — used for the pick-list. */
export function sectionsByTab(mode: DraftMode): { tab: string; sections: Section[] }[] {
  const order: string[] = [];
  const map = new Map<string, Section[]>();
  for (const s of sectionsFor(mode)) {
    if (!map.has(s.tab)) { map.set(s.tab, []); order.push(s.tab); }
    map.get(s.tab)!.push(s);
  }
  return order.map((tab) => ({ tab, sections: map.get(tab)! }));
}

/**
 * Order a set of section ids so that every section comes after the ones it
 * depends on. Dependencies outside the selection are ignored (they are read as
 * context, not drafted). Cycles cannot occur in a hand-written registry, but a
 * visited-set guards against one anyway.
 */
export function orderByDependency(mode: DraftMode, ids: string[]): string[] {
  const all = sectionsFor(mode);
  const wanted = new Set(ids);
  const out: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();

  const visit = (id: string) => {
    if (done.has(id) || visiting.has(id)) return;
    visiting.add(id);
    const sec = all.find((s) => s.id === id);
    for (const dep of sec?.dependsOn ?? []) {
      if (wanted.has(dep)) visit(dep);
    }
    visiting.delete(id);
    done.add(id);
    out.push(id);
  };

  // Registry order is the tie-breaker, so the run reads top-to-bottom.
  for (const s of all) if (wanted.has(s.id)) visit(s.id);
  return out;
}

/** Which sections already have content — drives the overwrite question. */
export function filledSections(mode: DraftMode, values: any): Set<string> {
  const out = new Set<string>();
  for (const s of sectionsFor(mode)) {
    try {
      if (s.isFilled(values)) out.add(s.id);
    } catch {
      // A malformed project must never break the pick-list.
    }
  }
  return out;
}

/** Progress across the whole document type, for the readiness bar. */
export function sectionProgress(mode: DraftMode, values: any): { done: number; total: number; percent: number } {
  const total = sectionsFor(mode).length;
  const done = filledSections(mode, values).size;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

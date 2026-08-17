// ── Drafto AI knowledge: the field catalog ───────────────────────────────────
// A curated, safety-bounded map of the form fields the AI assistant is allowed
// to fill. This is deliberately hand-authored rather than auto-derived from the
// Zod schema: it doubles as (a) the human-readable map injected into the LLM
// system prompt and (b) the allow-list + type rules used to validate anything
// the LLM proposes before it can touch the form. The assistant can ONLY target
// paths that appear here, which keeps file attachments, IDs and other delicate
// state out of reach.
//
// Coverage policy: the catalog covers EVERY user-editable field in the Drafto
// project, across all tabs. The only deliberate exclusions are:
//   • advocate.aorName / advocate.aorCode — set once in Settings → User Defaults
//     and auto-filled into every project; the assistant must never touch them.
//   • File attachments (annexure files, receipt files, the appendix file, the
//     pdfMergeItems list) — the assistant identifies documents via the separate
//     "documents" map; it cannot set File objects or disk paths.
//   • Auto-generated list-row `id`s and legacy/compat fields.

import { checklistQueries } from "@/lib/checklist-queries";

export type FieldKind = "text" | "longtext" | "enum" | "date" | "boolean" | "number";

// One column of a list item. A leaf is normally a scalar (text/enum/date/…),
// but when `itemFields` is present the column is itself a nested list of rows
// (e.g. the petitioners inside one common-order party group). `kind` is ignored
// for nested-list leaves.
export interface LeafField {
  key: string; // sub-key within a list item; "" for a top-level scalar
  label: string;
  kind: FieldKind;
  enumValues?: readonly string[];
  description?: string;
  // Present iff this column is a nested list; describes the shape of each sub-row.
  itemFields?: LeafField[];
}

export interface CatalogEntry {
  path: string; // dot-path into the form (the array path itself, for lists)
  tab: string;
  label: string;
  description: string;
  isList: boolean;
  // Scalar entries:
  kind?: FieldKind;
  enumValues?: readonly string[];
  // List entries — the shape of each row:
  itemFields?: LeafField[];
}

const PARTY_FIELDS: LeafField[] = [
  { key: "name", label: "Name", kind: "text" },
  { key: "address", label: "Address", kind: "longtext" },
  {
    key: "positionInEarlierCourt",
    label: "Designation in the court below, WITH the number",
    kind: "text",
    description:
      "The party's exact numbered designation in the court below — e.g. \"Petitioner No. 1\", \"Petitioner No. 2\", \"Respondent No. 3\". Take the number from the source's memo of parties / cause title; the first petitioner is \"Petitioner No. 1\", the second \"Petitioner No. 2\", and so on. Never write just \"Petitioner\" or \"Respondent\" without the number.",
  },
];

// A bare one-column "particulars" list row, reused by Grounds-style tables.
const PARTICULARS_FIELDS: LeafField[] = [{ key: "particulars", label: "Particulars", kind: "longtext" }];

const DEPONENT_ROLES = [
  "Petitioner",
  "Petitioner No. 1",
  "Pairokar of the Petitioner",
  "Pairokar of the Petitioner No. 1",
  "Authorised Representative of the Petitioner",
  "Authorised Representative of Petitioner No. 1",
  "Legal Guardian of the Petitioner",
  "Legal Guardian of Petitioner No. 1",
  "Power of Attorney Holder of the Petitioner",
  "Power of Attorney Holder of Petitioner No. 1",
] as const;

const BASE_CATALOG: CatalogEntry[] = [
  // ── Preliminary tab ──
  {
    path: "caseType",
    tab: "Preliminary",
    label: "Case type",
    description: "Whether this is a Civil or Criminal SLP.",
    isList: false,
    kind: "enum",
    enumValues: ["Civil", "Criminal"],
  },
  {
    path: "petitioners",
    tab: "Preliminary",
    label: "Petitioners",
    description: "The party/parties filing the SLP, in order.",
    isList: true,
    itemFields: PARTY_FIELDS,
  },
  {
    path: "respondents",
    tab: "Preliminary",
    label: "Respondents",
    description: "The opposing party/parties, in order.",
    isList: true,
    itemFields: PARTY_FIELDS,
  },
  {
    path: "isCommonOrder",
    tab: "Preliminary",
    label: "Impugned order is a common order",
    description:
      "Set true when the single impugned order disposed of multiple petitions/cases together. When true, fill commonOrderParties with the per-case party groups.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "commonOrderParties",
    tab: "Preliminary",
    label: "Common-order party groups",
    description:
      "Used only when isCommonOrder is true. One group per case that the common order disposed of, each with its own case number and its own petitioners/respondents.",
    isList: true,
    itemFields: [
      { key: "caseNumber", label: "Case number in the court below", kind: "text" },
      { key: "petitioners", label: "Petitioners in this case", kind: "text", itemFields: PARTY_FIELDS },
      { key: "respondents", label: "Respondents in this case", kind: "text", itemFields: PARTY_FIELDS },
    ],
  },
  {
    path: "impugnedOrders",
    tab: "Preliminary",
    label: "Impugned order(s)",
    description: "The order(s) being challenged in this SLP.",
    isList: true,
    itemFields: [
      { key: "type", label: "Order type", kind: "enum", enumValues: ["Final Judgment and Order", "Final Order", "Interim Order"] },
      { key: "date", label: "Date of the order (ISO yyyy-mm-dd)", kind: "date" },
      { key: "caseNumber", label: "Case number in the court below", kind: "text" },
      { key: "court", label: "Court that passed the order", kind: "text" },
      {
        key: "customCourt",
        label: "Custom court name",
        kind: "text",
        description: "A free-text court name, used only when the court isn't one of the standard preset courts.",
      },
      { key: "effect", label: "Effect of the order (one-line gist)", kind: "longtext" },
    ],
  },
  {
    path: "intraCourtAppealStatus",
    tab: "Preliminary",
    label: "Intra-court appeal status",
    description:
      "Whether an intra-court appeal (e.g. Letters Patent Appeal) lies against the impugned order. Use \"no_appeal_lies\" if no such appeal lies, \"appeal_lies_but\" if one lies but is not being pursued (then fill the reason), or leave empty if not applicable.",
    isList: false,
    kind: "enum",
    enumValues: ["", "no_appeal_lies", "appeal_lies_but"],
  },
  {
    path: "intraCourtAppealReason",
    tab: "Preliminary",
    label: "Intra-court appeal reason",
    description: "Explanation, used when intraCourtAppealStatus is \"appeal_lies_but\".",
    isList: false,
    kind: "longtext",
  },
  {
    path: "para1BContent",
    tab: "Preliminary",
    label: "Para 1B contents",
    description: "Optional free-text contents for Para 1B of the petition, added directly below Para 1A. Leave empty if not needed.",
    isList: false,
    kind: "longtext",
  },
  { path: "advocate.filingPlace", tab: "Preliminary", label: "Filing place", description: "Usually New Delhi.", isList: false, kind: "text" },
  { path: "advocate.filingDate", tab: "Preliminary", label: "Filing date (ISO yyyy-mm-dd)", description: "Date the petition is filed.", isList: false, kind: "date" },
  {
    path: "advocate.wantsDrawnBy",
    tab: "Preliminary",
    label: "Show a \"Drawn by\" advocate",
    description: "Set true when a separate \"Drawn by\" advocate should appear on the petition.",
    isList: false,
    kind: "boolean",
  },
  { path: "advocate.drawnByName", tab: "Preliminary", label: "\"Drawn by\" advocate name", description: "", isList: false, kind: "text" },
  { path: "advocate.drawnByDate", tab: "Preliminary", label: "\"Drawn by\" date (ISO yyyy-mm-dd)", description: "", isList: false, kind: "date" },
  { path: "advocate.drawnByPlace", tab: "Preliminary", label: "\"Drawn by\" place", description: "Usually New Delhi.", isList: false, kind: "text" },
  {
    path: "advocate.wantsSettledBy",
    tab: "Preliminary",
    label: "Show a \"Settled by\" advocate",
    description: "Set true when a separate \"Settled by\" advocate (e.g. a Senior Advocate) should appear on the petition.",
    isList: false,
    kind: "boolean",
  },
  { path: "advocate.settledByName", tab: "Preliminary", label: "\"Settled by\" advocate name", description: "", isList: false, kind: "text" },
  { path: "advocate.settledByDate", tab: "Preliminary", label: "\"Settled by\" date (ISO yyyy-mm-dd)", description: "", isList: false, kind: "date" },
  { path: "advocate.settledByPlace", tab: "Preliminary", label: "\"Settled by\" place", description: "Usually New Delhi.", isList: false, kind: "text" },
  { path: "deponent.name", tab: "Preliminary", label: "Deponent name", description: "Person swearing the affidavit.", isList: false, kind: "text" },
  { path: "deponent.fatherName", tab: "Preliminary", label: "Deponent's father/husband name", description: "", isList: false, kind: "text" },
  { path: "deponent.address", tab: "Preliminary", label: "Deponent address", description: "", isList: false, kind: "longtext" },
  { path: "deponent.location", tab: "Preliminary", label: "Deponent location", description: "The place at which the affidavit is sworn/verified.", isList: false, kind: "text" },
  { path: "deponent.age", tab: "Preliminary", label: "Deponent age", description: "", isList: false, kind: "text" },
  {
    path: "deponent.relationship",
    tab: "Preliminary",
    label: "Deponent relationship",
    description: "Relationship phrasing used in the affidavit.",
    isList: false,
    kind: "enum",
    enumValues: ["son of", "daughter of", "wife of"],
  },
  {
    path: "deponent.role",
    tab: "Preliminary",
    label: "Deponent role",
    description: "The deponent's capacity in which the affidavit is sworn.",
    isList: false,
    kind: "enum",
    enumValues: DEPONENT_ROLES,
  },

  // ── Petition tab ──
  {
    path: "synopsis",
    tab: "Petition",
    label: "Synopsis",
    description: "The narrative synopsis of the case.",
    isList: false,
    kind: "longtext",
  },
  {
    path: "listOfDates",
    tab: "Petition",
    label: "List of Dates & Events",
    description: "Chronological table of events. Each row is one event.",
    isList: true,
    itemFields: [
      { key: "date", label: "Date (free text, e.g. 12.03.2021)", kind: "text" },
      { key: "event", label: "Particulars of the event", kind: "longtext" },
      {
        key: "annexures",
        label: "Annexure(s) for this event",
        kind: "longtext",
        description:
          "Annexure(s) tied to this event. Put each annexure's DESCRIPTION here, NOT in the event/particulars text. This describes the annexure only — it does not attach a file (use the documents map for splitting/attaching).",
        itemFields: [
          { key: "title", label: "Annexure description/title", kind: "longtext" },
          { key: "date", label: "Annexure date (free text, e.g. 12.03.2021)", kind: "text" },
          { key: "copyType", label: "Copy type", kind: "enum", enumValues: ["true copy", "typed copy", "true and typed copy", "translated copy", "true and translated copy"] },
          { key: "customText", label: "Extra custom text (optional)", kind: "longtext" },
          { key: "isAdditionalDocument", label: "Additional Document (not before the court below)", kind: "boolean" },
        ],
      },
    ],
  },
  {
    path: "questionsOfLaw",
    tab: "Petition",
    label: "Questions of Law",
    description: "Substantial questions of law raised. One per row.",
    isList: true,
    itemFields: [{ key: "particulars", label: "Question of law", kind: "longtext" }],
  },
  {
    path: "grounds",
    tab: "Petition",
    label: "Grounds",
    description: "Grounds for the SLP. One per row.",
    isList: true,
    itemFields: [{ key: "particulars", label: "Ground", kind: "longtext" }],
  },
  {
    path: "wantsInterimRelief",
    tab: "Petition",
    label: "Seeks interim relief",
    description: "Whether the petition prays for interim relief. Set true when drafting interim-relief grounds/prayers.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "interimReliefGrounds",
    tab: "Petition",
    label: "Interim Relief — Grounds",
    description: "Grounds for seeking interim relief (prima facie case, balance of convenience, irreparable injury, etc.). One per row.",
    isList: true,
    itemFields: [{ key: "particulars", label: "Ground for interim relief", kind: "longtext" }],
  },
  {
    path: "interimReliefPrayers",
    tab: "Petition",
    label: "Interim Relief — Prayers",
    description: "The interim relief(s) prayed for. One per row.",
    isList: true,
    itemFields: [{ key: "particulars", label: "Interim relief prayer", kind: "longtext" }],
  },
  // Appendix (rendered on the Petition tab)
  {
    path: "wantsAppendix",
    tab: "Petition",
    label: "Include an Appendix",
    description: "Whether the petition includes an Appendix (statutory provisions, judgments, or other material).",
    isList: false,
    kind: "boolean",
  },
  {
    path: "appendixItems",
    tab: "Petition",
    label: "Appendix documents",
    description:
      "The documents attached as an Appendix — statutory provisions, judgments, or anything else. One row per document; each becomes its own Index entry (Appendix-A, Appendix-B …). Uploaded PDFs are attached by the user; only the typed-out text can be filled in here.",
    isList: true,
    itemFields: [
      {
        key: "kind",
        label: "What the document is",
        kind: "enum",
        enumValues: ["provisions", "judgment", "custom"] as const,
      },
      {
        key: "description",
        label: "Description",
        kind: "text",
        description:
          "The Act/Rules for provisions, the case name and citation for a judgment, or a short description for anything else.",
      },
      {
        key: "useManual",
        label: "Typed out rather than uploaded",
        kind: "boolean",
        description:
          "Only for provisions and other material. A judgment is always filed as a copy of the court's document, so it must be uploaded — leave this false for a judgment.",
      },
      { key: "manualEntry", label: "Appendix text (when typed out)", kind: "longtext" },
    ],
  },
  // Declarations (rendered on the Petition tab)
  {
    path: "declarations.noOtherSLPFiled",
    tab: "Petition",
    label: "Declaration: no other SLP filed",
    description: "Declares that no other SLP/petition has been filed against the impugned order.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "declarations.annexuresTrueCopies",
    tab: "Petition",
    label: "Declaration: annexures are true copies",
    description: "Declares that the annexures are true copies of the documents on the record of the court below.",
    isList: false,
    kind: "boolean",
  },
  // AOR Certificate (rendered on the Petition tab)
  {
    path: "aorCertificate.confinedToPleadings",
    tab: "Petition",
    label: "AoR certificate: confined to pleadings",
    description: "Certifies that the SLP is confined to the pleadings before the court below.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "aorCertificate.annexuresNecessary",
    tab: "Petition",
    label: "AoR certificate: annexures necessary",
    description: "Certifies that the annexures are necessary for the petition.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "aorCertificate.basedOnInstructions",
    tab: "Petition",
    label: "AoR certificate: based on instructions",
    description: "Certifies that the SLP is based on the instructions given by the client.",
    isList: false,
    kind: "boolean",
  },

  // ── Applications (IAs) tab ──
  {
    path: "standardIas.condonationOfDelay.active",
    tab: "Applications",
    label: "IA: Condonation of delay — active",
    description: "Set true to include an application for condonation of delay (when the SLP is time-barred).",
    isList: false,
    kind: "boolean",
  },
  {
    path: "standardIas.condonationOfDelay.delayDays",
    tab: "Applications",
    label: "Condonation of delay — number of days",
    description: "The number of days of delay to be condoned.",
    isList: false,
    kind: "number",
  },
  {
    path: "standardIas.condonationOfDelay.grounds",
    tab: "Applications",
    label: "Condonation of delay — grounds",
    description: "Grounds explaining/justifying the delay. One per row.",
    isList: true,
    itemFields: PARTICULARS_FIELDS,
  },
  {
    path: "standardIas.additionalDocuments",
    tab: "Applications",
    label: "IA: Additional documents — active",
    description: "Set true to include an application for permission to file additional documents.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "standardIas.additionalDocumentsGrounds",
    tab: "Applications",
    label: "Additional documents — grounds",
    description: "Grounds for seeking to file additional documents. One per row.",
    isList: true,
    itemFields: PARTICULARS_FIELDS,
  },
  {
    path: "standardIas.exemptionCertifiedCopy.active",
    tab: "Applications",
    label: "IA: Exemption from filing certified copy — active",
    description: "Set true to include an application for exemption from filing the certified copy of the impugned order.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "standardIas.exemptionCertifiedCopy.hasApplied",
    tab: "Applications",
    label: "Certified copy — has been applied for?",
    description: "Whether the certified copy has already been applied for.",
    isList: false,
    kind: "enum",
    enumValues: ["yes", "no"],
  },
  {
    path: "standardIas.exemptionCertifiedCopy.receiptDate",
    tab: "Applications",
    label: "Certified copy — application receipt date (ISO yyyy-mm-dd)",
    description: "Date on the receipt for applying for the certified copy (used when hasApplied is \"yes\").",
    isList: false,
    kind: "date",
  },
  {
    path: "standardIas.exemptionCertifiedCopy.reasonForNotApplying",
    tab: "Applications",
    label: "Certified copy — reason for not applying",
    description: "Reason the certified copy was not applied for (used when hasApplied is \"no\").",
    isList: false,
    kind: "longtext",
  },
  {
    path: "standardIas.exemptionOfficialTranslation.active",
    tab: "Applications",
    label: "IA: Exemption from filing official translation — active",
    description: "Set true to include an application for exemption from filing the official translation of vernacular documents.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "standardIas.exemptionOfficialTranslation.userReason",
    tab: "Applications",
    label: "Official translation exemption — reason (optional)",
    description: "Optional user-entered reason for not obtaining the official translation; inserted into the application's second paragraph. (The list of translated annexures is filled automatically.)",
    isList: false,
    kind: "longtext",
  },
  {
    path: "standardIas.exemptionFromSurrendering.active",
    tab: "Applications",
    label: "IA: Exemption from surrendering — active",
    description: "Set true to include an application for exemption from surrendering (in criminal matters involving conviction).",
    isList: false,
    kind: "boolean",
  },
  {
    path: "standardIas.exemptionFromSurrendering.grounds",
    tab: "Applications",
    label: "Exemption from surrendering — grounds",
    description: "Grounds for seeking exemption from surrendering. One per row.",
    isList: true,
    itemFields: PARTICULARS_FIELDS,
  },
  {
    path: "customIas",
    tab: "Applications",
    label: "Custom applications (IAs)",
    description: "Bespoke interlocutory applications beyond the standard ones. Each has a title, its own grounds, and its own prayers.",
    isList: true,
    itemFields: [
      { key: "title", label: "Application title (e.g. \"Application for ...\")", kind: "text" },
      { key: "grounds", label: "Grounds", kind: "longtext", itemFields: PARTICULARS_FIELDS },
      { key: "prayers", label: "Prayers", kind: "longtext", itemFields: PARTICULARS_FIELDS },
    ],
  },
  {
    path: "ias",
    tab: "Applications",
    label: "Other applications (name + prayer)",
    description: "Simple additional applications listed by name and prayer.",
    isList: true,
    itemFields: [
      { key: "name", label: "Application name", kind: "text" },
      { key: "prayer", label: "Prayer", kind: "longtext" },
    ],
  },

  // ── Listing Proforma tab ──
  { path: "listingProforma.general.petitionerPhone", tab: "Listing Proforma", label: "Petitioner phone", description: "", isList: false, kind: "text" },
  { path: "listingProforma.general.petitionerEmail", tab: "Listing Proforma", label: "Petitioner email", description: "", isList: false, kind: "text" },
  { path: "listingProforma.general.respondentPhone", tab: "Listing Proforma", label: "Respondent phone", description: "", isList: false, kind: "text" },
  { path: "listingProforma.general.respondentEmail", tab: "Listing Proforma", label: "Respondent email", description: "", isList: false, kind: "text" },
  { path: "listingProforma.general.mainCategory", tab: "Listing Proforma", label: "Main category", description: "Subject-matter category.", isList: false, kind: "text" },
  { path: "listingProforma.general.subCategory", tab: "Listing Proforma", label: "Sub-category", description: "", isList: false, kind: "text" },
  {
    path: "listingProforma.general.specialCategory",
    tab: "Listing Proforma",
    label: "Special category",
    description: "Special listing category, if any.",
    isList: false,
    kind: "enum",
    enumValues: ["N.A.", "Death Penalty", "Habeas Corpus", "Demolition of Property", "Eviction", "Bail or Anticipatory Bail"],
  },
  { path: "listingProforma.general.notToListBefore", tab: "Listing Proforma", label: "Not to be listed before", description: "Any Bench/Judge before whom the matter should not be listed (else N.A.).", isList: false, kind: "text" },
  { path: "listingProforma.general.judgesPassedImpugned", tab: "Listing Proforma", label: "Judge(s) who passed the impugned order", description: "", isList: false, kind: "text" },
  { path: "listingProforma.general.similarDisposed", tab: "Listing Proforma", label: "Similar matters disposed of", description: "Particulars of similar/identical matters already disposed of (else N.A.).", isList: false, kind: "text" },
  { path: "listingProforma.general.similarPending", tab: "Listing Proforma", label: "Similar matters pending", description: "Particulars of similar/identical matters pending (else N.A.).", isList: false, kind: "text" },
  { path: "listingProforma.general.litigationOnSamePoint", tab: "Listing Proforma", label: "Litigation on the same point", description: "Any other litigation on the same point of law (else N.A.).", isList: false, kind: "text" },
  {
    path: "listingProforma.legalProvisions",
    tab: "Listing Proforma",
    label: "Legal provisions involved",
    description: "The Acts/Rules and sections involved in the matter. One per row.",
    isList: true,
    itemFields: [
      { key: "type", label: "Type", kind: "enum", enumValues: ["Central Act", "Central Rule", "State Act", "State Rule"] },
      { key: "act", label: "Act / Rule name", kind: "text" },
      { key: "section", label: "Section / Rule number", kind: "text" },
    ],
  },
  {
    path: "listingProforma.specialCategories.surrenderStatus",
    tab: "Listing Proforma",
    label: "Surrender status",
    description: "In criminal matters, whether the petitioner has surrendered.",
    isList: false,
    kind: "enum",
    enumValues: ["N.A.", "Has Surrendered", "Has Not Surrendered"],
  },
  { path: "listingProforma.specialCategories.firNoAndDate", tab: "Listing Proforma", label: "FIR number and date", description: "Else N.A.", isList: false, kind: "text" },
  { path: "listingProforma.specialCategories.policeStation", tab: "Listing Proforma", label: "Police station", description: "Else N.A.", isList: false, kind: "text" },
  { path: "listingProforma.specialCategories.sentenceAwarded", tab: "Listing Proforma", label: "Sentence awarded", description: "Else N.A.", isList: false, kind: "text" },
  { path: "listingProforma.specialCategories.sentenceUndergone", tab: "Listing Proforma", label: "Sentence undergone", description: "Else N.A.", isList: false, kind: "text" },
  { path: "listingProforma.specialCategories.taxEffect", tab: "Listing Proforma", label: "Tax effect", description: "Else N.A.", isList: false, kind: "text" },
  { path: "listingProforma.specialCategories.vehicleNo", tab: "Listing Proforma", label: "Vehicle number", description: "Else N.A.", isList: false, kind: "text" },
  { path: "listingProforma.specialCategories.landAcqS4", tab: "Listing Proforma", label: "Land acquisition — Section 4 notification date", description: "Else N.A.", isList: false, kind: "text" },
  { path: "listingProforma.specialCategories.landAcqS6", tab: "Listing Proforma", label: "Land acquisition — Section 6 declaration date", description: "Else N.A.", isList: false, kind: "text" },
  { path: "listingProforma.specialCategories.landAcqS17", tab: "Listing Proforma", label: "Land acquisition — Section 17 (urgency) date", description: "Else N.A.", isList: false, kind: "text" },
  { path: "listingProforma.specialCategories.petitionerCategories.senior", tab: "Listing Proforma", label: "Petitioner is a senior citizen", description: "", isList: false, kind: "boolean" },
  { path: "listingProforma.specialCategories.petitionerCategories.scst", tab: "Listing Proforma", label: "Petitioner is SC/ST", description: "", isList: false, kind: "boolean" },
  { path: "listingProforma.specialCategories.petitionerCategories.woman", tab: "Listing Proforma", label: "Petitioner is a woman", description: "", isList: false, kind: "boolean" },
  { path: "listingProforma.specialCategories.petitionerCategories.disabled", tab: "Listing Proforma", label: "Petitioner is disabled", description: "", isList: false, kind: "boolean" },
  { path: "listingProforma.specialCategories.petitionerCategories.legalaid", tab: "Listing Proforma", label: "Petitioner is on legal aid", description: "", isList: false, kind: "boolean" },
  { path: "listingProforma.specialCategories.petitionerCategories.custody", tab: "Listing Proforma", label: "Petitioner is in custody", description: "", isList: false, kind: "boolean" },
  {
    path: "listingProforma.specialCategories.earlierCaseSameParties",
    tab: "Listing Proforma",
    label: "Earlier case between the same parties",
    description: "Whether there is an earlier case between the same parties.",
    isList: false,
    kind: "enum",
    enumValues: ["Yes", "No"],
  },
  { path: "listingProforma.specialCategories.firAndCaseParticulars", tab: "Listing Proforma", label: "FIR and case particulars", description: "Else N.A.", isList: false, kind: "longtext" },
  { path: "listingProforma.specialCategories.bailApplicationHistory", tab: "Listing Proforma", label: "Bail application history", description: "Else N.A.", isList: false, kind: "longtext" },
];

// ── Checklist tab ─────────────────────────────────────────────────────────────
// Generated from the canonical 15-point checklist so the labels stay in sync with
// the UI. Display-only lead-in rows (e.g. the PIL preamble) carry no answer field
// and are excluded.
const CHECKLIST_ENTRIES: CatalogEntry[] = checklistQueries.filter((q) => !q.header).map((q) => ({
  path: `checklist.${q.name}`,
  tab: "Checklist",
  label: q.label,
  description: "Advocate's checklist answer (Supreme Court Rules compliance).",
  isList: false,
  kind: "enum" as const,
  enumValues: q.options,
}));

export const FIELD_CATALOG: CatalogEntry[] = [...BASE_CATALOG, ...CHECKLIST_ENTRIES];

// ── Writ Petition (Delhi HC) catalog ─────────────────────────────────────────
// A separate, WP-shaped field map rendered into the system prompt when the
// project is a writ petition. Shares the project's common fields (parties,
// deponent, synopsis, listOfDates, grounds) but describes them in WP terms, and
// adds the wp.* fields. Exclusions mirror the SLP policy: wp.advocate.* is a
// Settings-driven "Filed by" block (like the AoR fields) and file attachments
// stay out of reach.

export type DraftMode = "SLP" | "WritPetitionDHC" | "OriginalApplicationCAT";

const WP_PARTY_FIELDS: LeafField[] = [
  { key: "name", label: "Name", kind: "text" },
  {
    key: "through",
    label: "\"Through\" service designation (optional)",
    kind: "text",
    description:
      "Shown under the name in the Memo of Parties for parties served through an officer/counsel — e.g. \"Through the Secretary, Ministry of Finance\", \"Through its Standing Counsel\". Leave empty for natural persons.",
  },
  { key: "address", label: "Address", kind: "longtext" },
];

const WP_RELIEF_DESCRIPTION =
  "The reliefs prayed for — the single source of truth: the FULL list (residuary included) prints as the lettered reliefs block at the top of the petition, inline in Para 1, AND as the final PRAYERS paragraph. One relief per row, plain prose, NO numbering/lettering (Drafto letters them), but YOU supply each relief's punctuation — \"; and\" after intermediate reliefs, a full stop after the last. The LAST row must be the residuary prayer (\"Pass any such other order(s) as this Hon'ble Court may deem fit…\"). In an Impugned-Order writ, the FIRST relief should seek to quash and set aside the impugned order (cite its annexure, e.g. \"[Annexure P-1]\").";

export const WP_FIELD_CATALOG: CatalogEntry[] = [
  // ── Preliminary tab ──
  {
    path: "caseType",
    tab: "Preliminary",
    label: "Petition type",
    description: "Whether this is a Writ Petition (Civil) or Writ Petition (Criminal).",
    isList: false,
    kind: "enum",
    enumValues: ["Civil", "Criminal"],
  },
  {
    path: "petitioners",
    tab: "Preliminary",
    label: "Petitioners",
    description: "The party/parties filing the writ petition, in order.",
    isList: true,
    itemFields: WP_PARTY_FIELDS,
  },
  {
    path: "respondents",
    tab: "Preliminary",
    label: "Respondents",
    description: "The authorities/parties against whom the writ is sought, in order (government respondents usually carry a \"through\" designation).",
    isList: true,
    itemFields: WP_PARTY_FIELDS,
  },
  {
    path: "wp.articleBasis",
    tab: "Preliminary",
    label: "Constitutional basis",
    description: "The Article(s) of the Constitution under which the writ petition is filed. Use 227 (alone) only for pure supervisory challenges to court/tribunal orders; 226 read with 227 is the safe default when an order is challenged.",
    isList: false,
    kind: "enum",
    enumValues: ["226", "227", "226 read with 227"],
  },
  {
    path: "wp.isIoWrit",
    tab: "Preliminary",
    label: "Impugned-order writ",
    description:
      "Set true when the writ challenges a specific impugned order. The impugned order's annexure (marked isImpugnedOrder on its List-of-Dates row) becomes Annexure P-1 and a Stay CM becomes available.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "wp.listingDate",
    tab: "Preliminary",
    label: "Listing date (ISO yyyy-mm-dd)",
    description: "The date the Notice of Motion says the matter is \"likely to be listed on\". Only fill when the user provides it.",
    isList: false,
    kind: "date",
  },
  { path: "advocate.filingPlace", tab: "Preliminary", label: "Filing place", description: "Usually New Delhi.", isList: false, kind: "text" },
  { path: "advocate.filingDate", tab: "Preliminary", label: "Filing date (ISO yyyy-mm-dd)", description: "Date the petition is filed.", isList: false, kind: "date" },
  {
    path: "wp.drawnOnDate",
    tab: "Preliminary",
    label: "Drawn on date (ISO yyyy-mm-dd)",
    description: "Optional. When set, \"Drawn on\" appears above \"Filed on\" in the petition body's Filed-by block only. Fill only when the user provides it.",
    isList: false,
    kind: "date",
  },
  { path: "deponent.name", tab: "Preliminary", label: "Deponent name", description: "Person swearing the affidavit. Defaults to the first Petitioner if left blank.", isList: false, kind: "text" },
  { path: "deponent.fatherName", tab: "Preliminary", label: "Deponent's father/spouse name", description: "", isList: false, kind: "text" },
  { path: "deponent.address", tab: "Preliminary", label: "Deponent address", description: "", isList: false, kind: "longtext" },
  { path: "deponent.age", tab: "Preliminary", label: "Deponent age", description: "", isList: false, kind: "text" },
  {
    path: "deponent.relationship",
    tab: "Preliminary",
    label: "Deponent relationship",
    description: "Relationship phrasing used in the affidavit.",
    isList: false,
    kind: "enum",
    enumValues: ["son of", "daughter of", "wife of", "husband of"],
  },
  {
    path: "deponent.role",
    tab: "Preliminary",
    label: "Deponent capacity",
    description: "The capacity in which the affidavit is sworn — pick a representative capacity (e.g. Authorised Representative) for company/organisation petitioners.",
    isList: false,
    kind: "enum",
    enumValues: DEPONENT_ROLES,
  },

  // ── Petition tab ──
  {
    path: "synopsis",
    tab: "Petition",
    label: "Synopsis",
    description: "The narrative synopsis of the case.",
    isList: false,
    kind: "longtext",
  },
  {
    path: "listOfDates",
    tab: "Petition",
    label: "List of Dates & Events",
    description:
      "Chronological table of events. Each row is one event. IMPORTANT (WP): the printed List of Dates carries date + particulars ONLY — annexure sentences appear in the FACTS section instead. Attach each annexure's details to its row's annexure entry; never describe an annexure in the Particulars text.",
    isList: true,
    itemFields: [
      { key: "date", label: "Date (free text, e.g. 12.03.2021)", kind: "text" },
      { key: "event", label: "Particulars of the event", kind: "longtext" },
      {
        key: "annexures",
        label: "Annexure(s) for this event",
        kind: "longtext",
        description:
          "Annexure(s) tied to this event. Put each annexure's DESCRIPTION here, NOT in the event/particulars text. This describes the annexure only — it does not attach a file (use the documents map for splitting/attaching).",
        itemFields: [
          { key: "title", label: "Annexure description/title", kind: "longtext" },
          { key: "date", label: "Annexure date (free text, e.g. 12.03.2021)", kind: "text" },
          { key: "copyType", label: "Copy type", kind: "enum", enumValues: ["true copy", "typed copy", "true and typed copy", "translated copy", "true and translated copy"] },
          { key: "isImpugnedOrder", label: "This annexure IS the impugned order (sorts to Annexure P-1; impugned-order writs only)", kind: "boolean" },
        ],
      },
    ],
  },
  {
    path: "wp.reliefs",
    tab: "Petition",
    label: "Reliefs",
    description: WP_RELIEF_DESCRIPTION,
    isList: true,
    itemFields: [{ key: "particulars", label: "Relief", kind: "longtext" }],
  },
  {
    path: "wp.facts",
    tab: "Petition",
    label: "Facts",
    description:
      "The FACTS section of the petition body — an HTML ordered list (<ol><li>…</li></ol>), ONE <li> per List-of-Dates row, each a flowing prose paragraph (\"On 12.03.2021, the Petitioner …\"). Annexure sentences live HERE (\"Annexure P-2 is a true copy of … dated ….\") — keep each annexure sentence with the paragraph for its event, in the annexure's P-number order. EXCEPTION: the impugned order's own sentence prints in Para 1 automatically — do NOT write it in Facts (the other annexures still cite their real P-numbers, P-2 onwards).",
    isList: false,
    kind: "longtext",
  },
  {
    path: "grounds",
    tab: "Petition",
    label: "Grounds",
    description: "Grounds of the writ petition. One per row, no numbering (Drafto letters them automatically).",
    isList: true,
    itemFields: [{ key: "particulars", label: "Ground", kind: "longtext" }],
  },
  {
    path: "wp.splitSynopsisAndLod",
    tab: "Petition",
    label: "Start List of Dates on a fresh page",
    description: "Layout preference; only set if the user asks.",
    isList: false,
    kind: "boolean",
  },

  // ── Applications (CMs) tab ──
  {
    path: "wp.cms.stay.active",
    tab: "Applications",
    label: "CM: Stay of the impugned order — active",
    description: "Set true to include a CM seeking stay of the impugned order (impugned-order writs only).",
    isList: false,
    kind: "boolean",
  },
  {
    path: "wp.cms.stay.title",
    tab: "Applications",
    label: "Stay CM — title override",
    description: "Optional override of the standard application title. Leave empty for the default.",
    isList: false,
    kind: "text",
  },
  {
    path: "wp.cms.stay.body",
    tab: "Applications",
    label: "Stay CM — body paragraphs",
    description: "The application's middle paragraphs (the opening writ-petition reference, good-faith closing and prayer lead-in are added automatically). One per row.",
    isList: true,
    itemFields: PARTICULARS_FIELDS,
  },
  {
    path: "wp.cms.stay.prayers",
    tab: "Applications",
    label: "Stay CM — prayers",
    description: "The application's prayers, one per row, no lettering. Keep the residuary prayer last.",
    isList: true,
    itemFields: PARTICULARS_FIELDS,
  },
  {
    path: "wp.cms.lengthySynopsis.active",
    tab: "Applications",
    label: "CM: Lengthy synopsis — active",
    description: "Set true to include a CM seeking permission to file a lengthy Synopsis and List of Dates.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "wp.cms.lengthySynopsis.title",
    tab: "Applications",
    label: "Lengthy-synopsis CM — title override",
    description: "Optional override of the standard application title. Leave empty for the default.",
    isList: false,
    kind: "text",
  },
  {
    path: "wp.cms.lengthySynopsis.body",
    tab: "Applications",
    label: "Lengthy-synopsis CM — body paragraphs",
    description: "The application's middle paragraphs. One per row.",
    isList: true,
    itemFields: PARTICULARS_FIELDS,
  },
  {
    path: "wp.cms.lengthySynopsis.prayers",
    tab: "Applications",
    label: "Lengthy-synopsis CM — prayers",
    description: "The application's prayers, one per row. Keep the residuary prayer last.",
    isList: true,
    itemFields: PARTICULARS_FIELDS,
  },
  {
    path: "wp.cms.exemptionCopies.active",
    tab: "Applications",
    label: "CM: Exemption from filing certified/legible copies — active",
    description: "Set true to include a CM for exemption from filing certified / legible / true-typed copies of the annexures.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "wp.cms.exemptionCopies.title",
    tab: "Applications",
    label: "Exemption CM — title override",
    description: "Optional override of the standard application title. Leave empty for the default.",
    isList: false,
    kind: "text",
  },
  {
    path: "wp.cms.exemptionCopies.body",
    tab: "Applications",
    label: "Exemption CM — body paragraphs",
    description: "The application's middle paragraphs. One per row.",
    isList: true,
    itemFields: PARTICULARS_FIELDS,
  },
  {
    path: "wp.cms.exemptionCopies.prayers",
    tab: "Applications",
    label: "Exemption CM — prayers",
    description: "The application's prayers, one per row. Keep the residuary prayer last.",
    isList: true,
    itemFields: PARTICULARS_FIELDS,
  },
  {
    path: "wp.customCms",
    tab: "Applications",
    label: "Custom applications (CMs)",
    description: "Bespoke CM applications beyond the three standard ones. Each has a title, a \"praying that…\" paragraph, its own grounds, and its own prayers.",
    isList: true,
    itemFields: [
      { key: "title", label: "Application title (e.g. \"Application under Section 151 CPC for ...\")", kind: "text" },
      { key: "para2", label: "\"This application is being filed praying that…\" paragraph", kind: "longtext" },
      { key: "grounds", label: "Grounds", kind: "longtext", itemFields: PARTICULARS_FIELDS },
      { key: "prayers", label: "Prayers", kind: "longtext", itemFields: PARTICULARS_FIELDS },
    ],
  },
];

// ── Original Application (CAT) catalog ───────────────────────────────────────
// The Tribunal's own field map. Shares the project's common fields (parties,
// deponent, synopsis, listOfDates, grounds) but names them in CAT terms —
// Applicants rather than Petitioners — and adds the oa.* fields. Exclusions
// mirror the SLP and WP policy: oa.advocate.* is the Settings-driven "Filed by"
// block, oa.numbering.* is presentation, and file attachments stay out of reach.

const OA_PARTY_FIELDS: LeafField[] = [
  { key: "name", label: "Name", kind: "text" },
  {
    key: "through",
    label: "\"Through\" service designation (optional)",
    kind: "text",
    description:
      "Shown under the name in the Memo of Parties for parties served through an officer — e.g. \"Through the Secretary, Ministry of Defence\". Leave empty for natural persons.",
  },
  { key: "address", label: "Address", kind: "longtext" },
];

export const OA_FIELD_CATALOG: CatalogEntry[] = [
  // ── Preliminary ──
  {
    path: "petitioners",
    tab: "Preliminary",
    label: "Applicants",
    description: "The party/parties filing the Original Application, in order. (Stored as \"petitioners\" internally; they are the Applicants.)",
    isList: true,
    itemFields: OA_PARTY_FIELDS,
  },
  {
    path: "respondents",
    tab: "Preliminary",
    label: "Respondents",
    description: "The Union/State authorities against whom relief is sought, in order. Government respondents usually carry a \"through\" designation.",
    isList: true,
    itemFields: OA_PARTY_FIELDS,
  },
  {
    path: "oa.legalAid",
    tab: "Preliminary",
    label: "Legal aid case",
    description: "True when the OA is filed through the Delhi State Legal Services Authority; prints a banner on the first page.",
    isList: false,
    kind: "boolean",
  },
  { path: "advocate.filingPlace", tab: "Preliminary", label: "Filing place", description: "Usually New Delhi.", isList: false, kind: "text" },
  { path: "advocate.filingDate", tab: "Preliminary", label: "Filing date (ISO yyyy-mm-dd)", description: "Date the OA is filed.", isList: false, kind: "date" },
  { path: "deponent.name", tab: "Preliminary", label: "Deponent name", description: "Person swearing the affidavit. Defaults to the first Applicant if blank.", isList: false, kind: "text" },
  { path: "deponent.fatherName", tab: "Preliminary", label: "Deponent's father/spouse name", description: "", isList: false, kind: "text" },
  { path: "deponent.address", tab: "Preliminary", label: "Deponent address", description: "", isList: false, kind: "longtext" },
  { path: "deponent.age", tab: "Preliminary", label: "Deponent age", description: "", isList: false, kind: "text" },

  // ── Application ──
  {
    path: "oa.jurisdictionCause",
    tab: "Application",
    label: "Jurisdiction — cause of action arose here",
    description: "Para 2. Asserts that the cause of action arose within the Bench's territorial jurisdiction. The usual basis; ticked by default.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "oa.jurisdictionCauseNote",
    tab: "Application",
    label: "Jurisdiction — cause of action rider",
    description: "Optional sentence appended to the cause-of-action declaration, e.g. where precisely the cause arose.",
    isList: false,
    kind: "longtext",
  },
  {
    path: "oa.jurisdictionPosted",
    tab: "Application",
    label: "Jurisdiction — Applicant posted here",
    description: "Para 2. Asserts that the Applicant is posted, for the time being, within the Bench's jurisdiction.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "oa.jurisdictionPostedNote",
    tab: "Application",
    label: "Jurisdiction — posting rider",
    description: "Optional sentence appended to the posting declaration, e.g. the station of posting.",
    isList: false,
    kind: "longtext",
  },
  {
    path: "oa.limitation",
    tab: "Application",
    label: "Limitation position",
    description:
      "Para 3. \"noDelay\" = filed within time. \"delay\" = beyond time, with the number of days and a condonation application. \"abundantCaution\" = no delay admitted, but condonation sought without prejudice.",
    isList: false,
    kind: "enum",
    enumValues: ["noDelay", "delay", "abundantCaution"],
  },
  {
    path: "oa.delayDays",
    tab: "Application",
    label: "Days of delay",
    description: "Number of days of delay, as text. Only meaningful when the limitation position is \"delay\".",
    isList: false,
    kind: "text",
  },
  {
    path: "oa.limitationNote",
    tab: "Application",
    label: "Limitation explanation",
    description: "The explanation for the delay, or any rider on the limitation position.",
    isList: false,
    kind: "longtext",
  },
  {
    path: "synopsis",
    tab: "Application",
    label: "Synopsis",
    description: "The narrative synopsis of the case.",
    isList: false,
    kind: "longtext",
  },
  {
    path: "listOfDates",
    tab: "Application",
    label: "List of Dates & Events",
    description: "Chronological table of events, with annexures attached to the relevant rows. The Facts (Para 4) are generated from these rows, so this is the spine of the OA.",
    isList: true,
    itemFields: [
      { key: "date", label: "Date (free text, e.g. 12.03.2021)", kind: "text" },
      { key: "event", label: "Particulars of the event", kind: "longtext" },
      {
        key: "annexures",
        label: "Annexure(s) for this event",
        kind: "longtext",
        description:
          "Annexure(s) tied to this event. Put each annexure's DESCRIPTION here, NOT in the event text. Describes the annexure only — it does not attach a file.",
        itemFields: [
          { key: "title", label: "Annexure description/title", kind: "longtext" },
          { key: "date", label: "Annexure date (free text)", kind: "text" },
          { key: "copyType", label: "Copy type", kind: "enum", enumValues: ["true copy", "typed copy", "true and typed copy", "translated copy", "true and translated copy"] },
          { key: "customText", label: "Extra custom text (optional)", kind: "longtext" },
        ],
      },
    ],
  },
  {
    path: "oa.facts",
    tab: "Application",
    label: "Facts (Para 4)",
    description:
      "The facts narration, as an HTML ordered list (<ol><li>…</li></ol>) — one <li> per numbered sub-paragraph. Normally transposed from the List of Dates; draft it directly only when asked.",
    isList: false,
    kind: "longtext",
  },
  {
    path: "grounds",
    tab: "Application",
    label: "Grounds (Para 5)",
    description: "Grounds on which the relief is sought. One per row, no numbering — Drafto numbers them.",
    isList: true,
    itemFields: [{ key: "particulars", label: "Ground", kind: "longtext" }],
  },
  {
    path: "oa.reliefs",
    tab: "Application",
    label: "Reliefs (Paras 1 and 8)",
    description:
      "The reliefs sought — the single source of truth, printed both in Para 1 and as the Para 8 prayer. One relief per row, plain prose, NO numbering (Drafto letters them). Supply each relief's own punctuation. The fixed residuary prayer is added automatically, so do NOT include it.",
    isList: true,
    itemFields: [{ key: "particulars", label: "Relief", kind: "longtext" }],
  },
  {
    path: "oa.interimNil",
    tab: "Application",
    label: "No interim relief sought",
    description: "Para 9. True (the default) prints NIL. Set false when interim relief is sought, and fill the interim reliefs.",
    isList: false,
    kind: "boolean",
  },
  {
    path: "oa.interimReliefs",
    tab: "Application",
    label: "Interim reliefs (Para 9)",
    description: "Interim reliefs sought, one per row, no numbering. Only meaningful when \"No interim relief sought\" is false.",
    isList: true,
    itemFields: [{ key: "particulars", label: "Interim relief", kind: "longtext" }],
  },
  {
    path: "oa.postalOrders",
    tab: "Application",
    label: "Postal orders for the application fee (Para 11)",
    description: "Free text describing the postal orders enclosed towards the application fee.",
    isList: false,
    kind: "text",
  },

  // ── Applications (MAs / Petition for Transfer) ──
  {
    path: "oa.mas",
    tab: "Applications",
    label: "Miscellaneous Applications",
    description:
      "Applications filed with the OA (condonation of delay, exemption, interim relief, Petition for Transfer, and bespoke ones). Each has a title, a praying paragraph, grounds and prayers.",
    isList: true,
    itemFields: [
      { key: "title", label: "Application title", kind: "text" },
      { key: "para2", label: "\"This application is being filed praying that…\" paragraph", kind: "longtext" },
      { key: "grounds", label: "Grounds", kind: "longtext", itemFields: [{ key: "particulars", label: "Ground", kind: "longtext" }] },
      { key: "prayers", label: "Prayers", kind: "longtext", itemFields: [{ key: "particulars", label: "Prayer", kind: "longtext" }] },
    ],
  },
];

export function catalogFor(mode: DraftMode): CatalogEntry[] {
  if (mode === "WritPetitionDHC") return WP_FIELD_CATALOG;
  if (mode === "OriginalApplicationCAT") return OA_FIELD_CATALOG;
  return FIELD_CATALOG;
}

// ── Validation map ────────────────────────────────────────────────────────────
// Validation accepts the SUPERSET of both catalogs: shared paths (petitioners,
// listOfDates, …) get their leaf fields merged so an op valid in either mode
// passes. The mode-specific restriction happens at prompt time — the model only
// SEES its own catalog; validation just guards types and the path allow-list.

function mergeLeafFields(a?: LeafField[], b?: LeafField[]): LeafField[] | undefined {
  if (!a) return b;
  if (!b) return a;
  const out = a.map((f) => ({ ...f }));
  for (const f of b) {
    const i = out.findIndex((x) => x.key === f.key);
    if (i < 0) { out.push({ ...f }); continue; }
    const merged = { ...out[i] };
    if (out[i].enumValues || f.enumValues) {
      merged.enumValues = Array.from(new Set([...(out[i].enumValues ?? []), ...(f.enumValues ?? [])]));
    }
    merged.itemFields = mergeLeafFields(out[i].itemFields, f.itemFields);
    out[i] = merged;
  }
  return out;
}

function buildValidationMap(): Map<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>(FIELD_CATALOG.map((e) => [e.path, e]));
  for (const e of [...WP_FIELD_CATALOG, ...OA_FIELD_CATALOG]) {
    const existing = map.get(e.path);
    if (!existing) { map.set(e.path, e); continue; }
    map.set(e.path, {
      ...existing,
      enumValues: existing.enumValues || e.enumValues
        ? Array.from(new Set([...(existing.enumValues ?? []), ...(e.enumValues ?? [])]))
        : undefined,
      itemFields: mergeLeafFields(existing.itemFields, e.itemFields),
    });
  }
  return map;
}

const CATALOG_BY_PATH = buildValidationMap();

export function getFieldDescriptor(path: string): CatalogEntry | undefined {
  return CATALOG_BY_PATH.get(path);
}

// Group catalog entries by tab, preserving first-seen order — used to render the
// field map in the system prompt.
export function catalogByTab(mode: DraftMode = "SLP"): { tab: string; entries: CatalogEntry[] }[] {
  const order: string[] = [];
  const map = new Map<string, CatalogEntry[]>();
  for (const e of catalogFor(mode)) {
    if (!map.has(e.tab)) {
      map.set(e.tab, []);
      order.push(e.tab);
    }
    map.get(e.tab)!.push(e);
  }
  return order.map((tab) => ({ tab, entries: map.get(tab)! }));
}

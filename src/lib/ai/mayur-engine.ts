// ── Mayur Unified Engine: Verbatim Import [i] & Raw-Material Construction [ii] ─
// Powers every contextual <MayurButton /> next to section headings as well as
// the Master Mayur button in the workspace bar.

import type { UseFormReturn, FieldValues } from "react-hook-form";
import { buildSystemPrompt } from "./drafto-knowledge";
import { draftModeFor } from "./field-catalog";
import {
  extractProposal,
  extractPartialProposal,
  validateProposal,
  type SafeOp,
  type RawProposal,
} from "./form-patch";
import { applyOps } from "./apply-ops";
import { PRESETS, WP_PRESETS } from "./presets";
import { sectionById, sectionsFor } from "./sections";
import { renderContext } from "./job";
import { getSettings } from "@/components/dialogs/settings-dialog";
import {
  customIaSchema,
  iaGroundItemSchema,
  aamTableItemSchema,
  oaMaSchema,
} from "@/lib/schema";
import { cleanOpValues } from "./clean-html";

export type LlmProvider = "gemini" | "anthropic" | "openai";

export type MayurSectionId =
  | "master"
  | "lod"
  | "grounds"
  | "synopsis"
  | "qol"
  | "interim"
  | "facts"
  | "reliefs"
  | "parties"
  | "impugned"
  | "deponent"
  | "proforma"
  | "checklist"
  | "oa-jurisdiction"
  | "ia:delay"
  | "ia:delayRefiling"
  | "ia:cc"
  | "ia:surrender"
  | "ia:susp"
  | "ia:ot"
  | "ia:ad"
  | `ia:custom:${number}`
  | "cm:stay"
  | "cm:lengthySynopsis"
  | "cm:exemptionCopies"
  | `cm:custom:${number}`
  | `ma:${number}`;

export interface MayurSectionMeta {
  id: MayurSectionId;
  title: string;
  targetPaths: string[];
  supportsDeriveFromFields?: boolean;
  deriveHint?: string;
}

export function getMayurSectionMeta(
  sectionId: MayurSectionId,
  courtType?: string
): MayurSectionMeta {
  const mode = draftModeFor(courtType);

  if (sectionId.startsWith("ia:custom:")) {
    const idx = parseInt(sectionId.split(":")[2] || "0", 10);
    return {
      id: sectionId,
      title: `Custom IA #${idx + 1}`,
      targetPaths: ["customIas"],
    };
  }
  if (sectionId.startsWith("cm:custom:")) {
    const idx = parseInt(sectionId.split(":")[2] || "0", 10);
    return {
      id: sectionId,
      title: `Custom CM #${idx + 1}`,
      targetPaths: ["wp.customCms"],
    };
  }
  if (sectionId.startsWith("ma:")) {
    const idx = parseInt(sectionId.split(":")[1] || "0", 10);
    return {
      id: sectionId,
      title: `Miscellaneous Application #${idx + 1}`,
      targetPaths: ["oa.mas"],
    };
  }

  switch (sectionId) {
    case "master":
      return {
        id: "master",
        title: "All Sections (Master Mayur)",
        targetPaths: [],
      };
    case "lod":
      return {
        id: "lod",
        title: "List of Dates & Events",
        targetPaths: ["listOfDates"],
      };
    case "grounds":
      return {
        id: "grounds",
        title: "Grounds",
        targetPaths: ["grounds"],
      };
    case "synopsis":
      return {
        id: "synopsis",
        title: "Synopsis",
        targetPaths: ["synopsis"],
        supportsDeriveFromFields: true,
        deriveHint: "Construct Synopsis from already-filled List of Dates & Grounds",
      };
    case "qol":
      return {
        id: "qol",
        title: "Questions of Law",
        targetPaths: ["questionsOfLaw"],
        supportsDeriveFromFields: true,
        deriveHint: "Frame Questions of Law from already-filled Grounds & List of Dates",
      };
    case "interim":
      return {
        id: "interim",
        title: "Interim Relief",
        targetPaths:
          mode === "OriginalApplicationCAT"
            ? ["oa.interimNil", "oa.interimReliefs"]
            : ["wantsInterimRelief", "interimReliefGrounds", "interimReliefPrayers"],
        supportsDeriveFromFields: true,
        deriveHint: "Draft Interim Relief from already-filled Impugned Order & Petition",
      };
    case "facts":
      return {
        id: "facts",
        title: "Facts",
        targetPaths:
          mode === "OriginalApplicationCAT"
            ? ["oa.factsRows", "oa.facts"]
            : ["wp.factsRows", "wp.facts", "pil.injuryToPublic"],
      };
    case "reliefs":
      return {
        id: "reliefs",
        title: mode === "OriginalApplicationCAT" ? "Main Prayers / Reliefs" : "Reliefs / Prayers",
        targetPaths: mode === "OriginalApplicationCAT" ? ["oa.reliefs"] : ["wp.reliefs"],
        supportsDeriveFromFields: true,
        deriveHint: "Draft Reliefs / Prayers from already-filled List of Dates & Grounds",
      };
    case "parties":
      return {
        id: "parties",
        title: "Memo of Parties",
        targetPaths: ["caseType", "petitioners", "respondents", "isCommonOrder", "commonOrderParties"],
      };
    case "impugned":
      return {
        id: "impugned",
        title: "Impugned Order(s)",
        targetPaths: [
          "caseType",
          "impugnedOrders",
          "intraCourtAppealStatus",
          "intraCourtAppealReason",
          "para1BContent",
        ],
      };
    case "deponent":
      return {
        id: "deponent",
        title: "Deponent Details",
        targetPaths: [
          "deponent",
          "deponent.name",
          "deponent.relationship",
          "deponent.fatherName",
          "deponent.age",
          "deponent.address",
          "deponent.location",
          "deponent.role",
        ],
      };
    case "proforma":
      return {
        id: "proforma",
        title: "Listing Proforma",
        targetPaths: [
          "listingProforma",
          "listingProforma.general.petitionerPhone",
          "listingProforma.general.petitionerEmail",
          "listingProforma.general.respondentPhone",
          "listingProforma.general.respondentEmail",
          "listingProforma.general.mainCategory",
          "listingProforma.general.subCategory",
          "listingProforma.general.specialCategory",
          "listingProforma.general.notToListBefore",
          "listingProforma.general.judgesPassedImpugned",
          "listingProforma.general.similarDisposed",
          "listingProforma.general.similarPending",
          "listingProforma.general.litigationOnSamePoint",
          "listingProforma.legalProvisions",
          "listingProforma.specialCategories.surrenderStatus",
          "listingProforma.specialCategories.firNoAndDate",
          "listingProforma.specialCategories.policeStation",
          "listingProforma.specialCategories.sentenceAwarded",
          "listingProforma.specialCategories.sentenceUndergone",
          "listingProforma.specialCategories.taxEffect",
          "listingProforma.specialCategories.vehicleNo",
          "listingProforma.specialCategories.landAcqS4",
          "listingProforma.specialCategories.landAcqS6",
          "listingProforma.specialCategories.landAcqS17",
          "listingProforma.specialCategories.earlierCaseSameParties",
          "listingProforma.specialCategories.firAndCaseParticulars",
          "listingProforma.specialCategories.bailApplicationHistory",
        ],
        supportsDeriveFromFields: true,
        deriveHint: "Fill Listing Proforma from already-filled Petition fields",
      };
    case "checklist":
      return {
        id: "checklist",
        title: "Advocate's Checklist",
        targetPaths: [
          "checklist.q1_form28",
          "checklist.q2_orderXV",
          "checklist.q3_papersArranged",
          "checklist.q4_lod",
          "checklist.q5_numbering",
          "checklist.q6_paperBooks",
          "checklist.q7_particularsUniform",
          "checklist.q8_certificate",
          "checklist.q9_annexuresTrueCopies",
          "checklist.q10_annexuresSeparate",
          "checklist.q11_secondAppeal",
          "checklist.q12_proforma",
          "checklist.q13_a",
          "checklist.q13_b",
          "checklist.q13_c",
          "checklist.q13_d",
          "checklist.q13_e",
          "checklist.q14_aft",
          "checklist.q15_paperbooksCured",
        ],
        supportsDeriveFromFields: true,
        deriveHint: "Answer Checklist based on the current Petition state",
      };
    case "oa-jurisdiction":
      return {
        id: "oa-jurisdiction",
        title: "Jurisdiction & Limitation",
        targetPaths: [
          "oa.jurisdictionCause",
          "oa.jurisdictionCauseNote",
          "oa.jurisdictionPosted",
          "oa.jurisdictionPostedNote",
          "oa.limitation",
          "oa.delayDays",
          "oa.limitationNote",
        ],
      };
    case "ia:delay":
      return {
        id: "ia:delay",
        title: "IA: Condonation of Delay in Filing",
        targetPaths: [
          "standardIas.condonationOfDelay.active",
          "standardIas.condonationOfDelay.delayDays",
          "standardIas.condonationOfDelay.grounds",
        ],
      };
    case "ia:delayRefiling":
      return {
        id: "ia:delayRefiling",
        title: "IA: Condonation of Delay in Refiling",
        targetPaths: [
          "standardIas.condonationOfDelayInRefiling.active",
          "standardIas.condonationOfDelayInRefiling.delayDays",
          "standardIas.condonationOfDelayInRefiling.grounds",
        ],
      };
    case "ia:cc":
      return {
        id: "ia:cc",
        title: "IA: Exemption from Filing Certified Copy",
        targetPaths: [
          "standardIas.exemptionCertifiedCopy.active",
          "standardIas.exemptionCertifiedCopy.hasApplied",
          "standardIas.exemptionCertifiedCopy.receiptDate",
          "standardIas.exemptionCertifiedCopy.reasonForNotApplying",
        ],
      };
    case "ia:surrender":
      return {
        id: "ia:surrender",
        title: "IA: Exemption from Surrendering",
        targetPaths: [
          "standardIas.exemptionFromSurrendering.active",
          "standardIas.exemptionFromSurrendering.grounds",
        ],
      };
    case "ia:susp":
      return {
        id: "ia:susp",
        title: "IA: Suspension of Sentence",
        targetPaths: [
          "standardIas.suspensionOfSentence.active",
          "standardIas.suspensionOfSentence.grounds",
        ],
      };
    case "ia:ot":
      return {
        id: "ia:ot",
        title: "IA: Exemption from Official Translation",
        targetPaths: [
          "standardIas.exemptionOfficialTranslation.active",
          "standardIas.exemptionOfficialTranslation.userReason",
        ],
      };
    case "ia:ad":
      return {
        id: "ia:ad",
        title: "IA: Permission to File Additional Documents",
        targetPaths: [
          "standardIas.additionalDocuments",
          "standardIas.additionalDocumentsGrounds",
        ],
      };
    case "cm:stay":
      return {
        id: "cm:stay",
        title: "CM: Stay of Impugned Order",
        targetPaths: [
          "wp.cms.stay.active",
          "wp.cms.stay.title",
          "wp.cms.stay.body",
          "wp.cms.stay.prayers",
        ],
      };
    case "cm:lengthySynopsis":
      return {
        id: "cm:lengthySynopsis",
        title: "CM: Permission to File Lengthy Synopsis & LoD",
        targetPaths: [
          "wp.cms.lengthySynopsis.active",
          "wp.cms.lengthySynopsis.title",
          "wp.cms.lengthySynopsis.body",
          "wp.cms.lengthySynopsis.prayers",
        ],
      };
    case "cm:exemptionCopies":
      return {
        id: "cm:exemptionCopies",
        title: "CM: Exemption from Filing Certified/Typed Copies",
        targetPaths: [
          "wp.cms.exemptionCopies.active",
          "wp.cms.exemptionCopies.title",
          "wp.cms.exemptionCopies.body",
          "wp.cms.exemptionCopies.prayers",
        ],
      };
  }
}

// ── Verbatim Import Prompt Builder (Mode [i]) ────────────────────────────────

function buildVerbatimImportPrompt(
  sectionId: MayurSectionId,
  courtType: string | undefined,
  draftHtml: string,
  draftFormat: "docx" | "pdf",
  fileName: string
): string {
  const meta = getMayurSectionMeta(sectionId, courtType);
  const pathList =
    meta.targetPaths.length > 0
      ? `Target field path(s) ONLY: ${meta.targetPaths.map((p) => `"${p}"`).join(", ")}. Do NOT emit operations for any other path.`
      : `This is a Master Verbatim Import: locate every drafted section present in the document (Memo of Parties, Impugned Order, Deponent, Synopsis, List of Dates & Annexures, Facts, Questions of Law, Grounds, Reliefs/Prayers, Interim Relief, and any Interlocutory Applications / CMs / MAs) and populate all corresponding Drafto fields.`;

  const headingRule = `
=== MANDATORY HEADINGS FORMATTING (HEADING 1 & HEADING 2) ===
Lawyers rarely use Word's built-in heading styles; they type headings as standalone bold or underlined paragraphs, often with Roman numerals or capital letters.
1. IN RICH TEXT FIELDS (such as "synopsis", "wp.facts", or inside paragraph bodies):
   - FORMAT LEVEL 1 HEADINGS (e.g., Roman numerals 'I.', 'II.', 'III.', or major standalone uppercase titles like "PRELIMINARY OBJECTIONS", "SUBMISSIONS ON JURISDICTION") with <h1> tags: <h1>I. FIR IS BOGUS</h1>.
   - FORMAT LEVEL 2 SUBHEADINGS (e.g., capital letters 'A.', 'B.', 'C.', or numbered sub-points) with <h2> tags: <h2>A. Violation of Natural Justice</h2>.
   - NEVER leave headings as ordinary bold paragraphs (<p><b>...</b></p>). They MUST be <h1> or <h2> so Drafto's Heading buttons and document numbering attach to them!
   - Do NOT wrap text inside <h1> or <h2> in redundant <b> tags.
2. IN GROUNDS ("grounds") & FACTS ("facts") LIST TABLES:
   - When a row in the draft is a section divider or heading (e.g. "I. ON LIMITATION", "A. GROUNDS RELATING TO JURISDICTION") rather than an individual ground, emit a heading row:
     { "isHeading": true, "heading": "Exact heading text (e.g. I. ON LIMITATION)", "particulars": "" }
   - Grounds under that heading will follow as standard rows: { "isHeading": false, "heading": "", "particulars": "..." }.
`;

  const quoteRule = `
=== MANDATORY QUOTES & EMPHASIS FORMATTING (BLOCKQUOTES) ===
When a passage in the draft is an extract or quotation (e.g. from a judgment, statute, notification, impugned order, or agreement):
1. WRAP IN <blockquote> TAGS: Wrap the quoted passage in <blockquote><p>...</p></blockquote>. Each quoted paragraph inside should be its own <p> tag.
2. EXTRACT EMPHASIS PARENTHETICAL INTO "data-emphasis":
   - Inspect the quote for notes such as "(emphasis supplied)", "(emphasis added)", "(emphasis in original)", "(italics supplied)", "(underlining supplied)", or similar.
   - If present:
     (a) STRIP the "(emphasis ...)" parenthetical note completely out of the quote's text!
     (b) ADD the normalized note as the "data-emphasis" attribute on the <blockquote> tag, for example:
         <blockquote data-emphasis="emphasis supplied"><p>102. Where the allegations made in the first information report...</p></blockquote>
   - This allows Drafto's editor to display the note right-aligned outside the quote and formats it properly on document export!
   - CRITICAL: If no emphasis note is present in the source text, emit a clean <blockquote><p>...</p></blockquote> with NO data-emphasis attribute at all (do NOT emit data-emphasis="none", data-emphasis="", or any other placeholder).
`;

  const paragraphRule = `
=== PARAGRAPH INTEGRITY MANDATE: ENTER (<p>) VS SHIFT+ENTER (<br>) ===
1. TRUE PARAGRAPHS ONLY (<p>):
   - Every distinct paragraph MUST be enclosed in its own <p>...</p> tags (representing "Enter" in the editor).
   - NEVER join multiple paragraphs with <br> or <br><br> (which represent "Shift+Enter" soft line breaks).
   - In Drafto, block styles like Heading 1 or Heading 2 apply to the entire <p> block. If two paragraphs are joined with <br>, applying Heading 1 turns both paragraphs into a heading! Each paragraph must be its own independent <p> tag.
2. NO EMPTY SPACER PARAGRAPHS:
   - Do NOT insert blank paragraphs (<p></p>, <p><br></p>, <p>&nbsp;</p>) between paragraphs to create visual spacing. Drafto's paragraph styling already provides visual separation between <p> blocks.
   - Single <br> is permitted ONLY for line breaks within a single continuous block (such as lines of an advocate's postal address or a statutory stanza).
`;

  let sectionSpecificRules = "";

  if (sectionId === "lod" || sectionId === "master") {
    sectionSpecificRules += `
=== CRITICAL RULES FOR LIST OF DATES ("listOfDates") & ANNEXURES ===
1. COMPLETE CONTINUATION ACROSS ALL PAGES AND TABLES (ZERO TRUNCATION):
   - The List of Dates in Indian court drafts almost always spans MULTIPLE PAGES and MULTIPLE TABLES.
   - In the extracted draft below, the List of Dates table may be interrupted by page boundaries (<!-- Page X -->), running headers (e.g. "LIST OF DATES (CONTD.)"), or split into multiple consecutive <table> elements.
   - YOU MUST CONTINUE EXTRACTING ALL ENTRIES ACROSS EVERY SINGLE TABLE AND PAGE FROM START TO FINISH.
   - Do NOT stop after the first table or page! Continue until the entire List of Dates genuinely concludes and the next section (such as "MEMO OF PARTIES", "QUESTIONS OF LAW", or "GROUNDS") begins.
   - Extract EVERY chronological date entry from earliest to latest. Do not omit or summarize a single entry.
2. TABLE CELL TO ROW MAPPING:
   - In the extracted draft below, the List of Dates is typically represented as a <table> with <tr> rows and <td> cells (e.g., 2 columns: [Date | Particulars], 3 columns: [S.No. | Date | Particulars], or 4 columns: [S.No. | Date | Particulars | Page No.]), or as chronological paragraphs.
   - Map EVERY chronological entry into its own item in "listOfDates": { "date": "...", "event": "...", "annexures": [...] }.
   - Skip table header rows (like "Date | Events" or "S.No. | Date | Particulars"). Ignore serial-number and page-number columns.
   - If a continuation row in the table has an empty Date cell and continues the previous event's text, append its paragraphs into the parent event row as separate <p>...</p> tags (NOT joined with <br><br>) unless it is a distinct standalone entry.
3. VERBATIM TEXT & FORMATTING IN "event":
   - Copy the text of each event 100% VERBATIM — do not alter, summarize, or reword a single word, spelling, or punctuation mark.
   - Preserve all inline formatting tags (<b>, <i>, <u>, <s>), capitalization, and lists (<ol>, <ul>, <li>) inside "event".
   - If an event has multiple paragraphs, format each as a separate <p>...</p> tag (do NOT join them with <br><br>).
   - If an event contains quoted extracts, wrap them in <blockquote data-emphasis="...">...</blockquote> as specified in the quote rules.
4. DETECTING & EXTRACTING ANNEXURE SENTENCES INTO THE ANNEXURE DIALOG ("annexures"):
   - Carefully inspect every List of Dates entry (and any Facts paragraphs if importing into a Writ Petition) for annexure sentences or references — for example:
     • "A true copy of the Order dated 12.03.2024 passed by the High Court of Delhi in W.P.(C) No. 1234/2023 is annexed herewith and marked as Annexure P-2 (at pages 45 to 60)."
     • "True and typed copy of the FIR No. 45/2021 dated 04.05.2021 is annexed herewith as Annexure P-1."
     • "Copy of the representation dated 10.01.2023 is annexed as Annexure A-3 (pp. 72-75)."
     • "(Annexure P-4)" or "[Annexure P-5 (Colly)]"
   - Whenever an entry contains an annexure sentence:
     (a) STRIP the entire annexure sentence (including page number placeholders like "(at pages __ to __)" or "(pp. 12-15)") out of the "event" text! Drafto automatically generates the standardized annexure sentence from the Annexure Dialog data when creating the document, so leaving the sentence inside "event" would print it twice.
     (b) POPULATE a corresponding object in that row's "annexures" array:
         {
           "title": "<exact plain text description of the document WITHOUT ANY <p> OR HTML TAGS, e.g., 'Order passed by the High Court of Delhi in W.P.(C) No. 1234/2023' — strip leading 'A true copy of' and strip 'dated DD.MM.YYYY' and 'is annexed herewith as Annexure P-X'>",
           "date": "<the document's date as written in the annexure sentence, e.g. '12.03.2024', or '' if undated>",
           "copyType": "<one of: 'true copy' | 'typed copy' | 'true and typed copy' | 'translated copy' | 'true and translated copy' — match what the draft says, default to 'true copy'>",
           "isAdditionalDocument": false,
           "isImpugnedOrder": <true ONLY if this is a Writ Petition challenging this specific Impugned Order, else false>
         }
     (c) If a single List of Dates row annexes multiple documents (e.g. Annexure P-2 and Annexure P-3), add each one to that row's "annexures" array in order.
     (d) If a separate table row in the draft contains ONLY an annexure sentence for the immediately preceding event row, attach that annexure to the preceding event row's "annexures" array and do not emit an empty event row!
`;
  }

  if (sectionId === "grounds" || sectionId === "qol" || sectionId === "master") {
    sectionSpecificRules += `
=== CRITICAL RULES FOR GROUNDS ("grounds") & QUESTIONS OF LAW ("questionsOfLaw") ===
1. ONE ROW PER GROUND / QUESTION:
   - Each numbered or lettered Ground (e.g. A., B., C., I., II., 1., 2., Ground A) or Question of Law (e.g. i., ii., a., b., 1., 2., I., II.) — whether written as paragraphs, list items, or rows of a 2-column borderless table ([A. | Because...]) — MUST be placed into its own separate item in the array: { "particulars": "..." }.
2. STRIP LEADING NUMBERS/LETTERS ONLY:
   - Strip ONLY the leading ground/question label (e.g. "A.", "B.", "1.", "2.", "(i)", "I.", "GROUND A:") from the beginning of each item, because Drafto automatically numbers/letters the rows.
   - Keep the opening word ("BECAUSE", "Because", "That", "Whether", etc.) and every single word of the body 100% VERBATIM!
3. KEEP SUB-PARAGRAPHS, LISTS & QUOTES INSIDE THEIR PARENT GROUND:
   - If a Ground contains multiple paragraphs, blockquotes, or sub-clauses (like (i), (ii), (a), (b)) before the next top-level Ground begins, keep ALL of those sub-paragraphs and sub-lists inside that single Ground's "particulars" field as separate <p>...</p> tags, <ol>, <ul>, <li>, and <blockquote data-emphasis="...">...</blockquote>.
   - Do NOT use <br><br> to separate paragraphs inside a ground.
   - Do NOT split sub-paragraphs or indented quotes of a single ground into separate top-level grounds!
4. SECTION HEADINGS BETWEEN GROUNDS:
   - If a standalone heading or topic divider appears between grounds (e.g. "I. ON LIMITATION", "A. GROUNDS RELATING TO JURISDICTION"), emit:
     { "isHeading": true, "heading": "Heading text", "particulars": "" }
`;
  }

  if (sectionId === "synopsis" || sectionId === "master") {
    sectionSpecificRules += `
=== CRITICAL RULES FOR SYNOPSIS ("synopsis") ===
- Locate the Synopsis section (typically titled "SYNOPSIS" before the List of Dates).
- Copy the entire Synopsis text 100% VERBATIM into "synopsis".
- Separate each paragraph with <p>...</p> (do NOT use <br><br>).
- If there are headings (e.g. "I. BRIEF FACTS", "II. SUBMISSIONS"), format them as <h1>...</h1> or <h2>...</h2> (do not leave them as <p><b>...</b></p>).
- If there are quotes or extracts, wrap them in <blockquote data-emphasis="...">...</blockquote>.
- Loyally preserve all <b>, <i>, <u>, <s>, <ol>, <ul>, <li> tags and exact capitalization.
- Do NOT include the "LIST OF DATES" table inside "synopsis".
`;
  }

  if (sectionId.startsWith("ia:") || sectionId.startsWith("cm:") || sectionId.startsWith("ma:")) {
    sectionSpecificRules += `
=== CRITICAL RULES FOR INTERLOCUTORY APPLICATION / CM / MA ===
- Locate the relevant Application in the draft (or if the uploaded file is itself the standalone Application draft, use its body paragraphs/grounds and prayers).
- Exclude standard boilerplate opening Para 1 ("The accompanying Special Leave Petition / Writ Petition has been filed...") and standard closing ("This application is made bona fide...") which Drafto generates automatically, and place all substantive body/ground paragraphs verbatim into the application's grounds/body list (one paragraph per row, stripping leading paragraph numbers like "2.", "3.", "A.").
- Each paragraph row must have its text cleanly in <p>...</p> tags without <br><br>.
- If importing a Custom IA / Custom CM / MA, also extract its title and prayers verbatim.
`;
  }

  return [
    `TASK: OPTION [i] — IMPORT VERBATIM FROM UPLOADED DRAFT (${fileName}, format: .${draftFormat}).`,
    pathList,
    ``,
    `ABSOLUTE VERBATIM & FORMATTING LOYALTY MANDATE:`,
    `1. ZERO REWRITING: You are acting as a precision verbatim importer, NOT an editor. Copy the exact words, spelling, capitalization, and punctuation from <draft_content> into the target Drafto field(s) WITHOUT changing, paraphrasing, or omitting a single word.`,
    `2. PRESERVE ALL RICH FORMATTING: Every <b> (bold), <i> (italic), <u> (underline), <s> (strikethrough), <ol>, <ul>, <li> tag present in the relevant section of <draft_content> MUST be preserved inside the JSON string values you output.`,
    paragraphRule,
    headingRule,
    quoteRule,
    sectionSpecificRules,
    ``,
    `Respond ONLY with the single fenced \`\`\`json block containing { "operations": [ ... ], "message": "..." }.`,
    ``,
    `<draft_content file="${fileName}" format="${draftFormat}">`,
    draftHtml,
    `</draft_content>`,
  ].join("\n");
}

// ── Raw-Material Construction Prompt Builder (Mode [ii]) ─────────────────────

function buildConstructFromRawPrompt(
  sectionId: MayurSectionId,
  courtType: string | undefined,
  partyRoleHint?: string,
  userGuidance?: string
): string {
  const mode = draftModeFor(courtType);
  const meta = getMayurSectionMeta(sectionId, courtType);
  const presets = mode === "WritPetitionDHC" ? WP_PRESETS : PRESETS;

  // Map MayurSectionId to existing rich preset instructions where available
  const presetMap: Partial<Record<MayurSectionId, string>> = {
    parties: "memo",
    impugned: "impugned",
    deponent: "deponent",
    lod: "lod",
    synopsis: "synopsis",
    grounds: "grounds",
    qol: "qol",
    interim: "interim",
    proforma: "listing",
    reliefs: "reliefs",
    facts: "facts",
  };

  const presetId = presetMap[sectionId];
  const preset = presetId ? presets.find((p) => p.id === presetId) : undefined;
  const secSpec = sectionById(mode, sectionId) || (presetId ? sectionById(mode, presetId) : undefined);

  const lines: string[] = [
    `TASK: OPTION [ii] — CONSTRUCT "${meta.title.toUpperCase()}" FROM RAW CASE MATERIAL.`,
    `This section is being drafted or replaced afresh from raw material. Propose complete, rigorous operations for the target fields.`,
  ];

  if (meta.targetPaths.length > 0) {
    lines.push(
      `TARGET FIELDS ONLY: Emit operations ONLY for: ${meta.targetPaths.map((p) => `"${p}"`).join(", ")}. Do not touch unrelated fields.`
    );
  }

  if (partyRoleHint && partyRoleHint.trim()) {
    lines.push(`CLIENT / PETITIONER ROLE IN COURT BELOW: ${partyRoleHint.trim()}`);
  }
  if (userGuidance && userGuidance.trim()) {
    lines.push(`USER'S SPECIAL INSTRUCTIONS FOR THIS SECTION: ${userGuidance.trim()}`);
  }

  if (preset) {
    lines.push(``, `=== SECTION DRAFTING GUIDELINES ===`, preset.prompt);
  }
  if (secSpec?.playbook) {
    lines.push(``, `=== STEP-BY-STEP PLAYBOOK ===`, secSpec.playbook);
  }

  // Specific instructions when constructing specific sections
  if (sectionId === "parties") {
    lines.push(
      ``,
      `IMPORTANT FOR MEMO OF PARTIES: Identify the SLP Petitioner(s) from the cause title of the Impugned Order / lower court petition (the party challenging the adverse order, e.g. the Applicant / Petitioner / Appellant). Identify all Respondents (including the State and the complainant / opposite party). Emit BOTH "petitioners" and "respondents" operations. For each party, fill name, address, and their exact numbered position in the court below (positionInEarlierCourt, e.g. "Applicant No. 1", "Respondent No. 1"). Do NOT return empty arrays or ask clarifying questions; determine the parties from the material and populate them.`
    );
  } else if (sectionId === "lod") {
    lines.push(
      ``,
      `IMPORTANT FOR LIST OF DATES & EVENTS: Exhaustively scan ALL documents provided in <case_material>. Construct a comprehensive, granular chronological timeline (typically 10 to 20 dated entries) spanning from the earliest dispute or origin all the way to the Impugned Order.`,
      `- MUST include every key milestone: marriage/agreement, key disputes, representations, police complaints, FIR registration date, notices/investigation, filing of quashing petition or lower court petition, interim stay/orders in the High Court, and CRITICALLY THE FINAL IMPUGNED ORDER DATE ITSELF as the final entry. Do NOT end the timeline prematurely!`,
      `- For each entry corresponding to a document in <case_material>, attach an annexure in that row's "annexures" array with title, date, and copyType ("true copy" or "true and translated copy").`
    );
  } else if (sectionId === "synopsis") {
    lines.push(
      ``,
      `IMPORTANT FOR SYNOPSIS: Construct a complete, persuasive 4-to-6 paragraph synopsis in rich text HTML (<p>...</p>):`,
      `- Paragraph 1: Challenge statement identifying the Impugned Judgment/Order, court, date, case number, and enactment under challenge.`,
      `- Paragraph 2: Core factual narrative and context.`,
      `- Paragraph 3: Specific legal infirmities, statutory violations, lack of jurisdiction, or perversity in the Impugned Order.`,
      `- Paragraph 4: Why this Hon'ble Court's urgent interference under Article 136 is imperative.`,
      ``,
      `MANDATORY JSON FORMAT FOR SYNOPSIS:`,
      `You MUST emit a single scalar operation targeting path "synopsis":`,
      `\`\`\`json`,
      `{`,
      `  "operations": [`,
      `    {`,
      `      "kind": "scalar",`,
      `      "path": "synopsis",`,
      `      "value": "<p>Challenge statement...</p><p>Core factual narrative...</p><p>Legal grounds...</p><p>Prayer for urgent interference...</p>"`,
      `    }`,
      `  ]`,
      `}`,
      `\`\`\``
    );
  } else if (sectionId === "interim") {
    lines.push(
      ``,
      `IMPORTANT FOR INTERIM RELIEF:`,
      `- Set "wantsInterimRelief" to true.`,
      `- In "interimReliefPrayers", draft the primary substantive prayer in the first item's particulars (e.g., "Pass an ex-parte ad-interim order staying the operation and effect of the Impugned Final Judgment and Order dated ... and staying all further proceedings arising out of FIR No. ..."), and keep the second item as the omnibus prayer ("Pass any such other or further order(s)...").`,
      `- In "interimReliefGrounds", draft 3 to 4 persuasive grounds showing strong prima facie case, balance of convenience, and grave irreparable injury.`
    );
  } else if (sectionId === "proforma") {
    lines.push(
      ``,
      `IMPORTANT FOR LISTING PROFORMA: Extract and populate all required fields from the case material and already-filled fields:`,
      `- "listingProforma.general.judgesPassedImpugned": Exact name(s) of the Hon'ble High Court Judge(s) who passed the Impugned Order (e.g. "Hon'ble Mr. Justice Nirzar S. Desai").`,
      `- "listingProforma.general.mainCategory": Subject category (e.g. "14 CRIMINAL MATTERS").`,
      `- "listingProforma.general.subCategory": Sub-category (e.g. "1439 Criminal Matters Relating To All Other Matters Incld. Threat To Life / Quashing of FIR").`,
      `- "listingProforma.legalProvisions": List of objects { "type": "Central Act" | "State Act" | "Central Rule" | "State Rule", "act": "Act Name", "section": "Section numbers" } for every enactment involved (e.g. Bharatiya Nyaya Sanhita, 2023 - Section 85; Bharatiya Nagarik Suraksha Sanhita, 2023 - Section 208, 528).`,
      `- "listingProforma.specialCategories.firNoAndDate": FIR number and date (e.g. "FIR No. 11215018260013 dated 02.04.2026") or "N.A."`,
      `- "listingProforma.specialCategories.policeStation": Police Station name or "N.A."`,
      `- "listingProforma.specialCategories.surrenderStatus": "N.A." (or "Has Surrendered" / "Has Not Surrendered").`,
      `- "listingProforma.specialCategories.earlierCaseSameParties": "No".`
    );
  } else if (sectionId === "impugned") {
    lines.push(
      ``,
      `IMPORTANT FOR IMPUGNED ORDERS: Extract the court, order date, case number, and detriment/effect. In a Criminal SLP challenging a High Court order under Section 482 CrPC / Section 528 BNSS, no intra-court appeal lies in law; set "intraCourtAppealStatus" to "no_appeal_lies".`
    );
  } else if (sectionId === "deponent") {
    lines.push(
      ``,
      `IMPORTANT FOR DEPONENT: Populate name, relationship, fatherName, address, location, role, and age (extract age from the complaint/FIR/affidavit if stated).`
    );
  } else if (sectionId === "grounds") {
    lines.push(
      ``,
      `IMPORTANT: The user clicked Mayur specifically on the GROUNDS heading. Emit ONLY the "grounds" operation (do NOT emit "questionsOfLaw" in this turn). Construct comprehensive, legally rigorous grounds challenging every factual and legal infirmity in the Impugned Order, using group headings ({ "isHeading": true, "heading": "..." }) where appropriate.`
    );
  } else if (sectionId === "qol") {
    lines.push(
      ``,
      `IMPORTANT FOR QUESTIONS OF LAW: The user clicked Mayur specifically on the QUESTIONS OF LAW heading. Emit ONLY the "questionsOfLaw" operation (do NOT emit "grounds" in this turn). Frame crisp, generalized, substantial questions of law ("Whether...") arising from the case material and any grounds already in the project.`,
      `- Each question must be in its own item with { "particulars": "Whether...", "isHeading": false, "heading": "" }.`,
      `- Do NOT number or letter them (e.g. do not write "1.", "A.", "Question 1:") because Drafto automatically numbers the rows.`,
      ``,
      `MANDATORY JSON FORMAT FOR QUESTIONS OF LAW:`,
      `You MUST emit a single list operation targeting path "questionsOfLaw":`,
      `\`\`\`json`,
      `{`,
      `  "operations": [`,
      `    {`,
      `      "kind": "list",`,
      `      "path": "questionsOfLaw",`,
      `      "items": [`,
      `        { "particulars": "Whether the Hon'ble High Court erred in dismissing the quashing petition...", "isHeading": false, "heading": "" },`,
      `        { "particulars": "Whether the statutory bar under Section 85 of the BNS is attracted...", "isHeading": false, "heading": "" }`,
      `      ]`,
      `    }`,
      `  ]`,
      `}`,
      `\`\`\``
    );
  } else if (sectionId.startsWith("ia:") || sectionId.startsWith("cm:") || sectionId.startsWith("ma:")) {
    lines.push(
      ``,
      `=== APPLICATION CONSTRUCTION INSTRUCTIONS ===`,
      `Read the case material and the current project snapshot carefully, and draft persuasive, specific, factually grounded paragraphs for "${meta.title}".`,
      `- Set the application's active flag (if any) to true.`,
      `- Draft 3 to 6 clear, self-contained grounds/body paragraphs (one per row in the grounds/body list, without leading paragraph numbers or letters) explaining the factual basis, bona fides, prima facie case, and grave prejudice from the record.`,
      `- If this is a Condonation of Delay IA, calculate or infer the delay days if apparent from the impugned order date and explain the reasons for delay persuasively.`,
      `- If this is a Custom IA / CM / MA, fill its title, para2 continuation, grounds, and prayers.`
    );
  }

  lines.push(
    ``,
    `ABSOLUTE FORMAT MANDATE: Your response MUST begin directly with the opening fence \`\`\`json without ANY introductory greetings, commentary, or text before or after the JSON block. Output ONLY the single fenced \`\`\`json block containing your proposed operations.`
  );

  return lines.join("\n");
}

// ── Derive from Existing Fields Prompt Builder (Mode [iii]) ──────────────────

function buildDeriveFromFieldsPrompt(
  sectionId: MayurSectionId,
  courtType: string | undefined,
  userGuidance?: string
): string {
  const meta = getMayurSectionMeta(sectionId, courtType);
  const basePrompt = buildConstructFromRawPrompt(sectionId, courtType, undefined, userGuidance);
  return [
    basePrompt,
    ``,
    `NOTE: Construct "${meta.title}" directly from the already-populated fields in the current project snapshot (such as the Impugned Order, Memo of Parties, List of Dates, and Grounds) even if no external <case_material> files are attached.`,
  ].join("\n");
}

// ── Executing a Single Turn & Applying Operations ────────────────────────────

export interface MayurUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface MayurStepNotification {
  sectionId: MayurSectionId;
  sectionTitle: string;
  ok: boolean;
  fieldsApplied: string[];
  opCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  truncated?: boolean;
  reasonsFailed?: string[];
  skippedNotes?: string[];
}

export interface RunMayurOptions {
  form: UseFormReturn<FieldValues>;
  sectionId: MayurSectionId;
  mode: "verbatim" | "construct" | "derive";
  draftFilePath?: string; // For mode === "verbatim"
  contextDir?: string; // For mode === "construct"
  partyRoleHint?: string;
  userGuidance?: string;
  onStatus?: (status: string) => void;
  onSectionComplete?: (sectionResult: MayurStepNotification) => void;
}

export interface RunMayurResult {
  ok: boolean;
  appliedPaths: string[];
  opCount: number;
  message?: string;
  error?: string;
  needsKey?: boolean;
  cancelled?: boolean;
  usage?: MayurUsage;
  truncated?: boolean;
  sectionResults?: MayurStepNotification[];
}

// Apply operations when targeting a specific indexed Custom IA / CM / MA
function applyIndexedCustomAppOps(
  form: UseFormReturn<FieldValues>,
  sectionId: MayurSectionId,
  ops: SafeOp[]
): string[] | null {
  if (sectionId.startsWith("ia:custom:")) {
    const idx = parseInt(sectionId.split(":")[2] || "0", 10);
    const customOp = ops.find((o) => o.kind === "list" && o.path === "customIas");
    if (customOp && customOp.kind === "list" && customOp.items.length > 0) {
      const cleaned = cleanOpValues(customOp.items[0]);
      const parsed = customIaSchema.parse(cleaned);
      const existing = [...(form.getValues("customIas") || [])];
      existing[idx] = { ...existing[idx], ...parsed, id: existing[idx]?.id || parsed.id };
      form.setValue("customIas", existing, { shouldDirty: true, shouldTouch: true });
      return [`customIas.${idx}`];
    }
  }
  if (sectionId.startsWith("cm:custom:")) {
    const idx = parseInt(sectionId.split(":")[2] || "0", 10);
    const customOp = ops.find((o) => o.kind === "list" && o.path === "wp.customCms");
    if (customOp && customOp.kind === "list" && customOp.items.length > 0) {
      const cleaned = cleanOpValues(customOp.items[0]);
      const parsed = customIaSchema.parse(cleaned);
      const existing = [...(form.getValues("wp.customCms") || [])];
      existing[idx] = { ...existing[idx], ...parsed, id: existing[idx]?.id || parsed.id };
      form.setValue("wp.customCms", existing, { shouldDirty: true, shouldTouch: true });
      return [`wp.customCms.${idx}`];
    }
  }
  if (sectionId.startsWith("ma:")) {
    const idx = parseInt(sectionId.split(":")[1] || "0", 10);
    const maOp = ops.find((o) => o.kind === "list" && o.path === "oa.mas");
    if (maOp && maOp.kind === "list" && maOp.items.length > 0) {
      const rawItem = cleanOpValues(maOp.items[0]) as Record<string, unknown>;
      const existing = [...(form.getValues("oa.mas") || [])];
      const current = existing[idx] || oaMaSchema.parse({});
      const bodyRaw = (rawItem.grounds || rawItem.body || []) as Record<string, unknown>[];
      const bodyParsed = Array.isArray(bodyRaw)
        ? bodyRaw.map((b) => aamTableItemSchema.parse(b))
        : current.body;
      existing[idx] = {
        ...current,
        ...(typeof rawItem.title === "string" && rawItem.title ? { provision: rawItem.title } : {}),
        ...(Array.isArray(rawItem.prayers) && rawItem.prayers[0]
          ? { firstPrayer: String((rawItem.prayers[0] as any).particulars || "") }
          : {}),
        body: bodyParsed,
      };
      form.setValue("oa.mas", existing, { shouldDirty: true, shouldTouch: true });
      return [`oa.mas.${idx}`];
    }
  }
  return null;
}

async function runSingleLlmCall(
  systemPrompt: string,
  userPrompt: string,
  contextDir?: string,
  onStatus?: (s: string) => void,
  targetPath?: string
): Promise<{
  ok: boolean;
  proposal?: RawProposal;
  error?: string;
  needsKey?: boolean;
  cancelled?: boolean;
  usage?: MayurUsage;
  truncated?: boolean;
}> {
  const win = typeof window !== "undefined" ? (window as any).electron : undefined;
  if (!win?.aiRun) {
    return { ok: false, error: "Mayur is only available in the Drafto desktop app." };
  }

  const settings = getSettings();
  const provider: LlmProvider = (settings.aiProvider as LlmProvider) || "gemini";
  const model: string = settings.aiModel || "";

  const offStream = win.onAiStream
    ? win.onAiStream((evt: any) => {
        if (evt?.kind === "status" && evt.text && onStatus) {
          onStatus(evt.text);
        }
      })
    : null;

  try {
    const res = await win.aiRun({
      provider,
      model,
      systemPrompt,
      prompt: userPrompt,
      addDirs: contextDir ? [contextDir] : [],
    });

    const isTruncated = Boolean(res?.truncated);
    const usage: MayurUsage | undefined =
      res?.usage ||
      (typeof res?.inputTokens === "number" || typeof res?.outputTokens === "number"
        ? {
            inputTokens: res.inputTokens || 0,
            outputTokens: res.outputTokens || 0,
            totalTokens: (res.inputTokens || 0) + (res.outputTokens || 0),
          }
        : undefined);

    if (!res?.ok) {
      // Check if partial output has valid operations
      if (res?.partialText) {
        const partial = extractProposal(res.partialText, targetPath) || extractPartialProposal(res.partialText);
        if (partial && Array.isArray(partial.operations) && partial.operations.length > 0) {
          return { ok: true, proposal: partial, usage, truncated: isTruncated };
        }
      }
      return {
        ok: false,
        error: res?.error || "Mayur could not complete the request.",
        needsKey: !!res?.needsKey,
        cancelled: !!res?.cancelled,
        usage,
        truncated: isTruncated,
      };
    }

    const rawText = String(res.text || "");
    const proposal = extractProposal(rawText, targetPath) || extractPartialProposal(rawText);
    if (!proposal || !Array.isArray(proposal.operations) || proposal.operations.length === 0) {
      return {
        ok: false,
        error: targetPath
          ? `Could not structure operations for ${targetPath}.`
          : "Mayur did not produce structured operations to populate fields.",
        usage,
        truncated: isTruncated,
      };
    }

    return { ok: true, proposal, usage, truncated: isTruncated };
  } finally {
    if (offStream) offStream();
  }
}

async function extendListTimelineIfNeeded(
  ops: SafeOp[],
  freshSnapshot: Record<string, any>,
  systemPrompt: string,
  baseUserPrompt: string,
  contextDir: string | undefined,
  onStatus?: (s: string) => void
): Promise<{ addedIn: number; addedOut: number }> {
  const lodOp = ops.find((o) => o.path === "listOfDates" && o.kind === "list");
  if (!lodOp || !Array.isArray((lodOp as any).items) || (lodOp as any).items.length === 0) {
    return { addedIn: 0, addedOut: 0 };
  }

  let currentItems = [...(lodOp as any).items];
  const lastItem = currentItems[currentItems.length - 1];
  const lastDate = String(lastItem?.date || "").trim();

  // Extract impugned order date to check milestone
  const impOrders = freshSnapshot?.impugnedOrders;
  const impDateRaw = Array.isArray(impOrders) && impOrders[0]?.date ? String(impOrders[0].date) : "";
  let impDateFormatted = "";
  if (impDateRaw) {
    try {
      const d = new Date(impDateRaw);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        impDateFormatted = `${day}.${month}.${year}`;
      }
    } catch {}
  }

  const reachedImpugned =
    impDateFormatted &&
    currentItems.some(
      (it) => it.date === impDateFormatted || (typeof it.event === "string" && it.event.includes(impDateFormatted))
    );

  // If lastDate didn't reach the impugned date, or if fewer than 10 events:
  if (lastDate && (!reachedImpugned || currentItems.length < 10)) {
    onStatus?.(`Timeline reached ${lastDate}. Continuing chronologically up to Impugned Order (${impDateFormatted || "conclusion"})…`);
    const contPrompt = [
      `TASK: CONTINUE LIST OF DATES TIMELINE FROM DATE "${lastDate}".`,
      `You previously extracted chronological entries up to date "${lastDate}".`,
      `The case timeline continues chronologically after "${lastDate}". You must extract all subsequent events:`,
      `- Filing of the petition / quashing petition in the High Court`,
      `- Any High Court notices, hearings, or interim orders`,
      impDateFormatted
        ? `- CRITICALLY: The Final Impugned Judgment and Order dated "${impDateFormatted}" as the concluding entry of the timeline.`
        : `- And the Final Impugned Judgment as the concluding entry.`,
      ``,
      `MANDATORY RULES:`,
      `1. Do NOT re-extract "${lastDate}" or earlier dates. Start with the very next subsequent date after "${lastDate}".`,
      `2. Extract all subsequent events up to and including the Impugned Order.`,
      `3. For each document, populate the annexures array { title, date, copyType }.`,
      `4. Emit ONLY the single fenced \`\`\`json block targeting "listOfDates".`,
    ].join("\n");

    const contRes = await runSingleLlmCall(
      systemPrompt,
      `${baseUserPrompt}\n\n${contPrompt}`,
      contextDir,
      onStatus,
      "listOfDates"
    );

    const addedIn = contRes.usage?.inputTokens || 0;
    const addedOut = contRes.usage?.outputTokens || 0;

    if (contRes.ok && contRes.proposal) {
      const contVal = validateProposal(contRes.proposal);
      const contLodOp = contVal.valid.find((o) => o.path === "listOfDates" && o.kind === "list");
      const newItems = contLodOp && Array.isArray((contLodOp as any).items) ? (contLodOp as any).items : [];
      if (newItems.length > 0) {
        currentItems = [...currentItems, ...newItems];
        (lodOp as any).items = currentItems;
      }
    }
    return { addedIn, addedOut };
  }
  return { addedIn: 0, addedOut: 0 };
}

async function extendGroundsIfNeeded(
  ops: SafeOp[],
  wasTruncated: boolean,
  hadTruncatedItem: boolean,
  systemPrompt: string,
  baseUserPrompt: string,
  contextDir: string | undefined,
  onStatus?: (s: string) => void
): Promise<{ addedIn: number; addedOut: number }> {
  const groundsOp = ops.find((o) => o.path === "grounds" && o.kind === "list");
  if (!groundsOp || !Array.isArray((groundsOp as any).items)) {
    return { addedIn: 0, addedOut: 0 };
  }

  const items = (groundsOp as any).items as any[];
  const substantive = items.filter((it) => !it.isHeading);

  // If fewer than 6 grounds or if the stream was cut off:
  if (substantive.length < 6 || wasTruncated || hadTruncatedItem) {
    onStatus?.(`Drafted ${substantive.length} grounds. Drafting remaining comprehensive grounds…`);
    const lastGroundPreview = substantive[substantive.length - 1]?.particulars
      ? String(substantive[substantive.length - 1].particulars).replace(/<[^>]*>/g, "").slice(0, 70)
      : "";
    const contPrompt = [
      `TASK: CONTINUE DRAFTING GROUNDS OF PETITION.`,
      `You previously drafted ${substantive.length} grounds (the last ground drafted was: "${lastGroundPreview}").`,
      `Continue drafting 4 to 6 additional, distinct, legally rigorous grounds challenging the Impugned Order:`,
      `- Jurisdictional errors, statutory bars, non-consideration of vital record, lack of ingredients, parity with co-accused, and violation of binding Supreme Court precedents.`,
      ``,
      `MANDATORY RULES:`,
      `1. Do NOT repeat any earlier ground. Start directly with the next new grounds.`,
      `2. Emit ONLY the single fenced \`\`\`json block targeting "grounds".`,
    ].join("\n");

    const contRes = await runSingleLlmCall(
      systemPrompt,
      `${baseUserPrompt}\n\n${contPrompt}`,
      contextDir,
      onStatus,
      "grounds"
    );

    const addedIn = contRes.usage?.inputTokens || 0;
    const addedOut = contRes.usage?.outputTokens || 0;

    if (contRes.ok && contRes.proposal) {
      const contVal = validateProposal(contRes.proposal);
      const contGroundsOp = contVal.valid.find((o) => o.path === "grounds" && o.kind === "list");
      const newItems = contGroundsOp && Array.isArray((contGroundsOp as any).items) ? (contGroundsOp as any).items : [];
      if (newItems.length > 0) {
        (groundsOp as any).items = [...items, ...newItems];
      }
    }
    return { addedIn, addedOut };
  }
  return { addedIn: 0, addedOut: 0 };
}

export async function executeMayurTask(opts: RunMayurOptions): Promise<RunMayurResult> {
  const {
    form,
    sectionId,
    mode,
    draftFilePath,
    contextDir,
    partyRoleHint,
    userGuidance,
    onStatus,
  } = opts;

  const win = typeof window !== "undefined" ? (window as any).electron : undefined;
  if (!win) {
    return { ok: false, appliedPaths: [], opCount: 0, error: "Desktop environment required." };
  }

  const currentValues = form.getValues();
  const courtType = currentValues?.courtType as string | undefined;
  const meta = getMayurSectionMeta(sectionId, courtType);

  // ── Mode [i]: Verbatim Import from Draft (.docx or .pdf) ───────────────────
  if (mode === "verbatim") {
    if (!draftFilePath) {
      return { ok: false, appliedPaths: [], opCount: 0, error: "No draft file selected." };
    }
    onStatus?.("Extracting rich text, tables, and formatting from draft…");
    const extracted = await win.aiExtractDraft(draftFilePath);
    if (!extracted?.ok) {
      return {
        ok: false,
        appliedPaths: [],
        opCount: 0,
        error: extracted?.error || "Could not read the selected draft file.",
      };
    }

    onStatus?.(`Locating ${meta.title} and importing verbatim…`);
    const draftMode = draftModeFor(courtType);
    const systemPrompt = buildSystemPrompt({ courtType: draftMode });
    const baseUserPrompt = buildVerbatimImportPrompt(
      sectionId,
      courtType,
      extracted.richText,
      extracted.format,
      extracted.fileName
    );
    const userPrompt = userGuidance
      ? `${baseUserPrompt}\n\nAdditional user note: ${userGuidance}`
      : baseUserPrompt;

    const llmRes = await runSingleLlmCall(
      systemPrompt,
      userPrompt,
      undefined,
      onStatus,
      meta.targetPaths[0]
    );
    if (!llmRes.ok || !llmRes.proposal) {
      return {
        ok: false,
        appliedPaths: [],
        opCount: 0,
        error: llmRes.error,
        needsKey: llmRes.needsKey,
        cancelled: llmRes.cancelled,
        usage: llmRes.usage,
      };
    }

    const validated = validateProposal(llmRes.proposal);
    const allowedSet = meta.targetPaths.length > 0 ? new Set(meta.targetPaths) : null;
    const filteredOps = allowedSet
      ? validated.valid.filter((op) => allowedSet.has(op.path))
      : validated.valid;

    if (filteredOps.length === 0) {
      return {
        ok: false,
        appliedPaths: [],
        opCount: 0,
        error: `Could not find ${meta.title} in ${extracted.fileName}.`,
        usage: llmRes.usage,
      };
    }

    // Automatic multi-batch continuation for List of Dates tables that exceed a single LLM turn
    if (sectionId === "lod") {
      const lodOp = filteredOps.find((op) => op.path === "listOfDates" && op.kind === "list");
      if (lodOp && Array.isArray((lodOp as any).items) && (lodOp as any).items.length > 0) {
        let currentItems = (lodOp as any).items as any[];
        let totalUsage = llmRes.usage ? { ...llmRes.usage } : undefined;
        let contTurns = 0;

        while (contTurns < 5) {
          const lastItem = currentItems[currentItems.length - 1];
          const lastDate = String(lastItem?.date || "").trim();
          if (!lastDate) break;

          // Check if extracted.richText contains subsequent <tr> table rows after lastDate
          const datePos = extracted.richText.lastIndexOf(lastDate);
          if (datePos === -1) break;
          const subsequentHtml = extracted.richText.slice(datePos + lastDate.length);
          if (!/<tr>/i.test(subsequentHtml)) break;

          contTurns++;
          onStatus?.(`Imported ${currentItems.length} entries (up to ${lastDate}). Continuing with remaining entries…`);

          const contUserPrompt = [
            `TASK: VERBATIM IMPORT CONTINUATION — LIST OF DATES (${extracted.fileName}).`,
            `You previously imported entries up to date "${lastDate}".`,
            `The draft table continues with subsequent entries after "${lastDate}".`,
            `Extract ONLY the remaining subsequent entries that appear AFTER date "${lastDate}" from the draft table below.`,
            ``,
            `MANDATORY CONTINUATION RULES:`,
            `1. Do NOT re-extract "${lastDate}" or any earlier dates.`,
            `2. Start with the very next row after "${lastDate}" and extract every single remaining entry verbatim to the end of the table.`,
            `3. For annexures, format { "title": "...", "date": "...", "copyType": "..." } (title plain text without <p>).`,
            `4. Respond ONLY with the single fenced \`\`\`json block:`,
            `\`\`\`json`,
            `{`,
            `  "operations": [`,
            `    {`,
            `      "path": "listOfDates",`,
            `      "items": [`,
            `        ...remaining entries...`,
            `      ]`,
            `    }`,
            `  ]`,
            `}`,
            `\`\`\``,
            ``,
            `<draft_content file="${extracted.fileName}" format="${extracted.format}">`,
            extracted.richText,
            `</draft_content>`,
          ].join("\n");

          const contRes = await runSingleLlmCall(
            systemPrompt,
            contUserPrompt,
            undefined,
            onStatus,
            "listOfDates"
          );
          if (contRes.usage && totalUsage) {
            totalUsage.inputTokens += contRes.usage.inputTokens;
            totalUsage.outputTokens += contRes.usage.outputTokens;
            totalUsage.totalTokens += contRes.usage.totalTokens;
          }

          if (!contRes.ok || !contRes.proposal) break;
          const contVal = validateProposal(contRes.proposal);
          const contLodOp = contVal.valid.find((op) => op.path === "listOfDates" && op.kind === "list");
          const newItems = contLodOp && Array.isArray((contLodOp as any).items) ? (contLodOp as any).items : [];
          if (newItems.length === 0) break;

          currentItems = [...currentItems, ...newItems];
          (lodOp as any).items = currentItems;
        }

        if (totalUsage && llmRes.usage) {
          llmRes.usage = totalUsage;
        }
      }
    }

    const customApplied = applyIndexedCustomAppOps(form, sectionId, filteredOps);
    const appliedPaths = customApplied ?? applyOps(form, filteredOps);

    if (appliedPaths.length === 0) {
      return {
        ok: false,
        appliedPaths: [],
        opCount: 0,
        error: `Could not apply ${meta.title} updates to the draft.`,
        usage: llmRes.usage,
      };
    }

    const firstListOp = filteredOps.find((o) => o.kind === "list");
    const actualEntryCount =
      firstListOp && Array.isArray((firstListOp as any).items)
        ? (firstListOp as any).items.length
        : null;

    const accurateMessage =
      actualEntryCount != null
        ? `Imported ${actualEntryCount} chronological entr${actualEntryCount === 1 ? "y" : "ies"} into ${meta.title} with verbatim text and annexure mapping.`
        : (llmRes.proposal.message || `Imported ${meta.title} verbatim from ${extracted.fileName}.`);

    const verbatimUsage = llmRes.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const verbatimNotif: MayurStepNotification = {
      sectionId,
      sectionTitle: meta.title,
      ok: true,
      fieldsApplied: appliedPaths,
      opCount: appliedPaths.length,
      inputTokens: verbatimUsage.inputTokens,
      outputTokens: verbatimUsage.outputTokens,
      totalTokens: verbatimUsage.totalTokens,
      truncated: Boolean(llmRes.truncated),
    };
    opts.onSectionComplete?.(verbatimNotif);

    return {
      ok: true,
      appliedPaths,
      opCount: appliedPaths.length,
      message: accurateMessage,
      usage: llmRes.usage,
      truncated: Boolean(llmRes.truncated),
      sectionResults: [verbatimNotif],
    };
  }

  // ── Mode [ii]: Master Multi-Pass Construction from Raw Material ────────────
  if (mode === "construct" && sectionId === "master") {
    const draftMode = draftModeFor(courtType);
    const pipeline: MayurSectionId[] =
      draftMode === "WritPetitionDHC"
        ? ["parties", "deponent", "lod", "reliefs", "facts", "synopsis", "grounds"]
        : draftMode === "OriginalApplicationCAT"
        ? ["parties", "deponent", "oa-jurisdiction", "lod", "reliefs", "facts", "synopsis", "grounds"]
        : ["impugned", "parties", "deponent", "lod", "synopsis", "grounds", "qol", "interim", "proforma"];

    const allApplied: string[] = [];
    const appliedSections: string[] = [];
    const sectionResults: MayurStepNotification[] = [];
    let totalOps = 0;
    let totalIn = 0;
    let totalOut = 0;

    for (let i = 0; i < pipeline.length; i++) {
      const stepSec = pipeline[i];
      const stepMeta = getMayurSectionMeta(stepSec, courtType);
      onStatus?.(`Step ${i + 1}/${pipeline.length}: Constructing ${stepMeta.title}…`);

      const freshSnapshot = form.getValues();
      // Exclude the section currently being drafted from context so the model
      // is never told "Do NOT re-draft" for the very section it must construct.
      const secSpec = sectionById(draftMode, stepSec);
      const contextSecIds = sectionsFor(draftMode)
        .map((s) => s.id)
        .filter((id) => id !== stepSec && (!secSpec || id !== secSpec.id));
      const ctxBlock = renderContext(draftMode, freshSnapshot, contextSecIds);
      const sys = buildSystemPrompt({ courtType: draftMode });
      const baseUsr = buildConstructFromRawPrompt(stepSec, courtType, partyRoleHint, userGuidance);
      const usr = ctxBlock ? `${ctxBlock}\n\n${baseUsr}` : baseUsr;

      const stepRes = await runSingleLlmCall(
        sys,
        usr,
        contextDir,
        (sub) => onStatus?.(`Step ${i + 1}/${pipeline.length} (${stepMeta.title}): ${sub}`),
        stepMeta.targetPaths[0]
      );

      totalIn += stepRes.usage?.inputTokens || 0;
      totalOut += stepRes.usage?.outputTokens || 0;

      if (stepRes.cancelled || stepRes.needsKey) {
        return {
          ok: allApplied.length > 0,
          appliedPaths: allApplied,
          opCount: totalOps,
          error: stepRes.error,
          needsKey: stepRes.needsKey,
          cancelled: stepRes.cancelled,
          usage: {
            inputTokens: totalIn,
            outputTokens: totalOut,
            totalTokens: totalIn + totalOut,
          },
          sectionResults,
        };
      }

      const wasTruncated = Boolean(stepRes.truncated);
      let stepInput = stepRes.usage?.inputTokens || 0;
      let stepOutput = stepRes.usage?.outputTokens || 0;
      let stepTotal = stepInput + stepOutput;

      let stepOk = false;
      let stepPaths: string[] = [];
      let stepOpCount = 0;
      const stepReasonsFailed: string[] = [];
      const stepSkippedNotes: string[] = [];

      if (stepRes.ok && stepRes.proposal) {
        const validated = validateProposal(stepRes.proposal);
        if (validated.rejected.length > 0) {
          for (const rej of validated.rejected) {
            stepSkippedNotes.push(`${rej.path} (${rej.reason})`);
          }
        }
        const allowedPaths = stepMeta.targetPaths;
        const ops = validated.valid.filter((o) => {
          if (allowedPaths.length === 0) return true;
          return allowedPaths.some(
            (p) => o.path === p || o.path.startsWith(p + ".") || p.startsWith(o.path + ".")
          );
        });
        if (ops.length > 0) {
          if (stepSec === "lod") {
            const ext = await extendListTimelineIfNeeded(
              ops,
              freshSnapshot,
              sys,
              usr,
              contextDir,
              (sub) => onStatus?.(`Step ${i + 1}/${pipeline.length} (List of Dates): ${sub}`)
            );
            stepInput += ext.addedIn;
            stepOutput += ext.addedOut;
            stepTotal += ext.addedIn + ext.addedOut;
            totalIn += ext.addedIn;
            totalOut += ext.addedOut;
          } else if (stepSec === "grounds") {
            const ext = await extendGroundsIfNeeded(
              ops,
              wasTruncated,
              Boolean(validated.hadTruncatedItem),
              sys,
              usr,
              contextDir,
              (sub) => onStatus?.(`Step ${i + 1}/${pipeline.length} (Grounds): ${sub}`)
            );
            stepInput += ext.addedIn;
            stepOutput += ext.addedOut;
            stepTotal += ext.addedIn + ext.addedOut;
            totalIn += ext.addedIn;
            totalOut += ext.addedOut;
          }

          // If interim reliefs/prayers/grounds were drafted, ensure wantsInterimRelief is set to true
          if (stepSec === "interim" && !ops.some((o) => o.path === "wantsInterimRelief")) {
            ops.push({ kind: "scalar", path: "wantsInterimRelief", value: true });
          }
          const paths = applyOps(form, ops);
          allApplied.push(...paths);
          appliedSections.push(stepMeta.title);
          totalOps += ops.length;
          stepOk = true;
          stepPaths = paths;
          stepOpCount = ops.length;
        } else {
          stepReasonsFailed.push(
            validated.valid.length > 0
              ? `Operations outside allowed scope (${validated.valid.map((o) => o.path).join(", ")})`
              : "No fillable details found in case material for this section."
          );
        }
      } else {
        stepReasonsFailed.push(stepRes.error || "Model returned no matching operations.");
      }

      const stepNotification: MayurStepNotification = {
        sectionId: stepSec,
        sectionTitle: stepMeta.title,
        ok: stepOk,
        fieldsApplied: stepPaths,
        opCount: stepOpCount,
        inputTokens: stepInput,
        outputTokens: stepOutput,
        totalTokens: stepTotal,
        truncated: wasTruncated,
        reasonsFailed: stepReasonsFailed.length > 0 ? stepReasonsFailed : undefined,
        skippedNotes: stepSkippedNotes.length > 0 ? stepSkippedNotes : undefined,
      };

      sectionResults.push(stepNotification);
      opts.onSectionComplete?.(stepNotification);

      // Add a 3s socket breathing pause between steps so token rate limits reset smoothly
      if (i < pipeline.length - 1) {
        onStatus?.(`Pacing for next section…`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    const masterUsage: MayurUsage = {
      inputTokens: totalIn,
      outputTokens: totalOut,
      totalTokens: totalIn + totalOut,
    };

    if (allApplied.length === 0) {
      return {
        ok: false,
        appliedPaths: [],
        opCount: 0,
        error: "Mayur could not construct fields from the supplied files.",
        usage: masterUsage,
        sectionResults,
      };
    }

    const uniqueSections = Array.from(new Set(appliedSections));
    const uniqueFields = Array.from(new Set(allApplied));
    return {
      ok: true,
      appliedPaths: uniqueFields,
      opCount: totalOps,
      message: `Master Mayur constructed ${uniqueSections.length} section${uniqueSections.length === 1 ? "" : "s"} (${uniqueFields.length} field${uniqueFields.length === 1 ? "" : "s"}) from your case material.`,
      usage: masterUsage,
      sectionResults,
    };
  }

  // ── Mode [ii] Single-Section Construct OR Mode [iii] Derive from Fields ───
  onStatus?.(
    mode === "derive"
      ? `Constructing ${meta.title} from existing project fields…`
      : `Reading case material and constructing ${meta.title}…`
  );

  const draftMode = draftModeFor(courtType);
  const secSpec = sectionById(draftMode, sectionId);
  const contextSecIds = sectionsFor(draftMode)
    .map((s) => s.id)
    .filter((id) => id !== sectionId && (!secSpec || id !== secSpec.id));
  const ctxBlock = renderContext(draftMode, currentValues, contextSecIds);
  const systemPrompt = buildSystemPrompt({ courtType: draftMode });
  const rawUserPrompt =
    mode === "derive"
      ? buildDeriveFromFieldsPrompt(sectionId, courtType, userGuidance)
      : buildConstructFromRawPrompt(sectionId, courtType, partyRoleHint, userGuidance);
  const userPrompt = ctxBlock ? `${ctxBlock}\n\n${rawUserPrompt}` : rawUserPrompt;

  const llmRes = await runSingleLlmCall(
    systemPrompt,
    userPrompt,
    mode === "construct" ? contextDir : undefined,
    onStatus,
    meta.targetPaths[0]
  );

  const wasTruncated = Boolean(llmRes.truncated);
  let inputTokens = llmRes.usage?.inputTokens || 0;
  let outputTokens = llmRes.usage?.outputTokens || 0;
  let totalTokens = inputTokens + outputTokens;

  if (!llmRes.ok || !llmRes.proposal) {
    const failNotif: MayurStepNotification = {
      sectionId,
      sectionTitle: meta.title,
      ok: false,
      fieldsApplied: [],
      opCount: 0,
      inputTokens,
      outputTokens,
      totalTokens,
      truncated: wasTruncated,
      reasonsFailed: [llmRes.error || "Mayur could not complete the request."],
    };
    opts.onSectionComplete?.(failNotif);

    return {
      ok: false,
      appliedPaths: [],
      opCount: 0,
      error: llmRes.error,
      needsKey: llmRes.needsKey,
      cancelled: llmRes.cancelled,
      usage: llmRes.usage,
      truncated: wasTruncated,
      sectionResults: [failNotif],
    };
  }

  const validated = validateProposal(llmRes.proposal);
  const skippedNotes = validated.rejected.map((r) => `${r.path} (${r.reason})`);
  const filteredOps =
    meta.targetPaths.length > 0
      ? validated.valid.filter((op) =>
          meta.targetPaths.some(
            (p) => op.path === p || op.path.startsWith(p + ".") || p.startsWith(op.path + ".")
          )
        )
      : validated.valid;

  if (sectionId === "interim" && filteredOps.length > 0 && !filteredOps.some((o) => o.path === "wantsInterimRelief")) {
    filteredOps.push({ kind: "scalar", path: "wantsInterimRelief", value: true });
  }

  if (filteredOps.length > 0) {
    if (sectionId === "lod" && mode === "construct") {
      const ext = await extendListTimelineIfNeeded(
        filteredOps,
        currentValues,
        systemPrompt,
        userPrompt,
        contextDir,
        onStatus
      );
      inputTokens += ext.addedIn;
      outputTokens += ext.addedOut;
      totalTokens += ext.addedIn + ext.addedOut;
    } else if (sectionId === "grounds" && mode === "construct") {
      const ext = await extendGroundsIfNeeded(
        filteredOps,
        wasTruncated,
        Boolean(validated.hadTruncatedItem),
        systemPrompt,
        userPrompt,
        contextDir,
        onStatus
      );
      inputTokens += ext.addedIn;
      outputTokens += ext.addedOut;
      totalTokens += ext.addedIn + ext.addedOut;
    }
  }

  if (filteredOps.length === 0) {
    const emptyNotif: MayurStepNotification = {
      sectionId,
      sectionTitle: meta.title,
      ok: false,
      fieldsApplied: [],
      opCount: 0,
      inputTokens,
      outputTokens,
      totalTokens,
      truncated: wasTruncated,
      reasonsFailed: [
        validated.valid.length > 0
          ? `Operations were outside the target scope (${validated.valid.map((o) => o.path).join(", ")})`
          : `Mayur did not find matching facts to populate ${meta.title}.`,
      ],
      skippedNotes: skippedNotes.length > 0 ? skippedNotes : undefined,
    };
    opts.onSectionComplete?.(emptyNotif);

    return {
      ok: false,
      appliedPaths: [],
      opCount: 0,
      error: `Mayur did not return valid operations for ${meta.title}.`,
      usage: llmRes.usage,
      truncated: wasTruncated,
      sectionResults: [emptyNotif],
    };
  }

  const customApplied = applyIndexedCustomAppOps(form, sectionId, filteredOps);
  const appliedPaths = customApplied ?? applyOps(form, filteredOps);

  const succNotif: MayurStepNotification = {
    sectionId,
    sectionTitle: meta.title,
    ok: true,
    fieldsApplied: appliedPaths,
    opCount: filteredOps.length,
    inputTokens,
    outputTokens,
    totalTokens,
    truncated: wasTruncated,
    skippedNotes: skippedNotes.length > 0 ? skippedNotes : undefined,
  };
  opts.onSectionComplete?.(succNotif);

  return {
    ok: true,
    appliedPaths,
    opCount: filteredOps.length,
    message: llmRes.proposal.message || `Constructed ${meta.title}.`,
    usage: llmRes.usage,
    truncated: wasTruncated,
    sectionResults: [succNotif],
  };
}

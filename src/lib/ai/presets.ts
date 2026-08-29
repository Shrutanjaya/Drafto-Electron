// ── Preset quick-action prompts ──────────────────────────────────────────────
// One-click task launchers shown in Mayur's menu. Each `prompt` is a complete,
// carefully-worded playbook for that task; the Master Instructions (always in the
// system prompt) additionally enforce the global style/nomenclature/formatting/
// completeness rules, so these focus on WHAT to do for the specific task.
//
// `needsFolder` marks actions that draft/extract from the source documents (so
// the UI can hint when no folder is selected). `group` controls menu sectioning:
// the six core "Task" buttons, then "More" extras.

import type { Effort } from "./estimate";
import type { DraftMode } from "./field-catalog";

export interface Preset {
  id: string;
  label: string;
  group: "Tasks" | "More";
  prompt: string;
  effort: Effort;
  needsFolder?: boolean;
  // Recommended model for this task, used when the user hasn't explicitly picked
  // one (dropdown on "Default"). Extraction tasks → haiku (fast); nuanced
  // drafting → sonnet. The user's explicit dropdown choice always wins.
  model?: "haiku" | "sonnet" | "opus";
}

export const PRESETS: Preset[] = [
  // ── The six core tasks ──
  {
    id: "memo",
    model: "haiku",
    label: "Memo of Parties",
    group: "Tasks",
    effort: "medium",
    needsFolder: true,
    prompt:
      "Fill the Memo of Parties (Preliminary → Memo of Parties) from the lower-court paperbook.\n" +
      "- The SLP Petitioners are the parties challenging the Impugned Order. The user tells you their position in the court below (e.g. \"the appellants\", \"Petitioner No. 1 and 2\"). If the user has NOT said who the SLP Petitioners are, ask before proceeding.\n" +
      "- In the paperbook, find the section titled \"Memo of Parties\" (or \"Memorandum of Parties\", \"List of Parties\", or \"Details of Parties\") and locate the SLP Petitioners there.\n" +
      "- Fill the SLP Petitioners into Petitioners in the SAME order they appear in the paperbook: Name (Title Case) in the first field, full address in the second, and their exact designation WITH number in the court below in the third (e.g. \"Appellant No. 1\", \"Respondent No. 3\", \"Applicant No. 2\", \"Petitioner No. 1\").\n" +
      "- Then fill EVERY other party from the paperbook's memo of parties into Respondents, keeping their original designation+number in the third field — EXCEPT for ordering: list the second-side parties (the Respondents / opposite parties in the court below) en bloc FIRST, then the first-side parties (Petitioners/Appellants/Applicants).\n" +
      "- Do not omit anyone.",
  },
  {
    id: "impugned",
    model: "haiku",
    label: "Impugned Order(s)",
    group: "Tasks",
    effort: "medium",
    needsFolder: true,
    prompt:
      "Fill Preliminary → Impugned Order(s) from the lower-court paperbook and the Impugned Order.\n" +
      "- Case type (Civil/Criminal): infer from the lower-court case nomenclature (e.g. Writ Petition (C) → Civil; Writ Petition (Crl.) → Criminal). If unclear, read the prayer of the lower-court case — if it sought bail, setting aside a conviction/penal sentence, parole/furlough, re-investigation, registration/transfer of an FIR/investigation, or any relief concerning the State's criminal-law machinery → Criminal; otherwise Civil.\n" +
      "- Order type: if the impugned document is titled \"Judgment\" → \"Final Judgment and Order\". If titled \"Order\" → if it finally disposes of the case → \"Final Order\", else → \"Interim Order\".\n" +
      "- Date: the Impugned Order's date (usually appears at the start and the end) — locate and set it.\n" +
      "- Court: set the High Court's name (evident from the paperbook and the Impugned Order).\n" +
      "- Case number (from the Impugned Order): if the order was passed in an application WITHIN the main matter (not the main matter itself), use e.g. \"IA No. 15/2026 in Writ Petition (C) No. 1572/2026\"; otherwise just the main-matter number e.g. \"Writ Petition (C) No. 1572/2026\". If a batch of matters was disposed of by a common judgment, append \" and batch\" to YOUR petition number from the paperbook; if your number isn't stated, identify it by matching the cause title against the list of cases in the judgment — if still unclear, ask the user for their petition number.\n" +
      "- \"by which\" (effect): one line stating what the High Court did to the SLP Petitioners' detriment by the Impugned Order (e.g. \"the Hon'ble High Court has dismissed the Petitioner's bail application\"; \"... has denied the benefit of regularisation to the Petitioners\"; \"... has refused to reject the plaint under Order 7 Rule 11 CPC\").\n" +
      "- Contents of Para 1A: fill ONLY if the Impugned Order was passed by a SINGLE judge (check the signatures). If single-judge, the user must tell you whether an intra-court appeal lies: if NO intra-court appeal lies, set intraCourtAppealStatus to \"no_appeal_lies\"; if one lies but is being bypassed, set it to \"appeal_lies_but\" and fill intraCourtAppealReason explaining why the SLP Petitioners are filing the SLP directly — ask the user for this reason if not provided.\n" +
      "- Para 1B: leave blank unless the user specifically asks; if they do, ask what it should say.",
  },
  {
    id: "deponent",
    model: "haiku",
    label: "Deponent",
    group: "Tasks",
    effort: "small",
    needsFolder: true,
    prompt:
      "Fill Preliminary → Deponent from the lower-court paperbook.\n" +
      "- Use the FIRST SLP Petitioner as the deponent by default (no need to confirm), unless the user specified someone else.\n" +
      "- Find the deponent's details from the paperbook — the memo of parties or the affidavits supporting the petition (name, relationship, father's/husband's name, address, age, role).\n" +
      "- If anything is missing (commonly the father's/husband's name, or the current signing location when different from the address), ask the user for it.",
  },
  {
    id: "lod",
    model: "haiku",
    label: "List of Dates",
    group: "Tasks",
    effort: "large",
    needsFolder: true,
    prompt:
      "Draft Petition → List of Dates from the lower-court paperbook and the Impugned Order.\n" +
      "- If the SLP Petitioners filed the lower-court case (they were not respondents): construct the List of Dates primarily from the paperbook's own \"List of Dates\" and \"Facts of the Case\", refined with the facts in the Impugned Order.\n" +
      "- Otherwise: construct it by reading the paperbook and ESPECIALLY any documents/affidavits/replies the SLP Petitioners filed in the court below, together with the Impugned Order.\n" +
      "- MOST IMPORTANT: the List of Dates is NOT a mechanical narration of events — it is the most persuasive part of the brief. Written well, a reader should finish it convinced the SLP Petitioners have suffered injustice, with few or no legal arguments. Narrate the story to that effect. NEVER use strong language against any court or judge — attack the Judgment/Order, never the court that passed it.\n" +
      "- Fill each row's Date and Particulars. The Particulars describe the EVENT only.\n" +
      "- For EVERY date that has a corresponding document in the source folder, record that document as an annexure IN THAT ROW'S ANNEXURE ENTRY — its description/title, date, copy type, custom text and AD checkbox. NEVER put an annexure's description in the Particulars/event text. Include documents even for dates not mentioned in the lower-court facts/List of Dates, unless irrelevant. EVERY document annexed in the lower-court paperbook MUST be annexed with the SLP (regardless of relevance) — each one gets a date+particulars row with its annexure entry. Take descriptions from where they were described in the paperbook's petition; if absent, construct them by reading the document.\n" +
      "- AD checkbox: tick ONLY for documents that were NOT before the lower court (separately supplied by the client).",
  },
  {
    id: "grounds-qol",
    model: "sonnet",
    label: "Grounds & Questions of Law",
    group: "Tasks",
    effort: "large",
    needsFolder: true,
    prompt:
      "Draft Petition → Grounds, then Petition → Questions of Law, from the Impugned Order and the lower-court paperbook. These tell the Court why the Impugned Order is perverse and must be set aside.\n" +
      "- If the SLP Petitioners filed the lower-court case: the Grounds can be lifted from the paperbook plus the parts of the Impugned Order narrating the SLP Petitioners' arguments (rephrase / present them better where you can, but leave NO ground out).\n" +
      "- Otherwise: construct the Grounds by reading the Impugned Order FIRST (Grounds are reasons it should be set aside), then drawing challenges from the paperbook and your own factual and legal reasoning.\n" +
      "- Frame every ground around the Impugned Order, never the court. Do not number the grounds.\n" +
      "- THEN draft the Questions of Law from the Grounds (the Grounds are answers to the Questions of Law). You need not have as many Questions as Grounds — usually 2-3 suffice unless the matter is very bulky. Do not number them.",
  },
  {
    id: "interim",
    model: "sonnet",
    label: "Interim Relief",
    group: "Tasks",
    effort: "medium",
    needsFolder: true,
    prompt:
      "Fill Petition → Interim Relief.\n" +
      "- FIRST, if the user hasn't already told you, ask whether they want interim relief; if yes, ask what — offer two choices: \"Stay of the Impugned Judgment/Order\" or \"Custom\". If Custom, take their wording but use it verbatim ONLY if it is drafted with surgical precision and sufficient detail; otherwise redraft it to that precision.\n" +
      "- Tick the Include checkbox (set wantsInterimRelief = true).\n" +
      "- Complete the three template grounds for interim relief — prima facie case, balance of convenience, and irreparable injury — tailored to this case.\n" +
      "- There can be ONLY ONE prayer for interim relief (the Supreme Court's prescribed format). If the user demands more than one interim relief, correct them and keep it to a single prayer.",
  },

  // ── More (extras) ──
  {
    id: "synopsis",
    model: "sonnet",
    label: "Synopsis",
    group: "More",
    effort: "large",
    needsFolder: true,
    prompt: "Draft the Synopsis for this SLP based on the source documents, written with the overall intent of challenging the Impugned Order.",
  },
  {
    id: "listing",
    model: "haiku",
    label: "Listing Proforma",
    group: "More",
    effort: "small",
    needsFolder: true,
    prompt:
      "Fill up the Listing Proforma general details from the source documents: the parties' phone numbers and emails (if available), and the main and sub category of the matter.",
  },
  {
    id: "annexures",
    model: "haiku",
    label: "Split & attach Annexures",
    group: "More",
    effort: "medium",
    needsFolder: true,
    prompt:
      "Identify every document in the source PDFs that should be annexed with this SLP (each document that formed part of the High Court record), and produce the documents map — for each, its source file, page range, a short title and its date — so Drafto can split and attach them. Mark anything not part of the High Court record as an Additional Document. Do not assign annexure numbers. (Note: this splits and attaches PDFs and so consumes many more tokens.)",
  },
];

// ── Writ Petition (Delhi HC) presets ─────────────────────────────────────────
export const WP_PRESETS: Preset[] = [
  {
    id: "memo",
    model: "haiku",
    label: "Parties & Details",
    group: "Tasks",
    effort: "medium",
    needsFolder: true,
    prompt:
      "Fill Preliminary → Parties and Petition Details from the source documents.\n" +
      "- Petitioners: the party/parties filing this writ petition, in order, Name (Title Case) + full address. If the user hasn't said who the petitioners are and it isn't evident, ask before proceeding.\n" +
      "- Respondents: every authority/party against whom relief is sought, in order. Government respondents get their \"through\" service designation in the through field (e.g. \"Through the Secretary, Ministry of …\", \"Through its Standing Counsel\") — never inside the name or address.\n" +
      "- Petition type (caseType): Criminal only if the writ concerns the criminal-law machinery (FIR, investigation, bail, custody, sentence); otherwise Civil.\n" +
      "- Constitutional basis (wp.articleBasis): 226 read with 227 when a court/tribunal order is challenged; 226 for other state action; 227 alone only for pure supervisory challenges.\n" +
      "- Mark the challenged order's annexure isImpugnedOrder if the writ challenges a specific order.",
  },
  {
    id: "deponent",
    model: "haiku",
    label: "Deponent",
    group: "Tasks",
    effort: "small",
    needsFolder: true,
    prompt:
      "Fill Preliminary → Deponent from the source documents.\n" +
      "- Use the FIRST Petitioner as the deponent by default (no need to confirm), unless the user specified someone else.\n" +
      "- For a company/organisation petitioner, the deponent is a natural person — set deponent.role to the matching representative capacity (e.g. Authorised Representative of the Petitioner).\n" +
      "- Find name, relationship, father's/spouse's name, address and age from the documents; ask for whatever is genuinely missing.",
  },
  {
    id: "lod",
    model: "haiku",
    label: "List of Dates",
    group: "Tasks",
    effort: "large",
    needsFolder: true,
    prompt:
      "Draft Petition → List of Dates from the source documents.\n" +
      "- MOST IMPORTANT: the List of Dates is NOT a mechanical narration — written well, a reader should finish it convinced the Petitioners have suffered injustice. Narrate the story to that effect. NEVER use strong language against any court or judge — attack the order/action, never its author.\n" +
      "- Fill each row's Date and Particulars. The Particulars describe the EVENT only — in a writ petition the annexure sentences are printed in the FACTS section, so NEVER describe an annexure in the Particulars.\n" +
      "- For EVERY date that has a corresponding document in the sources, record that document in THAT ROW'S ANNEXURE ENTRY (title, date, copy type). In an impugned-order writ, mark the impugned order's annexure entry isImpugnedOrder true (it becomes Annexure P-1).\n" +
      "- After the List of Dates is settled, the user can generate the Facts section from it (or ask you to draft/refine wp.facts).",
  },
  {
    id: "grounds",
    model: "sonnet",
    label: "Grounds",
    group: "Tasks",
    effort: "large",
    needsFolder: true,
    prompt:
      "Draft Petition → Grounds from the source documents. These tell the Court why the impugned order/action is illegal, arbitrary or perverse and must be interfered with under Articles 226/227.\n" +
      "- Cover jurisdictional error, violation of natural justice, arbitrariness/Article 14, perversity, and the specific legal errors the sources disclose — grounded in the record, not boilerplate.\n" +
      "- Frame every ground around the impugned order/action, never the court or officer. Do not number the grounds.",
  },
  {
    id: "reliefs",
    model: "sonnet",
    label: "Reliefs",
    group: "Tasks",
    effort: "medium",
    needsFolder: true,
    prompt:
      "Draft Petition → Reliefs (wp.reliefs) — the single source of truth for the reliefs block and the PRAYERS paragraph.\n" +
      "- One relief per row, plain prose, no lettering. Precise, executable writ language (certiorari/mandamus substance without needing the Latin): quash-and-set-aside, direct the respondent to …, declare ….\n" +
      "- In an impugned-order writ, the FIRST relief must seek to quash and set aside the impugned order, citing its annexure — e.g. \"Quash and set aside the Order dated 01.01.2020 [Annexure P-1]\".\n" +
      "- Keep the residuary prayer (\"Pass any such other order(s) as this Hon'ble Court may deem fit in the facts and circumstances of this case.\") as the LAST row.\n" +
      "- If a stay of the impugned order is wanted, that is the separate Stay CM (wp.cms.stay) — set it active and tailor its body paragraphs; do NOT add a stay prayer to the reliefs.",
  },
  {
    id: "facts",
    model: "sonnet",
    label: "Facts (from List of Dates)",
    group: "Tasks",
    effort: "medium",
    needsFolder: false,
    prompt:
      "Draft/refine Petition → Facts (wp.facts) from the CURRENT List of Dates in the form (read the field values I've described; ask me to paste the List of Dates only if you cannot see it).\n" +
      "- Produce an HTML ordered list — <ol><li>…</li></ol> — with ONE <li> per List-of-Dates row, in order. Each <li> is flowing prose (\"On 12.03.2021, the Petitioner …\") ending with that row's annexure sentence(s): \"Annexure P-N is a true copy of … dated ….\" (the impugned order is P-1, other annexures P-2 onwards in row order).\n" +
      "- EXCEPTION: do NOT write an annexure sentence for the impugned order itself — its sentence prints in Para 1 automatically. Facts only carries the sentences for the other annexures (P-2 onwards).\n" +
      "- Improve connectives, flow and persuasion; do not change the facts, the row order, or the annexure sentences' substance.",
  },

  // ── More (extras) ──
  {
    id: "synopsis",
    model: "sonnet",
    label: "Synopsis",
    group: "More",
    effort: "large",
    needsFolder: true,
    prompt: "Draft the Synopsis for this writ petition based on the source documents, written to persuade this Hon'ble Court that the impugned order/action is unsustainable.",
  },
  {
    id: "cms",
    model: "sonnet",
    label: "CM Applications",
    group: "More",
    effort: "medium",
    needsFolder: false,
    prompt:
      "Set up Applications (CMs) for this writ petition.\n" +
      "- Stay CM (impugned-order writs): if the user wants a stay, set wp.cms.stay.active true and tailor its body paragraphs (prima facie case, balance of convenience, irreparable injury) to this case; keep the residuary prayer last.\n" +
      "- Lengthy Synopsis CM: activate only if the Synopsis & List of Dates are genuinely lengthy.\n" +
      "- Exemption-from-copies CM: activate when annexures include illegible/uncertified copies.\n" +
      "- Any other application goes in wp.customCms (title + \"praying that\" para + grounds + prayers). Ask the user which CMs they want if it isn't evident.",
  },
  {
    id: "annexures",
    model: "haiku",
    label: "Split & attach Annexures",
    group: "More",
    effort: "medium",
    needsFolder: true,
    prompt:
      "Identify every document in the source PDFs that should be annexed with this writ petition, and produce the documents map — for each, its source file, page range, a short title and its date — so Drafto can split and attach them. In an impugned-order writ the impugned order IS an annexure (it becomes Annexure P-1): map it as type \"annexure\" and mark its List-of-Dates annexure entry isImpugnedOrder true. Do not assign annexure numbers. (Note: this splits and attaches PDFs and so consumes many more tokens.)",
  },
];

export function getPresets(mode: DraftMode): Preset[] {
  return mode === "WritPetitionDHC" ? WP_PRESETS : PRESETS;
}

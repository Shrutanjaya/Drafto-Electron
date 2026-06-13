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


type ChecklistValue = "Yes" | "No" | "NA";

// The 15-point Advocate's Checklist. `sub` renders a row indented under the
// current main number; `header` marks a display-only lead-in row (no answer, no
// schema field) — used for point 13's PIL preamble above its (a)–(e) parts.
// The main number shown next to a row is derived from its `q<N>_` name prefix.
export const checklistQueries: { name: string; label: string; options: ChecklistValue[]; sub?: boolean; header?: boolean }[] = [
    { name: "q1_form28", label: "SLP (C) has been filed in Form No. 28 with certificate.", options: ["Yes", "No"] },
    { name: "q2_orderXV", label: "The Petition is as per the provisions of Order XV Rule 1.", options: ["Yes", "No"] },
    { name: "q3_papersArranged", label: "The papers of SLP have been arranged as per Order XXI, Rule (3)(1)(f).", options: ["Yes", "No"] },
    { name: "q4_lod", label: "Brief list of dates/events has been filed.", options: ["Yes", "No"] },
    { name: "q5_numbering", label: "Paragraphs and pages of paper books have been numbered consecutively and correctly noted in Index.", options: ["Yes", "No"] },
    { name: "q6_paperBooks", label: "Proper and required number of paper books (1+1) have been filed.", options: ["Yes", "No"] },
    { name: "q7_particularsUniform", label: "The particulars of the impugned judgment passed by the court(s) below are uniformly written in all the documents.", options: ["Yes", "No"] },
    { name: "q8_certificate", label: "In case of appeal by certificate, the appeal is accompanied by judgment and decree appealed from and order granting certificate.", options: ["Yes", "No", "NA"] },
    { name: "q9_annexuresTrueCopies", label: "The Annexures referred to in the petition are true copies of the documents before the court(s) below and are filed in chronological order as per List of Dates.", options: ["Yes", "No"] },
    { name: "q10_annexuresSeparate", label: "The annexures referred to in the petition are filed and indexed separately and not marked collectively.", options: ["Yes", "No"] },
    { name: "q11_secondAppeal", label: "In SLP against the order passed in Second Appeal, copies of the orders passed by the Trial Court and First Appellate Court have been filed.", options: ["Yes", "No", "NA"] },
    { name: "q12_proforma", label: "The complete listing proforma has been filled in, signed and included in the paper books.", options: ["Yes", "No"] },
    { name: "q13_pil", label: "In a petition (PIL) filed under clause (d) of Rule 12(1) Order XXXVIII, the petitioner has disclosed:", options: [], header: true },
    { name: "q13_a", label: "(a) Full name, complete postal address, e-mail address, phone number, proof regarding personal identification, occupation, annual income, PAN number, and National Unique Identity Card number (if any).", options: ["Yes", "No", "NA"], sub: true },
    { name: "q13_b", label: "(b) The facts constituting the cause of action.", options: ["Yes", "No", "NA"], sub: true },
    { name: "q13_c", label: "(c) The nature of injury caused or likely to be caused to the public.", options: ["Yes", "No", "NA"], sub: true },
    { name: "q13_d", label: "(d) The nature and extent of personal interest, if any, of the petitioner(s).", options: ["Yes", "No", "NA"], sub: true },
    { name: "q13_e", label: "(e) Details regarding any civil, criminal or revenue litigation involving the petitioner(s) which has/could have a legal nexus with the PIL issue(s).", options: ["Yes", "No", "NA"], sub: true },
    { name: "q14_aft", label: "In case of appeals under Armed Forces Tribunal Act, 2007, the petitioner/appellant has moved before the Armed Forces Tribunal for granting certificate for leave to appeal to the Supreme Court.", options: ["Yes", "No", "NA"] },
    { name: "q15_paperbooksCured", label: "All the paperbooks to be filed after curing the defects shall be in order.", options: ["Yes", "No"] },
];

// Point 1 names the petition by its type, which differs between a civil SLP —
// "SLP (C)" — and a criminal one — "SLP (Crl.)". Everything else in the
// checklist is common to both, so only that one label is swapped.
export const getChecklistQueries = (caseType?: "Civil" | "Criminal") =>
    caseType === "Criminal"
        ? checklistQueries.map((q) =>
              q.name === "q1_form28" ? { ...q, label: q.label.replace("SLP (C)", "SLP (Crl.)") } : q
          )
        : checklistQueries;

// The attestation the advocate ticks at the top of the checklist before filing.
export const CHECKLIST_DECLARATION =
    "I have personally verified that the petition and its contents conform with the Supreme Court Rules, 2013, all checklist requirements are met, and all necessary documents for the hearing are filed.";

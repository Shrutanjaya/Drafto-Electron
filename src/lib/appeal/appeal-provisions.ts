/**
 * Reference data for the Supreme Court Appeal tool.
 *
 * Two things live here, both chosen by the case type (Civil / Criminal) and
 * both needed in more than one place:
 *
 *  1. The statutory provisions an appeal may be filed under. The user picks one
 *     in Preliminary → Impugned Order(s); the choice is printed on the cover
 *     page, in the Index and in Para 1 of the memorandum.
 *  2. The Supreme Court Rules Order and Rule the appeal is presented under,
 *     which replaces the SLP's Order XXI on the cover page.
 *
 * Keeping both here means the wording is written once. The UI reads the lists,
 * the generators read the resolvers, and neither can drift from the other.
 */

import type { DraftoProject } from "@/lib/schema";

export type AppealProvision = {
  /** Stable id stored in the project file. Never change one once shipped. */
  id: string;
  /** The wording as it should read in the document. */
  text: string;
};

/** Sentinel id for a provision the user typed themselves. */
export const APPEAL_PROVISION_OTHER = "other";

export const CRIMINAL_APPEAL_PROVISIONS: readonly AppealProvision[] = [
  {
    id: "crpc-379-bnss-420",
    text: "S.379 of the Code of Criminal Procedure, 1973 read with S.420 of the Bharatiya Nagrik Suraksha Sanhita, 2023",
  },
];

export const CIVIL_APPEAL_PROVISIONS: readonly AppealProvision[] = [
  { id: "ibc-62", text: "S.62 of the Insolvency and Bankruptcy Code, 2016" },
  { id: "electricity-125", text: "S.125 of the Electricity Act, 2003" },
  { id: "consumer-67", text: "S.67 of the Consumer Protection Act, 2019" },
  { id: "ngt-22", text: "S.22 of the National Green Tribunal Act, 2010" },
  {
    id: "scra-22f-sebi-15z",
    text: "S.22F of the Securities Contracts (Regulation) Act, 1956 read with S.15Z of the Securities and Exchange Board of India Act, 1992",
  },
];

/** The presets offered for a case type, in the order they should be listed. */
export function appealProvisionsFor(caseType: string): readonly AppealProvision[] {
  return caseType === "Criminal" ? CRIMINAL_APPEAL_PROVISIONS : CIVIL_APPEAL_PROVISIONS;
}

/**
 * The provision wording for a project, ready to drop into a sentence.
 *
 * Falls back to a visible placeholder rather than an empty string: a blank here
 * would silently produce "The present appeal is being filed under  against…",
 * which reads as finished text. "[Provision]" does not.
 */
export function appealProvisionText(projectData: DraftoProject): string {
  const chosen = projectData.appeal?.provision || "";
  if (!chosen) return "[Provision]";
  if (chosen === APPEAL_PROVISION_OTHER) {
    return projectData.appeal?.provisionCustom?.trim() || "[Provision]";
  }
  const preset = appealProvisionsFor(projectData.caseType).find(p => p.id === chosen);
  return preset?.text || projectData.appeal?.provisionCustom?.trim() || "[Provision]";
}

/**
 * The Supreme Court Rules reference printed on the Appeal cover page, replacing
 * the SLP's "Order XXI".
 */
export function appealOrderRule(caseType: string): string {
  return caseType === "Criminal" ? "Order XX Rule 2(1)" : "Order XIX Rule 3(1)";
}

/** "Civil Appeal" / "Criminal Appeal" — the cover-page and header title. */
export function appealTitle(caseType: string): string {
  return caseType === "Criminal" ? "Criminal Appeal" : "Civil Appeal";
}

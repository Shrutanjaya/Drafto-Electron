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
  /** Normal statutory limitation period in days. */
  limitationDays: number;
  /**
   * Maximum additional delay (in days) that can be condoned by the Supreme Court.
   * If undefined, condonation is governed by Section 5 of the Limitation Act
   * (sufficient cause, no statutory outer cap).
   * If specified (e.g. 15 or 60), delay beyond this outer limit cannot be condoned.
   */
  maxCondonableDays?: number;
  /** Trigger for limitation (e.g. "order", "communication", "receipt"). */
  fromTrigger?: string;
  /** Basis of the appeal. */
  basis?: string;
};

/** Sentinel id for a provision the user typed themselves. */
export const APPEAL_PROVISION_OTHER = "other";

export const CRIMINAL_APPEAL_PROVISIONS: readonly AppealProvision[] = [
  {
    id: "crpc-379-bnss-420",
    text: "S.379 of the Code of Criminal Procedure, 1973 read with S.420 of the Bharatiya Nagrik Suraksha Sanhita, 2023",
    limitationDays: 60,
    fromTrigger: "date of judgment / final order",
    basis: "Reversal of acquittal by High Court and sentencing to death or imprisonment for 10+ years / life",
  },
  {
    id: "sc-enlargement-criminal",
    text: "Section 2 of the Supreme Court (Enlargement of Criminal Appellate Jurisdiction) Act, 1970",
    limitationDays: 60,
    fromTrigger: "date of judgment / final order",
    basis: "Conviction by High Court on reversal of acquittal with 10+ years sentence",
  },
  {
    id: "contempt-19-crl",
    text: "S.19(1)(b) of the Contempt of Courts Act, 1971",
    limitationDays: 60,
    fromTrigger: "date of order",
    basis: "Order of punishment for Criminal Contempt by Division Bench of High Court",
  },
];

export const CIVIL_APPEAL_PROVISIONS: readonly AppealProvision[] = [
  // ── From Statutory List ──
  {
    id: "advocates-38",
    text: "S.38 of the Advocates Act, 1961",
    limitationDays: 60,
    fromTrigger: "date of communication of order",
    basis: "Order of Disciplinary Committee of Bar Council of India",
  },
  {
    id: "consumer-67",
    text: "S.67 of the Consumer Protection Act, 2019",
    limitationDays: 30,
    fromTrigger: "date of order",
    basis: "Order of National Consumer Disputes Redressal Commission (NCDRC)",
  },
  {
    id: "consumer-23",
    text: "S.23 of the Consumer Protection Act, 1986",
    limitationDays: 30,
    fromTrigger: "date of order",
    basis: "Order of National Consumer Disputes Redressal Commission (NCDRC)",
  },
  {
    id: "rpa-116a",
    text: "S.116-A of the Representation of the People Act, 1951",
    limitationDays: 30,
    fromTrigger: "date of order",
    basis: "Order of High Court in election petition under S.98 or S.99",
  },
  {
    id: "electricity-125",
    text: "S.125 of the Electricity Act, 2003",
    limitationDays: 60,
    maxCondonableDays: 60,
    fromTrigger: "date of communication of decision or order",
    basis: "Decision or order of APTEL on substantial question of law",
  },
  {
    id: "customs-130e",
    text: "S.130E of the Customs Act, 1962",
    limitationDays: 60,
    fromTrigger: "date of order",
    basis: "CESTAT order regarding duty rate/valuation, or HC judgment on certificate",
  },
  {
    id: "central-excise-35l",
    text: "S.35L of the Central Excise Act, 1944",
    limitationDays: 60,
    fromTrigger: "date of order",
    basis: "CESTAT order regarding duty rate/valuation, or HC judgment on certificate",
  },
  {
    id: "trai-18",
    text: "S.18 of the Telecom Regulatory Authority of India Act, 1997",
    limitationDays: 90,
    fromTrigger: "date of order",
    basis: "Order of TDSAT (not being interlocutory) on substantial question of law",
  },
  {
    id: "scra-22f-sebi-15z",
    text: "S.22F of the Securities Contracts (Regulation) Act, 1956 read with S.15Z of the Securities and Exchange Board of India Act, 1992",
    limitationDays: 60,
    maxCondonableDays: 60,
    fromTrigger: "date of communication of decision or order",
    basis: "Order or decision of SAT on question of law",
  },
  {
    id: "contempt-19",
    text: "S.19(1)(b) of the Contempt of Courts Act, 1971",
    limitationDays: 60,
    fromTrigger: "date of order",
    basis: "Order or decision of Division Bench of High Court in contempt",
  },
  {
    id: "ngt-22",
    text: "S.22 of the National Green Tribunal Act, 2010",
    limitationDays: 90,
    maxCondonableDays: 60,
    fromTrigger: "date of communication of award, decision or order",
    basis: "Award, decision or order of NGT on substantial question of law",
  },

  // ── Additional Key Supreme Court Statutory Appeals ──
  {
    id: "ibc-62",
    text: "S.62 of the Insolvency and Bankruptcy Code, 2016",
    limitationDays: 45,
    maxCondonableDays: 15,
    fromTrigger: "date of receipt of order",
    basis: "Order of NCLAT on question of law",
  },
  {
    id: "companies-423",
    text: "S.423 of the Companies Act, 2013",
    limitationDays: 60,
    maxCondonableDays: 60,
    fromTrigger: "date of receipt of order",
    basis: "Order of NCLAT on question of law",
  },
  {
    id: "competition-53t",
    text: "S.53T of the Competition Act, 2002",
    limitationDays: 60,
    maxCondonableDays: 60,
    fromTrigger: "date of communication of decision or order",
    basis: "Decision or order of Appellate Tribunal (NCLAT)",
  },
  {
    id: "pngrb-33",
    text: "S.33 of the Petroleum and Natural Gas Regulatory Board Act, 2006",
    limitationDays: 90,
    maxCondonableDays: 60,
    fromTrigger: "date of communication of order",
    basis: "Decision or order of APTEL on substantial question of law",
  },
  {
    id: "aera-31",
    text: "S.31 of the Airports Economic Regulatory Authority of India Act, 2008",
    limitationDays: 90,
    maxCondonableDays: 60,
    fromTrigger: "date of communication of order",
    basis: "Decision or order of TDSAT on substantial question of law",
  },
  {
    id: "aft-30-31",
    text: "Section 30 read with Section 31 of the Armed Forces Tribunal Act, 2007",
    limitationDays: 30,
    fromTrigger: "date of order or grant of certificate",
    basis: "Final determination of AFT on question of general public importance",
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

export interface AppealLimitationInfo {
  limitationDays: number;
  maxCondonableDays?: number;
  fromTrigger?: string;
  provisionName: string;
  hasOuterLimit: boolean;
  basis?: string;
}

/**
 * Returns limitation details for a project based on its courtType, caseType,
 * and selected appeal provision.
 */
export function getAppealLimitation(
  courtType?: string,
  caseType?: string,
  provisionId?: string,
  customProvision?: string,
): AppealLimitationInfo {
  if (courtType !== "Appeal") {
    // Standard SLP: 90 days
    return {
      limitationDays: 90,
      provisionName: "Special Leave Petition",
      hasOuterLimit: false,
    };
  }

  const provisions = appealProvisionsFor(caseType || "Civil");
  const found = provisions.find(p => p.id === provisionId);

  if (found) {
    return {
      limitationDays: found.limitationDays,
      maxCondonableDays: found.maxCondonableDays,
      fromTrigger: found.fromTrigger,
      provisionName: found.text,
      hasOuterLimit: found.maxCondonableDays != null,
      basis: found.basis,
    };
  }

  if (provisionId === APPEAL_PROVISION_OTHER && customProvision?.trim()) {
    return {
      limitationDays: caseType === "Criminal" ? 60 : 90,
      provisionName: customProvision.trim(),
      hasOuterLimit: false,
    };
  }

  // Fallback for unset provision
  return {
    limitationDays: caseType === "Criminal" ? 60 : 90,
    provisionName: caseType === "Criminal" ? "Criminal Appeal" : "Civil Appeal",
    hasOuterLimit: false,
  };
}

/**
 * The Supreme Court Rules reference printed on the Appeal cover page, replacing
 * the SLP's "Order XXI".
 */
export function appealOrderRule(caseType: string, provisionId?: string): string {
  if (caseType === "Criminal") return "Order XX Rule 2(1)";
  if (provisionId === "advocates_38") return "Order XXIII Rule 1";
  if (provisionId === "cpa_67" || provisionId === "cpa_23") return "Order XXIV Rule 1";
  if (provisionId === "hc_cert" || provisionId === "hc_certificate") return "Order XIX Rule 3(1)";
  // All other statutory civil appeals from tribunals/authorities are governed by
  // Order XIX Rule 40 of Supreme Court Rules, 2013 (which extends Order XIX to other Acts).
  return "Order XIX Rule 40";
}

/** "Civil Appeal" / "Criminal Appeal" — the cover-page and header title. */
export function appealTitle(caseType: string): string {
  return caseType === "Criminal" ? "Criminal Appeal" : "Civil Appeal";
}

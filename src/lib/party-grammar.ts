import { isAppeal } from "./court-family";

export type PartyBaseNoun = "Petitioner" | "Appellant" | "Applicant";

export interface PartyLike {
  name?: string;
}

/**
 * Counts active parties in a party list.
 * Prefers rows with a non-empty name; if no names have been typed yet,
 * falls back to the array length (minimum 1) so adding a second row in the UI
 * immediately switches to plural phrasing.
 */
export function countParties(parties?: PartyLike[] | null): number {
  if (!parties || parties.length === 0) return 1;
  const named = parties.filter((p) => (p?.name || "").trim() !== "").length;
  // If the user has added multiple party rows in the table, honour the row count
  // when at least one row is present or named count is lower only because they
  // haven't typed the second name yet.
  return Math.max(named, parties.length, 1);
}

/**
 * Resolves the effective petitioners and respondents for a project, accounting
 * for common-order party groups in SLP/Appeal projects.
 */
export function getEffectiveParties(project?: {
  isCommonOrder?: boolean;
  commonOrderParties?: Array<{ petitioners?: PartyLike[]; respondents?: PartyLike[] }>;
  petitioners?: PartyLike[];
  respondents?: PartyLike[];
} | null): { petitioners: PartyLike[]; respondents: PartyLike[] } {
  if (!project) return { petitioners: [], respondents: [] };
  const useCommon = project.isCommonOrder && (project.commonOrderParties?.length ?? 0) > 0;
  return {
    petitioners: (useCommon ? project.commonOrderParties![0]?.petitioners : project.petitioners) || [],
    respondents: (useCommon ? project.commonOrderParties![0]?.respondents : project.respondents) || [],
  };
}

/**
 * Infers whether a formatted party header ("Name", "Name & Anr.", "Name & Ors.")
 * represents multiple parties.
 */
export function isHeaderPlural(header?: string | null): boolean {
  if (!header) return false;
  return /&\s*(Anr|Ors)\.?$/i.test(header.trim());
}

export interface PartyGrammar {
  baseNoun: PartyBaseNoun;
  petCount: number;
  resCount: number;
  multiPet: boolean;
  multiRes: boolean;
  /** "Petitioner" | "Petitioners" (or Appellant/Appellants, Applicant/Applicants) */
  Pet: string;
  /** Lowercase "petitioner" | "petitioners" */
  pet: string;
  /** For "on behalf of myself and the other Petitioner(s)": singular when total=2, plural when total>=3 */
  OtherPet: string;
  /** "Respondent" | "Respondents" */
  Res: string;
  /** Lowercase "respondent" | "respondents" */
  res: string;
  /** "has" | "have" (for Petitioner/Appellant/Applicant) */
  has: string;
  /** "is" | "are" (for Petitioner/Appellant/Applicant) */
  is: string;
  /** "is" | "are" (for Respondent) */
  resIs: string;
  /** "submits" | "submit" */
  submits: string;
  /** "prays" | "pray" */
  prays: string;
  /** "undertakes" | "undertake" */
  undertakes: string;
  /** "craves" | "crave" */
  craves: string;
  /** "declares" | "declare" */
  declares: string;
  /** "he" | "they" */
  they: string;
  /** "him" | "them" */
  them: string;
  /** "Petitioner’s" | "Petitioners’" */
  possessive: string;
  /** "Vakalatnama" | "Vakalatnamas" */
  vakalatnamaLabel: string;
}

export function getPartyGrammar(
  project?: {
    courtType?: string;
    isCommonOrder?: boolean;
    commonOrderParties?: Array<{ petitioners?: PartyLike[]; respondents?: PartyLike[] }>;
    petitioners?: PartyLike[];
    respondents?: PartyLike[];
  } | null,
  overrideBaseNoun?: PartyBaseNoun,
): PartyGrammar {
  const baseNoun: PartyBaseNoun =
    overrideBaseNoun ||
    (isAppeal(project?.courtType)
      ? "Appellant"
      : project?.courtType === "OriginalApplication"
        ? "Applicant"
        : "Petitioner");

  const { petitioners, respondents } = getEffectiveParties(project);
  return buildPartyGrammarFromCounts(countParties(petitioners), countParties(respondents), baseNoun);
}

export function buildPartyGrammarFromCounts(
  petCount: number,
  resCount: number,
  baseNoun: PartyBaseNoun = "Petitioner",
): PartyGrammar {
  const multiPet = petCount > 1;
  const multiRes = resCount > 1;
  const Pet = multiPet ? `${baseNoun}s` : baseNoun;
  const OtherPet = petCount > 2 ? `${baseNoun}s` : baseNoun;
  const Res = multiRes ? "Respondents" : "Respondent";

  return {
    baseNoun,
    petCount,
    resCount,
    multiPet,
    multiRes,
    Pet,
    pet: Pet.toLowerCase(),
    OtherPet,
    Res,
    res: Res.toLowerCase(),
    has: multiPet ? "have" : "has",
    is: multiPet ? "are" : "is",
    resIs: multiRes ? "are" : "is",
    submits: multiPet ? "submit" : "submits",
    prays: multiPet ? "pray" : "prays",
    undertakes: multiPet ? "undertake" : "undertakes",
    craves: multiPet ? "crave" : "craves",
    declares: multiPet ? "declare" : "declares",
    they: multiPet ? "they" : "he",
    them: multiPet ? "them" : "him",
    possessive: multiPet ? `${baseNoun}s’` : `${baseNoun}’s`,
    vakalatnamaLabel: multiPet ? "Vakalatnamas" : "Vakalatnama",
  };
}

/**
 * Replaces residual `(s)` placeholders and adapts standard preset sentences to match
 * the active party counts. Leaves user-customized prose untouched unless it contains
 * explicit `Petitioner(s)` / `Respondent(s)` / `Appellant(s)` / `Applicant(s)` tokens.
 */
export function adaptPartyText(text: string, g: PartyGrammar): string {
  if (!text) return text;
  let out = text;

  // Replace explicit "(s)" tokens if present
  out = out
    .replace(/\b(Petitioner|Appellant|Applicant)\(s\)\s+have\b/g, `${g.Pet} ${g.has}`)
    .replace(/\b(Petitioner|Appellant|Applicant)\(s\)\s+has\b/g, `${g.Pet} ${g.has}`)
    .replace(/\b(Petitioner|Appellant|Applicant)\(s\)\s+are\b/g, `${g.Pet} ${g.is}`)
    .replace(/\b(Petitioner|Appellant|Applicant)\(s\)\s+is\b/g, `${g.Pet} ${g.is}`)
    .replace(/\b(Petitioner|Appellant|Applicant)\(s\)\s+undertake\(s\)/g, `${g.Pet} ${g.undertakes}`)
    .replace(/\b(Petitioner|Appellant|Applicant)\(s\)\s+undertakes?\b/g, `${g.Pet} ${g.undertakes}`)
    .replace(/\bPetitioner\(s\)/g, g.baseNoun === "Petitioner" ? g.Pet : g.Pet)
    .replace(/\bAppellant\(s\)/g, g.Pet)
    .replace(/\bApplicant\(s\)/g, g.Pet)
    .replace(/\bRespondent\(s\)/g, g.Res)
    .replace(/\bundertake\(s\)/g, g.undertakes);

  // Also adapt known unedited preset sentences when switching between 1 and 2+ parties
  const stripTags = (s: string) => s.replace(/^<p>|<\/p>$/gi, "").trim();
  const hasWrapP = /^<p>[\s\S]*<\/p>$/i.test(out.trim());
  const bare = stripTags(out);

  const presets: Array<{ re: RegExp; build: (g: PartyGrammar) => string }> = [
    {
      re: /^The (?:Petitioner|Petitioners|Appellant|Appellants)(?:\(s\))? (?:has|have) a strong prima facie case for the grounds mentioned above\.$/i,
      build: (gr) => `The ${gr.Pet} ${gr.has} a strong prima facie case for the grounds mentioned above.`,
    },
    {
      re: /^The balance of convenience is in favour of the (?:Petitioner|Petitioners|Appellant|Appellants)(?:\(s\))?\. No inconvenience would be caused to the (?:Respondent|Respondents)(?:\(s\))? if the interim reliefs were granted, whereas huge inconvenience and injury would be caused to the (?:Petitioner|Petitioners|Appellant|Appellants)(?:\(s\))? if the interim relief prayed for were not granted\.$/i,
      build: (gr) =>
        `The balance of convenience is in favour of the ${gr.Pet}. No inconvenience would be caused to the ${gr.Res} if the interim reliefs were granted, whereas huge inconvenience and injury would be caused to the ${gr.Pet} if the interim relief prayed for were not granted.`,
    },
    {
      re: /^Irreparable injury would be caused to the (?:Petitioner|Petitioners|Appellant|Appellants)(?:\(s\))? if the interim relief prayed for were not granted\.$/i,
      build: (gr) => `Irreparable injury would be caused to the ${gr.Pet} if the interim relief prayed for were not granted.`,
    },
    {
      re: /^The (?:Petitioner|Petitioners) (?:has|have) a strong prima facie case and the balance of convenience lies in favour of the (?:Petitioner|Petitioners)\. Irreparable injury would be caused to the (?:Petitioner|Petitioners) if the operation of the Impugned Order is not stayed during the pendency of the writ petition\.$/i,
      build: (gr) =>
        `The ${gr.Pet} ${gr.has} a strong prima facie case and the balance of convenience lies in favour of the ${gr.Pet}. Irreparable injury would be caused to the ${gr.Pet} if the operation of the Impugned Order is not stayed during the pendency of the writ petition.`,
    },
    {
      re: /^Permit the (?:Petitioner|Petitioners) to file a lengthy Synopsis and List of Dates and exempt the (?:Petitioner|Petitioners) from complying with the applicable rules pertaining to filing a brief Synopsis and List of Dates; and$/i,
      build: (gr) =>
        `Permit the ${gr.Pet} to file a lengthy Synopsis and List of Dates and exempt the ${gr.Pet} from complying with the applicable rules pertaining to filing a brief Synopsis and List of Dates; and`,
    },
    {
      re: /^The annexures to the writ petition are being filed on an urgent basis; some may not be legible or clear, or available as certified or true typed copies with the prescribed margins and spacing\. The (?:Petitioner|Petitioners) (?:undertakes|undertake) to furnish clear\/typed copies of the same if so directed by this Hon[’']ble Court\.$/i,
      build: (gr) =>
        `The annexures to the writ petition are being filed on an urgent basis; some may not be legible or clear, or available as certified or true typed copies with the prescribed margins and spacing. The ${gr.Pet} ${gr.undertakes} to furnish clear/typed copies of the same if so directed by this Hon’ble Court.`,
    },
    {
      re: /^Exempt the (?:Petitioner|Petitioners) from filing legible\/clear copies, certified copies or true typed copies of the annexures to the writ petition; and$/i,
      build: (gr) =>
        `Exempt the ${gr.Pet} from filing legible/clear copies, certified copies or true typed copies of the annexures to the writ petition; and`,
    },
  ];

  for (const preset of presets) {
    if (preset.re.test(bare)) {
      const updated = preset.build(g);
      return hasWrapP ? `<p>${updated}</p>` : updated;
    }
  }

  return out;
}

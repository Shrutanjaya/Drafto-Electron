/**
 * Court-type families.
 *
 * Some document types are copies of another: the Supreme Court Appeal is the
 * SLP tool with an appeal cover and a Facts section, and the PIL writ petition
 * is the Article 32 writ petition with PIL-specific wording. Shared components
 * (the header's export menu, the PDF dialog, the annexure dialog) branch on the
 * FAMILY rather than on a single court type, so a copied tool inherits every
 * behaviour of its parent automatically and only its deliberate differences
 * have to be written down.
 *
 * Test with these helpers rather than comparing courtType directly. A bare
 * `courtType === "WritPetitionSC"` silently excludes the PIL variant, which is
 * how a copied tool quietly loses half its features.
 */

import type { DraftoProject, LodTableItem, Annexure } from "@/lib/schema";
import { newBlankProject } from "@/lib/project-defaults";

export type ProjectCourtType = DraftoProject["courtType"];

/** The Supreme Court Article 32 writ petition and its PIL variant. */
export function isScWpFamily(courtType?: ProjectCourtType | string): boolean {
  return courtType === "WritPetitionSC" || courtType === "WritPetitionPIL";
}

/** The special leave petition and the statutory appeal copied from it. */
export function isSlpFamily(courtType?: ProjectCourtType | string): boolean {
  return courtType === "SLP" || courtType === "Appeal";
}

/** The statutory appeal specifically — where it differs from the SLP. */
export function isAppeal(courtType?: ProjectCourtType | string): boolean {
  return courtType === "Appeal";
}

/**
 * The letter an annexure label carries: the statutory appeal uses the A-series
 * ("Annexure A-1"), every other Supreme Court document the P-series. Only the
 * letter differs — the NUMBERING rules are untouched, so an appeal still sorts
 * additional documents last and keeps the impugned order out of the series.
 */
export function annexurePrefix(courtType?: ProjectCourtType | string): string {
  return isAppeal(courtType) ? "A" : "P";
}

/** The PIL writ specifically — where it differs from the Article 32 writ. */
export function isPil(courtType?: ProjectCourtType | string): boolean {
  return courtType === "WritPetitionPIL";
}

export type CourtForumId = "SC" | "DHC" | "CAT";

export interface DocumentTypeOption {
  type: ProjectCourtType;
  label: string;
  badge: string;
  description: string;
  forumId: CourtForumId;
  forumName: string;
  extension: "drafto" | "scappeal" | "scwp" | "scpil" | "dhcwp" | "catoa";
}

export const ALL_DOCUMENT_TYPES: DocumentTypeOption[] = [
  {
    type: "SLP",
    label: "Special Leave Petition (SLP)",
    badge: "Article 136",
    description: "Petition for special leave to appeal against judgments/orders of High Courts or Tribunals.",
    forumId: "SC",
    forumName: "Supreme Court of India",
    extension: "drafto",
  },
  {
    type: "Appeal",
    label: "Statutory Appeal",
    badge: "Civil / Criminal Appeal",
    description: "Direct statutory appeal before the Supreme Court under specialized Central Acts (A-series annexures).",
    forumId: "SC",
    forumName: "Supreme Court of India",
    extension: "scappeal",
  },
  {
    type: "WritPetitionSC",
    label: "Writ Petition (Civil/Criminal)",
    badge: "Article 32",
    description: "Writ petition under Article 32 of the Constitution of India for enforcement of Fundamental Rights.",
    forumId: "SC",
    forumName: "Supreme Court of India",
    extension: "scwp",
  },
  {
    type: "WritPetitionPIL",
    label: "Writ Petition (PIL)",
    badge: "Public Interest Litigation",
    description: "Public Interest Litigation writ petition under Article 32 with Order XXXVIII Rule 12 declarations.",
    forumId: "SC",
    forumName: "Supreme Court of India",
    extension: "scpil",
  },
  {
    type: "WritPetitionDHC",
    label: "Writ Petition (Delhi High Court)",
    badge: "Article 226/227",
    description: "Writ petition under Article 226/227 of the Constitution before the High Court of Delhi.",
    forumId: "DHC",
    forumName: "High Court of Delhi",
    extension: "dhcwp",
  },
  {
    type: "OriginalApplicationCAT",
    label: "Original Application (CAT)",
    badge: "Section 19",
    description: "Original Application before the Central Administrative Tribunal under Section 19 of AT Act, 1985.",
    forumId: "CAT",
    forumName: "Central Administrative Tribunal",
    extension: "catoa",
  },
];

export function getForumForCourtType(courtType?: ProjectCourtType | string): CourtForumId {
  if (courtType === "WritPetitionDHC") return "DHC";
  if (courtType === "OriginalApplicationCAT") return "CAT";
  return "SC";
}

export function getForumName(courtType?: ProjectCourtType | string): string {
  const forum = getForumForCourtType(courtType);
  if (forum === "DHC") return "High Court of Delhi";
  if (forum === "CAT") return "Central Administrative Tribunal";
  return "Supreme Court of India";
}

export function getDocumentTypeOption(courtType?: ProjectCourtType | string): DocumentTypeOption {
  const ct = courtType ?? "SLP";
  const found = ALL_DOCUMENT_TYPES.find((d) => d.type === ct);
  return found ?? ALL_DOCUMENT_TYPES[0];
}

export function getSameCourtDocumentTypes(courtType?: ProjectCourtType | string): DocumentTypeOption[] {
  const currentCt = courtType ?? "SLP";
  const forum = getForumForCourtType(currentCt);
  return ALL_DOCUMENT_TYPES.filter((d) => d.forumId === forum && d.type !== currentCt);
}

/**
 * Converts a project between document types of the SAME court.
 * Preserves List of Dates, Annexures, Parties, Grounds, Advocate, Listing Proforma,
 * and bridges synopsis <-> wp.facts gracefully.
 */
export function convertProjectCourtType(
  project: DraftoProject,
  targetCourtType: ProjectCourtType
): DraftoProject {
  const currentCourtType = project.courtType ?? "SLP";
  if (currentCourtType === targetCourtType) return project;

  const currentForum = getForumForCourtType(currentCourtType);
  const targetForum = getForumForCourtType(targetCourtType);
  if (currentForum !== targetForum) {
    throw new Error(`Cannot convert project across different courts (${currentForum} to ${targetForum}).`);
  }

  // Preserve File objects and deep structure cleanly
  let next: DraftoProject;
  try {
    next = typeof structuredClone === "function" ? structuredClone(project) : JSON.parse(JSON.stringify(project));
  } catch {
    next = { ...project };
  }
  next.courtType = targetCourtType;

  // Case 1: Between WritPetitionSC and WritPetitionPIL
  // 100% identical data structures; PIL disclosures remain stored in the schema.
  if (isScWpFamily(currentCourtType) && isScWpFamily(targetCourtType)) {
    return next;
  }

  // Case 2: Between SLP and Appeal
  // 100% identical data structures; annexure prefix automatically updates.
  if (isSlpFamily(currentCourtType) && isSlpFamily(targetCourtType)) {
    if (targetCourtType === "Appeal") {
      next.appeal = next.appeal || { provision: "", provisionCustom: "" };
    }
    return next;
  }

  // Case 3: Cross-family conversion within Supreme Court (SLP/Appeal <-> SC WP/PIL)
  if (isScWpFamily(targetCourtType)) {
    next.wp = next.wp || ({} as any);
    // Bridge synopsis -> wp.facts if wp.facts is empty
    if (!next.wp.facts && next.synopsis) {
      next.wp.facts = next.synopsis;
    }
    // Initialize standard WP reliefs if not set
    if (!next.wp.reliefs || next.wp.reliefs.length === 0) {
      next.wp.reliefs = [
        { id: `item_${Math.random()}`, particulars: "", isHeading: false, heading: "" },
        { id: `item_${Math.random()}`, particulars: "Pass any such other order(s) as this Hon'ble Court may deem fit in the facts and circumstances of this case.", isHeading: false, heading: "" },
      ];
    }
  } else if (isSlpFamily(targetCourtType)) {
    // Bridge wp.facts -> synopsis if synopsis is empty
    if (!next.synopsis && next.wp?.facts) {
      next.synopsis = next.wp.facts;
    }
    if (targetCourtType === "Appeal") {
      next.appeal = next.appeal || { provision: "", provisionCustom: "" };
    }
  }

  return next;
}

/**
 * Returns document types for DIFFERENT courts from the given courtType.
 * E.g. If current is Delhi HC, returns Supreme Court and CAT options.
 */
export function getDifferentCourtDocumentTypes(courtType?: ProjectCourtType | string): DocumentTypeOption[] {
  const currentCt = courtType ?? "SLP";
  const currentForum = getForumForCourtType(currentCt);
  return ALL_DOCUMENT_TYPES.filter((d) => d.forumId !== currentForum);
}

/**
 * Unbundles Colly annexures from Delhi HC into individual top-level annexures,
 * ensuring compliance with Supreme Court Rules and CAT Practice where Colly is forbidden.
 */
export function unbundleCollyAnnexures(listOfDates: LodTableItem[]): LodTableItem[] {
  return (listOfDates || []).map((row) => {
    if (!row.annexures || row.annexures.length === 0) return row;
    const newAnnexures: Annexure[] = [];
    for (const annex of row.annexures) {
      if (annex.isColly && annex.collyDocuments && annex.collyDocuments.length > 0) {
        // Unbundle each constituent document into an individual numbered annexure
        annex.collyDocuments.forEach((cd, idx) => {
          newAnnexures.push({
            id: `annex_${Math.random().toString(36).slice(2, 9)}`,
            file: cd.file,
            filePath: cd.filePath,
            typedOrTranslatedFile: undefined,
            typedOrTranslatedFilePath: undefined,
            isAdditionalDocument: annex.isAdditionalDocument || false,
            copyType: annex.copyType ?? "true copy",
            title: cd.title || (idx === 0 ? annex.title : `Constituent Document ${idx + 1}`),
            date: cd.date || annex.date,
            customText: annex.customText || "",
            isColly: false,
            collyDocuments: [],
            isImpugnedOrder: false,
          });
        });
      } else {
        newAnnexures.push({
          ...annex,
          isColly: false,
          collyDocuments: [],
        });
      }
    }
    return {
      ...row,
      annexures: newAnnexures,
    };
  });
}

/**
 * Forks an existing project into a brand new draft for a DIFFERENT court.
 * - Does NOT modify or overwrite the source project.
 * - Preserves the neutral factual spine: Parties, Chronological List of Dates,
 *   all attached PDFs & disk paths, and Factual Narrative.
 * - Automatically unbundles Colly annexures if moving to Supreme Court or CAT.
 * - Initializes court-specific pleadings, prayers, and applications cleanly.
 */
export function forkProjectToCourt(
  source: DraftoProject,
  targetCourtType: ProjectCourtType
): DraftoProject {
  const targetForum = getForumForCourtType(targetCourtType);
  const sourceForum = getForumForCourtType(source.courtType);

  // Initialize a fresh blank project of the target court type
  const target = newBlankProject(targetCourtType);

  // Deeply clone source to avoid mutating any references or File objects
  let cleanSource: DraftoProject;
  try {
    cleanSource = typeof structuredClone === "function" ? structuredClone(source) : JSON.parse(JSON.stringify(source));
  } catch {
    cleanSource = { ...source };
  }

  // 1. Parties: Petitioners & Respondents
  if (cleanSource.petitioners && cleanSource.petitioners.length > 0) {
    const validPets = cleanSource.petitioners.filter((p) => p.name?.trim());
    if (validPets.length > 0) {
      target.petitioners = validPets.map((p) => ({ ...p, id: `vaadi_${Math.random().toString(36).slice(2, 9)}` }));
    }
  }
  if (cleanSource.respondents && cleanSource.respondents.length > 0) {
    const validResps = cleanSource.respondents.filter((r) => r.name?.trim());
    if (validResps.length > 0) {
      target.respondents = validResps.map((r) => ({ ...r, id: `vaadi_${Math.random().toString(36).slice(2, 9)}` }));
    }
  }

  // 2. Case Type
  target.caseType = cleanSource.caseType || "Civil";

  // 3. Chronology / List of Dates
  let dates = cleanSource.listOfDates ? [...cleanSource.listOfDates] : [];
  // Unbundle Colly if moving from Delhi HC to SC or CAT
  if ((targetForum === "SC" || targetForum === "CAT") && sourceForum === "DHC") {
    dates = unbundleCollyAnnexures(dates);
  }
  if (dates.length > 0) {
    target.listOfDates = dates;
  }

  // 4. Factual Narrative / Synopsis
  const narrative =
    cleanSource.synopsis ||
    cleanSource.wp?.facts ||
    cleanSource.oa?.facts ||
    "";

  if (narrative) {
    target.synopsis = narrative;
    if (isScWpFamily(targetCourtType) || targetCourtType === "WritPetitionDHC") {
      target.wp = target.wp || ({} as any);
      target.wp.facts = narrative;
    } else if (targetCourtType === "OriginalApplicationCAT") {
      target.oa = target.oa || ({} as any);
      target.oa.facts = narrative;
    }
  }

  // 5. Impugned Order slot
  // When forking from High Court to Supreme Court, prepare an empty slot ready for the HC Judgment
  if (targetForum === "SC") {
    target.impugnedOrders = [
      {
        id: `io_${Math.random().toString(36).slice(2, 9)}`,
        type: "Final Judgment and Order",
        date: new Date(),
        caseNumber: "",
        court: sourceForum === "DHC" ? "High Court of Delhi" : "",
        customCourt: "",
        effect: "",
      },
    ];
  } else if (targetForum === "DHC") {
    target.impugnedOrders = [
      {
        id: `io_${Math.random().toString(36).slice(2, 9)}`,
        type: "Final Order",
        date: new Date(),
        caseNumber: "",
        court: sourceForum === "CAT" ? "Central Administrative Tribunal" : "",
        customCourt: "",
        effect: "",
      },
    ];
  }

  return target;
}

export interface ImportDataOptions {
  importDates: boolean;
  datesMode: "replace" | "append";
  importParties: boolean;
  importFacts: boolean;
  importGrounds: boolean;
}

/**
 * Merges selected data slices from a source project into the target project.
 * Supports Append/Replace for List of Dates and automatic Colly unbundling.
 */
export function importProjectData(
  target: DraftoProject,
  source: DraftoProject,
  options: ImportDataOptions
): DraftoProject {
  let next: DraftoProject;
  try {
    next = typeof structuredClone === "function" ? structuredClone(target) : JSON.parse(JSON.stringify(target));
  } catch {
    next = { ...target };
  }

  const targetForum = getForumForCourtType(next.courtType);
  const sourceForum = getForumForCourtType(source.courtType);

  // 1. List of Dates & Events
  if (options.importDates && source.listOfDates && source.listOfDates.length > 0) {
    let sourceDates = source.listOfDates;
    const populated = sourceDates.filter(
      (d) => d.date?.trim() || d.event?.trim() || (d.annexures && d.annexures.length > 0)
    );
    const toImport = populated.length > 0 ? populated : sourceDates;

    // Unbundle Colly if moving into Supreme Court or CAT
    const processedDates =
      (targetForum === "SC" || targetForum === "CAT") && sourceForum === "DHC"
        ? unbundleCollyAnnexures(toImport)
        : toImport;

    if (options.datesMode === "append") {
      const existingNonEmpty = (next.listOfDates || []).filter(
        (d) => d.date?.trim() || d.event?.trim() || (d.annexures && d.annexures.length > 0)
      );
      next.listOfDates = [...existingNonEmpty, ...processedDates];
    } else {
      next.listOfDates = processedDates;
    }
  }

  // 2. Parties
  if (options.importParties) {
    if (source.petitioners && source.petitioners.length > 0) {
      const validPets = source.petitioners.filter((p) => p.name?.trim());
      if (validPets.length > 0) {
        next.petitioners = validPets.map((p) => ({
          ...p,
          id: `vaadi_${Math.random().toString(36).slice(2, 9)}`,
        }));
      }
    }
    if (source.respondents && source.respondents.length > 0) {
      const validResps = source.respondents.filter((r) => r.name?.trim());
      if (validResps.length > 0) {
        next.respondents = validResps.map((r) => ({
          ...r,
          id: `vaadi_${Math.random().toString(36).slice(2, 9)}`,
        }));
      }
    }
  }

  // 3. Factual Narrative / Synopsis
  if (options.importFacts) {
    const narrative =
      source.synopsis ||
      source.wp?.facts ||
      source.oa?.facts ||
      "";
    if (narrative) {
      next.synopsis = narrative;
      if (isScWpFamily(next.courtType) || next.courtType === "WritPetitionDHC") {
        next.wp = next.wp || ({} as any);
        next.wp.facts = narrative;
      } else if (next.courtType === "OriginalApplicationCAT") {
        next.oa = next.oa || ({} as any);
        next.oa.facts = narrative;
      }
    }
  }

  // 4. Grounds (if requested)
  if (options.importGrounds && source.grounds && source.grounds.length > 0) {
    const validGrounds = source.grounds.filter((g) => g.particulars?.trim() || g.heading?.trim());
    if (validGrounds.length > 0) {
      next.grounds = validGrounds.map((g) => ({
        ...g,
        id: `item_${Math.random().toString(36).slice(2, 9)}`,
      }));
    }
  }

  return next;
}

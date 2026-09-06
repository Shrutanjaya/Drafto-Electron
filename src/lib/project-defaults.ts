import { draftoProjectSchema, type DraftoProject } from "@/lib/schema";
import { getSettings } from "@/components/dialogs/settings-dialog";
import { getWpFiledBy } from "@/lib/wp/wp-settings";
import { getOaFiledBy } from "@/lib/oa/oa-settings";

// A fresh blank project with the user's Settings → User Defaults pre-applied
// (currently AoR name/code). Used for the launch project and for "New Project".
// `courtType` selects the document type (SLP vs Delhi HC writ petition); it
// defaults to "SLP" so existing call sites and saved projects are unaffected.
export function newBlankProject(courtType: DraftoProject["courtType"] = "SLP"): DraftoProject {
  const project = draftoProjectSchema.parse({});
  project.courtType = courtType;
  try {
    const s = getSettings();
    if (s.defaultAorName) project.advocate.aorName = s.defaultAorName;
    if (s.defaultAorCode) project.advocate.aorCode = s.defaultAorCode;
    // Supreme Court Writ Petitions pre-seed Article 32 and checklist defaults.
    if (courtType === "WritPetitionSC") {
      project.listingProforma.legalProvisions = [
        { id: `lp_${Date.now()}`, type: "Central Act", act: "Constitution of India, 1950", section: "Article 32" } as any
      ];
      project.checklist.q1_form28 = "NA";
      project.checklist.q3_papersArranged = "NA";
      project.standardIas.exemptionCertifiedCopy.active = false;
      project.standardIas.exemptionFromSurrendering.active = false;
    }
    // Writ petitions pre-fill the "Filed by" block from the WP defaults.
    if (courtType === "WritPetitionDHC") {
      project.wp.advocate = { ...project.wp.advocate, ...getWpFiledBy() };
    }
    // Original Applications pre-fill theirs from the CAT defaults.
    if (courtType === "OriginalApplicationCAT") {
      project.oa.advocate = { ...project.oa.advocate, ...getOaFiledBy() };
    }
  } catch {
    /* settings unavailable (e.g. SSR) — return the plain blank project */
  }
  return project;
}

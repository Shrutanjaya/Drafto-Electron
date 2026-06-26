import { draftoProjectSchema, type DraftoProject } from "@/lib/schema";
import { getSettings } from "@/components/dialogs/settings-dialog";
import { getWpFiledBy } from "@/lib/wp/wp-settings";

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
    // Writ petitions pre-fill the "Filed by" block from the WP defaults.
    if (courtType === "WritPetitionDHC") {
      project.wp.advocate = { ...project.wp.advocate, ...getWpFiledBy() };
    }
  } catch {
    /* settings unavailable (e.g. SSR) — return the plain blank project */
  }
  return project;
}

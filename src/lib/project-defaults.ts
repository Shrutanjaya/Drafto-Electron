import { draftoProjectSchema, type DraftoProject } from "@/lib/schema";
import { getSettings } from "@/components/dialogs/settings-dialog";

// A fresh blank project with the user's Settings → User Defaults pre-applied
// (currently AoR name/code). Used for the launch project and for "New Project".
export function newBlankProject(): DraftoProject {
  const project = draftoProjectSchema.parse({});
  try {
    const s = getSettings();
    if (s.defaultAorName) project.advocate.aorName = s.defaultAorName;
    if (s.defaultAorCode) project.advocate.aorCode = s.defaultAorCode;
  } catch {
    /* settings unavailable (e.g. SSR) — return the plain blank project */
  }
  return project;
}

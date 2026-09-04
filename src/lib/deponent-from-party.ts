// ── Deponent, taken from the first petitioner/applicant ──────────────────────
// The deponent is very often the first petitioner, and retyping the name,
// parentage, age and address is both tedious and a place for the two to drift
// apart. This fills what the party record actually holds and leaves the rest
// alone — it never blanks a deponent field the party has nothing to say about.

import type { DraftoProject } from "./schema";

type Party = DraftoProject["petitioners"][number];

export interface DeponentFill {
  name?: string;
  fatherName?: string;
  age?: string;
  address?: string;
  relationship?: DraftoProject["deponent"]["relationship"];
  role?: DraftoProject["deponent"]["role"];
}

const RELATIONSHIPS = ["son of", "daughter of", "wife of", "husband of"] as const;

// The first party with a name — the one the petition calls Petitioner No. 1.
export function firstNamedParty(project: Partial<DraftoProject> | undefined): Party | undefined {
  return (project?.petitioners || []).find(p => (p?.name || "").trim());
}

export function deponentFromParty(project: Partial<DraftoProject> | undefined): DeponentFill | null {
  const party = firstNamedParty(project);
  if (!party) return null;

  const named = (project?.petitioners || []).filter(p => (p?.name || "").trim()).length;
  const fill: DeponentFill = {};
  const take = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s || undefined;
  };

  fill.name = take(party.name);
  fill.address = take(party.address);
  // The CAT applicant record carries these; SLP and writ parties do not, and
  // then they are simply left as the user has them.
  fill.fatherName = take((party as any).fatherName);
  fill.age = take((party as any).age);
  const rel = take((party as any).relationship);
  if (rel && (RELATIONSHIPS as readonly string[]).includes(rel)) {
    fill.relationship = rel as DeponentFill["relationship"];
  }
  // Where there are several petitioners the deponent swears for himself and the
  // others, so the role has to say which one he is.
  fill.role = named > 1 ? "Petitioner No. 1" : "Petitioner";

  return fill;
}

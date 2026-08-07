// ── The drafting job ─────────────────────────────────────────────────────────
// A job is what the user asked for: draft THESE sections, reading THOSE ones,
// and this is what to do about anything already written. It is planned into a
// sequence of small passes in dependency order, so each pass is reliable on its
// own and can see what the passes before it produced.

import type { DraftMode, CatalogEntry } from "./field-catalog";
import { catalogFor } from "./field-catalog";
import { orderByDependency, sectionById, sectionsFor, type Section } from "./sections";

export type OverwritePolicy = "skip" | "replace" | "both";

export interface JobSpec {
  mode: DraftMode;
  /** Section ids to draft. */
  draft: string[];
  /** Section ids whose current contents are given to the model as context. */
  read: string[];
  overwrite: OverwritePolicy;
  /** Free-text nuance from the user ("keep the grounds to six"). */
  extra?: string;
  /** True when a source-document folder has been provided. */
  hasDocuments: boolean;
}

export interface Pass {
  sectionId: string;
  label: string;
  model?: "haiku" | "sonnet" | "opus";
  effort: Section["effort"];
  /** Sections read as context for this pass (ids). */
  reads: string[];
}

/**
 * Turn a job into an ordered list of passes.
 *
 * Sections already filled are dropped under the "skip" policy — that decision
 * belongs here rather than in the UI, so the plan the user sees is the plan that
 * runs. Under "replace" and "both" everything selected runs.
 */
export function planJob(spec: JobSpec, filled: Set<string>): Pass[] {
  const wanted = spec.draft.filter((id) => (spec.overwrite === "skip" ? !filled.has(id) : true));
  const ordered = orderByDependency(spec.mode, wanted);

  return ordered.map((id) => {
    const sec = sectionById(spec.mode, id)!;
    // A pass reads what the user chose, plus its own declared dependencies —
    // whether those were drafted earlier in this run or typed by the user.
    const reads = Array.from(new Set([...spec.read, ...(sec.dependsOn ?? [])])).filter((r) => r !== id);
    return { sectionId: id, label: sec.label, model: sec.model, effort: sec.effort, reads };
  });
}

/** Total time estimate for a plan, in seconds (uses the existing per-task model). */
export function planEffort(passes: Pass[]): { small: number; medium: number; large: number } {
  const out = { small: 0, medium: 0, large: 0 };
  for (const p of passes) out[p.effort] += 1;
  return out;
}

// ── Reading the project back to the model ────────────────────────────────────

/** Pull the current value at a dot-path. */
function at(values: any, path: string): unknown {
  return path.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), values);
}

const isEmpty = (v: unknown): boolean =>
  v == null ||
  (typeof v === "string" && v.replace(/<[^>]*>/g, "").trim() === "") ||
  (Array.isArray(v) && v.length === 0);

/**
 * Render the sections being read as context. Deliberately the *current* values —
 * whether the user typed them or an earlier pass drafted them — because "read
 * the Synopsis and draft the Questions of Law" must work either way.
 */
export function renderContext(mode: DraftMode, values: any, sectionIds: string[]): string {
  if (sectionIds.length === 0) return "";
  const blocks: string[] = [];
  for (const id of sectionIds) {
    const sec = sectionById(mode, id);
    if (!sec) continue;
    const parts: string[] = [];
    for (const path of sec.paths) {
      const v = at(values, path);
      if (isEmpty(v)) continue;
      parts.push(`${path}:\n${JSON.stringify(v, null, 2)}`);
    }
    if (parts.length) blocks.push(`### ${sec.label}\n${parts.join("\n\n")}`);
  }
  if (blocks.length === 0) return "";
  return (
    "## What is already in the project\n" +
    "These are the current contents of the sections you were asked to read. Draft consistently with them — same parties, same dates, same defined terms. Do NOT re-draft them.\n\n" +
    blocks.join("\n\n")
  );
}

/** The fields this pass may write to, spelled out so the model stays in its lane. */
function renderTargetFields(mode: DraftMode, sec: Section): string {
  const catalog = catalogFor(mode);
  const owned = catalog.filter((e: CatalogEntry) => sec.paths.some((p) => e.path === p || e.path.startsWith(p + ".")));
  if (owned.length === 0) return "";
  const lines = owned.map((e) => `- ${e.path} — ${e.label}${e.description ? `: ${e.description}` : ""}`);
  return `## The ONLY fields this task may write to\n${lines.join("\n")}`;
}

const OVERWRITE_TEXT: Record<OverwritePolicy, string> = {
  skip: "This section is empty — you are writing it for the first time.",
  replace:
    "This section already has content and the user has asked you to REPLACE it. Draft it afresh; do not merely tidy what is there.",
  both:
    "This section already has content. Draft your own version in full — the user will compare the two side by side and choose.",
};

/** The gap-reporting contract, appended to every pass. */
const GAPS_CONTRACT = `## Reporting what you could not fill
Alongside "operations", include a "gaps" array for anything you could NOT complete. Each entry:
{ "field": "<the field or the thing missing>", "reason": "<one of: not-in-documents | documents-disagree | needs-your-decision | assumed>", "detail": "<one sentence: what is missing, or what you assumed>" }
- Use "assumed" when you DID fill the field but made a judgement the user should check.
- Never invent facts to fill a hole. An empty field with a gap entry is always better than a plausible fabrication.
- If nothing is missing, omit "gaps" or send an empty array.`;

/** Build the user-message for one pass. */
export function buildPassPrompt(
  spec: JobSpec,
  pass: Pass,
  values: any,
  opts: { alreadyFilled: boolean },
): string {
  const sec = sectionById(spec.mode, pass.sectionId);
  if (!sec) return "";
  const policy = opts.alreadyFilled ? spec.overwrite : "skip";

  const parts = [
    `# Task: draft the ${sec.label}`,
    sec.playbook,
    OVERWRITE_TEXT[policy],
    renderTargetFields(spec.mode, sec),
    renderContext(spec.mode, values, pass.reads),
    spec.hasDocuments && sec.needsDocuments
      ? "The source documents are available to you — read them for this task."
      : "",
    spec.extra ? `## The user has also asked\n${spec.extra}` : "",
    GAPS_CONTRACT,
    `Respond with your one-line note and the JSON proposal. Fill ONLY the fields listed above — anything else will be discarded.`,
  ];
  return parts.filter(Boolean).join("\n\n");
}

// ── Presets for the pick-list ────────────────────────────────────────────────

/** Everything this document type can draft. */
export function allSectionIds(mode: DraftMode): string[] {
  return sectionsFor(mode).map((s) => s.id);
}

/** Everything not yet written. */
export function emptySectionIds(mode: DraftMode, filled: Set<string>): string[] {
  return sectionsFor(mode)
    .map((s) => s.id)
    .filter((id) => !filled.has(id));
}

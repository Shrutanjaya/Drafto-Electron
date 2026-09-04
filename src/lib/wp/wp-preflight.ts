// Pre-flight checks run before assembling the WP paper-book. Pure & DOM-free so
// it can be unit-tested. Nothing here BLOCKS generation — a lawyer may want a
// partial draft — but every silent failure mode (blank placeholder pages,
// placeholder text printed into the petition, stale Facts) is surfaced first.

import type { DraftoProject } from "@/lib/schema";
import { wpAnnexureOrder, annexLabel, cmAnnexureOrder, cmAnnexLabel } from "./wp-annexures";
import { lodFingerprint, transposableLodIds } from "./wp-facts";
import { wpActiveCms } from "./wp-actions";
import { hasUsableFile, isRememberedButMissing, fileNameOf } from "@/lib/file-availability";

export interface WpPreflightIssue {
  // error → the output would be defective (blank pages / placeholder text);
  // warning → probably not what the user wants, but a valid document.
  severity: "error" | "warning";
  message: string;
  // Which row of the paper-book this is about, so the generation dialog can put
  // it against that item instead of stacking every issue at the bottom where it
  // is nobody's in particular. Ids match the dialog's own rows:
  //   "parties" | "synopsis" | "petition" | "affidavit" | "vakalatnama"
  //   "courtFee" | "proofOfService" | "filing"
  //   `annex:<annexure id>` | `cm:<index>` | `cmannex:<annexure id>`
  target?: string;
}

function htmlHasText(html?: string): boolean {
  return !!(html || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim();
}

// A file is "present" if a live File object exists, or a saved path that this
// machine can actually open — a project carried from another computer keeps its
// paths, and reading one as an attachment is how an annexure came out as a
// blank page while the dialog said it was attached.
const hasFile = hasUsableFile;

// The words for a slot whose file the project remembers but this machine does
// not have.
const missingHereNote = (entry: { file?: unknown; filePath?: string } | undefined): string =>
  isRememberedButMissing(entry)
    ? ` It was attached on another computer (${fileNameOf(entry?.filePath)}); the file is not on this machine.`
    : "";

export function wpPreflight(project: DraftoProject): WpPreflightIssue[] {
  const issues: WpPreflightIssue[] = [];
  const err = (message: string, target?: string) => issues.push({ severity: "error", message, target });
  const warn = (message: string, target?: string) => issues.push({ severity: "warning", message, target });

  // ── Parties ──
  if (!project.petitioners?.some(p => p.name?.trim())) err("No Petitioner name has been entered (Preliminary → Parties).", "parties");
  if (!project.respondents?.some(r => r.name?.trim())) err("No Respondent name has been entered (Preliminary → Parties).", "parties");

  // ── Petition body ──
  const reliefs = (project.wp.reliefs || []).filter(r => htmlHasText(r.particulars));
  // The last relief is the residuary prayer — at least one substantive relief
  // (including the quash relief, if any) must be entered by the user.
  if (reliefs.length <= 1) err("No reliefs have been entered (Petition → Reliefs) — only the residuary prayer would print.", "petition");
  if (!htmlHasText(project.synopsis)) warn("The Synopsis is empty.", "synopsis");
  if (!(project.listOfDates || []).some(l => l.date?.trim() || htmlHasText(l.event))) warn("The List of Dates is empty.", "synopsis");
  if (!(project.grounds || []).some(g => htmlHasText(g.particulars))) err("No Grounds have been entered — the GROUNDS section would be empty.", "petition");

  if (!htmlHasText(project.wp.facts)) {
    err("The Facts section is empty — placeholder text would be printed in the petition body. Use “Generate from List of Dates” in Petition → Facts.", "petition");
  } else if (project.wp.factsLodFingerprint && project.wp.factsLodFingerprint !== lodFingerprint(project)) {
    const done = new Set(project.wp.factsLodIds || []);
    const newRows = transposableLodIds(project).filter(id => !done.has(id)).length;
    warn(newRows > 0
      ? `The List of Dates has changed since Facts were generated (${newRows} new row${newRows === 1 ? "" : "s"} not yet in Facts). Regenerate or use “Append new rows”.`
      : "The List of Dates has changed since Facts were generated — review the Facts section for stale content.", "petition");
  }

  // ── Annexures (P-series) ──
  for (const { annex, pNumber } of wpAnnexureOrder(project)) {
    const label = annexLabel(pNumber, annex);
    const title = annex.title?.trim() ? ` (${annex.title.trim()})` : "";
    if (annex.isColly) {
      const docs = annex.collyDocuments || [];
      if (docs.length === 0) err(`${label}${title} has no constituent documents — a blank page would be inserted.`, `annex:${annex.id}`);
      else docs.forEach((cd, i) => {
        if (!hasFile(cd)) err(`${label}${title}: constituent ${i + 1}${cd.title ? ` (${cd.title})` : ""} has no file — a blank page would be inserted.${missingHereNote(cd)}`, `annex:${annex.id}`);
      });
    } else if (!hasFile(annex)) {
      err(`${label}${title} has no file uploaded — a blank page would be inserted.${missingHereNote(annex)}`, `annex:${annex.id}`);
    }
    if (!annex.title?.trim()) warn(`${label} has no description — “[description]” would print in the Index and Facts.`, `annex:${annex.id}`);
  }

  // ── CM applications and their A-series annexures ──
  wpActiveCms(project).forEach((cm, i) => {
    for (const { annex, aNumber } of cm.annexures) {
      if (!hasFile(annex)) err(`${cmAnnexLabel(aNumber)}${annex.title ? ` (${annex.title})` : ""} has no file — a blank page would be inserted.${missingHereNote(annex)}`, `cmannex:${annex.id}`);
      if (!annex.title?.trim()) warn(`${cmAnnexLabel(aNumber)} has no description — “[description]” would print.`, `cmannex:${annex.id}`);
    }
  });
  // Custom CMs are also rendered when empty — catch a title-only shell.
  (project.wp.customCms || []).forEach((cm, i) => {
    const hasBody = (cm.grounds || []).some(g => htmlHasText(g.particulars)) || cmAnnexureOrder(cm).length > 0;
    const hasPrayer = (cm.prayers || []).some(p => htmlHasText(p.particulars));
    if (!hasBody || !hasPrayer) warn(`This application has ${!hasBody ? "no grounds" : "no prayers"} — it would print with gaps.`, `customcm:${cm.id}`);
  });

  // ── Filing details ──
  if (!project.wp.listingDate) warn("No listing date is set (Preliminary → Petition Details) — the Notice of Motion would show a blank.", "filing");
  if (!hasFile(project.wp.uploads?.courtFee)) warn("Court Fee receipt not uploaded — the Index will reserve one page for it; insert the printed receipt at that page.", "courtFee");
  if (!hasFile(project.wp.uploads?.proofOfService)) warn("Proof of Service not uploaded — the Index will reserve one page for it; insert the printed acknowledgement at that page.", "proofOfService");
  if (!hasFile(project.wp.uploads?.signedAffidavit)) warn("No notarised affidavit uploaded — the clean generated affidavit will be used.", "affidavit");
  if (!hasFile(project.wp.uploads?.signedVakalatnama)) warn("No signed vakalatnama uploaded — the clean generated vakalatnama will be used.", "vakalatnama");

  // ── e-filing compliance ──
  const anyUpload = wpAnnexureOrder(project).length > 0 || hasFile(project.wp.uploads?.courtFee) || hasFile(project.wp.uploads?.proofOfService);
  if (anyUpload) warn("The Index certifies an OCR (text-searchable) copy was served. Tick “Run OCR on the merged PDF” when generating (Windows only) if your scanned annexures are not already text-searchable.", "filing");

  // Errors first, then warnings.
  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
}

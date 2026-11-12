// ── The project's name ───────────────────────────────────────────────────────
// A project is named by its own file on disk: the name in the header IS the
// file name, with no second copy kept anywhere. Before the first save there is
// no file yet, so the app holds the typed name in memory until there is one.
//
// The party-derived name is only ever a suggestion. Once the user has typed a
// name of their own, nothing regenerates it.

/** Strip the project extension from a file name. */
export function stemOf(fileNameOrPath: string): string {
  const base = fileNameOrPath.split(/[\\/]/).pop() || "";
  return base.replace(/\.(drafto|scappeal|scwp|scpil|dhcwp|catoa)$/i, "");
}

// Windows cannot hold a file called CON, PRN, AUX, NUL, COM1-9 or LPT1-9.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Make a typed name usable as a file name — quietly, where the fix is obvious.
 * Returns null when there is nothing usable left, so the caller can refuse.
 */
export function cleanProjectName(input: string): string | null {
  let s = (input || "")
    .replace(/[\\/:*?"<>|]/g, "")   // characters no file name may contain
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");          // Windows rejects a trailing space or dot
  if (s.length > 120) s = s.slice(0, 120).trim().replace(/[. ]+$/, "");
  if (!s) return null;
  if (WINDOWS_RESERVED.test(s)) return null;
  return s;
}

/**
 * Builds a clean, legal-standard PDF filename incorporating party names.
 * - Format for petitions: "{Petitioner} v. {Respondent} – {DocumentTitle}.pdf"
 * - Format for paperbooks: "{Petitioner} v. {Respondent} Paperbook.pdf"
 * Clamps each party to the first 3 words and sanitizes against illegal file path characters.
 */
export function getPaperbookFileName(
  project?: { petitioners?: Array<{ name?: string }>; respondents?: Array<{ name?: string }>; courtType?: string } | null,
  defaultDocumentTitle?: string
): string {
  const firstWords = (s: string, n: number) => s.trim().split(/\s+/).slice(0, n).join(" ");
  const rawPet = project?.petitioners?.[0]?.name?.trim();
  const rawRes = project?.respondents?.[0]?.name?.trim();
  const pet = rawPet ? cleanProjectName(firstWords(rawPet, 3)) : null;
  const res = rawRes ? cleanProjectName(firstWords(rawRes, 3)) : null;

  const caseName = pet && res ? `${pet} v. ${res}` : pet || res || "";

  let docTitle = defaultDocumentTitle;
  if (!docTitle) {
    if (project?.courtType === "WritPetitionDHC" || project?.courtType === "WritPetitionSC" || project?.courtType === "WritPetitionPIL") {
      docTitle = "Writ Petition";
    } else if (project?.courtType === "OriginalApplicationCAT") {
      docTitle = "Original Application";
    } else {
      docTitle = "Paperbook";
    }
  }

  if (!caseName) return `${docTitle}.pdf`;
  if (docTitle === "Paperbook" || docTitle === "Paperbook (Short Bookmarks)") return `${caseName} ${docTitle}.pdf`;
  return `${caseName} – ${docTitle}.pdf`;
}

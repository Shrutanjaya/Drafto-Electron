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
  return base.replace(/\.(drafto|dhcwp|scwp)$/i, "");
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

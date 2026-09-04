// ── Files a project remembers but this computer cannot open ──────────────────
// A saved project stores the disk path of every attachment. Move the project to
// another machine — deliberately, to work on it there and send it back — and
// those paths are still in the file while the documents are not on the disk.
// Everything downstream read a stored path as "attached", so the generation
// dialog showed annexures as present that would in fact have come out as blank
// pages.
//
// The paths are NOT cleared: the project has to go back to the first machine
// with its attachments intact. Instead this records, FOR THIS SESSION ONLY and
// never in the project file, which paths could not be opened here. Anything
// that reads an attachment asks here first.

const unavailable = new Set<string>();

export function markFileUnavailable(path: string | undefined | null): void {
  if (path) unavailable.add(path);
}

export function markFileAvailable(path: string | undefined | null): void {
  if (path) unavailable.delete(path);
}

export function isPathUnavailable(path: string | undefined | null): boolean {
  return !!path && unavailable.has(path);
}

export interface FileEntry { file?: unknown; filePath?: string }

// A live File object always counts. A stored path counts only if this machine
// has not already found it missing.
export function hasUsableFile(entry: FileEntry | undefined): boolean {
  if (!entry) return false;
  const f: any = entry.file;
  if (f && typeof f === "object" && typeof f.arrayBuffer === "function") return true;
  return !!entry.filePath && !isPathUnavailable(entry.filePath);
}

// True when the project remembers a file for this slot but it is not here.
export function isRememberedButMissing(entry: FileEntry | undefined): boolean {
  if (!entry?.filePath) return false;
  const f: any = entry.file;
  if (f && typeof f === "object" && typeof f.arrayBuffer === "function") return false;
  return isPathUnavailable(entry.filePath);
}

export const fileNameOf = (path: string | undefined): string =>
  path ? String(path).split(/[\\/]/).pop() || path : "";

// Re-checks a set of stored paths against the disk, so a file that turns up
// later — a synced drive catching up, a volume mounted — stops being reported
// as missing. Returns true if anything changed.
export async function refreshFileAvailability(paths: (string | undefined)[]): Promise<boolean> {
  const check = (window as any)?.electron?.pathExists;
  if (typeof check !== "function") return false;
  let changed = false;
  for (const path of Array.from(new Set(paths.filter(Boolean) as string[]))) {
    try {
      const exists = await check(path);
      const was = unavailable.has(path);
      if (exists && was) { unavailable.delete(path); changed = true; }
      else if (!exists && !was) { unavailable.add(path); changed = true; }
    } catch {
      /* leave the current state alone */
    }
  }
  return changed;
}

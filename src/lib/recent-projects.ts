// Most-recently-used project list, backing the header's Quick Load menu. Stores
// the last few project file paths (Electron only — the browser build has no
// stable path) in localStorage, newest first, de-duplicated by path.

export interface RecentProject {
  path: string;
  name: string;   // basename shown in the menu
  at: number;     // last-opened timestamp (ms)
}

const KEY = "drafto-recent-projects";
const MAX = 8; // keep a few; the menu shows the top 3

function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}

export function getRecentProjects(): RecentProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r): r is RecentProject => !!r && typeof r.path === "string")
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  } catch {
    return [];
  }
}

// Record (or bump) a project path as most-recent. Returns the new list.
export function pushRecentProject(path: string): RecentProject[] {
  if (typeof window === "undefined" || !path) return getRecentProjects();
  const entry: RecentProject = { path, name: basename(path), at: Date.now() };
  const next = [entry, ...getRecentProjects().filter((r) => r.path !== path)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("drafto-recent-projects-changed"));
  } catch { /* ignore quota errors */ }
  return next;
}

// Drop a path that no longer opens (e.g. moved/deleted file).
export function removeRecentProject(path: string): RecentProject[] {
  if (typeof window === "undefined") return [];
  const next = getRecentProjects().filter((r) => r.path !== path);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("drafto-recent-projects-changed"));
  } catch { /* ignore */ }
  return next;
}

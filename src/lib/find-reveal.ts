import { escapeRegExp } from "./find-replace";

// Cross-component glue for "reveal the current Find match". The FindReplaceBar
// sets the pending target and fires FIND_REVEAL_EVENT; the Workspace switches to
// the right tab and the Petition tab switches to the right section, then the bar
// highlights the match (TipTap selection for rich text, native selection for
// plain inputs) via a short mount-retry loop.

export interface RevealTarget {
  tab: string;
  section?: string;
  path: string;
  occurrence: number;
  isHtml: boolean;
  query: string;
  caseSensitive: boolean;
}

export const FIND_REVEAL_EVENT = 'drafto-find-reveal';

let pending: RevealTarget | null = null;
export const setPendingReveal = (t: RevealTarget | null) => { pending = t; };
export const getPendingReveal = (): RevealTarget | null => pending;

// Locate a plain text input/textarea by its react-hook-form name (= the path),
// scroll it into view and select the requested occurrence. Returns true if the
// element exists in the DOM yet.
export function revealPlainInput(path: string, query: string, caseSensitive: boolean, occurrence: number): boolean {
  const el = document.querySelector(`[name="${path}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const val = el.value ?? '';
  const re = new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi');
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(val)) !== null) {
    if (k === occurrence) {
      el.focus();
      try { el.setSelectionRange(m.index, m.index + m[0].length); } catch { /* non-text input */ }
      return true;
    }
    k++;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  el.focus();
  return true;
}

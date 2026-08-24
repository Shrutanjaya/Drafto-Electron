import type { DraftoProject } from "./schema";

// Find & Replace operates on the form data model (the single source of truth),
// so it reaches every tab whether or not it is currently on screen. Each
// searchable leaf is described by its react-hook-form path, the scope group it
// belongs to (for selective find/replace), and whether its value is rich-text
// HTML (so matching/replacement only touches visible text, never tags).

export interface FieldDescriptor {
  path: string;
  group: SearchGroup;
  isHtml: boolean;
}

export const SEARCH_GROUPS = [
  'Basic Details',
  'Synopsis',
  'List of Dates',
  'Questions of Law',
  'Grounds',
  'Interim Relief',
  'Appendix',
  'IAs',
  'Listing Proforma',
] as const;
export type SearchGroup = typeof SEARCH_GROUPS[number];

export interface FindOptions {
  caseSensitive: boolean;
}

// Build the list of searchable fields from a snapshot of the form values. Array
// lengths come from the snapshot so newly added rows are included.
export function buildSearchableFields(values: DraftoProject): FieldDescriptor[] {
  const fields: FieldDescriptor[] = [];
  const push = (path: string, group: SearchGroup, isHtml = false) => fields.push({ path, group, isHtml });

  // ── Basic Details (plain text) ──
  const parties = (arr: any[] | undefined, prefix: string) =>
    (arr ?? []).forEach((_, i) => {
      push(`${prefix}.${i}.name`, 'Basic Details');
      push(`${prefix}.${i}.address`, 'Basic Details');
      push(`${prefix}.${i}.positionInEarlierCourt`, 'Basic Details');
    });
  parties(values.petitioners, 'petitioners');
  parties(values.respondents, 'respondents');
  (values.commonOrderParties ?? []).forEach((g, gi) => {
    push(`commonOrderParties.${gi}.caseNumber`, 'Basic Details');
    parties(g.petitioners, `commonOrderParties.${gi}.petitioners`);
    parties(g.respondents, `commonOrderParties.${gi}.respondents`);
  });
  (values.impugnedOrders ?? []).forEach((_, i) => {
    push(`impugnedOrders.${i}.caseNumber`, 'Basic Details');
    push(`impugnedOrders.${i}.court`, 'Basic Details');
    push(`impugnedOrders.${i}.customCourt`, 'Basic Details');
    push(`impugnedOrders.${i}.effect`, 'Basic Details');
  });
  push('intraCourtAppealReason', 'Basic Details');
  ['aorName', 'aorCode', 'filingPlace', 'drawnByName', 'drawnByPlace', 'settledByName', 'settledByPlace']
    .forEach(k => push(`advocate.${k}`, 'Basic Details'));
  ['name', 'fatherName', 'address', 'location', 'age'].forEach(k => push(`deponent.${k}`, 'Basic Details'));

  // ── Synopsis (HTML) ──
  push('synopsis', 'Synopsis', true);

  // ── List of Dates ──
  (values.listOfDates ?? []).forEach((row, i) => {
    push(`listOfDates.${i}.date`, 'List of Dates');
    push(`listOfDates.${i}.event`, 'List of Dates', true);
    (row.annexures ?? []).forEach((_, j) => {
      push(`listOfDates.${i}.annexures.${j}.title`, 'List of Dates');
      push(`listOfDates.${i}.annexures.${j}.customText`, 'List of Dates');
    });
  });

  // ── Questions of Law / Grounds / Interim Relief (HTML particulars) ──
  (values.questionsOfLaw ?? []).forEach((_, i) => push(`questionsOfLaw.${i}.particulars`, 'Questions of Law', true));
  (values.grounds ?? []).forEach((row, i) => {
    // A grounds heading keeps its text in its own plain-text field.
    if ((row as any)?.isHeading) push(`grounds.${i}.heading`, 'Grounds');
    else push(`grounds.${i}.particulars`, 'Grounds', true);
  });
  (values.interimReliefGrounds ?? []).forEach((_, i) => push(`interimReliefGrounds.${i}.particulars`, 'Interim Relief', true));
  (values.interimReliefPrayers ?? []).forEach((_, i) => push(`interimReliefPrayers.${i}.particulars`, 'Interim Relief', true));

  // ── Appendix (one row per attached document) ──
  (values.appendixItems ?? []).forEach((_, i) => {
    push(`appendixItems.${i}.description`, 'Appendix');
    push(`appendixItems.${i}.manualEntry`, 'Appendix');
    push(`appendixItems.${i}.indexTextOverride`, 'Appendix');
  });

  // ── IAs ──
  const si = values.standardIas;
  (si?.condonationOfDelay?.grounds ?? []).forEach((_, i) => push(`standardIas.condonationOfDelay.grounds.${i}.particulars`, 'IAs', true));
  (si?.additionalDocumentsGrounds ?? []).forEach((_, i) => push(`standardIas.additionalDocumentsGrounds.${i}.particulars`, 'IAs', true));
  (si?.exemptionFromSurrendering?.grounds ?? []).forEach((_, i) => push(`standardIas.exemptionFromSurrendering.grounds.${i}.particulars`, 'IAs', true));
  push('standardIas.exemptionCertifiedCopy.reasonForNotApplying', 'IAs');
  push('standardIas.exemptionOfficialTranslation.reason', 'IAs');
  (values.customIas ?? []).forEach((ia, i) => {
    push(`customIas.${i}.title`, 'IAs');
    (ia.grounds ?? []).forEach((_, j) => push(`customIas.${i}.grounds.${j}.particulars`, 'IAs', true));
    (ia.prayers ?? []).forEach((_, j) => push(`customIas.${i}.prayers.${j}.particulars`, 'IAs', true));
  });
  (values.ias ?? []).forEach((_, i) => {
    push(`ias.${i}.name`, 'IAs');
    push(`ias.${i}.prayer`, 'IAs');
  });

  // ── Listing Proforma (plain text leaves) ──
  const lp = values.listingProforma;
  const pushStringLeaves = (obj: Record<string, unknown> | undefined, prefix: string) => {
    if (!obj) return;
    Object.keys(obj).forEach(k => {
      if (typeof obj[k] === 'string') push(`${prefix}.${k}`, 'Listing Proforma');
    });
  };
  pushStringLeaves(lp?.general as any, 'listingProforma.general');
  (lp?.legalProvisions ?? []).forEach((_, i) => {
    push(`listingProforma.legalProvisions.${i}.act`, 'Listing Proforma');
    push(`listingProforma.legalProvisions.${i}.section`, 'Listing Proforma');
  });
  pushStringLeaves(lp?.specialCategories as any, 'listingProforma.specialCategories');

  return fields;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// `$` is special in String.replace replacement strings; double it to insert literally.
function escapeReplacement(s: string): string {
  return s.replace(/\$/g, '$$$$');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function makeRegex(query: string, caseSensitive: boolean): RegExp {
  return new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi');
}

// Split HTML so tags and text alternate; only text segments are searched/replaced
// so formatting (and tag attributes) are never touched. Matches that span a tag
// boundary are not handled — acceptable for word-level find/replace.
function mapHtmlText(html: string, fn: (text: string) => string): string {
  return html.split(/(<[^>]+>)/).map(seg => (/^<[^>]+>$/.test(seg) ? seg : fn(seg))).join('');
}

function countIn(text: string, re: RegExp): number {
  if (!text) return 0;
  const m = text.match(re);
  return m ? m.length : 0;
}

export function countValue(value: string, isHtml: boolean, query: string, opts: FindOptions): number {
  if (!query || !value) return 0;
  const re = makeRegex(query, opts.caseSensitive);
  if (!isHtml) return countIn(value, re);
  let count = 0;
  mapHtmlText(value, seg => { count += countIn(seg, makeRegex(query, opts.caseSensitive)); return seg; });
  return count;
}

export function replaceValue(value: string, isHtml: boolean, query: string, replacement: string, opts: FindOptions): string {
  if (!query || !value) return value;
  if (!isHtml) return value.replace(makeRegex(query, opts.caseSensitive), escapeReplacement(replacement));
  const repl = escapeReplacement(escapeHtml(replacement));
  return mapHtmlText(value, seg => seg.replace(makeRegex(query, opts.caseSensitive), repl));
}

// Replace only the n-th (0-based) match within a single value. Used by the
// "Replace" (current match) button. The replace callback returns literal text,
// so no `$` escaping is needed; HTML replacements are still tag-escaped.
export function replaceNth(value: string, isHtml: boolean, query: string, replacement: string, opts: FindOptions, n: number): string {
  if (!query || !value) return value;
  if (!isHtml) {
    let k = 0;
    return value.replace(makeRegex(query, opts.caseSensitive), m => (k++ === n ? replacement : m));
  }
  const repl = escapeHtml(replacement);
  let k = 0;
  return mapHtmlText(value, seg => seg.replace(makeRegex(query, opts.caseSensitive), m => (k++ === n ? repl : m)));
}

function getByPath(obj: any, path: string): unknown {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export interface MatchResult {
  total: number;
  perGroup: Partial<Record<SearchGroup, number>>;
}

export function countMatches(
  values: DraftoProject,
  query: string,
  opts: FindOptions,
  groups: Set<string> | null,
): MatchResult {
  const result: MatchResult = { total: 0, perGroup: {} };
  if (!query) return result;
  for (const f of buildSearchableFields(values)) {
    if (groups && !groups.has(f.group)) continue;
    const v = getByPath(values, f.path);
    if (typeof v !== 'string') continue;
    const c = countValue(v, f.isHtml, query, opts);
    if (c > 0) {
      result.total += c;
      result.perGroup[f.group] = (result.perGroup[f.group] ?? 0) + c;
    }
  }
  return result;
}

// Which top-level workspace tab and (for the Petition tab) which section a group
// lives in — used to reveal a match before highlighting it.
export const GROUP_TO_TAB: Record<SearchGroup, string> = {
  'Basic Details': 'basic',
  'Synopsis': 'slp',
  'List of Dates': 'slp',
  'Questions of Law': 'slp',
  'Grounds': 'slp',
  'Interim Relief': 'slp',
  'Appendix': 'slp',
  'IAs': 'ias',
  'Listing Proforma': 'proforma',
};

export const GROUP_TO_SLP_SECTION: Partial<Record<SearchGroup, string>> = {
  'Synopsis': 'synopsis',
  'List of Dates': 'listOfDates',
  'Questions of Law': 'questionsOfLaw',
  'Grounds': 'grounds',
  'Interim Relief': 'interimRelief',
  'Appendix': 'appendix',
};

export interface NavMatch {
  path: string;
  group: SearchGroup;
  isHtml: boolean;
  occurrence: number; // 0-based index of this match within its field
}

// Ordered, one entry per individual match, in document order. Total length equals
// countMatches().total for the same inputs, so "X of Y" stays consistent.
export function buildMatchList(
  values: DraftoProject,
  query: string,
  opts: FindOptions,
  groups: Set<string> | null,
): NavMatch[] {
  const list: NavMatch[] = [];
  if (!query) return list;
  for (const f of buildSearchableFields(values)) {
    if (groups && !groups.has(f.group)) continue;
    const v = getByPath(values, f.path);
    if (typeof v !== 'string') continue;
    const c = countValue(v, f.isHtml, query, opts);
    for (let k = 0; k < c; k++) list.push({ path: f.path, group: f.group, isHtml: f.isHtml, occurrence: k });
  }
  return list;
}

// Replace every match within scope, writing each changed field back via setValue.
// Returns the number of occurrences replaced.
export function replaceAllInForm(
  values: DraftoProject,
  query: string,
  replacement: string,
  opts: FindOptions,
  groups: Set<string> | null,
  setValue: (path: string, value: string) => void,
): number {
  if (!query) return 0;
  let replaced = 0;
  for (const f of buildSearchableFields(values)) {
    if (groups && !groups.has(f.group)) continue;
    const v = getByPath(values, f.path);
    if (typeof v !== 'string') continue;
    const c = countValue(v, f.isHtml, query, opts);
    if (c > 0) {
      setValue(f.path, replaceValue(v, f.isHtml, query, replacement, opts));
      replaced += c;
    }
  }
  return replaced;
}

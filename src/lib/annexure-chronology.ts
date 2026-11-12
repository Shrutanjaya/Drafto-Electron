/**
 * Validates chronological ordering of annexures in Supreme Court petitions.
 *
 * Rule:
 * 1. All main SLP annexures (P-1 to P-n) must be chronological among each other.
 * 2. All annexures to the Application for Additional Documents (P-n+1 to P-m)
 *    must be chronological among each other.
 */

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Parses Indian legal date strings into UTC milliseconds for chronological comparison.
 * Returns null if the string is empty, undated, or unparseable.
 */
export function parseLegalDate(raw: string): number | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s || /^(?:undated|n\/?a|-+|\.+)$/i.test(s)) return null;

  // If a range is given ("15.08.2021 to 20.08.2021" or "15.08.2021 - 20.08.2021"),
  // use the opening date of the document/order.
  if (/\s+(?:to|-)\s+/i.test(s)) {
    const parts = s.split(/\s+(?:to|-)\s+/i);
    if (parts[0]) s = parts[0].trim();
  }

  // Strip ordinal suffixes: 1st, 2nd, 3rd, 15th -> 1, 2, 3, 15
  s = s.replace(/(\d+)(?:st|nd|rd|th)\b/gi, "$1");

  // Format 1: DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY or DD.MM.YY
  const dmyMatch = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day);
    }
  }

  // Format 2: DD Month YYYY (e.g. "15 August 2021", "15 Aug, 2021")
  const dmyTextMatch = s.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{2,4})$/);
  if (dmyTextMatch) {
    const day = parseInt(dmyTextMatch[1], 10);
    const mStr = dmyTextMatch[2].toLowerCase();
    let year = parseInt(dmyTextMatch[3], 10);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    const month = MONTH_MAP[mStr];
    if (month && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day);
    }
  }

  // Format 3: Month DD, YYYY (e.g. "August 15, 2021", "Aug 15 2021")
  const mdyTextMatch = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (mdyTextMatch) {
    const mStr = mdyTextMatch[1].toLowerCase();
    const day = parseInt(mdyTextMatch[2], 10);
    let year = parseInt(mdyTextMatch[3], 10);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    const month = MONTH_MAP[mStr];
    if (month && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day);
    }
  }

  // Format 4: Month YYYY (e.g. "August 2021", "Aug, 2021")
  const myTextMatch = s.match(/^([A-Za-z]+),?\s+(\d{4})$/);
  if (myTextMatch) {
    const mStr = myTextMatch[1].toLowerCase();
    const year = parseInt(myTextMatch[2], 10);
    const month = MONTH_MAP[mStr];
    if (month) {
      return Date.UTC(year, month - 1, 1);
    }
  }

  // Format 5: Year only (e.g. "2021")
  const yearMatch = s.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    return Date.UTC(year, 0, 1);
  }

  // Fallback: standard Date.parse
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return parsed;

  return null;
}

export interface AnnexureWithDate {
  id: string;
  title?: string;
  date?: string;
  isAdditionalDocument?: boolean;
}

/**
 * Checks whether annexures within the main SLP and within the Additional Documents
 * are each arranged in strict chronological order.
 * Returns an array of human-readable error messages for any inversions found.
 */
export function checkAnnexureChronology(
  annexures: AnnexureWithDate[],
  annexureNumberingMap: Map<string, number>
): string[] {
  const errors: string[] = [];

  const checkSequence = (list: AnnexureWithDate[], labelPrefix: string) => {
    // Only inspect annexures that have a valid parseable date
    const datedItems: { pNum: number; rawDate: string; timestamp: number; title: string }[] = [];

    for (const item of list) {
      const pNum = annexureNumberingMap.get(item.id);
      if (!pNum) continue;
      const ts = parseLegalDate(item.date || "");
      if (ts !== null) {
        datedItems.push({
          pNum,
          rawDate: (item.date || "").trim(),
          timestamp: ts,
          title: (item.title || "").trim(),
        });
      }
    }

    // Check each consecutive pair of dated annexures
    for (let i = 0; i < datedItems.length - 1; i++) {
      const current = datedItems[i];
      const next = datedItems[i + 1];

      if (next.timestamp < current.timestamp) {
        const nextLabel = `${labelPrefix} P-${next.pNum}`;
        const curLabel = `${labelPrefix} P-${current.pNum}`;
        errors.push(
          `${nextLabel} (dated ${next.rawDate}) is placed after ${curLabel} (dated ${current.rawDate}), but is chronologically earlier.`
        );
      }
    }
  };

  const nonAdList = annexures.filter((a) => !a.isAdditionalDocument);
  const adList = annexures.filter((a) => a.isAdditionalDocument);

  checkSequence(nonAdList, "Annexure");
  checkSequence(adList, "Additional Document Annexure");

  return errors;
}

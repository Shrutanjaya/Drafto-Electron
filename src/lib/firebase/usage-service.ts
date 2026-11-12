import { doc, getDoc, increment, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from './config';

export type GenerationType = 'paperbook' | 'docx';

const LOCAL_USAGE_KEY = 'paperbook_local_usage_cache';

function getLocalUsageCache(): UsageCounts {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(LOCAL_USAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch { /* silent */ }
  return { paperbooksGenerated: 0, docxGenerated: 0 };
}

function updateLocalUsageCache(type: GenerationType) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const cur = getLocalUsageCache();
      if (type === 'paperbook') cur.paperbooksGenerated = (cur.paperbooksGenerated || 0) + 1;
      else cur.docxGenerated = (cur.docxGenerated || 0) + 1;
      window.localStorage.setItem(LOCAL_USAGE_KEY, JSON.stringify(cur));
    }
  } catch { /* silent */ }
}

export function computeHoursSaved(counts: UsageCounts): number {
  return (counts.paperbooksGenerated || 0) * 2 + (counts.docxGenerated || 0) * 0.5;
}

export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/**
 * Increments the generation counter for the currently logged-in user.
 * Creates the document if it doesn't exist yet.
 * Fire-and-forget — never throws to the caller.
 */
export async function incrementGenerationCount(type: GenerationType): Promise<void> {
  updateLocalUsageCache(type);
  const user = auth.currentUser;
  if (!user) return;

  const ref = doc(db, 'usage', user.uid);
  const now = new Date().toISOString();
  try {
    const isPb = type === 'paperbook';
    const field = isPb ? 'paperbooksGenerated' : 'docxGenerated';
    const timestampField = isPb ? 'lastPaperbookGeneratedAt' : 'lastDocxGeneratedAt';
    await updateDoc(ref, {
      [field]: increment(1),
      [timestampField]: now,
      lastGeneratedAt: now,
    });
  } catch (err: unknown) {
    // Document likely doesn't exist — create it
    if ((err as { code?: string }).code === 'not-found') {
      try {
        const isPb = type === 'paperbook';
        await setDoc(ref, {
          email: user.email,
          displayName: user.displayName,
          paperbooksGenerated: isPb ? 1 : 0,
          docxGenerated: isPb ? 0 : 1,
          lastPaperbookGeneratedAt: isPb ? now : null,
          lastDocxGeneratedAt: isPb ? null : now,
          lastGeneratedAt: now,
        });
      } catch { /* silent */ }
    }
    // For any other error, silently ignore — counters are non-critical
  }
}

export interface UsageCounts {
  paperbooksGenerated: number;
  docxGenerated: number;
  lastPaperbookGeneratedAt?: string | null;
  lastDocxGeneratedAt?: string | null;
  lastGeneratedAt?: string | null;
}

/**
 * Fetches the current generation counts for the logged-in user.
 */
export async function getGenerationCounts(): Promise<UsageCounts> {
  const local = getLocalUsageCache();
  const user = auth.currentUser;
  if (!user) return local;

  try {
    const snap = await getDoc(doc(db, 'usage', user.uid));
    if (!snap.exists()) return local;
    const data = snap.data();
    const result: UsageCounts = {
      paperbooksGenerated: Math.max(data.paperbooksGenerated ?? 0, local.paperbooksGenerated ?? 0),
      docxGenerated: Math.max(data.docxGenerated ?? 0, local.docxGenerated ?? 0),
      lastPaperbookGeneratedAt: data.lastPaperbookGeneratedAt ?? null,
      lastDocxGeneratedAt: data.lastDocxGeneratedAt ?? null,
      lastGeneratedAt: data.lastGeneratedAt ?? null,
    };
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LOCAL_USAGE_KEY, JSON.stringify(result));
      }
    } catch { /* silent */ }
    return result;
  } catch {
    return local;
  }
}

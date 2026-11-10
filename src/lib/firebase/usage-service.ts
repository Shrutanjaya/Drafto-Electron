import { doc, getDoc, increment, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from './config';

export type GenerationType = 'paperbook' | 'docx';

/**
 * Increments the generation counter for the currently logged-in user.
 * Creates the document if it doesn't exist yet.
 * Fire-and-forget — never throws to the caller.
 */
export async function incrementGenerationCount(type: GenerationType): Promise<void> {
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
  const user = auth.currentUser;
  if (!user) return { paperbooksGenerated: 0, docxGenerated: 0 };

  try {
    const snap = await getDoc(doc(db, 'usage', user.uid));
    if (!snap.exists()) return { paperbooksGenerated: 0, docxGenerated: 0 };
    const data = snap.data();
    return {
      paperbooksGenerated: data.paperbooksGenerated ?? 0,
      docxGenerated: data.docxGenerated ?? 0,
      lastPaperbookGeneratedAt: data.lastPaperbookGeneratedAt ?? null,
      lastDocxGeneratedAt: data.lastDocxGeneratedAt ?? null,
      lastGeneratedAt: data.lastGeneratedAt ?? null,
    };
  } catch {
    return { paperbooksGenerated: 0, docxGenerated: 0 };
  }
}

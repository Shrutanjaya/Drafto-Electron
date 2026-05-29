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
  try {
    const field = type === 'paperbook' ? 'paperbooksGenerated' : 'docxGenerated';
    await updateDoc(ref, { [field]: increment(1) });
  } catch (err: unknown) {
    // Document likely doesn't exist — create it
    if ((err as { code?: string }).code === 'not-found') {
      try {
        await setDoc(ref, {
          email: user.email,
          displayName: user.displayName,
          paperbooksGenerated: type === 'paperbook' ? 1 : 0,
          docxGenerated: type === 'docx' ? 1 : 0,
        });
      } catch { /* silent */ }
    }
    // For any other error, silently ignore — counters are non-critical
  }
}

export interface UsageCounts {
  paperbooksGenerated: number;
  docxGenerated: number;
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
    };
  } catch {
    return { paperbooksGenerated: 0, docxGenerated: 0 };
  }
}

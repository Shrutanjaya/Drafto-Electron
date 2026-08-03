// ─── Early-Bird migration offer ──────────────────────────────────────────────
// The five original subscribers are offered every court at their existing price
// until 15 August 2027, reverting to the Supreme Court alone afterwards unless
// they move to a current plan.
//
// Both reading and accepting go through a Cloud Function rather than straight to
// Firestore. That is deliberate: Firestore rules forbid the app from writing
// billing fields, so a customer cannot grant themselves the migration, and
// eligibility is judged server-side from the stored record rather than from
// anything this app claims.

import { auth } from './config';

const ENDPOINT = 'https://asia-south1-draftoslp.cloudfunctions.net/earlyBirdOffer';

export interface EarlyBirdState {
  /** True when the offer is open to this account and not yet taken up. */
  eligible: boolean;
  accepted: boolean;
  reason: string;
  /** Their current monthly price, as a display string ("499", "1,499"). */
  price?: string;
  /** Accept by this date or the offer lapses. */
  deadline: string;
  /** Full court coverage runs until this date once accepted. */
  suiteUntil: string;
}

async function call(method: 'GET' | 'POST'): Promise<EarlyBirdState | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const token = await user.getIdToken();
    const res = await fetch(ENDPOINT, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 409) return null;
    return (await res.json()) as EarlyBirdState;
  } catch {
    // Offline or the function is unreachable: simply do not show the offer.
    // It is a one-off prompt, not something worth interrupting anyone over.
    return null;
  }
}

/** Is this account offered the migration right now? */
export function fetchEarlyBirdOffer(): Promise<EarlyBirdState | null> {
  return call('GET');
}

/** Record acceptance. The grant and the confirmation email are the server's job. */
export function acceptEarlyBirdOffer(): Promise<EarlyBirdState | null> {
  return call('POST');
}

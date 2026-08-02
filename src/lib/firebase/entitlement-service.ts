// ─── Entitlement service ─────────────────────────────────────────────────────
// Fetches the billing record from Firestore `users/{uid}`, normalises it, caches
// it locally, and applies the offline grace window. The pure decision logic lives
// in `@/lib/entitlement/entitlement`.

import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from './config';
import {
  resolveEntitlement,
  OFFLINE_GRACE_DAYS,
  type Entitlement,
  type UserBilling,
} from '@/lib/entitlement/entitlement';
import { SIM_ENABLED, getSim } from '@/lib/dev/sim-entitlement';

const DAY_MS = 86_400_000;
const CACHE_PREFIX = 'drafto.entitlement.';

interface CachedBilling {
  billing: UserBilling;
  fetchedAtMs: number;
}

/** Firestore stores instants as Timestamp; the resolver wants epoch seconds. */
function toSec(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (v instanceof Timestamp) return v.seconds;
  if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : v; // ms → s if needed
  if (typeof v === 'object' && v !== null && 'seconds' in (v as any)) {
    return Number((v as any).seconds);
  }
  return undefined;
}

function normalise(data: Record<string, unknown>): UserBilling {
  return {
    subscriptionStatus: data.subscriptionStatus as UserBilling['subscriptionStatus'],
    plan: data.plan as UserBilling['plan'],
    deviceLimit: typeof data.deviceLimit === 'number' ? data.deviceLimit : undefined,
    currentPeriodEnd: toSec(data.currentPeriodEnd),
    trialEnd: toSec(data.trialEnd),
    suiteAccessUntil: toSec(data.suiteAccessUntil),
    accessOverride: data.accessOverride as UserBilling['accessOverride'],
    overrideTier: data.overrideTier as UserBilling['overrideTier'],
    overrideUntil: toSec(data.overrideUntil),
  };
}

function cacheKey(uid: string) {
  return CACHE_PREFIX + uid;
}

function readCache(uid: string): CachedBilling | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBilling;
    if (!parsed || typeof parsed.fetchedAtMs !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(uid: string, billing: UserBilling): void {
  try {
    localStorage.setItem(
      cacheKey(uid),
      JSON.stringify({ billing, fetchedAtMs: Date.now() } satisfies CachedBilling),
    );
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

/** The "no active subscription" fallback, resolved at the current time. */
function lapsedNow(billing: UserBilling | null): Entitlement {
  return resolveEntitlement(billing, Math.floor(Date.now() / 1000));
}

export interface EntitlementResult extends Entitlement {
  /** True when the decision came from cache because Firestore was unreachable. */
  fromCache: boolean;
  /** True when the offline cache is older than the grace window (access denied for staleness). */
  staleOffline: boolean;
}

/**
 * Fetch and resolve the current user's entitlement.
 *  - Online  → fetch fresh, cache it, resolve.
 *  - Offline → use cache if it's within OFFLINE_GRACE_DAYS, else force read-only.
 */
export async function fetchEntitlement(): Promise<EntitlementResult> {
  const nowSec = Math.floor(Date.now() / 1000);

  // Dev simulator: resolve straight from the chosen scenario, no network.
  if (SIM_ENABLED) {
    const sim = getSim();
    if (sim.active && sim.billing) {
      return { ...resolveEntitlement(sim.billing, nowSec), fromCache: false, staleOffline: false };
    }
  }

  const user = auth.currentUser;
  if (!user) {
    return { ...lapsedNow(null), fromCache: false, staleOffline: false };
  }

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const billing = snap.exists() ? normalise(snap.data() as Record<string, unknown>) : null;
    if (billing) writeCache(user.uid, billing);
    else localStorage.removeItem(cacheKey(user.uid));
    return { ...resolveEntitlement(billing, nowSec), fromCache: false, staleOffline: false };
  } catch {
    // Network / permission failure → fall back to cached last-known-good.
    const cached = readCache(user.uid);
    if (!cached) {
      // No cache and can't reach Firestore: be conservative but do not hard-lock
      // — resolve as no-subscription (read-only), never a crash.
      return { ...lapsedNow(null), fromCache: true, staleOffline: true };
    }
    const ageMs = Date.now() - cached.fetchedAtMs;
    if (ageMs > OFFLINE_GRACE_DAYS * DAY_MS) {
      return { ...lapsedNow(cached.billing), fromCache: true, staleOffline: true };
    }
    return { ...resolveEntitlement(cached.billing, nowSec), fromCache: true, staleOffline: false };
  }
}

export { OFFLINE_GRACE_DAYS };

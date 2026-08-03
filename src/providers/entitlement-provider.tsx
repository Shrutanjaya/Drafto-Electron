import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuthContext } from '@/providers/auth-provider';
import {
  fetchEntitlement,
  type EntitlementResult,
} from '@/lib/firebase/entitlement-service';
import {
  resolveEntitlement,
  allowsCourtType,
  hasFreeForumSlot,
  type Forum,
  type CourtType,
} from '@/lib/entitlement/entitlement';
import { SIM_ENABLED, subscribeSim } from '@/lib/dev/sim-entitlement';
import { ENTITLEMENT_ENABLED } from '@/lib/entitlement/entitlement-enabled';

/** Where the in-app "Manage subscription" / "Renew" buttons send the user. */
export const MANAGE_SUBSCRIPTION_URL = 'https://drafto.quindoph.com/account';

interface EntitlementContextValue {
  entitlement: EntitlementResult;
  loading: boolean;
  refresh: () => void;
  openManageSubscription: () => void;
}

// Optimistic default while the first fetch is in flight: full access but export
// is still gated by `loading` at the call sites, so a lapsed user can't slip an
// export through during the load window.
const OPTIMISTIC: EntitlementResult = {
  ...resolveEntitlement({ subscriptionStatus: 'active' }, Math.floor(Date.now() / 1000)),
  fromCache: false,
  staleOffline: false,
};

const EntitlementContext = createContext<EntitlementContextValue | undefined>(undefined);

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // re-check every 15 min

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();
  const [entitlement, setEntitlement] = useState<EntitlementResult>(OPTIMISTIC);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    // Enforcement disabled for this build → stay at the optimistic full access.
    if (!ENTITLEMENT_ENABLED) { setLoading(false); return; }
    // In the dev simulator the entitlement comes from the chosen scenario, so it
    // resolves even without a signed-in Firebase user.
    if (!user && !SIM_ENABLED) return;
    fetchEntitlement()
      .then((e) => setEntitlement(e))
      .catch(() => { /* fetchEntitlement never throws, but be safe */ })
      .finally(() => setLoading(false));
  }, [user]);

  // Dev simulator: re-resolve the instant a scenario is switched.
  useEffect(() => {
    if (!SIM_ENABLED) return;
    return subscribeSim(() => refresh());
  }, [refresh]);

  useEffect(() => {
    if (!user) {
      setEntitlement(OPTIMISTIC);
      setLoading(true);
      return;
    }
    setLoading(true);
    refresh();

    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, refresh]);

  const openManageSubscription = useCallback(() => {
    if (window.electron?.openExternal) {
      window.electron.openExternal(MANAGE_SUBSCRIPTION_URL);
    } else {
      window.open(MANAGE_SUBSCRIPTION_URL, '_blank');
    }
  }, []);

  return (
    <EntitlementContext.Provider value={{ entitlement, loading, refresh, openManageSubscription }}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement(): EntitlementContextValue {
  const ctx = useContext(EntitlementContext);
  if (ctx === undefined) {
    throw new Error('useEntitlement must be used within an EntitlementProvider');
  }
  return ctx;
}

/** Convenience: is the app currently editable (not read-only, not loading-locked)? */
export function useCanEdit(): boolean {
  const { entitlement } = useEntitlement();
  return entitlement.access === 'full';
}

/** Convenience: may the user generate a paperbook / DOCX right now? */
export function useCanExport(): boolean {
  const { entitlement, loading } = useEntitlement();
  return !loading && entitlement.canExport;
}

/** Which fora this subscription currently covers. */
export function useForums(): Forum[] {
  const { entitlement } = useEntitlement();
  return entitlement.forums;
}

/**
 * True when the plan has an unused forum slot, so a locked document type can be
 * unlocked by choosing it rather than by paying more. Drives the difference
 * between "Use a court slot" and "Upgrade to access".
 */
export function useHasFreeForumSlot(): boolean {
  const { entitlement } = useEntitlement();
  return hasFreeForumSlot(entitlement);
}

/**
 * May the user draft this document type on their current plan?
 *
 * Separate from `useCanEdit`: a lapsed Max subscriber still *covers* Writ
 * Petitions (they simply cannot edit anything), whereas a paying Niche
 * subscriber covers only the Supreme Court. The two questions are independent
 * and the UI answers them differently — read-only shows a renew banner,
 * uncovered shows an upgrade prompt.
 */
export function useCanDraft(courtType: CourtType): boolean {
  const { entitlement } = useEntitlement();
  if (!ENTITLEMENT_ENABLED) return true;
  return allowsCourtType(entitlement, courtType);
}

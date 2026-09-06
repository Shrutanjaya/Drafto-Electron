import { AlertTriangle, Lock } from 'lucide-react';
import { useEntitlement, useHasFreeForumSlot } from '@/providers/entitlement-provider';
import { entitlementMessage, type CourtType } from '@/lib/entitlement/entitlement';
import { Button } from '@/components/ui/button';

// Every court type needs an entry: this label is dropped into the "your plan
// does not cover …" sentence, and a missing key renders it as "undefined".
// WritPetitionSC was already absent before the Appeal and PIL tools existed.
const FORUM_LABEL: Record<CourtType, string> = {
  SLP: 'Special Leave Petitions',
  Appeal: 'Appeals',
  WritPetitionSC: 'Writ Petitions',
  WritPetitionPIL: 'Writ Petitions (PIL)',
  WritPetitionDHC: 'Writ Petitions',
  OriginalApplicationCAT: 'Original Applications',
};

interface EntitlementBannerProps {
  /**
   * Set when the open project's document type is outside the user's plan. This
   * is a different problem from a lapsed subscription — the account is in good
   * standing, they simply have not bought this forum — so it gets its own
   * message and an upgrade call to action rather than a renewal one.
   */
  uncoveredCourtType?: CourtType | null;
}

/**
 * A persistent banner shown whenever the account is not in good standing —
 * grace (payment failed but still working), read-only (lapsed), or an
 * ending-soon notice — or when the open document type is not on the plan.
 * Silent when the subscription is active/trialing and the forum is covered.
 */
export function EntitlementBanner({ uncoveredCourtType }: EntitlementBannerProps = {}) {
  const { entitlement, loading, openManageSubscription } = useEntitlement();
  const hasFreeSlot = useHasFreeForumSlot();
  if (loading) return null;

  // A billing problem is the more urgent message, so it wins if both apply.
  const billingMsg = entitlementMessage(entitlement);

  if (!billingMsg && uncoveredCourtType) {
    const forum = FORUM_LABEL[uncoveredCourtType] ?? 'This document type';
    // If the plan still has an unspent court slot, the fix costs nothing — the
    // customer just chooses this forum. Only a full plan needs an upgrade.
    const cta = hasFreeSlot ? 'Add this court' : 'Upgrade to access';
    const explain = hasFreeSlot
      ? 'Your plan has a court still to be chosen, so you can add this one at no extra cost.'
      : 'Upgrade your plan to include it.';
    return (
      <div
        role="status"
        className="flex flex-wrap items-center gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary"
      >
        <Lock className="h-4 w-4 shrink-0" />
        <span className="flex-1 min-w-[12rem]">
          {forum} are not included in your current plan. You can open and read this
          matter, but editing and generation are disabled. {explain}
        </span>
        <Button size="sm" variant="default" onClick={openManageSubscription}>
          {cta}
        </Button>
      </div>
    );
  }

  if (!billingMsg) return null;

  const readOnly = entitlement.access === 'readonly';
  const cta = readOnly ? 'Renew subscription' : 'Update payment';

  return (
    <div
      role="status"
      className={
        'flex flex-wrap items-center gap-3 px-4 py-2 text-xs border-b ' +
        (readOnly
          ? 'bg-destructive/10 text-destructive border-destructive/30'
          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30')
      }
    >
      {readOnly ? (
        <Lock className="h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1 min-w-[12rem]">{billingMsg}</span>
      <Button
        size="sm"
        variant={readOnly ? 'destructive' : 'outline'}
        onClick={openManageSubscription}
      >
        {cta}
      </Button>
    </div>
  );
}

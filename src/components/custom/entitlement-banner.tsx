import { AlertTriangle, Lock } from 'lucide-react';
import { useEntitlement } from '@/providers/entitlement-provider';
import { entitlementMessage } from '@/lib/entitlement/entitlement';
import { Button } from '@/components/ui/button';

/**
 * A persistent banner shown whenever the account is not in good standing —
 * grace (payment failed but still working), read-only (lapsed), or an
 * ending-soon notice. Silent when the subscription is active/trialing.
 */
export function EntitlementBanner() {
  const { entitlement, loading, openManageSubscription } = useEntitlement();
  if (loading) return null;

  const msg = entitlementMessage(entitlement);
  if (!msg) return null;

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
      <span className="flex-1 min-w-[12rem]">{msg}</span>
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

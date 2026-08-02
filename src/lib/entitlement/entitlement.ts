// ─── Entitlement resolver ────────────────────────────────────────────────────
// Pure, side-effect-free logic that turns a user's billing record (as written by
// the Razorpay webhook into Firestore `users/{uid}`) into what the app should let
// them do. Kept separate from Firebase so it can be unit-tested in isolation.
//
// Policy (decided 2026-07-22):
//   • Lapsed (cancelled/expired past paid period) → READ-ONLY: view/open but no
//     edit and no export.
//   • Autopay-retry states (halted/paused) → GRACE: full access for GRACE_DAYS
//     past the paid-through date, with a "fix payment" nudge, then read-only.
//   • Offline: last-known-good entitlement is trusted for OFFLINE_GRACE_DAYS
//     (enforced in the service layer, not here).

export const GRACE_DAYS = 7;
export const OFFLINE_GRACE_DAYS = 7;
const DAY = 86_400; // seconds

export type RawStatus =
  | 'active'
  | 'authenticated'
  | 'trialing'
  | 'halted'
  | 'paused'
  | 'cancelled'
  | 'expired'
  | 'created'
  | (string & {})
  | undefined;

export type Plan = 'lite' | 'solo' | 'chamber' | 'enterprise' | (string & {}) | undefined;

/** Which document types the user may draft. */
export type Tier = 'full' | 'lite' | 'none';

/** What the user may do with the app. */
export type AccessLevel = 'full' | 'readonly';

/**
 * The billing record shape (subset) the webhook writes to `users/{uid}`.
 * All timestamps are epoch **seconds** by the time they reach the resolver
 * (the service layer normalises Firestore Timestamps first).
 */
export interface UserBilling {
  subscriptionStatus?: RawStatus;
  plan?: Plan;
  deviceLimit?: number;
  currentPeriodEnd?: number; // paid through this instant
  trialEnd?: number;
  // Migration + manual levers (added for the multi-doctype expansion):
  suiteAccessUntil?: number;             // full-suite tier until here, regardless of plan (3-month grandfather)
  accessOverride?: AccessLevel | 'none'; // manual override for legacy one-time users
  overrideTier?: Tier;                   // tier to grant when accessOverride is set
  overrideUntil?: number;                // override expiry (absent = permanent)
}

export interface Entitlement {
  access: AccessLevel;   // 'full' = edit + export, 'readonly' = view only
  tier: Tier;            // document types unlocked
  canExport: boolean;    // paperbook / DOCX generation allowed
  inGrace: boolean;      // true while in the autopay-retry grace window
  status: RawStatus;     // raw Razorpay status, for display/telemetry
  plan: Plan;
  reason: EntitlementReason;
}

export type EntitlementReason =
  | 'active'
  | 'trial'
  | 'cancelled-period-remaining' // cancelled but paid period not yet over
  | 'grace-payment-failed'       // halted/paused, still inside grace
  | 'lapsed'                     // cancelled/expired past paid period
  | 'payment-failed'             // halted/paused past grace
  | 'no-subscription'            // no usable billing record
  | 'override';                  // manual override applied

const PAYING = new Set(['active', 'authenticated', 'trialing']);
const RETRY = new Set(['halted', 'paused']);

/** Map a plan to the document-type tier it unlocks. */
export function tierForPlan(plan: Plan): Tier {
  if (plan === 'lite') return 'lite';
  if (plan === 'solo' || plan === 'chamber' || plan === 'enterprise') return 'full';
  // Unknown/undefined plan on an otherwise-valid subscription: default to the
  // historically-sold scope (full) so we never under-deliver to a payer.
  return 'full';
}

function readonly(
  status: RawStatus,
  plan: Plan,
  reason: EntitlementReason,
): Entitlement {
  return { access: 'readonly', tier: tierForPlan(plan), canExport: false, inGrace: false, status, plan, reason };
}

function fullAccess(
  status: RawStatus,
  plan: Plan,
  reason: EntitlementReason,
  tier: Tier,
  inGrace = false,
): Entitlement {
  return { access: 'full', tier, canExport: true, inGrace, status, plan, reason };
}

/**
 * Resolve a billing record into an entitlement. `nowSec` is epoch seconds
 * (injectable for testing).
 */
export function resolveEntitlement(b: UserBilling | null | undefined, nowSec: number): Entitlement {
  const plan = b?.plan;
  const status = b?.subscriptionStatus;

  // The document-type tier the user is entitled to. The 3-month migration grant
  // (suiteAccessUntil) promotes anyone to the full suite while it is live.
  const suiteActive = !!b?.suiteAccessUntil && nowSec < b.suiteAccessUntil;
  const baseTier: Tier = suiteActive ? 'full' : tierForPlan(plan);

  // 1) Manual override wins (legacy one-time users, comps, support fixes).
  if (b?.accessOverride && (b.overrideUntil == null || nowSec < b.overrideUntil)) {
    if (b.accessOverride === 'none') return readonly(status, plan, 'override');
    const tier = b.overrideTier ?? baseTier;
    return fullAccess(status, plan, 'override', tier === 'none' ? baseTier : tier);
  }

  if (!status) return readonly(status, plan, 'no-subscription');

  // 2) Currently paying / in trial.
  if (PAYING.has(status)) {
    return fullAccess(status, plan, status === 'trialing' ? 'trial' : 'active', baseTier);
  }

  // 3) Autopay-retry states: grace for GRACE_DAYS past the paid-through date.
  if (RETRY.has(status)) {
    const paidThrough = b?.currentPeriodEnd;
    if (paidThrough != null && nowSec < paidThrough + GRACE_DAYS * DAY) {
      return fullAccess(status, plan, 'grace-payment-failed', baseTier, true);
    }
    return readonly(status, plan, 'payment-failed');
  }

  // 4) Cancelled but the already-paid period hasn't ended yet → keep full access.
  if (status === 'cancelled' && b?.currentPeriodEnd != null && nowSec < b.currentPeriodEnd) {
    return fullAccess(status, plan, 'cancelled-period-remaining', baseTier);
  }

  // 5) Everything else (cancelled past period, expired, created, unknown) → read-only.
  return readonly(status, plan, 'lapsed');
}

/** Short, user-facing explanation for the entitlement banner. */
export function entitlementMessage(e: Entitlement): string | null {
  switch (e.reason) {
    case 'grace-payment-failed':
      return 'We couldn’t process your last payment. Please update your payment method to avoid losing access.';
    case 'payment-failed':
      return 'Your subscription is on hold because a payment failed. Renew to restore full access — your work is view-only until then.';
    case 'lapsed':
      return 'Your subscription has ended. You can view your existing matters, but editing and PDF/DOCX generation are disabled until you renew.';
    case 'no-subscription':
      return 'No active subscription is linked to this account. Editing and generation are disabled.';
    case 'cancelled-period-remaining':
      return 'Your subscription is set to end at the close of the current billing period.';
    default:
      return null; // active / trial / override(full): no banner
  }
}

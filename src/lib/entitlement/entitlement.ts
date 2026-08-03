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

export type Plan =
  // Court-coverage plans (from 15 Aug 2026)
  | 'niche' | 'dual' | 'max'
  // Early-Bird plans, sold as a Supreme Court tool and priced by device count
  | 'solo' | 'chamber' | 'enterprise'
  | (string & {})
  | undefined;

/**
 * A forum Drafto can draft for. Plans are sold by HOW MANY of these a customer
 * gets (Niche 1, Dual 2, Max all); WHICH ones they hold is their own choice,
 * recorded on their billing record. So an advocate who never appears in the
 * Supreme Court can buy Niche and pick the Tribunal instead.
 *
 * Deliberately a list rather than a ladder: there is no sense in which the
 * Tribunal "contains" the High Court, and new fora can be added without
 * disturbing anything.
 */
export type Forum = 'SC' | 'HC-DEL' | 'CAT';

export const ALL_FORUMS: readonly Forum[] = ['SC', 'HC-DEL', 'CAT'];

export const FORUM_LABEL: Record<Forum, string> = {
  'SC': 'Supreme Court of India',
  'HC-DEL': 'High Court of Delhi at New Delhi',
  'CAT': 'Central Administrative Tribunal',
};

/** Project court types the app can draft. Mirrors DraftoProject['courtType']. */
export type CourtType = 'SLP' | 'WritPetitionDHC' | 'OriginalApplicationCAT';

/**
 * Which forum a document type belongs to. Document types are grouped by forum
 * on purpose: a customer who has bought the Delhi High Court gets the replies
 * and rejoinders added there later without buying anything again.
 */
const FORUM_OF: Record<CourtType, Forum> = {
  SLP: 'SC',
  WritPetitionDHC: 'HC-DEL',
  OriginalApplicationCAT: 'CAT',
};

export function forumOf(courtType: CourtType): Forum | undefined {
  return FORUM_OF[courtType];
}

/** How many fora a plan includes. `null` means every forum, including future ones. */
export function forumAllowanceForPlan(plan: Plan): number | null {
  switch (plan) {
    case 'max': return null;
    case 'dual': return 2;
    case 'niche': return 1;
    // Early-Bird plans differed only by device count and were sold as a Supreme
    // Court tool: one forum. Their one-year full-suite grant rides on
    // `suiteAccessUntil`, not on the plan.
    case 'solo': case 'chamber': case 'enterprise': return 1;
    // Unknown or absent plan: the narrowest allowance. Never default to all, or
    // a typo in a plan name gives away the whole suite.
    default: return 1;
  }
}

function isForum(v: unknown): v is Forum {
  return typeof v === 'string' && (ALL_FORUMS as readonly string[]).includes(v);
}

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
  /**
   * Full-suite coverage until this instant regardless of plan. This is the
   * Early-Bird grandfather grant: the five original subscribers keep every
   * forum until 15 Aug 2027 at their existing price, then fall back to whatever
   * their plan covers (Supreme Court) unless they move to a current plan.
   * Expires by itself — there is no dated task to remember.
   */
  suiteAccessUntil?: number;
  /**
   * The fora this customer has chosen, within the allowance their plan gives
   * them. Written by the webhook from the checkout selection, and changeable
   * once per billing period. Absent means they have not chosen — every
   * subscription sold before the court-coverage plans was a Supreme Court tool,
   * so that is the fallback.
   */
  courts?: string[];
  accessOverride?: AccessLevel | 'none'; // manual override for legacy one-time users
  /**
   * Fora to grant when accessOverride is set. 'full'/'all' grants every forum;
   * 'lite'/'sc' grants the Supreme Court. The first spelling of each pair is
   * already written to live records.
   */
  overrideTier?: 'full' | 'all' | 'lite' | 'sc' | 'none';
  overrideUntil?: number;                // override expiry (absent = permanent)
}

/** Fora granted by a manual override, or null to fall back to the plan. */
function overrideForums(v: UserBilling['overrideTier']): Forum[] | null {
  switch (v) {
    case 'all': case 'full': return [...ALL_FORUMS];
    case 'sc': case 'lite': return ['SC'];
    default: return null;
  }
}

export interface Entitlement {
  access: AccessLevel;   // 'full' = edit + export, 'readonly' = view only
  forums: Forum[];       // which fora the user may draft for
  forumAllowance: number | null; // how many they may hold; null = every forum
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

/**
 * Work out which fora a record actually grants.
 *
 * The plan sets the allowance; the customer's own selection fills it. The
 * selection is capped at the allowance so that a stale or over-long list can
 * never hand out more than was paid for.
 */
function resolveForums(b: UserBilling | null | undefined, suiteActive: boolean): Forum[] {
  if (suiteActive) return [...ALL_FORUMS];

  const allowance = forumAllowanceForPlan(b?.plan);
  if (allowance === null) return [...ALL_FORUMS];

  const chosen = (b?.courts ?? []).filter(isForum);
  // No selection recorded: every subscription sold before the court-coverage
  // plans was a Supreme Court tool, so that is the safe fallback.
  const list = chosen.length > 0 ? chosen : (['SC'] as Forum[]);

  // De-duplicate, then honour only as many as the plan allows.
  return [...new Set(list)].slice(0, allowance);
}

function readonly(
  status: RawStatus,
  plan: Plan,
  reason: EntitlementReason,
  forums: Forum[],
): Entitlement {
  return {
    access: 'readonly', forums, forumAllowance: forumAllowanceForPlan(plan),
    canExport: false, inGrace: false, status, plan, reason,
  };
}

function fullAccess(
  status: RawStatus,
  plan: Plan,
  reason: EntitlementReason,
  forums: Forum[],
  inGrace = false,
): Entitlement {
  return {
    access: 'full', forums, forumAllowance: forumAllowanceForPlan(plan),
    canExport: true, inGrace, status, plan, reason,
  };
}

/** May this entitlement draft the given document type? */
export function allowsCourtType(e: Entitlement, courtType: CourtType): boolean {
  const forum = forumOf(courtType);
  if (!forum) return false; // unknown document type → deny, never guess
  return e.forums.includes(forum);
}

/** Does the customer have an unused forum slot they could spend on `forum`? */
export function hasFreeForumSlot(e: Entitlement): boolean {
  if (e.forumAllowance === null) return false; // Max already has everything
  return e.forums.length < e.forumAllowance;
}

/**
 * Resolve a billing record into an entitlement. `nowSec` is epoch seconds
 * (injectable for testing).
 */
export function resolveEntitlement(b: UserBilling | null | undefined, nowSec: number): Entitlement {
  const plan = b?.plan;
  const status = b?.subscriptionStatus;

  // Which courts the user may draft for. The Early-Bird grandfather grant
  // (suiteAccessUntil) promotes them to every forum while it is live, and
  // lapses on its own date without anything having to run.
  const suiteActive = !!b?.suiteAccessUntil && nowSec < b.suiteAccessUntil;
  const baseForums = resolveForums(b, suiteActive);

  // 1) Manual override wins (legacy one-time users, comps, support fixes).
  if (b?.accessOverride && (b.overrideUntil == null || nowSec < b.overrideUntil)) {
    if (b.accessOverride === 'none') return readonly(status, plan, 'override', baseForums);
    return fullAccess(status, plan, 'override', overrideForums(b.overrideTier) ?? baseForums);
  }

  if (!status) return readonly(status, plan, 'no-subscription', baseForums);

  // 2) Currently paying / in trial.
  if (PAYING.has(status)) {
    return fullAccess(status, plan, status === 'trialing' ? 'trial' : 'active', baseForums);
  }

  // 3) Autopay-retry states: grace for GRACE_DAYS past the paid-through date.
  if (RETRY.has(status)) {
    const paidThrough = b?.currentPeriodEnd;
    if (paidThrough != null && nowSec < paidThrough + GRACE_DAYS * DAY) {
      return fullAccess(status, plan, 'grace-payment-failed', baseForums, true);
    }
    return readonly(status, plan, 'payment-failed', baseForums);
  }

  // 4) Cancelled but the already-paid period hasn't ended yet → keep full access.
  if (status === 'cancelled' && b?.currentPeriodEnd != null && nowSec < b.currentPeriodEnd) {
    return fullAccess(status, plan, 'cancelled-period-remaining', baseForums);
  }

  // 5) Everything else (cancelled past period, expired, created, unknown) → read-only.
  return readonly(status, plan, 'lapsed', baseForums);
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

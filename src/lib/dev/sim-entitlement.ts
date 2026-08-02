// ─── Dev-only entitlement / device simulator ─────────────────────────────────
// Lets you exercise every subscription and device-seat state WITHOUT touching
// real Firestore or real Razorpay data. Gated exactly like the WP feature: on in
// dev (`import.meta.env.DEV`) or when VITE_ENABLE_DEVSIM=true at build time.
// Production customer builds never see it and behave normally.
//
// When a scenario is active, the entitlement service resolves from the simulated
// billing record and the auth hook fabricates the device list — instantly, with
// no network. State is persisted in localStorage and broadcast via SIM_EVENT so
// providers re-evaluate the moment you switch scenarios.

import type { UserBilling } from '@/lib/entitlement/entitlement';

export const SIM_ENABLED: boolean =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEVSIM === 'true';

const KEY = 'drafto.devsim';
export const SIM_EVENT = 'drafto-sim-changed';

export interface SimDeviceConfig {
  limit: number;
  otherDevices: number; // fabricated "other" devices already holding seats
  forceLimitReached: boolean;
}

export interface SimState {
  active: boolean;
  presetId: string;
  billing: UserBilling | null;
  device: SimDeviceConfig | null;
}

export interface SimPreset {
  id: string;
  label: string;
  group: 'Subscription' | 'Devices';
  billing: UserBilling | null;
  device?: SimDeviceConfig;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const inDays = (n: number) => nowSec() + n * 86_400;

// Ordered list of scenarios shown in the dev panel.
export const SIM_PRESETS: SimPreset[] = [
  {
    id: 'active-solo',
    label: 'Active · Solo (1 seat)',
    group: 'Subscription',
    billing: { subscriptionStatus: 'active', plan: 'solo', deviceLimit: 1, currentPeriodEnd: inDays(20) },
  },
  {
    id: 'active-chamber',
    label: 'Active · Chamber (3 seats)',
    group: 'Subscription',
    billing: { subscriptionStatus: 'active', plan: 'chamber', deviceLimit: 3, currentPeriodEnd: inDays(20) },
  },
  {
    id: 'trial',
    label: 'Trial (in trial period)',
    group: 'Subscription',
    billing: { subscriptionStatus: 'trialing', plan: 'solo', deviceLimit: 1, trialEnd: inDays(5) },
  },
  {
    id: 'grace',
    label: 'Payment failed · in grace (still works)',
    group: 'Subscription',
    billing: { subscriptionStatus: 'halted', plan: 'solo', deviceLimit: 1, currentPeriodEnd: inDays(-2) },
  },
  {
    id: 'past-grace',
    label: 'Payment failed · past grace (read-only)',
    group: 'Subscription',
    billing: { subscriptionStatus: 'halted', plan: 'solo', deviceLimit: 1, currentPeriodEnd: inDays(-10) },
  },
  {
    id: 'lapsed',
    label: 'Expired / lapsed (read-only)',
    group: 'Subscription',
    billing: { subscriptionStatus: 'expired', plan: 'solo', deviceLimit: 1 },
  },
  {
    id: 'cancelled-remaining',
    label: 'Cancelled · paid period remaining (still works)',
    group: 'Subscription',
    billing: { subscriptionStatus: 'cancelled', plan: 'solo', deviceLimit: 1, currentPeriodEnd: inDays(10) },
  },
  {
    id: 'no-sub',
    label: 'No subscription (read-only)',
    group: 'Subscription',
    billing: {},
  },
  {
    id: 'test-override',
    label: 'Test account · override full',
    group: 'Subscription',
    billing: { accessOverride: 'full', overrideTier: 'full' },
  },
  {
    id: 'suite-migration',
    label: 'Migration grant · lite plan, full suite (3-mo)',
    group: 'Subscription',
    billing: { subscriptionStatus: 'active', plan: 'lite', deviceLimit: 1, currentPeriodEnd: inDays(20), suiteAccessUntil: inDays(90) },
  },
  {
    id: 'devices-1of3',
    label: 'Chamber · 1 of 3 seats used',
    group: 'Devices',
    billing: { subscriptionStatus: 'active', plan: 'chamber', deviceLimit: 3, currentPeriodEnd: inDays(20) },
    device: { limit: 3, otherDevices: 0, forceLimitReached: false },
  },
  {
    id: 'devices-2of3',
    label: 'Chamber · 2 of 3 seats used',
    group: 'Devices',
    billing: { subscriptionStatus: 'active', plan: 'chamber', deviceLimit: 3, currentPeriodEnd: inDays(20) },
    device: { limit: 3, otherDevices: 1, forceLimitReached: false },
  },
  {
    id: 'devices-full',
    label: 'Chamber · 3 of 3 — limit reached (blocked)',
    group: 'Devices',
    billing: { subscriptionStatus: 'active', plan: 'chamber', deviceLimit: 3, currentPeriodEnd: inDays(20) },
    device: { limit: 3, otherDevices: 3, forceLimitReached: true },
  },
  {
    id: 'devices-solo-full',
    label: 'Solo · 1 of 1 — limit reached (blocked)',
    group: 'Devices',
    billing: { subscriptionStatus: 'active', plan: 'solo', deviceLimit: 1, currentPeriodEnd: inDays(20) },
    device: { limit: 1, otherDevices: 1, forceLimitReached: true },
  },
];

const OFF: SimState = { active: false, presetId: '', billing: null, device: null };

export function getSim(): SimState {
  if (!SIM_ENABLED) return OFF;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...OFF, ...(JSON.parse(raw) as SimState) };
  } catch {
    /* ignore */
  }
  return OFF;
}

function write(s: SimState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(SIM_EVENT));
}

export function setSimPreset(id: string) {
  const p = SIM_PRESETS.find((x) => x.id === id);
  if (!p) return;
  write({ active: true, presetId: id, billing: p.billing, device: p.device ?? null });
}

export function clearSim() {
  write(OFF);
}

/**
 * Dev only: free one simulated "other" seat (as if signing that device out
 * remotely). Lets the blocked-screen "Remove" button demonstrate the real
 * auto-admit behavior while simulating.
 */
export function simRemoveOtherDevice() {
  const s = getSim();
  if (!s.active || !s.device || s.device.otherDevices <= 0) return;
  const otherDevices = s.device.otherDevices - 1;
  const forceLimitReached = otherDevices >= s.device.limit;
  write({ ...s, device: { ...s.device, otherDevices, forceLimitReached } });
}

export function subscribeSim(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(SIM_EVENT, handler);
  return () => window.removeEventListener(SIM_EVENT, handler);
}

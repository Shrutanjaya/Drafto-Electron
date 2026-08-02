// ─── Device / seat service ───────────────────────────────────────────────────
// Multi-device licensing. A user may run up to `deviceLimit` concurrent devices
// (solo 1 / chamber 3 / enterprise 5 — written to `users/{uid}.deviceLimit` by
// the Razorpay webhook).
//
// Storage: a `devices` MAP inside the existing `sessions/{uid}` document, keyed
// by deviceId. This deliberately reuses the doc path the deployed Firestore
// rules already permit (`match /sessions/{userId}`), so the feature ships with
// the app alone — no security-rules deploy required.
//
// Policy (decided 2026-07-22):
//   • At the limit, a NEW device is BLOCKED (not auto-evicting an old one).
//   • Seats are freed only by explicit sign-out — this device, or remotely via
//     the in-app "Manage devices" list. No inactivity auto-reclaim.

import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  deleteField,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { generateDeviceId, getDeviceInfo } from './auth-service';

const DEFAULT_LIMIT = 1;

export interface DeviceRecord {
  deviceId: string;
  deviceInfo?: { os: string; hostname: string; appVersion: string };
  loginTime?: { seconds: number } | null;
  lastHeartbeat?: { seconds: number } | null;
}

export type RegisterStatus = 'registered' | 'limit-reached';

export interface RegisterResult {
  status: RegisterStatus;
  deviceId: string;
  devices: DeviceRecord[];
  limit: number;
}

function sessionRef(uid: string) {
  return doc(db, 'sessions', uid);
}

/** This install's stable device id (persisted in localStorage). */
export function currentDeviceId(): string {
  return generateDeviceId();
}

async function getDeviceLimit(uid: string): Promise<number> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const n = snap.exists() ? (snap.data().deviceLimit as number | undefined) : undefined;
    return typeof n === 'number' && n > 0 ? n : DEFAULT_LIMIT;
  } catch {
    return DEFAULT_LIMIT;
  }
}

function mapToList(devices: Record<string, any> | undefined): DeviceRecord[] {
  if (!devices || typeof devices !== 'object') return [];
  return Object.entries(devices).map(([deviceId, v]) => ({ deviceId, ...(v as object) }));
}

export async function listDevices(uid: string): Promise<DeviceRecord[]> {
  const snap = await getDoc(sessionRef(uid));
  return mapToList(snap.exists() ? (snap.data().devices as Record<string, any>) : undefined);
}

/**
 * Register THIS device against the user's seat limit, atomically.
 *  - Already registered → refresh heartbeat and allow.
 *  - Under the limit     → claim a seat and allow.
 *  - At the limit        → 'limit-reached' (caller shows the blocked screen).
 */
export async function registerDevice(uid: string): Promise<RegisterResult> {
  const deviceId = generateDeviceId();
  const limit = await getDeviceLimit(uid);
  const ref = sessionRef(uid);

  const status = await runTransaction<RegisterStatus>(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const devices: Record<string, any> =
      data.devices && typeof data.devices === 'object' ? { ...data.devices } : {};
    const ids = Object.keys(devices);

    if (ids.includes(deviceId)) {
      devices[deviceId] = {
        ...devices[deviceId],
        deviceInfo: getDeviceInfo(),
        lastHeartbeat: serverTimestamp(),
      };
      tx.set(ref, { devices }, { merge: true });
      return 'registered';
    }
    if (ids.length < limit) {
      devices[deviceId] = {
        deviceInfo: getDeviceInfo(),
        loginTime: serverTimestamp(),
        lastHeartbeat: serverTimestamp(),
      };
      tx.set(ref, { devices }, { merge: true });
      return 'registered';
    }
    return 'limit-reached';
  });

  const devices = await listDevices(uid);
  return { status, deviceId, devices, limit };
}

/** Remove a device's seat (sign it out). Works for this device or a remote one. */
export async function signOutDevice(uid: string, deviceId: string): Promise<void> {
  try {
    await updateDoc(sessionRef(uid), { [`devices.${deviceId}`]: deleteField() });
  } catch {
    /* doc may not exist yet — nothing to remove */
  }
}

/** Release the current device's seat (on explicit sign-out). */
export async function releaseCurrentDevice(uid: string): Promise<void> {
  await signOutDevice(uid, generateDeviceId());
}

/**
 * Keep this device's seat warm — but never re-create a seat that was signed out
 * remotely (only touch the heartbeat if this device is still present).
 */
export async function heartbeatDevice(uid: string): Promise<void> {
  const deviceId = generateDeviceId();
  try {
    const snap = await getDoc(sessionRef(uid));
    const devices = snap.exists() ? (snap.data().devices as Record<string, any>) : undefined;
    if (devices && devices[deviceId]) {
      await updateDoc(sessionRef(uid), { [`devices.${deviceId}.lastHeartbeat`]: serverTimestamp() });
    }
  } catch {
    /* non-critical */
  }
}

/**
 * Real-time subscription to the user's device list. Enables instant
 * enforcement: when this device's seat is removed remotely, `cb` fires with a
 * list that no longer contains it, and the caller force-logs-out.
 */
export function subscribeDevices(uid: string, cb: (devices: DeviceRecord[]) => void): Unsubscribe {
  return onSnapshot(sessionRef(uid), (snap) => {
    cb(mapToList(snap.exists() ? (snap.data().devices as Record<string, any>) : undefined));
  });
}

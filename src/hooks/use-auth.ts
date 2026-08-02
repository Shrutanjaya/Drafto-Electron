import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import { authService } from '@/lib/firebase/auth-service';
import {
  registerDevice,
  subscribeDevices,
  heartbeatDevice,
  signOutDevice as signOutDeviceSvc,
  releaseCurrentDevice,
  currentDeviceId,
  type DeviceRecord,
} from '@/lib/firebase/device-service';
import { startGoogleAuth } from '@/lib/ipc/auth';
import { SIM_ENABLED, getSim, subscribeSim, simRemoveOtherDevice } from '@/lib/dev/sim-entitlement';
import { ENTITLEMENT_ENABLED } from '@/lib/entitlement/entitlement-enabled';
import { useNavigate } from 'react-router-dom';

const HEARTBEAT_MS = 10 * 60 * 1000;

export type DeviceStatus = 'checking' | 'registered' | 'limit-reached';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Device-seat state.
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>('checking');
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [deviceLimit, setDeviceLimit] = useState<number>(1);

  const navigate = useNavigate();

  // Refs so the real-time device listener always sees the latest values.
  const statusRef = useRef<DeviceStatus>('checking');
  const limitRef = useRef<number>(1);
  statusRef.current = deviceStatus;
  limitRef.current = deviceLimit;

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged((u) => {
      setUser(u);
      setLoading(false);
    });

    const handleForceLogout = (event: any) => {
      const reason = event.detail?.reason || 'Your session has been terminated';
      navigate(`/login?error=${encodeURIComponent(reason)}`);
    };
    window.addEventListener('force-logout', handleForceLogout);

    return () => {
      unsubscribe();
      window.removeEventListener('force-logout', handleForceLogout);
    };
  }, [navigate]);

  // Device-seat registration + lifecycle, driven by auth state (runs on fresh
  // sign-in AND on app reload with a persisted session).
  useEffect(() => {
    if (!user) {
      setDeviceStatus('checking');
      setDevices([]);
      authService.stopPeriodicValidation();
      return;
    }

    // Seat enforcement disabled for this build → admit every device.
    if (!ENTITLEMENT_ENABLED) {
      setDeviceStatus('registered');
      authService.startPeriodicValidation();
      return () => authService.stopPeriodicValidation();
    }

    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const uid = user.uid;

    const startRegisteredLifecycle = () => {
      authService.startPeriodicValidation();
      if (!heartbeat) {
        heartbeat = setInterval(() => heartbeatDevice(uid), HEARTBEAT_MS);
      }
    };

    // Dev simulator: fabricate the device list/limit from the chosen scenario
    // instead of hitting Firestore. Returns true when a device scenario is live.
    const applyDeviceSim = (): boolean => {
      if (!SIM_ENABLED) return false;
      const sim = getSim();
      if (!sim.active || !sim.device) return false;
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      authService.stopPeriodicValidation();
      const others = Array.from({ length: sim.device.otherDevices }).map((_, i) => ({
        deviceId: `sim-other-${i}`,
        deviceInfo: { os: 'Simulated', hostname: `Simulated device ${i + 1}`, appVersion: 'dev' },
      }));
      setDeviceLimit(sim.device.limit);
      if (sim.device.forceLimitReached) {
        setDevices(others);
        setDeviceStatus('limit-reached');
      } else {
        setDevices([
          { deviceId: currentDeviceId(), deviceInfo: { os: 'This device', hostname: 'This device', appVersion: 'dev' } },
          ...others,
        ]);
        setDeviceStatus('registered');
      }
      return true;
    };

    const attempt = async () => {
      if (applyDeviceSim()) return;
      setDeviceStatus('checking');
      try {
        const res = await registerDevice(uid);
        if (cancelled) return;
        setDevices(res.devices);
        setDeviceLimit(res.limit);
        setDeviceStatus(res.status);
        if (res.status === 'registered') startRegisteredLifecycle();
      } catch {
        // Network/Firestore failure (e.g. offline in court): fail OPEN so a
        // valid user is never stranded. Seat enforcement resumes once the
        // real-time listener reconnects.
        if (cancelled) return;
        setDeviceStatus('registered');
        startRegisteredLifecycle();
      }
    };

    attempt();

    // Real-time enforcement + auto-retry when a seat frees up.
    const unsub = subscribeDevices(uid, (list) => {
      if (cancelled) return;
      // Ignore real Firestore updates while a device scenario is simulated.
      if (SIM_ENABLED && getSim().device) return;
      setDevices(list);
      const mePresent = list.some((d) => d.deviceId === currentDeviceId());

      // Our seat was revoked remotely → sign this device out immediately.
      if (statusRef.current === 'registered' && !mePresent) {
        window.dispatchEvent(
          new CustomEvent('force-logout', {
            detail: { reason: 'This device was signed out from another device.' },
          }),
        );
        authService.signOut();
        return;
      }

      // We were blocked, and now there's room → try to claim a seat.
      if (statusRef.current === 'limit-reached' && !mePresent && list.length < limitRef.current) {
        attempt();
      }
    });

    // Dev simulator: re-apply the moment a scenario is switched.
    const simUnsub = SIM_ENABLED ? subscribeSim(() => { attempt(); }) : () => {};

    return () => {
      cancelled = true;
      unsub();
      simUnsub();
      if (heartbeat) clearInterval(heartbeat);
    };
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      const result = await authService.signIn(email, password);
      return result.user;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      setError(null);
      setLoading(true);
      const u = await authService.signUp(email, password, displayName);
      return u;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      setError(null);
      const uid = user?.uid;
      if (uid && ENTITLEMENT_ENABLED) await releaseCurrentDevice(uid); // free this device's seat
      await authService.signOut();
      navigate('/login');
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [navigate, user]);

  const resetPassword = useCallback(async (email: string) => {
    try {
      setError(null);
      await authService.resetPassword(email);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
      if (!clientId) throw new Error('Google sign-in is not configured');
      const { idToken, accessToken } = await startGoogleAuth(clientId);
      await authService.signInWithGoogleCredential(idToken, accessToken);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Sign a device out of its seat (this device or a remote one). The real-time
  // listener handles the consequences (force-logout here, or auto-retry).
  const signOutDevice = useCallback(
    async (deviceId: string) => {
      // In a device simulation, "sign out" a fabricated seat locally.
      if (SIM_ENABLED && getSim().device) {
        if (deviceId.startsWith('sim-other')) simRemoveOtherDevice();
        return;
      }
      if (!user) return;
      await signOutDeviceSvc(user.uid, deviceId);
    },
    [user],
  );

  return {
    user,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    resetPassword,
    signInWithGoogle,
    isAuthenticated: !!user,
    // device seats
    deviceStatus,
    devices,
    deviceLimit,
    currentDeviceId: currentDeviceId(),
    signOutDevice,
  };
}

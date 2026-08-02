import { useState } from 'react';
import { Laptop, LogOut, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';

function when(ts?: { seconds: number } | null): string {
  if (!ts?.seconds) return '';
  try {
    return new Date(ts.seconds * 1000).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

/**
 * List of the account's active devices, each with a sign-out button. Shared by
 * the device-limit blocked screen and the Settings dialog.
 */
export function ManageDevices({ compact = false }: { compact?: boolean }) {
  const { devices, currentDeviceId, deviceLimit, signOutDevice } = useAuthContext();
  const [busy, setBusy] = useState<string | null>(null);

  const handleSignOut = async (deviceId: string) => {
    setBusy(deviceId);
    try {
      await signOutDevice(deviceId);
    } finally {
      setBusy(null);
    }
  };

  const sorted = [...devices].sort((a, b) =>
    a.deviceId === currentDeviceId ? -1 : b.deviceId === currentDeviceId ? 1 : 0,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Active devices</span>
        <span>
          {devices.length} / {deviceLimit} seats in use
        </span>
      </div>
      <ul className="space-y-2">
        {sorted.map((d) => {
          const isCurrent = d.deviceId === currentDeviceId;
          return (
            <li
              key={d.deviceId}
              className="flex items-center justify-between gap-3 rounded-md border p-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Laptop className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {d.deviceInfo?.hostname || d.deviceInfo?.os || 'Unknown device'}
                    {isCurrent && (
                      <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        This device
                      </span>
                    )}
                  </p>
                  {!compact && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {d.deviceInfo?.os}
                      {when(d.lastHeartbeat) ? ` · last active ${when(d.lastHeartbeat)}` : ''}
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isCurrent ? 'ghost' : 'outline'}
                disabled={busy === d.deviceId}
                onClick={() => handleSignOut(d.deviceId)}
              >
                {busy === d.deviceId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <LogOut className="mr-1 h-3.5 w-3.5" />
                    {isCurrent ? 'Sign out' : 'Remove'}
                  </>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

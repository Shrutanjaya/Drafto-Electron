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
    <div className={compact ? "w-full space-y-1.5" : "space-y-2"}>
      <div className={compact ? "flex items-center justify-between text-[11px] text-muted-foreground" : "flex items-center justify-between text-xs text-muted-foreground"}>
        <span>{compact ? `${devices.length} of ${deviceLimit} seats in use` : "Active devices"}</span>
        {!compact && (
          <span>
            {devices.length} / {deviceLimit} seats in use
          </span>
        )}
      </div>
      <ul className={compact ? "space-y-1" : "space-y-2"}>
        {sorted.map((d) => {
          const isCurrent = d.deviceId === currentDeviceId;
          return (
            <li
              key={d.deviceId}
              className={compact
                ? "flex items-center justify-between gap-2 rounded border bg-muted/20 px-2.5 py-1 text-[12px]"
                : "flex items-center justify-between gap-3 rounded-md border p-2.5"
              }
            >
              <div className="flex min-w-0 items-center gap-2">
                <Laptop className={compact ? "h-3.5 w-3.5 shrink-0 text-muted-foreground" : "h-4 w-4 shrink-0 text-muted-foreground"} />
                <div className="min-w-0 flex items-center gap-1.5">
                  <p className={compact ? "truncate text-[12px] font-medium" : "truncate text-sm font-medium"}>
                    {d.deviceInfo?.hostname || d.deviceInfo?.os || 'Unknown device'}
                  </p>
                  {isCurrent && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary shrink-0">
                      This device
                    </span>
                  )}
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
                className={compact ? "h-6 px-2 text-[11px] shrink-0" : undefined}
                disabled={busy === d.deviceId}
                onClick={() => handleSignOut(d.deviceId)}
              >
                {busy === d.deviceId ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <LogOut className="mr-1 h-3 w-3" />
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

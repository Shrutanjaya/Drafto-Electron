import { ShieldAlert } from 'lucide-react';
import { useAuthContext } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { ManageDevices } from '@/components/auth/manage-devices';

/**
 * Shown when the user is authenticated but every device seat is taken. They can
 * free a seat by signing out one of their other devices right here — the
 * real-time listener then auto-admits this device — or sign out entirely.
 */
export function DeviceLimitScreen() {
  const { deviceLimit, signOut } = useAuthContext();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-5 rounded-xl border bg-white p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-amber-500/10 p-2">
            <ShieldAlert className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Device limit reached</h1>
            <p className="text-sm text-muted-foreground">
              Your plan allows {deviceLimit} device{deviceLimit === 1 ? '' : 's'} at a time.
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          To use Drafto on this device, sign out of one below. This device will be
          admitted automatically as soon as a seat frees up.
        </p>

        <ManageDevices />

        <div className="flex justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out of this account
          </Button>
        </div>
      </div>
    </div>
  );
}

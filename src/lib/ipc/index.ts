/**
 * IPC bridge: renderer-side wrappers for ipcMain handlers.
 * Replaces Next.js Server Actions.
 *
 * Usage:
 *   import { convertDocxToPdf } from "@/lib/ipc/pdf";
 *   const result = await convertDocxToPdf(docxBuffer);
 */

/** Returns the platform string ("win32" | "darwin" | "linux"). */
export function getPlatform(): string {
  return window.electron?.platform ?? "web";
}

/** Invoke any IPC channel safely. */
export async function ipcInvoke<T = unknown>(channel: string, payload?: unknown): Promise<T> {
  if (!window.electron) {
    throw new Error("IPC not available (running outside Electron)");
  }
  return window.electron.invoke(channel, payload) as Promise<T>;
}

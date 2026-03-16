// Global type declarations for the Electron context bridge API
// Must match what preload.js exposes via contextBridge.exposeInMainWorld("electron", ...)

interface ElectronAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  platform: string;
}

interface Window {
  electron?: ElectronAPI;
}

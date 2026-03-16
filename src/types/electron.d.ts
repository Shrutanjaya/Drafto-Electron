// Global type declarations for the Electron context bridge API
// Must match what preload.js exposes via contextBridge.exposeInMainWorld("electron", ...)

interface DraftoFileInfo {
  name: string;
  fileName: string;
  path: string;
  modifiedDate: string;
  size: number;
}

interface ElectronAPI {
  // Generic IPC invoke (used by lib/ipc/*)
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  platform: string;

  // File system operations
  listDraftoFiles: () => Promise<DraftoFileInfo[]>;
  loadDraftoFile: (fileName: string) => Promise<string>;
  saveProject: (data: { petitionerName: string; content: string }) => Promise<string | null>;
  openProjectsFolder: () => Promise<void>;

  // Dialogs
  readFileByPath: (filePath: string) => Promise<{ path: string; name: string; data: string; type: string } | null>;
  openFileDialog: () => Promise<{ path: string; name: string; data: string; type: string } | null>;
  selectDirectory: () => Promise<string | null>;

  // Save files
  saveDocx: (data: { fileName: string; content: string; defaultPath?: string; projectFolder?: string }) => Promise<string | null>;
  savePdf: (data: { fileName: string; content: string | ArrayBuffer; defaultPath?: string }) => Promise<string | null>;

  // OCR
  processOcr: (pdfBase64: string) => Promise<{ success: boolean; pdf?: string; error?: string }>;
  cancelOcr: () => Promise<void>;
  getPythonDepsStatus: () => Promise<{ ready: boolean; log: string[]; pythonCommand: string | null }>;
  onPythonDepsLog: (cb: (msg: string) => void) => void;
  onPythonDepsReady: (cb: (ready: boolean) => void) => void;
}

interface Window {
  electron?: ElectronAPI;
}

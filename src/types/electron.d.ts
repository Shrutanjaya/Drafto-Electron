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
  getRecentFiles: () => Promise<DraftoFileInfo[]>;
  removeRecentFile: (filePath: string) => Promise<void>;
  saveProject: (data: { petitionerName: string; content: string }) => Promise<string | null>;
  openProjectsFolder: () => Promise<void>;
  openFolderPath: (folderPath: string) => Promise<void>;
  listDraftoFilesFromPath: (folderPath: string) => Promise<DraftoFileInfo[]>;

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

  // Shared-folder collaboration
  saveProjectToPath: (data: { filePath: string; content: string }) => Promise<string>;
  loadProjectFromPath: (filePath: string) => Promise<string>;
  openDraftoFileDialog: () => Promise<string | null>;
  getFileMtime: (filePath: string) => Promise<number | null>;
  writeLockFile: (filePath: string) => Promise<{ locked: boolean; user?: string; since?: number } | null>;
  deleteLockFile: (filePath: string) => Promise<void>;

  // File-open via OS (double-click / second-instance)
  onOpenFilePath: (cb: (filePath: string) => void) => void;

  // Auto-update
  auCheck: () => Promise<{ status: string } | null>;
  auGetState: () => Promise<{ status: string; version: string | null } | null>;
  auDownload: () => Promise<void>;
  auInstall: () => Promise<void>;
  onAuUpdateAvailable: (cb: (info: { version: string }) => void) => void;
  onAuUpdateNotAvailable: (cb: (info: unknown) => void) => void;
  onAuDownloadProgress: (cb: (prog: { percent: number }) => void) => void;
  onAuUpdateDownloaded: (cb: (info: unknown) => void) => void;
  onAuError: (cb: (msg: string) => void) => void;

  // Utilities
  openExternal: (url: string) => Promise<void>;
}

interface Window {
  electron?: ElectronAPI;
}

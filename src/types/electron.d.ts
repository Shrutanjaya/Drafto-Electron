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

  // AI Plugin (Beta)
  aiCheckPrerequisites: (opts?: { customClaudePath?: string }) => Promise<AiPrerequisites>;
  aiRun: (opts: AiRunOptions) => Promise<AiRunResult>;
  aiCancel: () => Promise<{ ok: boolean }>;
  aiScanFolder: (folderPath: string) => Promise<AiFolderScan>;
  aiSplitDocuments: (opts: {
    projectPath?: string | null;
    documents: { id: string; sourcePath: string; startPage: number; endPage: number; title: string }[];
  }) => Promise<{
    ok: boolean;
    error?: string;
    outputDir?: string;
    managed?: boolean;
    results?: { id: string; ok: boolean; filePath?: string; error?: string }[];
  }>;
  aiLogin: (opts?: { claudePath?: string }) => Promise<{ ok: boolean; error?: string }>;
  aiInstallClaude: () => Promise<{ ok: boolean; code?: number; error?: string }>;
  onAiInstallLog: (cb: (msg: string) => void) => () => void;
  onAiStream: (cb: (msg: AiStreamMsg) => void) => () => void;
}

interface AiScanFile {
  name: string;
  originalPath: string;
  pageCount: number;
  scannedPages: number[];
  txtName?: string;
  error?: string;
}

interface AiFolderScan {
  ok: boolean;
  error?: string;
  contextDir?: string;
  files?: AiScanFile[];
  textTokens?: number;
  scannedPageCount?: number;
  imageTokens?: number;
}

interface AiStreamMsg {
  kind: "status" | "partial" | "usage";
  text?: string;
  input?: number;
  output?: number;
}

interface AiRunOptions {
  prompt: string;
  systemPrompt?: string;
  sourceFolder?: string;
  addDirs?: string[];
  resumeSessionId?: string;
  model?: string;
  claudePath?: string;
}

interface AiRunResult {
  ok: boolean;
  text?: string;
  error?: string;
  needsLogin?: boolean;
  cancelled?: boolean;
  partialText?: string;
  sessionId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number | null;
}

interface AiToolProbe {
  found: boolean;
  version: string | null;
  path: string | null;
}

interface AiPrerequisites {
  platform: string;
  node: AiToolProbe;
  claude: AiToolProbe;
  ok: boolean;      // claude binary is runnable AND logged in
  nodeOk: boolean;  // node is runnable
  loggedIn: boolean | null;   // null = binary not found
  authMethod?: string;
  needsLogin?: boolean;
}

interface Window {
  electron?: ElectronAPI;
}

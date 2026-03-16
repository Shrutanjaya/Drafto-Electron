// Global type declarations for Electron APIs

interface PythonInfo {
  command: string;
  ready: boolean;
  scriptsPath: string;
}

interface DraftoFileInfo {
  name: string;
  fileName: string;
  path: string;
  modifiedDate: string;
  size: number;
}

interface ElectronAPI {
  getPythonInfo: () => Promise<PythonInfo>;
  saveProject: (data: { petitionerName: string; content: string }) => Promise<string | null>;
  getFilePath: (file: File) => Promise<string | null>;
  createFileFromPath: (filePath: string) => Promise<File>;
  openFileDialog: () => Promise<File | null>;
  selectDirectory: () => Promise<string | null>;
  listDraftoFiles: () => Promise<DraftoFileInfo[]>;
  loadDraftoFile: (fileName: string) => Promise<string>;
  openProjectsFolder: () => Promise<void>;
  saveDocx: (data: { fileName: string; content: string; defaultPath?: string; projectFolder?: string }) => Promise<string | null>;
  savePdf: (data: { fileName: string; content: string | ArrayBuffer; defaultPath?: string }) => Promise<string | null>;
  processOcr: (pdfBase64: string) => Promise<{ success: boolean; pdf?: string; error?: string }>;
}

interface Window {
  electron?: ElectronAPI;
}

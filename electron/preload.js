const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // Generic IPC invoke (used by lib/ipc/*)
  invoke:   (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  platform: process.platform,

  // File system operations
  listDraftoFiles:  ()           => ipcRenderer.invoke("list-drafto-files"),
  loadDraftoFile:   (fileName)   => ipcRenderer.invoke("load-drafto-file", fileName),
  getRecentFiles:   ()           => ipcRenderer.invoke("get-recent-files"),
  removeRecentFile: (filePath)   => ipcRenderer.invoke("remove-recent-file", filePath),
  saveProject:      (data)       => ipcRenderer.invoke("save-project", data),
  openProjectsFolder: ()         => ipcRenderer.invoke("open-projects-folder"),
  openFolderPath:     (fp)        => ipcRenderer.invoke("open-folder-path", fp),
  listDraftoFilesFromPath: (fp)   => ipcRenderer.invoke("list-drafto-files-from-path", fp),

  // Dialogs
  readFileByPath:   (filePath)   => ipcRenderer.invoke("read-file-by-path", filePath),
  openFileDialog:   ()           => ipcRenderer.invoke("open-file-dialog"),
  selectDirectory:  ()           => ipcRenderer.invoke("select-directory"),

  // Save files
  saveDocx: (data) => ipcRenderer.invoke("save-docx", data),
  savePdf:  (data) => ipcRenderer.invoke("save-pdf", data),

  // Utilities
  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  // AI Plugin (Beta)
  aiCheckPrerequisites: (opts) => ipcRenderer.invoke("ai-check-prerequisites", opts),
  aiRun: (opts) => ipcRenderer.invoke("ai-run", opts),
  aiCancel: () => ipcRenderer.invoke("ai-cancel"),
  aiScanFolder: (folderPath) => ipcRenderer.invoke("ai-scan-folder", folderPath),
  aiSplitDocuments: (opts) => ipcRenderer.invoke("ai-split-documents", opts),
  aiLogin: (opts) => ipcRenderer.invoke("ai-login", opts),
  // Live progress while a turn runs. Returns a disposer to remove the listener.
  onAiStream: (cb) => {
    const h = (_e, msg) => cb(msg);
    ipcRenderer.on("ai-stream", h);
    return () => ipcRenderer.removeListener("ai-stream", h);
  },

  // Auto-update
  auCheck:    () => ipcRenderer.invoke("au-check"),
  auGetState: () => ipcRenderer.invoke("au-get-state"),
  auDownload: () => ipcRenderer.invoke("au-download"),
  auInstall:  () => ipcRenderer.invoke("au-install"),
  onAuUpdateAvailable:    (cb) => ipcRenderer.on("au-update-available",     (_e, info) => cb(info)),
  onAuUpdateNotAvailable: (cb) => ipcRenderer.on("au-update-not-available", (_e, info) => cb(info)),
  onAuDownloadProgress:   (cb) => ipcRenderer.on("au-download-progress",    (_e, prog) => cb(prog)),
  onAuUpdateDownloaded:   (cb) => ipcRenderer.on("au-update-downloaded",    (_e, info) => cb(info)),
  onAuError:              (cb) => ipcRenderer.on("au-error",                 (_e, msg)  => cb(msg)),

  // OCR
  processOcr:          (pdfBase64) => ipcRenderer.invoke("process-ocr", pdfBase64),
  cancelOcr:           ()          => ipcRenderer.invoke("cancel-ocr"),
  getPythonDepsStatus: ()          => ipcRenderer.invoke("get-python-deps-status"),

  // Python deps setup notifications (main → renderer)
  onPythonDepsLog:     (cb) => ipcRenderer.on("python-deps-log",   (_e, msg) => cb(msg)),
  onPythonDepsReady:   (cb) => ipcRenderer.on("python-deps-ready", (_e, ok)  => cb(ok)),

  // Shared-folder project management
  saveProjectToPath:      (data)     => ipcRenderer.invoke("save-project-to-path", data),
  loadProjectFromPath:    (filePath) => ipcRenderer.invoke("load-project-from-path", filePath),
  openDraftoFileDialog:   ()         => ipcRenderer.invoke("open-drafto-file-dialog"),
  getFileMtime:           (filePath) => ipcRenderer.invoke("get-file-mtime", filePath),
  writeLockFile:          (filePath) => ipcRenderer.invoke("write-lock-file", filePath),
  deleteLockFile:         (filePath) => ipcRenderer.invoke("delete-lock-file", filePath),

  // File-open-via-OS (double-click / second-instance)
  onOpenFilePath: (cb) => ipcRenderer.on("open-file-path", (_e, fp) => cb(fp)),
});

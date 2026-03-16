const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // Generic IPC invoke (used by lib/ipc/*)
  invoke:   (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  platform: process.platform,

  // File system operations
  listDraftoFiles:  ()           => ipcRenderer.invoke("list-drafto-files"),
  loadDraftoFile:   (fileName)   => ipcRenderer.invoke("load-drafto-file", fileName),
  saveProject:      (data)       => ipcRenderer.invoke("save-project", data),
  openProjectsFolder: ()         => ipcRenderer.invoke("open-projects-folder"),

  // Dialogs
  readFileByPath:   (filePath)   => ipcRenderer.invoke("read-file-by-path", filePath),
  openFileDialog:   ()           => ipcRenderer.invoke("open-file-dialog"),
  selectDirectory:  ()           => ipcRenderer.invoke("select-directory"),

  // Save files
  saveDocx: (data) => ipcRenderer.invoke("save-docx", data),
  savePdf:  (data) => ipcRenderer.invoke("save-pdf", data),

  // OCR
  processOcr:          (pdfBase64) => ipcRenderer.invoke("process-ocr", pdfBase64),
  cancelOcr:           ()          => ipcRenderer.invoke("cancel-ocr"),
  getPythonDepsStatus: ()          => ipcRenderer.invoke("get-python-deps-status"),

  // Python deps setup notifications (main → renderer)
  onPythonDepsLog:     (cb) => ipcRenderer.on("python-deps-log",   (_e, msg) => cb(msg)),
  onPythonDepsReady:   (cb) => ipcRenderer.on("python-deps-ready", (_e, ok)  => cb(ok)),
});

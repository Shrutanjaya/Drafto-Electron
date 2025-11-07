const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Get Python environment info
  getPythonInfo: () => ipcRenderer.invoke('get-python-info'),
  
  // Save project with file dialog
  saveProject: (data) => ipcRenderer.invoke('save-project', data),
  
  // Get the absolute path of a File object
  // Note: Due to browser security, we store the path when user selects the file
  getFilePath: (file) => {
    // Check if the file has a path property (added by our custom file input)
    if (file && file.path) {
      return Promise.resolve(file.path);
    }
    return Promise.resolve(null);
  },
  
  // Create a File object from an absolute path
  createFileFromPath: async (filePath) => {
    const fileData = await ipcRenderer.invoke('create-file-from-path', filePath);
    
    // Reconstruct a File object from the returned data
    const uint8Array = new Uint8Array(fileData.buffer);
    const blob = new Blob([uint8Array], { type: fileData.type });
    const file = new File([blob], fileData.name, { type: fileData.type });
    
    // Store the path so we can retrieve it later
    Object.defineProperty(file, 'path', {
      value: fileData.path,
      writable: false,
      enumerable: false
    });
    
    return file;
  },
  
  // Open file dialog and return File object with path
  openFileDialog: async () => {
    const result = await ipcRenderer.invoke('open-file-dialog');
    
    if (result.filePaths && result.filePaths.length > 0) {
      const fileData = await ipcRenderer.invoke('create-file-from-path', result.filePaths[0]);
      
      // Reconstruct a File object from the returned data
      const uint8Array = new Uint8Array(fileData.buffer);
      const blob = new Blob([uint8Array], { type: fileData.type });
      const file = new File([blob], fileData.name, { type: fileData.type });
      
      // Store the path so we can retrieve it later
      Object.defineProperty(file, 'path', {
        value: fileData.path,
        writable: false,
        enumerable: false
      });
      
      return file;
    }
    return null;
  },
  
  // Select directory dialog
  selectDirectory: async () => {
    const result = await ipcRenderer.invoke('select-directory');
    if (result && result.length > 0) {
      return result[0];
    }
    return null;
  },
  
  // Save DOCX file
  saveDocx: (data) => ipcRenderer.invoke('save-docx', data),
  
  // Save PDF file
  savePdf: (data) => ipcRenderer.invoke('save-pdf', data),
  
  // Process OCR on PDF
  processOcr: (pdfBase64) => ipcRenderer.invoke('process-ocr', pdfBase64),
});

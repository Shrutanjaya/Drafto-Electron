const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// This helps prevent some graphics-related crashes
app.disableHardwareAcceleration();

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load your running Next.js app
  win.loadURL('http://localhost:9002');
  
  // Open DevTools automatically for debugging
  win.webContents.openDevTools();
}

// Helper function to get a unique filename by adding numbers if file exists
function getUniqueFilePath(directory, baseName, extension) {
  const baseNameWithoutExt = baseName.replace(new RegExp(`\\.${extension}$`), '');
  let filePath = path.join(directory, `${baseNameWithoutExt}.${extension}`);
  let counter = 1;
  
  while (fs.existsSync(filePath)) {
    filePath = path.join(directory, `${baseNameWithoutExt} ${counter}.${extension}`);
    counter++;
  }
  
  return filePath;
}

// Handle save project
ipcMain.handle('save-project', async (event, { petitionerName, content, defaultPath }) => {
  let filePath;
  
  if (defaultPath) {
    // Use default path and find unique filename
    const fileName = `${petitionerName}.drafto`;
    filePath = getUniqueFilePath(defaultPath, fileName, 'drafto');
  } else {
    // Show dialog only if no default path
    const result = await dialog.showSaveDialog({
      defaultPath: `${petitionerName}.drafto`,
      filters: [{ name: 'Drafto Project', extensions: ['drafto'] }]
    });
    filePath = result.filePath;
  }
  
  if (filePath) {
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }
  return null;
});

// Open file dialog for selecting PDFs
ipcMain.handle('open-file-dialog', async () => {
  console.log('⚡ [MAIN] open-file-dialog handler called');
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });
  console.log('⚡ [MAIN] Dialog result:', result);
  return result;
});

// Get the absolute path of a File object
ipcMain.handle('get-file-path', async (event, fileName) => {
  // When a file is selected through an <input type="file">, 
  // the browser security model doesn't expose the full path.
  // We need to store this during file selection.
  // This is a limitation - we'll document it.
  return null; // Cannot extract path from File object in current implementation
});

// Create a File-like object from an absolute path
ipcMain.handle('create-file-from-path', async (event, filePath) => {
  console.log('⚡ [MAIN] create-file-from-path called with:', filePath);
  try {
    if (!fs.existsSync(filePath)) {
      console.error('⚡ [MAIN] File not found:', filePath);
      throw new Error('File not found');
    }
    
    console.log('⚡ [MAIN] Reading file...');
    const buffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    console.log('⚡ [MAIN] File read successfully:', {
      fileName,
      path: filePath,
      bufferLength: buffer.length
    });
    
    // Return the file data that can be reconstructed into a File object
    return {
      name: fileName,
      path: filePath,
      buffer: Array.from(buffer),
      type: 'application/pdf'
    };
  } catch (error) {
    throw new Error(`Could not read file: ${error.message}`);
  }
});

// Select directory dialog
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result.filePaths;
});

// Save DOCX file with optional default path
ipcMain.handle('save-docx', async (event, { fileName, content, defaultPath, projectFolder }) => {
  let filePath;
  
  if (defaultPath) {
    // Create project-specific subfolder if provided
    let targetDirectory = defaultPath;
    if (projectFolder) {
      targetDirectory = path.join(defaultPath, projectFolder);
      // Create directory if it doesn't exist
      if (!fs.existsSync(targetDirectory)) {
        fs.mkdirSync(targetDirectory, { recursive: true });
      }
    }
    
    // Use target directory and find unique filename
    filePath = getUniqueFilePath(targetDirectory, fileName, 'docx');
  } else {
    // Show dialog only if no default path
    const result = await dialog.showSaveDialog({
      defaultPath: fileName,
      filters: [{ name: 'Word Document', extensions: ['docx'] }]
    });
    filePath = result.filePath;
  }
  
  if (filePath) {
    // content is base64 string, convert to buffer
    const buffer = Buffer.from(content, 'base64');
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }
  return null;
});

// Save PDF file with optional default path
ipcMain.handle('save-pdf', async (event, { fileName, content, defaultPath }) => {
  let filePath;
  
  if (defaultPath) {
    // Use default path and find unique filename
    filePath = getUniqueFilePath(defaultPath, fileName, 'pdf');
  } else {
    // Show dialog only if no default path
    const result = await dialog.showSaveDialog({
      defaultPath: fileName,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
    });
    filePath = result.filePath;
  }
  
  if (filePath) {
    // content is either base64 string or buffer
    const buffer = typeof content === 'string' ? Buffer.from(content, 'base64') : Buffer.from(content);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }
  return null;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
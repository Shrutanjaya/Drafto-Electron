const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

// This helps prevent some graphics-related crashes
app.disableHardwareAcceleration();

let nextProcess = null;
let mainWindow = null;

// Configure auto-updater
autoUpdater.autoDownload = false; // Ask user before downloading
autoUpdater.autoInstallOnAppQuit = true;

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('🔍 Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  console.log('✅ Update available:', info.version);
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `Version ${info.version} is available. Would you like to download it now?`,
    detail: 'The update will be installed when you restart the app.',
    buttons: ['Download', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-not-available', () => {
  console.log('✅ App is up to date');
});

autoUpdater.on('download-progress', (progress) => {
  const percent = Math.round(progress.percent);
  console.log(`📥 Download progress: ${percent}%`);
  
  // Update window title with progress
  if (mainWindow) {
    mainWindow.setTitle(`Drafto - Downloading update: ${percent}%`);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('✅ Update downloaded:', info.version);
  
  // Reset window title
  if (mainWindow) {
    mainWindow.setTitle('Drafto');
  }
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'Update has been downloaded. Restart now to install?',
    detail: `Version ${info.version} is ready to install.`,
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      // Close Next.js before quitting
      if (nextProcess) {
        nextProcess.kill();
      }
      autoUpdater.quitAndInstall(false, true);
    }
  });
});

autoUpdater.on('error', (error) => {
  console.error('❌ Auto-updater error:', error);
  
  // Only show error dialog if window exists and error is significant
  if (mainWindow && error.message && !error.message.includes('No published versions')) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Update Check Failed',
      message: 'Could not check for updates. Please try again later.',
      buttons: ['OK']
    });
  }
});

// Determine Next.js project path
function getNextJsPath() {
  if (app.isPackaged) {
    // Production: Next.js is bundled in resources
    return path.join(process.resourcesPath, 'firebase-files');
  } else {
    // Development: Next.js is in parent directory
    return path.join(__dirname, '..', 'Firebase Files');
  }
}

// Start Next.js server
function startNextServer() {
  return new Promise((resolve, reject) => {
    const nextPath = getNextJsPath();
    console.log('Starting Next.js from:', nextPath);

    // Determine the correct command based on OS and environment
    let command, args;
    
    if (process.platform === 'win32') {
      command = 'cmd.exe';
      args = ['/c', 'npm', 'run', app.isPackaged ? 'start' : 'dev'];
    } else {
      command = 'npm';
      args = [app.isPackaged ? 'start' : 'dev'];
    }

    nextProcess = spawn(command, args, {
      cwd: nextPath,
      env: { ...process.env, NODE_ENV: app.isPackaged ? 'production' : 'development' },
      shell: true
    });

    let serverReady = false;

    nextProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Next.js:', output);
      
      // Check if server is ready
      if (!serverReady && (output.includes('Ready') || output.includes('started server') || output.includes('localhost:9002'))) {
        serverReady = true;
        console.log('✅ Next.js server is ready!');
        resolve();
      }
    });

    nextProcess.stderr.on('data', (data) => {
      console.error('Next.js Error:', data.toString());
    });

    nextProcess.on('error', (error) => {
      console.error('Failed to start Next.js:', error);
      reject(error);
    });

    nextProcess.on('close', (code) => {
      console.log('Next.js process exited with code:', code);
    });

    // Fallback: resolve after 5 seconds even if we don't see "Ready" message
    setTimeout(() => {
      if (!serverReady) {
        console.log('⚠️ Next.js ready message not detected, proceeding anyway...');
        resolve();
      }
    }, 5000);
  });
}

async function createWindow() {
  // Show loading window while Next.js starts
  const loadingWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true
    }
  });

  loadingWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
      <body style="margin:0; padding:0; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); display:flex; align-items:center; justify-content:center; font-family:system-ui;">
        <div style="text-align:center; color:white;">
          <h1 style="font-size:48px; margin:0;">Drafto</h1>
          <p style="font-size:18px; margin:20px 0;">Loading...</p>
          <div style="width:200px; height:4px; background:rgba(255,255,255,0.3); border-radius:2px; margin:0 auto; overflow:hidden;">
            <div style="width:100%; height:100%; background:white; animation:loading 1.5s infinite;"></div>
          </div>
        </div>
        <style>
          @keyframes loading {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        </style>
      </body>
    </html>
  `);

  try {
    // Start Next.js server
    console.log('Starting Next.js server...');
    await startNextServer();
    
    // Wait a bit more to ensure server is fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create main window
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // Load Next.js app
    mainWindow.loadURL('http://localhost:9002');

    // Show main window when ready and close loading window
    mainWindow.once('ready-to-show', () => {
      loadingWindow.close();
      mainWindow.show();
      
      // Open DevTools in development mode only
      if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
      }
      
      // Check for updates after app is fully loaded (only in production)
      if (app.isPackaged) {
        setTimeout(() => {
          console.log('🔍 Checking for updates...');
          autoUpdater.checkForUpdates().catch(err => {
            console.log('Update check error (will retry on next launch):', err.message);
          });
        }, 3000);
      }
    });

    // Handle window close
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

  } catch (error) {
    console.error('Error starting application:', error);
    loadingWindow.close();
    
    dialog.showErrorBox(
      'Startup Error',
      'Failed to start Drafto. Please ensure Node.js is installed and try again.'
    );
    
    app.quit();
  }
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
  // Kill Next.js process when app closes
  if (nextProcess) {
    console.log('Stopping Next.js server...');
    nextProcess.kill();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
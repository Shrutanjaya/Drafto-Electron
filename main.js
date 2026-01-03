const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const { spawn, exec, execSync, fork } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// This helps prevent some graphics-related crashes
app.disableHardwareAcceleration();

let nextProcess = null;
let mainWindow = null;
const isDev = !app.isPackaged; // True when running from source, false when packaged
const NEXT_PORT = 9002;

console.log('[Electron] Development mode:', isDev);
console.log('[Electron] App is packaged:', app.isPackaged);

// Python environment setup
let pythonCommand = 'python';
let pythonReady = false;

// Get bundled Python path
function getBundledPythonPath() {
  if (isDev) {
    // In development, use local python folder
    return path.join(__dirname, 'python', 'python.exe');
  } else {
    // In production, use bundled python from resources
    return path.join(process.resourcesPath, 'python', 'python.exe');
  }
}

// Check if Python is available and get the right command
async function checkPython() {
  console.log('[Electron] Checking Python installation...');
  
  // First, check for bundled Python
  const bundledPythonPath = getBundledPythonPath();
  console.log('[Electron] Checking bundled Python at:', bundledPythonPath);
  
  if (fs.existsSync(bundledPythonPath)) {
    try {
      const { stdout } = await execAsync(`"${bundledPythonPath}" --version`, { timeout: 5000 });
      console.log(`[Electron] Found bundled Python: ${stdout.trim()}`);
      pythonCommand = `"${bundledPythonPath}"`;
      
      // Check if docx2pdf is installed in bundled Python
      try {
        await execAsync(`${pythonCommand} -c "import docx2pdf"`, { timeout: 5000 });
        console.log('[Electron] docx2pdf is already installed in bundled Python');
        pythonReady = true;
        return { success: true, command: pythonCommand, bundled: true };
      } catch {
        console.log('[Electron] docx2pdf not found in bundled Python, will need to install');
        return { success: true, command: pythonCommand, needsDocx2pdf: true, bundled: true };
      }
    } catch (err) {
      console.error('[Electron] Bundled Python check failed:', err);
    }
  } else {
    console.log('[Electron] Bundled Python not found, checking system Python...');
  }
  
  // Fall back to system Python
  const commands = ['python3', 'python', 'py'];
  
  for (const cmd of commands) {
    try {
      const { stdout } = await execAsync(`${cmd} --version`, { timeout: 5000 });
      console.log(`[Electron] Found Python: ${stdout.trim()} using command: ${cmd}`);
      pythonCommand = cmd;
      
      // Check if docx2pdf is installed
      try {
        await execAsync(`${cmd} -c "import docx2pdf"`, { timeout: 5000 });
        console.log('[Electron] docx2pdf is already installed');
        pythonReady = true;
        return { success: true, command: cmd };
      } catch {
        console.log('[Electron] docx2pdf not found, will need to install');
        return { success: true, command: cmd, needsDocx2pdf: true };
      }
    } catch (err) {
      continue;
    }
  }
  
  return { success: false, error: 'Python not found' };
}

// Install docx2pdf using pip
async function installDocx2pdf() {
  console.log('[Electron] Installing docx2pdf...');
  
  try {
    const { stdout, stderr } = await execAsync(
      `${pythonCommand} -m pip install docx2pdf`,
      { timeout: 120000 } // 2 minute timeout for installation
    );
    console.log('[Electron] docx2pdf installation output:', stdout);
    
    if (stderr && !stderr.includes('Successfully installed') && !stderr.includes('Requirement already satisfied')) {
      console.error('[Electron] docx2pdf installation stderr:', stderr);
    }
    
    pythonReady = true;
    return { success: true };
  } catch (error) {
    console.error('[Electron] Failed to install docx2pdf:', error);
    return { success: false, error: error.message };
  }
}

// Show Python setup dialog
async function showPythonSetupDialog() {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Python Setup Required',
    message: 'Drafto requires Python and docx2pdf for PDF generation.',
    detail: 'Python was not found on your system. Please install Python from python.org and restart the application.\n\nFor PDF conversion to work, you\'ll also need Microsoft Word or LibreOffice installed.',
    buttons: ['Open Python Download Page', 'Continue Anyway', 'Quit'],
    defaultId: 0,
    cancelId: 2,
  });
  
  if (result.response === 0) {
    // Open Python download page
    require('electron').shell.openExternal('https://www.python.org/downloads/');
    app.quit();
  } else if (result.response === 2) {
    app.quit();
  }
  // If Continue Anyway (response === 1), app continues without Python
}

// Check MS Word/LibreOffice for PDF conversion
async function checkPdfConverter() {
  console.log('[Electron] Checking for PDF converter (MS Word/LibreOffice)...');
  
  if (process.platform === 'win32') {
    // Check for MS Word on Windows
    try {
      // Check registry for Word installation
      const { stdout } = await execAsync(
        'reg query "HKEY_CLASSES_ROOT\\Word.Application" /ve',
        { timeout: 5000 }
      );
      if (stdout) {
        console.log('[Electron] Microsoft Word found');
        return { found: true, app: 'Microsoft Word' };
      }
    } catch {
      console.log('[Electron] Microsoft Word not found in registry');
    }
    
    // Check for LibreOffice on Windows
    const libreOfficePaths = [
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ];
    
    for (const loPath of libreOfficePaths) {
      if (fs.existsSync(loPath)) {
        console.log('[Electron] LibreOffice found at:', loPath);
        return { found: true, app: 'LibreOffice' };
      }
    }
  } else if (process.platform === 'darwin') {
    // Check for MS Word on Mac
    if (fs.existsSync('/Applications/Microsoft Word.app')) {
      console.log('[Electron] Microsoft Word found on Mac');
      return { found: true, app: 'Microsoft Word' };
    }
    
    // Check for LibreOffice on Mac
    if (fs.existsSync('/Applications/LibreOffice.app')) {
      console.log('[Electron] LibreOffice found on Mac');
      return { found: true, app: 'LibreOffice' };
    }
  }
  
  console.log('[Electron] No PDF converter found');
  return { found: false };
}

// Show PDF converter warning
async function showPdfConverterWarning() {
  // Check if window still exists before showing dialog
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.log('[Electron] Cannot show PDF converter warning - window is destroyed');
    return;
  }
  
  await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'PDF Converter Not Found',
    message: 'Microsoft Word or LibreOffice not detected',
    detail: 'For PDF generation to work properly, you need either:\n\n• Microsoft Word (Office 365 or 2016+)\n• LibreOffice (free, open source)\n\nYou can continue using Drafto, but PDF generation may not work.',
    buttons: ['OK'],
  });
}

// Get the correct paths for production vs development
const getAppPath = () => {
  if (isDev) {
    return path.join(__dirname, '..');
  }
  // In production, resources are in app.asar.unpacked or resources folder
  return process.resourcesPath;
};

const getNextAppPath = () => {
  if (isDev) {
    return path.join(__dirname, '..', 'Firebase Files');
  }
  // In production, Next.js app is bundled with Electron
  return path.join(getAppPath(), 'app', 'Firebase Files');
};

const getPythonPath = () => {
  if (isDev) {
    return path.join(__dirname, '..', 'Firebase Files', 'python_scripts');
  }
  // In production, Python scripts are bundled with Firebase Files
  return path.join(getAppPath(), 'app', 'Firebase Files', 'python_scripts');
};

// Start Next.js server
async function startNextServer() {
  return new Promise((resolve, reject) => {
    const nextAppPath = getNextAppPath();
    console.log('[Electron] Starting Next.js server from:', nextAppPath);
    
    if (!fs.existsSync(nextAppPath)) {
      console.error('[Electron] Next.js app directory not found:', nextAppPath);
      reject(new Error('Next.js application not found'));
      return;
    }

    // In production, use standalone server; in development, use npm
    let command, args, cwd;
    
    if (isDev) {
      // Development mode: use npm
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      command = npmCmd;
      args = ['run', 'dev'];
      cwd = nextAppPath;
    } else {
      // Production mode: use standalone Node.js server
      const standalonePath = path.join(nextAppPath, '.next', 'standalone');
      const serverPath = path.join(standalonePath, 'server.js');
      
      if (!fs.existsSync(serverPath)) {
        console.error('[Electron] Standalone server not found at:', serverPath);
        reject(new Error('Next.js standalone server not found. Did you run npm run build?'));
        return;
      }
      
      // Use fork to run Node.js script with Electron's Node.js
      console.log(`[Electron] Forking standalone server: ${serverPath}`);
      nextProcess = fork(serverPath, [], {
        cwd: standalonePath,
        env: {
          ...process.env,
          PORT: NEXT_PORT.toString(),
          HOSTNAME: 'localhost',
          NODE_ENV: 'production',
          PYTHON_COMMAND: pythonCommand,
          PYTHON_SCRIPTS_PATH: getPythonPath(),
          IS_ELECTRON: 'true',
        },
        silent: true, // Capture stdout/stderr
      });
      
      // Setup stdout/stderr handlers for forked process
      nextProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[Next.js]', output);
        
        // Check if server is ready
        if (output.includes('Ready') || output.includes('started server') || output.includes(`localhost:${NEXT_PORT}`)) {
          console.log('[Electron] Next.js server is ready!');
          resolve();
        }
      });
      
      nextProcess.stderr.on('data', (data) => {
        console.error('[Next.js Error]', data.toString());
      });
      
      nextProcess.on('error', (error) => {
        console.error('[Electron] Failed to start Next.js:', error);
        reject(error);
      });
      
      nextProcess.on('exit', (code) => {
        console.log(`[Electron] Next.js process exited with code ${code}`);
      });
      
      // Timeout fallback - assume ready after 15 seconds
      setTimeout(() => {
        console.log('[Electron] Timeout reached, assuming Next.js is ready');
        resolve();
      }, 15000);
      
      return; // Exit early since we set up handlers above
    }
    
    // For development mode, use spawn with npm
    nextProcess = spawn(command, args, {
      cwd: cwd,
      env: {
        ...process.env,
        PORT: NEXT_PORT.toString(),
        NODE_ENV: isDev ? 'development' : 'production',
        PYTHON_COMMAND: pythonCommand,
        PYTHON_SCRIPTS_PATH: getPythonPath(),
        IS_ELECTRON: 'true',
      },
      shell: false,
      windowsHide: true, // Hide console window on Windows
    });

    nextProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Next.js]', output);
      
      // Check if server is ready
      if (output.includes('Ready') || output.includes('started server') || output.includes(`localhost:${NEXT_PORT}`)) {
        console.log('[Electron] Next.js server is ready!');
        resolve();
      }
    });

    nextProcess.stderr.on('data', (data) => {
      console.error('[Next.js Error]', data.toString());
    });

    nextProcess.on('error', (error) => {
      console.error('[Electron] Failed to start Next.js:', error);
      reject(error);
    });

    nextProcess.on('exit', (code) => {
      console.log(`[Electron] Next.js process exited with code ${code}`);
    });

    // Timeout fallback - assume ready after 15 seconds
    setTimeout(() => {
      console.log('[Electron] Timeout reached, assuming Next.js is ready');
      resolve();
    }, 15000);
  });
}

// Check if Next.js server is actually responding
async function waitForServer(maxAttempts = 30) {
  const http = require('http');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    updateSplash(`Waiting for server... (${attempt}/${maxAttempts})`, 40 + (attempt * 2), `Checking http://localhost:${NEXT_PORT}`);
    
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${NEXT_PORT}`, (res) => {
          console.log(`[Electron] Server check attempt ${attempt}: Status ${res.statusCode}`);
          if (res.statusCode === 200 || res.statusCode === 304) {
            resolve(true);
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
        });
        
        req.on('error', (err) => {
          reject(err);
        });
        
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      
      console.log('[Electron] Server is responding!');
      updateSplash('Server ready!', 90, 'Server responded successfully');
      return true;
    } catch (err) {
      if (attempt < maxAttempts) {
        console.log(`[Electron] Server not ready yet (attempt ${attempt}/${maxAttempts}), waiting...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  console.error('[Electron] Server failed to respond after', maxAttempts, 'attempts');
  updateSplash('Server failed to start', 0, 'Error: Server not responding');
  return false;
}

// Splash window for showing startup progress
let splashWindow = null;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
          }
          .splash {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            width: 100%;
            color: white;
          }
          h1 {
            font-size: 32px;
            margin-bottom: 10px;
            font-weight: 600;
          }
          .version {
            font-size: 14px;
            opacity: 0.9;
            margin-bottom: 30px;
          }
          .status {
            font-size: 16px;
            margin: 20px 0;
            min-height: 24px;
          }
          .progress-bar {
            width: 100%;
            height: 4px;
            background: rgba(255,255,255,0.3);
            border-radius: 2px;
            overflow: hidden;
            margin: 20px 0;
          }
          .progress-fill {
            height: 100%;
            background: white;
            width: 0%;
            transition: width 0.3s ease;
          }
          .details {
            font-size: 12px;
            opacity: 0.8;
            margin-top: 15px;
            font-family: 'Courier New', monospace;
            max-height: 60px;
            overflow-y: auto;
          }
          .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 1s linear infinite;
            margin-right: 10px;
            vertical-align: middle;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="splash">
          <h1>DRAFTO</h1>
          <div class="status" id="status">
            <span class="spinner"></span>
            <span id="status-text">Starting application...</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" id="progress"></div>
          </div>
          <div class="details" id="details"></div>
        </div>
      </body>
    </html>
  `)}`);

  return splashWindow;
}

function updateSplash(message, progress, details) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(`
      document.getElementById('status-text').textContent = '${message}';
      document.getElementById('progress').style.width = '${progress}%';
      ${details ? `document.getElementById('details').textContent = '${details.replace(/'/g, "\\'")}';` : ''}
    `).catch(err => console.error('[Splash] Update failed:', err));
  }
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // Don't show until ready
  });

  // Load Next.js app
  const url = `http://localhost:${NEXT_PORT}`;
  console.log('[Electron] Loading URL:', url);
  mainWindow.loadURL(url);

  // Handle page load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[Electron] Failed to load page:', errorCode, errorDescription, validatedURL);
    
    // Show error dialog
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`
        document.body.innerHTML = '<div style="font-family: Arial; padding: 40px; text-align: center;">' +
          '<h1>Failed to Start Drafto</h1>' +
          '<p style="color: #666;">The application failed to load. Error code: ${errorCode}</p>' +
          '<p style="color: #666;">${errorDescription}</p>' +
          '<p style="margin-top: 20px;">Please try:</p>' +
          '<ul style="text-align: left; display: inline-block;">' +
          '<li>Restarting the application</li>' +
          '<li>Checking if port ${NEXT_PORT} is available</li>' +
          '<li>Reinstalling the application</li>' +
          '</ul>' +
          '</div>';
      `);
      mainWindow.show();
    }
  });

  // Log when page finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] Page loaded successfully');
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      updateSplash('Application ready!', 100, 'Opening main window...');
      setTimeout(() => {
        mainWindow.show();
        closeSplash();
        console.log('[Electron] Window shown, splash closed');
      }, 500);
    }
  });

  // Open DevTools in development
  if (isDev && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Function to kill all processes using a specific port
function killProcessOnPort(port) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // On Windows, find and kill process by port
      exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
        if (!stdout) {
          resolve();
          return;
        }
        
        const lines = stdout.split('\n');
        const pids = new Set();
        
        lines.forEach(line => {
          const match = line.match(/LISTENING\s+(\d+)/);
          if (match) {
            pids.add(match[1]);
          }
        });
        
        if (pids.size === 0) {
          resolve();
          return;
        }
        
        // Kill each process found
        pids.forEach(pid => {
          try {
            execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
            console.log(`[Electron] Killed process ${pid} using port ${port}`);
          } catch (err) {
            console.error(`[Electron] Failed to kill process ${pid}:`, err.message);
          }
        });
        
        resolve();
      });
    } else {
      // On Unix-like systems
      exec(`lsof -ti:${port}`, (error, stdout) => {
        if (!stdout) {
          resolve();
          return;
        }
        
        const pids = stdout.trim().split('\n');
        pids.forEach(pid => {
          try {
            process.kill(parseInt(pid), 'SIGKILL');
            console.log(`[Electron] Killed process ${pid} using port ${port}`);
          } catch (err) {
            console.error(`[Electron] Failed to kill process ${pid}:`, err.message);
          }
        });
        
        resolve();
      });
    }
  });
}

// Auto-update functions
function setupAutoUpdater() {
  // Check for updates when app starts (after a delay)
  setTimeout(() => {
    if (!isDev) {
      autoUpdater.checkForUpdates();
    }
  }, 5000); // Wait 5 seconds after app starts

  // Auto-update event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available!`,
        detail: 'Would you like to download and install it now? The app will restart after installation.',
        buttons: ['Download & Install', 'Later'],
        defaultId: 0,
        cancelId: 1
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] App is up to date:', info.version);
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const message = `Downloading: ${Math.round(progressObj.percent)}%`;
    console.log('[Updater]', message);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(progressObj.percent / 100);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1); // Remove progress bar
      
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded successfully!',
        detail: 'The app will restart now to install the update.',
        buttons: ['Restart Now', 'Restart Later'],
        defaultId: 0,
        cancelId: 1
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
    }
  });
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

// IPC Handlers

// Get Python environment info
ipcMain.handle('get-python-info', async () => {
  return {
    command: pythonCommand,
    ready: pythonReady,
    scriptsPath: getPythonPath(),
  };
});

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

ipcMain.handle('process-ocr', async (event, pdfBase64) => {
  try {
    console.log('[Electron] Starting OCR processing...');
    
    if (!pythonReady) {
      throw new Error('Python is not ready');
    }
    
    // Create temp files for input and output
    const tempDir = path.join(app.getPath('temp'), 'drafto-ocr');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const inputPdf = path.join(tempDir, `input_${Date.now()}.pdf`);
    const outputPdf = path.join(tempDir, `output_${Date.now()}.pdf`);
    
    // Write input PDF
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    fs.writeFileSync(inputPdf, pdfBuffer);
    
    // Get path to OCR script
    const scriptsPath = isDev
      ? path.join(__dirname, '..', 'Firebase Files', 'python_scripts')
      : path.join(process.resourcesPath, 'app', 'Firebase Files', 'python_scripts');
    const ocrScript = path.join(scriptsPath, 'process_ocr.py');
    
    // Run OCR script
    console.log('[Electron] Running OCR script:', ocrScript);
    const { stdout, stderr } = await execAsync(
      `${pythonCommand} "${ocrScript}" "${inputPdf}" "${outputPdf}"`,
      { timeout: 300000 } // 5 minute timeout
    );
    
    if (stderr) {
      console.error('[Electron] OCR stderr:', stderr);
    }
    console.log('[Electron] OCR stdout:', stdout);
    
    // Read the OCR-processed PDF
    if (fs.existsSync(outputPdf)) {
      const ocrBuffer = fs.readFileSync(outputPdf);
      const ocrBase64 = ocrBuffer.toString('base64');
      
      // Clean up temp files
      try {
        fs.unlinkSync(inputPdf);
        fs.unlinkSync(outputPdf);
      } catch (cleanupErr) {
        console.error('[Electron] Cleanup error:', cleanupErr);
      }
      
      return { success: true, pdf: ocrBase64 };
    } else {
      throw new Error('OCR output file not found');
    }
  } catch (error) {
    console.error('[Electron] OCR processing error:', error);
    return { success: false, error: error.message };
  }
});


app.whenReady().then(async () => {
  try {
    console.log('[Electron] App is ready, starting initialization...');
    
    // Create splash window
    createSplashWindow();
    updateSplash('Initializing...', 5, 'Starting Drafto v1.0.14');
    
    // Check Python installation
    updateSplash('Checking Python...', 10, 'Looking for Python installation');
    const pythonCheck = await checkPython();
    
    if (!pythonCheck.success) {
      // Python not found - show setup dialog
      updateSplash('Python not found', 15, 'Will prompt for installation');
      await startNextServer(); // Start Next.js first so we can show dialog
      createWindow();
      closeSplash();
      await showPythonSetupDialog();
    } else if (pythonCheck.needsDocx2pdf) {
      // Python found but docx2pdf not installed
      console.log('[Electron] Attempting to install docx2pdf...');
      updateSplash('Installing dependencies...', 20, 'Installing docx2pdf package');
      const installResult = await installDocx2pdf();
      
      if (!installResult.success) {
        console.error('[Electron] Failed to auto-install docx2pdf');
        // Continue anyway, user can install manually
      }
    } else {
      updateSplash('Python ready', 25, `Using: ${pythonCommand}`);
    }
    
    // Check PDF converter (MS Word/LibreOffice)
    updateSplash('Checking PDF converter...', 30, 'Looking for MS Word or LibreOffice');
    const converterCheck = await checkPdfConverter();
    updateSplash(converterCheck.found ? 'PDF converter found' : 'No PDF converter', 35, converterCheck.found ? converterCheck.app : 'Will show warning');
    
    // Start Next.js server
    updateSplash('Starting server...', 40, 'Launching Next.js development server');
    await startNextServer();
    console.log('[Electron] Next.js server started, waiting for server to respond...');
    
    // Wait for server to actually be ready (updates splash internally)
    const serverReady = await waitForServer();
    if (!serverReady) {
      closeSplash();
      throw new Error('Next.js server failed to start properly');
    }
    
    console.log('[Electron] Server is ready, creating window...');
    updateSplash('Creating window...', 95, 'Loading application interface');
    createWindow();
    
    // Show warning if no PDF converter found (after window is created)
    if (!converterCheck.found) {
      setTimeout(() => showPdfConverterWarning(), 2000); // Delay to let window load
    }
    
    console.log('[Electron] Initialization complete');
    console.log('[Electron] Python ready:', pythonReady);
    console.log('[Electron] PDF converter:', converterCheck.found ? converterCheck.app : 'None');
    
    // Setup auto-updater (check for updates after app is ready)
    setupAutoUpdater();
    
  } catch (error) {
    console.error('[Electron] Failed to start application:', error);
    closeSplash();
    dialog.showErrorBox(
      'Startup Error - v1.0.14',
      `Failed to start the application.\n\nError: ${error.message}\n\nPlease check the console output or contact support with this information.`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Kill Next.js process and all its children
  if (nextProcess) {
    console.log('[Electron] Killing Next.js process...');
    try {
      if (process.platform === 'win32') {
        // On Windows, use taskkill to kill the entire process tree
        exec(`taskkill /pid ${nextProcess.pid} /T /F`, (error) => {
          if (error) {
            console.error('[Electron] Error killing Next.js process by PID:', error);
          }
          // Also kill by port as fallback
          killProcessOnPort(NEXT_PORT).then(() => {
            console.log('[Electron] Next.js cleanup complete');
          });
        });
      } else {
        // On Unix-like systems, kill the process group
        try {
          process.kill(-nextProcess.pid);
        } catch (e) {
          console.error('[Electron] Error killing process group:', e);
        }
        killProcessOnPort(NEXT_PORT);
      }
    } catch (error) {
      console.error('[Electron] Failed to kill Next.js process:', error);
      // Try killing by port as last resort
      killProcessOnPort(NEXT_PORT);
    }
    nextProcess = null;
  } else {
    // If nextProcess is null but port might still be in use
    killProcessOnPort(NEXT_PORT);
  }
  
  if (process.platform !== 'darwin') {
    // Small delay to ensure cleanup completes
    setTimeout(() => app.quit(), 500);
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  // Ensure Next.js process is killed before app quits
  if (nextProcess) {
    console.log('[Electron] Cleaning up Next.js process before quit...');
    try {
      if (process.platform === 'win32') {
        // Force kill the entire process tree on Windows
        execSync(`taskkill /pid ${nextProcess.pid} /T /F`, { stdio: 'ignore' });
      } else {
        process.kill(-nextProcess.pid);
      }
    } catch (error) {
      console.error('[Electron] Error during cleanup:', error);
    }
    nextProcess = null;
  }
  
  // Kill by port synchronously as last resort
  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano | findstr :${NEXT_PORT}`, { encoding: 'utf8', stdio: 'pipe' });
      const lines = output.split('\n');
      const pids = new Set();
      
      lines.forEach(line => {
        const match = line.match(/LISTENING\s+(\d+)/);
        if (match) {
          pids.add(match[1]);
        }
      });
      
      pids.forEach(pid => {
        try {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
          console.log(`[Electron] Force killed process ${pid} on port ${NEXT_PORT}`);
        } catch (err) {
          // Ignore errors
        }
      });
    } catch (error) {
      // Ignore if no processes found
    }
  }
});

// Handle unexpected exits - ensure Next.js is killed
process.on('exit', () => {
  if (nextProcess && nextProcess.pid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${nextProcess.pid} /T /F`, { stdio: 'ignore' });
        // Also kill by port
        try {
          const output = execSync(`netstat -ano | findstr :${NEXT_PORT}`, { encoding: 'utf8', stdio: 'pipe' });
          const match = output.match(/LISTENING\s+(\d+)/);
          if (match) {
            execSync(`taskkill /PID ${match[1]} /T /F`, { stdio: 'ignore' });
          }
        } catch (e) {
          // Ignore
        }
      } else {
        process.kill(-nextProcess.pid);
      }
    } catch (error) {
      // Ignore errors during exit cleanup
    }
  }
});

// Handle SIGINT (Ctrl+C) and SIGTERM
process.on('SIGINT', () => {
  console.log('[Electron] Received SIGINT, cleaning up...');
  app.quit();
});

process.on('SIGTERM', () => {
  console.log('[Electron] Received SIGTERM, cleaning up...');
  app.quit();
});
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// This helps prevent some graphics-related crashes
app.disableHardwareAcceleration();

let nextProcess = null;
let mainWindow = null;
const isDev = process.env.NODE_ENV === 'development';
const NEXT_PORT = 9002;

// Python environment setup
let pythonCommand = 'python';
let pythonReady = false;

// Check if Python is available and get the right command
async function checkPython() {
  console.log('[Electron] Checking Python installation...');
  
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
  // In production, Python is in resources
  return path.join(process.resourcesPath, 'python');
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

    // In production, we need to use the bundled Node.js and npm
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const nextCmd = isDev ? 'dev' : 'start';
    
    console.log(`[Electron] Running: npm run ${nextCmd} in ${nextAppPath}`);
    
    nextProcess = spawn(npmCmd, ['run', nextCmd], {
      cwd: nextAppPath,
      env: {
        ...process.env,
        PORT: NEXT_PORT.toString(),
        NODE_ENV: isDev ? 'development' : 'production',
        PYTHON_COMMAND: pythonCommand,
        PYTHON_SCRIPTS_PATH: getPythonPath(),
        IS_ELECTRON: 'true',
      },
      shell: true,
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
  mainWindow.loadURL(`http://localhost:${NEXT_PORT}`);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
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


app.whenReady().then(async () => {
  try {
    console.log('[Electron] App is ready, starting initialization...');
    
    // Check Python installation
    const pythonCheck = await checkPython();
    
    if (!pythonCheck.success) {
      // Python not found - show setup dialog
      await startNextServer(); // Start Next.js first so we can show dialog
      createWindow();
      await showPythonSetupDialog();
    } else if (pythonCheck.needsDocx2pdf) {
      // Python found but docx2pdf not installed
      console.log('[Electron] Attempting to install docx2pdf...');
      const installResult = await installDocx2pdf();
      
      if (!installResult.success) {
        console.error('[Electron] Failed to auto-install docx2pdf');
        // Continue anyway, user can install manually
      }
    }
    
    // Check PDF converter (MS Word/LibreOffice)
    const converterCheck = await checkPdfConverter();
    
    // Start Next.js server
    await startNextServer();
    console.log('[Electron] Next.js server started, creating window...');
    createWindow();
    
    // Show warning if no PDF converter found (after window is created)
    if (!converterCheck.found) {
      setTimeout(() => showPdfConverterWarning(), 2000); // Delay to let window load
    }
    
    console.log('[Electron] Initialization complete');
    console.log('[Electron] Python ready:', pythonReady);
    console.log('[Electron] PDF converter:', converterCheck.found ? converterCheck.app : 'None');
    
  } catch (error) {
    console.error('[Electron] Failed to start application:', error);
    dialog.showErrorBox(
      'Startup Error',
      'Failed to start the application. Please try again or contact support.\n\n' + error.message
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Kill Next.js process
  if (nextProcess) {
    console.log('[Electron] Killing Next.js process...');
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

app.on('before-quit', () => {
  // Ensure Next.js process is killed
  if (nextProcess) {
    nextProcess.kill();
  }
});
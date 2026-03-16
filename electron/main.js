const { app, BrowserWindow, ipcMain, shell, protocol, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { execFile, exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

// ── Environment ─────────────────────────────────────────────────────────────
const isDev = !app.isPackaged;

// ── Register custom protocol for OAuth callbacks (must be before app ready) ──
protocol.registerSchemesAsPrivileged([
  { scheme: "drafto", privileges: { standard: true, secure: true } },
]);

// ── Python (Windows/Linux only) ──────────────────────────────────────────────
let pythonCommand = null;
let pythonScriptsPath = null;
let pythonDepsReady = false;   // true once all pip packages confirmed importable
let pythonDepsSetupLog = [];   // progress lines forwarded to renderer

function findPython() {
  if (process.platform === "darwin") return; // Not used on macOS
  const candidates = [
    path.join(process.resourcesPath, "python", "python.exe"),
    path.join(__dirname, "..", "python", "python.exe"),
    "C:\\Python314\\python.exe",
    "C:\\Python313\\python.exe",
    "C:\\Python312\\python.exe",
    "C:\\Python311\\python.exe",
    "C:\\Python310\\python.exe",
    "python",
    "python3",
  ];
  // Prefer a Python that has pymupdf installed
  for (const p of candidates) {
    try {
      require("child_process").execFileSync(p, ["--version"], { stdio: "pipe" });
      try {
        require("child_process").execFileSync(p, ["-c", "import fitz"], { stdio: "pipe" });
        pythonCommand = p;
        break;
      } catch {
        // pymupdf not in this Python; keep searching but fall back to first working one
        if (!pythonCommand) pythonCommand = p;
      }
    } catch {}
  }
  pythonScriptsPath = fs.existsSync(path.join(process.resourcesPath, "python_scripts"))
    ? path.join(process.resourcesPath, "python_scripts")
    : path.join(__dirname, "..", "python_scripts");
}

/**
 * Ensures all pip packages needed for OCR are importable.
 * If they are missing, installs them silently using the resolved pythonCommand.
 * Safe to call multiple times (no-op once deps are present).
 */
async function ensurePythonDeps() {
  if (process.platform === "darwin") return;
  if (!pythonCommand) return;

  const required = ["fitz", "pytesseract", "PIL", "pikepdf"];
  const packageNames = { fitz: "pymupdf", PIL: "pillow" };

  const log = (msg) => {
    pythonDepsSetupLog.push(msg);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("python-deps-log", msg);
    }
  };

  // Quick import check first
  const checkScript = required.map(m => `import ${m}`).join("; ");
  try {
    require("child_process").execFileSync(pythonCommand, ["-c", checkScript], { stdio: "pipe" });
    pythonDepsReady = true;
    return; // all present
  } catch { /* some missing – continue to install */ }

  log("Installing OCR dependencies...");

  for (const mod of required) {
    try {
      require("child_process").execFileSync(pythonCommand, ["-c", `import ${mod}`], { stdio: "pipe" });
    } catch {
      const pkg = packageNames[mod] || mod;
      log(`  Installing ${pkg}...`);
      try {
        require("child_process").execFileSync(
          pythonCommand, ["-m", "pip", "install", pkg, "--no-warn-script-location", "--quiet"],
          { stdio: "pipe" }
        );
        log(`  ✓ ${pkg} installed`);
      } catch (err) {
        log(`  ✗ ${pkg} failed: ${err.message}`);
      }
    }
  }

  // Final check
  try {
    require("child_process").execFileSync(pythonCommand, ["-c", checkScript], { stdio: "pipe" });
    pythonDepsReady = true;
    log("OCR dependencies ready.");
  } catch {
    log("WARNING: Some OCR dependencies could not be installed.");
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("python-deps-ready", pythonDepsReady);
  }
}

// ── LibreOffice (macOS) ──────────────────────────────────────────────────────
let sofficeCommand = null;

function findSoffice() {
  const candidates = [
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/local/bin/soffice",
    "/opt/homebrew/bin/soffice",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) { sofficeCommand = p; return; }
  }
}

// ── OAuth / PKCE state ──────────────────────────────────────────────────────
let pendingAuthResolve = null;
let pendingAuthReject  = null;
let pendingCodeVerifier = null;
let pendingClientId    = null;

function base64URLEncode(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function generateCodeVerifier()  { return base64URLEncode(crypto.randomBytes(32)); }
function generateCodeChallenge(v) { return base64URLEncode(crypto.createHash("sha256").update(v).digest()); }

async function exchangeCodeForTokens(code, codeVerifier, clientId) {
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: "drafto://auth-callback",
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text}`);
  }
  return response.json();
}

async function handleProtocolUrl(url) {
  console.log("[OAuth] Protocol URL received:", url);
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "auth-callback") return;

    const code  = parsed.searchParams.get("code");
    const error = parsed.searchParams.get("error");
    const errorDesc = parsed.searchParams.get("error_description");

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    if (error) {
      pendingAuthReject?.(new Error(errorDesc || `Google auth denied: ${error}`));
    } else if (code && pendingCodeVerifier && pendingClientId) {
      const tokens = await exchangeCodeForTokens(code, pendingCodeVerifier, pendingClientId);
      pendingAuthResolve?.({ idToken: tokens.id_token, accessToken: tokens.access_token });
    }
  } catch (err) {
    console.error("[OAuth] Error handling protocol URL:", err);
    pendingAuthReject?.(err);
  } finally {
    pendingAuthResolve = null;
    pendingAuthReject  = null;
    pendingCodeVerifier = null;
    pendingClientId    = null;
  }
}

// ── Main window ─────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.icns"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });
}

// ── App lifecycle ────────────────────────────────────────────────────────────
// macOS: catch drafto:// callbacks (must register before app is ready)
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

// Single-instance lock so Windows/Linux can receive the drafto:// callback
// (the OS launches a second instance with the URL on the command line)
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const protocolUrl = argv.find((a) => a.startsWith("drafto://"));
    if (protocolUrl) handleProtocolUrl(protocolUrl);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAsDefaultProtocolClient("drafto");
    if (process.platform === "darwin") {
      findSoffice();
    } else {
      findPython();
      // Ensure OCR packages are installed after the window is ready
      app.on("browser-window-created", (_e, win) => {
        win.webContents.once("did-finish-load", () => ensurePythonDeps());
      });
    }
    createWindow();
  });
}

app.on("activate", () => {
  if (app.isReady() && BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── IPC: python deps setup status ───────────────────────────────────────────
ipcMain.handle("get-python-deps-status", () => ({
  ready: pythonDepsReady,
  log: pythonDepsSetupLog,
  pythonCommand,
}));

// ── IPC: environment info ────────────────────────────────────────────────────
ipcMain.handle("get-env", () => ({
  platform: process.platform,
  pythonCommand,
  pythonScriptsPath,
  sofficeCommand,
  resourcesPath: process.resourcesPath,
}));

// ── IPC: open external link ──────────────────────────────────────────────────
ipcMain.handle("open-external", (_event, url) => shell.openExternal(url));

// ── IPC: Google OAuth (PKCE flow) ───────────────────────────────────────────
// Renderer sends the Google OAuth client ID; main opens the system browser
// and awaits the drafto://auth-callback with the authorization code.
ipcMain.handle("google-auth-start", (_event, { clientId }) => {
  return new Promise((resolve, reject) => {
    let authTimeout;
    pendingAuthResolve = (val) => { clearTimeout(authTimeout); resolve(val); };
    pendingAuthReject  = (err) => { clearTimeout(authTimeout); reject(err); };
    pendingClientId    = clientId;

    const codeVerifier   = generateCodeVerifier();
    pendingCodeVerifier  = codeVerifier;
    const codeChallenge  = generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      client_id:             clientId,
      redirect_uri:          "drafto://auth-callback",
      response_type:         "code",
      scope:                 "openid email profile",
      code_challenge:        codeChallenge,
      code_challenge_method: "S256",
      access_type:           "offline",
      prompt:                "select_account",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    console.log("[OAuth] Opening Google OAuth URL in system browser");
    shell.openExternal(authUrl);

    authTimeout = setTimeout(() => {
      const rej = pendingAuthReject;
      pendingAuthResolve = null;
      pendingAuthReject  = null;
      pendingCodeVerifier = null;
      pendingClientId    = null;
      rej?.(new Error("Authentication timed out. Please try again."));
    }, 5 * 60 * 1000);
  });
});

// ── IPC: PDF conversion ──────────────────────────────────────────────────────
// All heavy document operations run here in the main process.
// The renderer calls window.electron.invoke("convert-docx-to-pdf", ...)
const { convertWithDocx2Pdf } = require("./ipc/pdf-converter");
ipcMain.handle("convert-docx-to-pdf", async (_event, { docxBase64 }) => {
  const tmp = require("tmp");
  const fsPromises = require("fs").promises;

  const tempDocx = tmp.fileSync({ postfix: ".docx", keep: true });
  const tempPdf  = tmp.fileSync({ postfix: ".pdf",  keep: true });
  try {
    tempDocx.removeCallback();
    tempPdf.removeCallback();
    const buf = Buffer.from(docxBase64, "base64");
    await fsPromises.writeFile(tempDocx.name, buf);
    await new Promise(resolve => setTimeout(resolve, 100));
    await convertWithDocx2Pdf(tempDocx.name, tempPdf.name, {
      pythonCommand,
      pythonScriptsPath,
      sofficeCommand,
    });
    const pdfBuf = await fsPromises.readFile(tempPdf.name);
    return { success: true, pdfBase64: pdfBuf.toString("base64") };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    fsPromises.unlink(tempDocx.name).catch(() => {});
    fsPromises.unlink(tempPdf.name).catch(() => {});
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function getUniqueFilePath(directory, baseName, extension) {
  const base = baseName.replace(new RegExp(`\\.${extension}$`), "");
  let filePath = path.join(directory, `${base}.${extension}`);
  let counter = 1;
  while (fs.existsSync(filePath)) {
    filePath = path.join(directory, `${base} ${counter}.${extension}`);
    counter++;
  }
  return filePath;
}

function getTesseractDir() {
  const local = process.env.LOCALAPPDATA || "";
  const candidates = [
    isDev
      ? path.join(__dirname, "python", "tesseract", "tesseract.exe")
      : path.join(process.resourcesPath, "python", "tesseract", "tesseract.exe"),
    "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
    "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
    path.join(local, "Programs", "Tesseract-OCR", "tesseract.exe"),
    path.join(local, "Tesseract-OCR", "tesseract.exe"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return path.dirname(c);
  }
  return null;
}

function getGhostscriptDir() {
  const bundled = isDev
    ? path.join(__dirname, "python", "ghostscript", "bin", "gswin64c.exe")
    : path.join(process.resourcesPath, "python", "ghostscript", "bin", "gswin64c.exe");
  if (fs.existsSync(bundled)) return path.dirname(bundled);
  const gsRoot = "C:\\Program Files\\gs";
  if (fs.existsSync(gsRoot)) {
    try {
      const versions = fs.readdirSync(gsRoot).filter(d => d.startsWith("gs")).sort().reverse();
      for (const ver of versions) {
        const c = path.join(gsRoot, ver, "bin", "gswin64c.exe");
        if (fs.existsSync(c)) return path.dirname(c);
      }
    } catch {}
  }
  return null;
}

// ── IPC: project file management ─────────────────────────────────────────────
const projectsDir = () => {
  const dir = path.join(app.getPath("userData"), "projects");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

ipcMain.handle("save-project", (_event, { petitionerName, content }) => {
  const dir = projectsDir();
  const filePath = path.join(dir, `${petitionerName}.drafto`);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
});

ipcMain.handle("list-drafto-files", () => {
  const dir = projectsDir();
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(".drafto"))
      .map(f => {
        const fp = path.join(dir, f);
        const stats = fs.statSync(fp);
        return { name: f.replace(".drafto", ""), fileName: f, path: fp, modifiedDate: stats.mtime.toISOString(), size: stats.size };
      })
      .sort((a, b) => new Date(b.modifiedDate) - new Date(a.modifiedDate));
  } catch { return []; }
});

ipcMain.handle("load-drafto-file", (_event, fileName) => {
  const fp = path.join(projectsDir(), fileName);
  if (!fs.existsSync(fp)) throw new Error("File not found");
  return fs.readFileSync(fp, "utf-8");
});

ipcMain.handle("open-projects-folder", () => {
  shell.openPath(projectsDir());
});

// ── IPC: dialogs ─────────────────────────────────────────────────────────────
ipcMain.handle("read-file-by-path", (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") return null;
  if (!fs.existsSync(filePath)) return null;
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  return { path: filePath, name: fileName, data: fileBuffer.toString("base64"), type: "application/pdf" };
});

ipcMain.handle("open-file-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "PDF Files", extensions: ["pdf"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  return { path: filePath, name: fileName, data: fileBuffer.toString("base64"), type: "application/pdf" };
});

ipcMain.handle("select-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

// ── IPC: save DOCX / PDF ──────────────────────────────────────────────────────
ipcMain.handle("save-docx", async (_event, { fileName, content, defaultPath, projectFolder }) => {
  let filePath;
  if (defaultPath) {
    const targetDir = projectFolder ? path.join(defaultPath, projectFolder) : defaultPath;
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    filePath = getUniqueFilePath(targetDir, fileName, "docx");
  } else {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fileName,
      filters: [{ name: "Word Document", extensions: ["docx"] }],
    });
    filePath = result.filePath;
  }
  if (filePath) {
    fs.writeFileSync(filePath, Buffer.from(content, "base64"));
    return filePath;
  }
  return null;
});

ipcMain.handle("save-pdf", async (_event, { fileName, content, defaultPath }) => {
  let filePath;
  if (defaultPath) {
    filePath = getUniqueFilePath(defaultPath, fileName, "pdf");
  } else {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fileName,
      filters: [{ name: "PDF Document", extensions: ["pdf"] }],
    });
    filePath = result.filePath;
  }
  if (filePath) {
    const buf = typeof content === "string" ? Buffer.from(content, "base64") : Buffer.from(content);
    fs.writeFileSync(filePath, buf);
    return filePath;
  }
  return null;
});

// ── IPC: OCR ─────────────────────────────────────────────────────────────────
let activeOcrProcess = null;

ipcMain.handle("process-ocr", async (_event, pdfBase64) => {
  try {
    if (!pythonCommand) throw new Error("Python is not available");

    const tempDir = path.join(app.getPath("temp"), "drafto-ocr");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const inputPdf  = path.join(tempDir, `input_${Date.now()}.pdf`);
    const outputPdf = path.join(tempDir, `output_${Date.now()}.pdf`);
    fs.writeFileSync(inputPdf, Buffer.from(pdfBase64, "base64"));

    const scriptsPath = pythonScriptsPath ||
      (isDev ? path.join(__dirname, "..", "python_scripts") : path.join(process.resourcesPath, "python_scripts"));
    const ocrScript = path.join(scriptsPath, "process_ocr.py");

    const tesseractDir   = getTesseractDir();
    const ghostscriptDir = getGhostscriptDir();
    if (!tesseractDir) return { success: false, error: "Tesseract OCR engine not found. Please reinstall DraftoSLP." };

    const extraDirs = [tesseractDir, ghostscriptDir].filter(Boolean);
    const gsRoot    = ghostscriptDir ? path.dirname(ghostscriptDir) : null;
    const gsLib     = gsRoot ? [path.join(gsRoot, "lib"), path.join(gsRoot, "Resource", "Init"), path.join(gsRoot, "Resource")].join(path.delimiter) : undefined;

    const ocrEnv = {
      ...process.env,
      PATH: `${extraDirs.join(path.delimiter)}${path.delimiter}${process.env.PATH || ""}`,
      TESSDATA_PREFIX: path.join(tesseractDir, "tessdata"),
      TESSERACT_EXE:   path.join(tesseractDir, "tesseract.exe"),
      ...(gsLib ? { GS_LIB: gsLib } : {}),
    };

    return await new Promise((resolve) => {
      const cmd = `${pythonCommand} "${ocrScript}" "${inputPdf}" "${outputPdf}"`;
      activeOcrProcess = exec(cmd, { timeout: 1800000, env: ocrEnv }, (err) => {
        activeOcrProcess = null;
        if (err) {
          fs.unlink(inputPdf, () => {});
          if (err.killed || err.signal) return resolve({ success: false, error: "cancelled" });
          return resolve({ success: false, error: err.message });
        }
        if (fs.existsSync(outputPdf)) {
          const result = fs.readFileSync(outputPdf).toString("base64");
          fs.unlink(inputPdf, () => {});
          fs.unlink(outputPdf, () => {});
          resolve({ success: true, pdf: result });
        } else {
          resolve({ success: false, error: "OCR output file not found" });
        }
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("cancel-ocr", () => {
  if (activeOcrProcess) {
    activeOcrProcess.kill();
    activeOcrProcess = null;
  }
});

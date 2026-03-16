const { app, BrowserWindow, ipcMain, shell, protocol } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

// ── Environment ─────────────────────────────────────────────────────────────
const isDev = !app.isPackaged;

// ── Register custom protocol for OAuth callbacks (must be before app ready) ──
protocol.registerSchemesAsPrivileged([
  { scheme: "drafto", privileges: { standard: true, secure: true } },
]);

// ── Python (Windows/Linux only) ──────────────────────────────────────────────
let pythonCommand = null;
let pythonScriptsPath = null;

function findPython() {
  if (process.platform === "darwin") return; // Not used on macOS
  const candidates = [
    path.join(process.resourcesPath, "python", "python.exe"),
    path.join(__dirname, "..", "python", "python.exe"),
    "python",
    "python3",
  ];
  for (const p of candidates) {
    try {
      require("child_process").execFileSync(p, ["--version"], { stdio: "pipe" });
      pythonCommand = p;
      break;
    } catch {}
  }
  pythonScriptsPath = fs.existsSync(path.join(process.resourcesPath, "python_scripts"))
    ? path.join(process.resourcesPath, "python_scripts")
    : path.join(__dirname, "..", "python_scripts");
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

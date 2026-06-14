const { app, BrowserWindow, ipcMain, shell, protocol, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { execFile, exec, spawn } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const { autoUpdater } = require("electron-updater");
const { scanFolder } = require("./ipc/pdf-extract");
const { splitDocuments } = require("./ipc/pdf-split");

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
  // In packaged builds, LibreOffice is embedded inside Drafto.app at
  //   Drafto.app/Contents/Resources/LibreOffice.app
  // process.resourcesPath points at Contents/Resources, so soffice lives at:
  const bundled = path.join(
    process.resourcesPath || "",
    "LibreOffice.app", "Contents", "MacOS", "soffice"
  );

  // Development fall-backs: the developer's locally-installed LibreOffice.
  const candidates = [
    bundled,
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/local/bin/soffice",
    "/opt/homebrew/bin/soffice",
    "/opt/local/bin/soffice",       // MacPorts
    "/usr/bin/soffice",
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      sofficeCommand = p;
      console.log(`[soffice] Using LibreOffice at: ${p}`);
      return;
    }
  }
  // Last-resort: shell PATH lookup (dev environments).
  try {
    const result = require("child_process").execSync("which soffice 2>/dev/null", { encoding: "utf8" }).trim();
    if (result && fs.existsSync(result)) {
      sofficeCommand = result;
      console.log(`[soffice] Using LibreOffice from PATH: ${result}`);
    }
  } catch {}
  if (!sofficeCommand) {
    console.warn("[soffice] No LibreOffice found. PDF conversion will fail.");
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

  // Send any pending file-open path once renderer has mounted
  mainWindow.webContents.once("did-finish-load", () => {
    if (pendingOpenFilePath) {
      // Small delay to let React mount
      setTimeout(() => {
        sendOpenFile(pendingOpenFilePath);
        pendingOpenFilePath = null;
      }, 1500);
    }
  });

  // Prevent Ctrl+R / Cmd+R from reloading the page (which would wipe all user data).
  // Blocking navigation in the main window is safe — all routing is handled by React Router
  // internally, and OAuth uses shell.openExternal (not in-window navigation).
  // This also allows the Tiptap editor to use Ctrl+R freely for right text alignment.
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  // Auto-check for updates after the renderer has had time to mount (~4 s)
  if (!isDev) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) =>
          console.warn("[autoUpdater] startup check failed:", err)
        );
      }, 4000);
    });
  }
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
    // Handle double-clicking a .drafto file while app is already running
    const draftoFile = argv.find((a) => a.endsWith(".drafto") && !a.startsWith("--"));
    if (draftoFile) sendOpenFile(draftoFile);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAsDefaultProtocolClient("drafto");
    // Check if launched by double-clicking a .drafto file
    const launchFile = process.argv.find((a) => a.endsWith(".drafto") && !a.startsWith("--"));
    if (launchFile) pendingOpenFilePath = launchFile;
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

app.on("before-quit", () => {
  if (activeLockFilePath) {
    try { if (fs.existsSync(activeLockFilePath)) fs.unlinkSync(activeLockFilePath); } catch {}
    activeLockFilePath = null;
  }
});

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

// ── AI Plugin (Beta): prerequisite detection ─────────────────────────────────
// GUI-launched apps on macOS/Linux do NOT inherit the user's login-shell PATH,
// so a `claude` / `node` installed via Homebrew, nvm, fnm, volta, or npm-global
// is invisible unless we widen PATH ourselves. Build an augmented env once.
function aiAugmentedEnv() {
  const home = os.homedir();
  const extra =
    process.platform === "win32"
      ? [
          path.join(process.env.APPDATA || "", "npm"),
          path.join(home, "AppData", "Roaming", "npm"),
          "C:\\Program Files\\nodejs",
          // Where the official Claude Code installer (install.ps1) places claude.exe.
          // Including it here lets Drafto find it right after a one-click install,
          // before the OS-level PATH change is picked up (which needs a restart).
          path.join(home, ".local", "bin"),
        ]
      : [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          path.join(home, ".npm-global", "bin"),
          path.join(home, ".local", "bin"),
          path.join(home, ".volta", "bin"),
          path.join(home, ".bun", "bin"),
          path.join(home, "n", "bin"),
        ];
  const sep = process.platform === "win32" ? ";" : ":";
  const current = process.env.PATH || "";
  const merged = [current, ...extra].filter(Boolean).join(sep);
  return { ...process.env, PATH: merged, Path: merged };
}

// Resolve a runnable command + report its `--version`. Returns { found, version, path }.
function aiProbeCommand(command, env) {
  try {
    const out = require("child_process")
      .execFileSync(command, ["--version"], { stdio: "pipe", env, timeout: 8000 })
      .toString()
      .trim();
    return { found: true, version: out.split("\n")[0].trim(), path: command };
  } catch {
    return { found: false, version: null, path: null };
  }
}

// Known absolute install locations of the `claude` launcher. Probed directly so
// we can return a runnable ABSOLUTE path even when `where`/`which` and PATH are
// stale — e.g. immediately after the one-click install on Windows, where the
// installer's PATH edit only takes effect in shells started after a restart.
function aiKnownClaudePaths() {
  const home = os.homedir();
  if (process.platform === "win32") {
    return [
      // Native installer (install.ps1 → `claude install`) launcher location.
      path.join(home, ".local", "bin", "claude.exe"),
      path.join(home, ".local", "bin", "claude.cmd"),
      // npm global installs.
      path.join(process.env.APPDATA || "", "npm", "claude.cmd"),
      path.join(home, "AppData", "Roaming", "npm", "claude.cmd"),
    ];
  }
  return [
    path.join(home, ".local", "bin", "claude"),
    path.join(home, ".npm-global", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
}

// Locate the `claude` binary: explicit override → PATH lookup → known dirs → probe.
// Prefers an absolute path so callers (notably the sign-in terminal) never have
// to rely on the binary being on PATH.
function aiResolveClaude(customPath, env) {
  const candidates = [];
  if (customPath && customPath.trim()) candidates.push(customPath.trim());

  // which/where against the widened PATH
  try {
    const finder = process.platform === "win32" ? "where" : "which";
    const found = require("child_process")
      .execFileSync(finder, ["claude"], { stdio: "pipe", env, timeout: 8000 })
      .toString()
      .trim()
      .split("\n")[0]
      .trim();
    if (found) candidates.push(found);
  } catch {}

  // Known absolute install locations (covers stale PATH right after install).
  for (const p of aiKnownClaudePaths()) {
    try { if (fs.existsSync(p)) candidates.push(p); } catch {}
  }

  candidates.push("claude"); // last resort: rely on env PATH

  for (const c of candidates) {
    const probe = aiProbeCommand(c, env);
    if (probe.found) return probe;
  }
  return { found: false, version: null, path: null };
}

// Cheap, instant authentication check via `claude auth status --json`. This
// makes no inference call (no token cost), so it is safe to run automatically.
// Returns { loggedIn, authMethod }. Exit code is non-zero when not logged in,
// but the JSON still arrives on stdout, so we parse regardless of the error.
function aiAuthStatus(claudePath, env) {
  return new Promise((resolve) => {
    execFile(claudePath, ["auth", "status", "--json"], { env, timeout: 12000 }, (_err, stdout) => {
      try {
        const j = JSON.parse(stdout);
        resolve({ loggedIn: !!j.loggedIn, authMethod: j.authMethod || "none" });
      } catch {
        resolve({ loggedIn: false, authMethod: "none", message: "Could not read authentication status." });
      }
    });
  });
}

ipcMain.handle("ai-check-prerequisites", async (_event, opts) => {
  const env = aiAugmentedEnv();
  const node = aiProbeCommand("node", env);
  const claude = aiResolveClaude(opts && opts.customClaudePath, env);
  // Auth status is free + instant, so we always check it when the binary exists.
  let login = null;
  if (claude.found) {
    login = await aiAuthStatus(claude.path, env);
  }
  return {
    platform: process.platform,
    node,                 // { found, version, path }
    claude,               // { found, version, path }
    // `ok` = the plugin can actually run: a working, logged-in `claude` binary.
    ok: claude.found && !!login && login.loggedIn === true,
    nodeOk: node.found,
    loggedIn: login ? login.loggedIn : null,    // null = binary not found
    authMethod: login ? login.authMethod : undefined,
    needsLogin: !!(claude.found && login && !login.loggedIn),
  };
});

// Opens a Terminal and runs `claude auth login` so the user can sign in without
// knowing any commands. The interactive OAuth flow opens their browser; we keep
// it in a visible Terminal so any prompt is transparent. Returns once launched.
ipcMain.handle("ai-login", (_event, opts) => {
  const env = aiAugmentedEnv();
  const claude = aiResolveClaude(opts && opts.claudePath, env);
  if (!claude.found) return { ok: false, error: "Claude Code CLI not found. Install it first (see Settings → Mayur)." };

  try {
    if (process.platform === "darwin") {
      const shellCmd = `'${claude.path}' auth login --claudeai`;
      const appleScript = `tell application "Terminal" to do script "${shellCmd}"`;
      spawn("osascript", ["-e", appleScript, "-e", 'tell application "Terminal" to activate'], { env, detached: true });
    } else if (process.platform === "win32") {
      // Resolve to an absolute path so the new terminal never relies on PATH —
      // right after install the CLI is NOT yet on a fresh shell's PATH (the
      // installer's PATH edit only applies to shells started after a restart),
      // which previously produced "'claude' is not recognized" and never reached
      // sign-in. windowsVerbatimArguments lets us control the quoting precisely:
      // an empty title ("") keeps `start` from treating the quoted exe path as
      // the window title, and quoting the exe path handles spaces in usernames.
      spawn(
        "cmd.exe",
        ["/c", "start", '""', "cmd.exe", "/k", `"${claude.path}" auth login --claudeai`],
        { env, windowsHide: false, detached: true, windowsVerbatimArguments: true }
      );
    } else {
      // Linux: try the common terminal emulators in order.
      const cmd = `'${claude.path}' auth login --claudeai`;
      const terminals = ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"];
      const term = terminals.find((t) => { try { require("child_process").execFileSync("which", [t], { stdio: "pipe", env }); return true; } catch { return false; } });
      if (!term) return { ok: false, error: "No terminal emulator found. Run `claude auth login` manually." };
      spawn(term, ["-e", `sh -c "${cmd}; exec sh"`], { env, detached: true });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// One-click install of the Claude Code CLI using Anthropic's official installer.
// Streams the installer's output to the renderer ("ai-install-log") and resolves
// when it finishes. The user consents in a dialog before this is invoked.
ipcMain.handle("ai-install-claude", async () => {
  const env = aiAugmentedEnv();
  const send = (line) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("ai-install-log", line);
  };

  let cmd, args;
  if (process.platform === "win32") {
    cmd = "powershell";
    args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://claude.ai/install.ps1 | iex"];
  } else {
    // macOS / Linux — login shell so PATH/curl resolve as in a normal terminal.
    cmd = "bash";
    args = ["-lc", "curl -fsSL https://claude.ai/install.sh | bash"];
  }

  return await new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { env });
    } catch (e) {
      send(`Failed to start installer: ${e.message}`);
      resolve({ ok: false, error: e.message });
      return;
    }
    send("Running the official Claude Code installer…");
    const onData = (buf) => buf.toString().split(/\r?\n/).forEach((l) => { if (l.trim() !== "") send(l); });
    if (child.stdout) child.stdout.on("data", onData);
    if (child.stderr) child.stderr.on("data", onData);
    child.on("error", (e) => { send(`Error: ${e.message}`); resolve({ ok: false, error: e.message }); });
    child.on("close", (code) => {
      const ok = code === 0;
      send(ok ? "✓ Installation finished." : `Installer exited with code ${code}.`);
      resolve({ ok, code });
    });
  });
});

// Relaunch Drafto (used after installing the CLI, so the app re-detects it with
// a refreshed PATH).
ipcMain.handle("relaunch-app", () => {
  app.relaunch();
  app.exit(0);
});

// A human-friendly label for a streamed tool call, so the user sees what the
// assistant is doing (e.g. "Reading judgment.pdf…") instead of a blank spinner.
function aiToolLabel(block) {
  const name = block.name || "tool";
  const input = block.input || {};
  const base = (p) => { try { return require("path").basename(String(p)); } catch { return String(p); } };
  if (name === "Read" && input.file_path) return `Reading ${base(input.file_path)}…`;
  if (name === "Glob") return "Looking through the folder…";
  if (name === "Grep") return "Searching the documents…";
  if (name === "Bash") return "Inspecting files…";
  return `Working (${name})…`;
}

// A friendly label for a Drafto field path, for the activity log.
const AI_FIELD_LABELS = {
  caseType: "Case Type",
  petitioners: "Petitioners",
  respondents: "Respondents",
  impugnedOrders: "Impugned Order(s)",
  synopsis: "Synopsis",
  listOfDates: "List of Dates",
  questionsOfLaw: "Questions of Law",
  grounds: "Grounds",
  wantsInterimRelief: "Interim Relief",
};
function aiFieldLabel(path) {
  if (AI_FIELD_LABELS[path]) return AI_FIELD_LABELS[path];
  if (path.startsWith("advocate.")) return "Advocate details";
  if (path.startsWith("deponent.")) return "Deponent";
  if (path.startsWith("listingProforma")) return "Listing Proforma";
  const seg = String(path).split(".").pop() || String(path);
  return seg.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

// Tracks the in-flight assistant process so it can be cancelled, and records an
// explicit cancel so we can report "Stopped" rather than a generic error.
let activeAiChild = null;
let aiCancelRequested = false;

// Run a single turn against the user's Claude Code CLI, STREAMING progress.
// Read-only by construction: the available toolset is restricted to Read/Glob/
// Grep (no Write/Edit/Bash/ExitPlanMode), so Claude can read the source files
// but literally cannot modify anything — and it won't drop into plan mode's
// "present a plan and wait for approval" flow (which has no headless approval,
// so it would just stall). Stream events are forwarded to the renderer
// ("ai-stream") for live activity; an *idle* timeout (reset on every event)
// replaces a flat timeout so long-but-active tasks aren't killed mid-work.
const AI_READONLY_TOOLS = "Read,Glob,Grep";
// Allowed model aliases for the plugin's model selector. "default" = whatever the
// CLI is configured to use (currently Sonnet); no --model flag is passed.
const AI_ALLOWED_MODELS = new Set(["haiku", "sonnet", "opus"]);
// A clean, empty working directory for the spawned CLI. Running in the user's
// home (or any real project) makes Claude Code auto-load its CLAUDE.md / personal
// auto-memory, which leaks dev notes into the assistant and sends it reading
// unrelated files. An empty temp dir has no project memory, so none loads.
// (Config-dir / --bare isolation can't be used — they break OAuth login.)
function aiScratchCwd() {
  const dir = path.join(os.tmpdir(), "drafto-ai-cwd");
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}
ipcMain.handle("ai-run", async (_event, opts) => {
  opts = opts || {};
  const env = aiAugmentedEnv();
  const claude = aiResolveClaude(opts.claudePath, env);
  if (!claude.found) {
    return { ok: false, error: "Claude Code CLI not found. Check Settings → Mayur." };
  }

  const args = [
    "-p", "--output-format", "stream-json", "--verbose",
    // Stream token-level deltas so stdout flows continuously while the model is
    // generating — otherwise a long, silent final generation trips the idle
    // timeout even though it's actively working.
    "--include-partial-messages",
    "--permission-mode", "default",
    "--tools", AI_READONLY_TOOLS,
    "--allowedTools", AI_READONLY_TOOLS,
  ];
  // Optional model override (haiku/sonnet/opus). "default"/unset → CLI default.
  if (opts.model && AI_ALLOWED_MODELS.has(String(opts.model))) {
    args.push("--model", String(opts.model));
  }
  // The prompt is delivered on stdin (see below). On Windows the whole command
  // line is capped at ~32k chars, so passing the large system prompt via
  // --append-system-prompt trips `spawn ENAMETOOLONG`; there we fold it into the
  // first stdin prompt instead. (macOS/Linux arg limits are far larger.)
  let stdinPrompt = String(opts.prompt || "");
  // Conversation continuity: resume the prior session so the model remembers the
  // chat. The system prompt is only set when starting a fresh session (on resume
  // it's already in the session history).
  if (opts.resumeSessionId) {
    args.push("--resume", String(opts.resumeSessionId));
  } else if (opts.systemPrompt) {
    if (process.platform === "win32") {
      stdinPrompt =
        `${String(opts.systemPrompt)}\n\n` +
        `----- END OF INSTRUCTIONS. THE USER'S REQUEST FOLLOWS. -----\n\n` +
        stdinPrompt;
    } else {
      args.push("--append-system-prompt", String(opts.systemPrompt));
    }
  }
  // addDirs (extracted-text context dir, optionally the original PDF folder for
  // scanned-page images) supersedes the legacy single sourceFolder. Re-granted
  // every turn so file access persists across resumes.
  const addDirs = Array.isArray(opts.addDirs) && opts.addDirs.length
    ? opts.addDirs
    : (opts.sourceFolder ? [opts.sourceFolder] : []);
  for (const d of addDirs) args.push("--add-dir", String(d));

  const send = (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("ai-stream", payload);
  };

  aiCancelRequested = false;

  return await new Promise((resolve) => {
    let buf = "";
    let finalText = "";
    let finalErr = null;
    let needsLogin = false;
    let settled = false;
    let sessionId = null;
    let inputTokens = 0;   // peak context size seen (input + cached)
    let finalInput = 0, finalOutput = 0, finalCost = null;
    let child;

    const IDLE_MS = 300000; // give up only after 5 min of *total* silence (with
                            // partial-message streaming, active work is never silent)
    const MAX_TOTAL_MS = 1200000; // hard backstop: 20 min, even if actively streaming
    let idle;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(idle);
      clearTimeout(hardCap);
      activeAiChild = null;
      resolve(res);
    };
    const onIdle = () => {
      try { child && child.kill(); } catch {}
      finish({ ok: false, error: "The assistant went quiet for too long and was stopped. Try a narrower request — e.g. just the parties, or just the synopsis.", partialText: genBuf });
    };
    // Total-time backstop against a runaway/looping task (partial streaming
    // defeats the idle timer, so a slow loop could otherwise run forever).
    const hardCap = setTimeout(() => {
      try { child && child.kill(); } catch {}
      finish({ ok: false, error: "This task ran for 20 minutes and was stopped. It's likely too large for one request — try splitting it (e.g. fill the tabs first, then map and attach the annexures separately).", partialText: genBuf });
    }, MAX_TOTAL_MS);
    const bump = () => { clearTimeout(idle); idle = setTimeout(onIdle, IDLE_MS); };

    // Send a status line only when it changes, so each one is a distinct step in
    // the renderer's activity log.
    let lastStatus = null;
    const sendStatus = (text) => {
      if (text && text !== lastStatus) {
        lastStatus = text;
        send({ kind: "status", text });
      }
    };
    // Accumulate the model's streamed output text and announce which Drafto field
    // it has started filling (and when it begins the annexure map).
    let genBuf = "";
    const announced = new Set();
    const scanGeneration = () => {
      const re = /"path"\s*:\s*"([^"]+)"/g;
      let m;
      while ((m = re.exec(genBuf))) {
        const p = m[1];
        if (!announced.has(p)) {
          announced.add(p);
          sendStatus(`Filling ${aiFieldLabel(p)}…`);
        }
      }
      if (!announced.has("__docs") && /"documents"\s*:/.test(genBuf)) {
        announced.add("__docs");
        sendStatus("Mapping annexures…");
      }
    };
    // Live token usage: accurate input (from message_start), estimated output
    // (from the streamed text so far). Throttled so we don't spam IPC.
    let lastUsageAt = 0;
    const sendUsage = (force) => {
      const now = Date.now();
      if (!force && now - lastUsageAt < 600) return;
      lastUsageAt = now;
      send({ kind: "usage", input: inputTokens, output: Math.ceil(genBuf.length / 4) });
    };

    const handleEvent = (evt) => {
      if (!evt || typeof evt !== "object") return;
      if (evt.session_id) sessionId = evt.session_id;
      if (evt.type === "system" && evt.subtype === "init") {
        sendStatus("Reading your request…");
      } else if (evt.type === "stream_event" && evt.event) {
        // Token-level deltas: accumulate text + detect fields being filled.
        const ev = evt.event;
        if (ev.type === "content_block_delta" && ev.delta) {
          if (ev.delta.type === "text_delta" && typeof ev.delta.text === "string") {
            genBuf += ev.delta.text;
            scanGeneration();
            sendUsage();
          } else if (ev.delta.type === "thinking_delta") {
            // Model is reasoning (no visible text yet) — show it's working.
            if (announced.size === 0) sendStatus("Reasoning…");
          }
        } else if (ev.type === "message_start" && ev.message && ev.message.usage) {
          const u = ev.message.usage;
          const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
          inputTokens = Math.max(inputTokens, ctx);
          sendStatus("Thinking…");
          sendUsage(true);
        }
      } else if (evt.type === "assistant" && evt.message && Array.isArray(evt.message.content)) {
        for (const block of evt.message.content) {
          if (block.type === "tool_use") sendStatus(aiToolLabel(block));
          else if (block.type === "text" && block.text) {
            genBuf += block.text; // in case partial deltas were missed
            scanGeneration();
          }
        }
      } else if (evt.type === "result") {
        if (evt.usage) {
          finalInput = (evt.usage.input_tokens || 0) + (evt.usage.cache_read_input_tokens || 0) + (evt.usage.cache_creation_input_tokens || 0);
          finalOutput = evt.usage.output_tokens || 0;
        }
        if (typeof evt.total_cost_usd === "number") finalCost = evt.total_cost_usd;
        if (evt.is_error) {
          finalErr = evt.result || "The assistant reported an error.";
          needsLogin = /log\s?in|logged in|authenticat/i.test(finalErr);
        } else {
          finalText = evt.result ?? finalText;
        }
      }
    };

    try {
      // Always run in a clean dir (the extracted-text context dir is one, or an
      // empty scratch dir) — never the user's home/project — so Claude Code does
      // not auto-load CLAUDE.md / personal memory into the assistant.
      child = spawn(claude.path, args, { env, cwd: addDirs[0] || aiScratchCwd() });
    } catch (e) {
      finish({ ok: false, error: `Could not start Claude Code: ${e.message}` });
      return;
    }
    activeAiChild = child;
    idle = setTimeout(onIdle, IDLE_MS);

    child.stdout.on("data", (d) => {
      bump();
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) { try { handleEvent(JSON.parse(line)); } catch {} }
      }
    });
    child.stderr.on("data", () => { bump(); });
    child.on("error", (e) => finish({ ok: false, error: `Could not start Claude Code: ${e.message}` }));
    child.on("close", () => {
      const last = buf.trim();
      if (last) { try { handleEvent(JSON.parse(last)); } catch {} }
      if (aiCancelRequested) { aiCancelRequested = false; finish({ ok: false, error: "Stopped.", cancelled: true, partialText: genBuf, sessionId, inputTokens: finalInput, outputTokens: finalOutput, costUsd: finalCost }); return; }
      if (finalErr) finish({ ok: false, error: finalErr, needsLogin, sessionId, inputTokens: finalInput, outputTokens: finalOutput, costUsd: finalCost });
      else finish({ ok: true, text: finalText, sessionId, inputTokens: finalInput, outputTokens: finalOutput, costUsd: finalCost });
    });

    try {
      child.stdin.write(stdinPrompt);
      child.stdin.end();
    } catch (e) {
      try { child.kill(); } catch {}
      finish({ ok: false, error: `Could not send the prompt: ${e.message}` });
    }
  });
});

// Cancel an in-flight assistant turn (the Stop button).
ipcMain.handle("ai-cancel", () => {
  if (activeAiChild) {
    aiCancelRequested = true;
    try { activeAiChild.kill(); } catch {}
    return { ok: true };
  }
  return { ok: false };
});

// Extract text from every PDF in a folder (pdf.js) into a temp context dir and
// report scanned-page counts + a token estimate, so the renderer can show the
// cost and let the user decide before any image reading happens.
ipcMain.handle("ai-scan-folder", async (_event, folderPath) => {
  try {
    return await scanFolder(String(folderPath));
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Split an approved document map into separate PDFs (pdf-lib) in a managed
// folder next to the .drafto project. Deterministic; source files untouched.
ipcMain.handle("ai-split-documents", async (_event, opts) => {
  try {
    return await splitDocuments(opts || {});
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Auto-updater ─────────────────────────────────────────────────────────────
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// Persisted state so the renderer can query it any time (e.g. on mount)
let auState = { status: 'idle', version: null, error: null };

function sendUpdate(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

autoUpdater.on("update-available", (info) => {
  auState = { status: 'available', version: info.version, error: null };
  sendUpdate("au-update-available", info);
});
autoUpdater.on("update-not-available", (info) => {
  auState = { status: 'up-to-date', version: null, error: null };
  sendUpdate("au-update-not-available", info);
});
autoUpdater.on("download-progress", (prog) => {
  auState = { ...auState, status: 'downloading' };
  sendUpdate("au-download-progress", prog);
});
autoUpdater.on("update-downloaded", (info) => {
  auState = { status: 'downloaded', version: info.version, error: null };
  sendUpdate("au-update-downloaded", info);
});
autoUpdater.on("error", (err) => {
  auState = { status: 'error', version: null, error: String(err) };
  sendUpdate("au-error", String(err));
});

ipcMain.handle("au-get-state", () => auState);

ipcMain.handle("au-check", async () => {
  if (isDev) return { status: "dev" };
  try {
    await autoUpdater.checkForUpdates();
    return { status: "checking" };
  } catch (err) {
    return { status: "error", message: String(err) };
  }
});

ipcMain.handle("au-download", async () => {
  if (isDev) return;
  await autoUpdater.downloadUpdate();
});

ipcMain.handle("au-install", () => {
  autoUpdater.quitAndInstall(true, true);
});

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

// ── Recent files ─────────────────────────────────────────────────────────────
const recentFilesPath = () => path.join(app.getPath("userData"), "recent-files.json");

function loadRecentFilePaths() {
  try {
    if (fs.existsSync(recentFilesPath())) {
      return JSON.parse(fs.readFileSync(recentFilesPath(), "utf-8"));
    }
  } catch {}
  return [];
}

function addRecentFile(filePath) {
  let recent = loadRecentFilePaths().filter(p => p !== filePath);
  recent.unshift(filePath);
  if (recent.length > 20) recent = recent.slice(0, 20);
  try { fs.writeFileSync(recentFilesPath(), JSON.stringify(recent), "utf-8"); } catch {}
}

function removeRecentFile(filePath) {
  const recent = loadRecentFilePaths().filter(p => p !== filePath);
  try { fs.writeFileSync(recentFilesPath(), JSON.stringify(recent), "utf-8"); } catch {}
}

ipcMain.handle("remove-recent-file", (_event, filePath) => {
  if (filePath && typeof filePath === "string") removeRecentFile(filePath);
});

// Best-effort: read a .drafto and pull a short subtitle (parties + case number)
// so the Load dialog can distinguish projects with similar names.
function draftoSubtitle(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const d = (raw && raw.petitioners) ? raw : (raw && (raw.data || raw.project)) || raw || {};
    const pet = Array.isArray(d.petitioners) && d.petitioners[0] && d.petitioners[0].name ? d.petitioners[0].name : "";
    const res = Array.isArray(d.respondents) && d.respondents[0] && d.respondents[0].name ? d.respondents[0].name : "";
    const caseNo = Array.isArray(d.impugnedOrders) && d.impugnedOrders[0] && d.impugnedOrders[0].caseNumber ? d.impugnedOrders[0].caseNumber : "";
    const parties = (pet || res) ? `${pet || "—"} v. ${res || "—"}` : "";
    return { parties: parties || undefined, caseNumber: caseNo || undefined };
  } catch { return {}; }
}

ipcMain.handle("get-recent-files", () => {
  return loadRecentFilePaths()
    .filter(p => fs.existsSync(p))
    .map(p => {
      try {
        const stats = fs.statSync(p);
        const sub = draftoSubtitle(p);
        return { name: path.basename(p, ".drafto"), fileName: path.basename(p), path: p, modifiedDate: stats.mtime.toISOString(), size: stats.size, parties: sub.parties, caseNumber: sub.caseNumber };
      } catch { return null; }
    })
    .filter(Boolean)
    .slice(0, 20);
});

ipcMain.handle("delete-drafto-file", (_event, filePath) => {
  try {
    if (typeof filePath === "string" && filePath.endsWith(".drafto") && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { ok: true };
    }
    return { ok: false, error: "File not found" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("save-project", (_event, { petitionerName, content }) => {
  const dir = projectsDir();
  const filePath = path.join(dir, `${petitionerName}.drafto`);
  fs.writeFileSync(filePath, content, "utf-8");
  addRecentFile(filePath);
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
  addRecentFile(fp);
  return fs.readFileSync(fp, "utf-8");
});

ipcMain.handle("open-projects-folder", () => {
  shell.openPath(projectsDir());
});

// Coalesce rapid repeat opens of the SAME folder into one window. Generating
// several docx at once fires one open per file; Windows opens a new Explorer
// window each time (macOS reuses a single Finder window), so without this the
// user gets N windows. Opening the same folder again after a short gap still works.
let lastFolderOpen = { path: null, at: 0 };
ipcMain.handle("open-folder-path", (_event, folderPath) => {
  if (!folderPath || typeof folderPath !== "string") return;
  const now = Date.now();
  if (folderPath === lastFolderOpen.path && now - lastFolderOpen.at < 10000) return;
  lastFolderOpen = { path: folderPath, at: now };
  shell.openPath(folderPath);
});

ipcMain.handle("list-drafto-files-from-path", (_event, folderPath) => {
  if (!folderPath || typeof folderPath !== "string") return [];
  if (!fs.existsSync(folderPath)) return [];
  try {
    return fs.readdirSync(folderPath)
      .filter(f => f.endsWith(".drafto"))
      .map(f => {
        const fp = path.join(folderPath, f);
        const stats = fs.statSync(fp);
        return { name: f.replace(".drafto", ""), fileName: f, path: fp, modifiedDate: stats.mtime.toISOString(), size: stats.size };
      })
      .sort((a, b) => new Date(b.modifiedDate) - new Date(a.modifiedDate));
  } catch { return []; }
});

// ── IPC: shared-path project save/load/lock ───────────────────────────────
ipcMain.handle("save-project-to-path", (_event, { filePath, content }) => {
  if (!filePath || typeof filePath !== "string") throw new Error("Invalid path");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  addRecentFile(filePath);
  return filePath;
});

ipcMain.handle("load-project-from-path", (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") throw new Error("Invalid path");
  if (!fs.existsSync(filePath)) throw new Error("File not found: " + filePath);
  addRecentFile(filePath);
  return fs.readFileSync(filePath, "utf-8");
});

ipcMain.handle("open-drafto-file-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Drafto Project", extensions: ["drafto"] }],
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
});

ipcMain.handle("get-file-mtime", (_event, filePath) => {
  try { return fs.statSync(filePath).mtimeMs; } catch { return null; }
});

const LOCK_STALE_MS = 30 * 60 * 1000; // 30 minutes
let activeLockFilePath = null; // track the current lock so we can clean it on quit

ipcMain.handle("write-lock-file", (_event, filePath) => {
  const lockPath = filePath + ".lock";
  // Clean up the previous lock if switching to a different file
  if (activeLockFilePath && activeLockFilePath !== lockPath) {
    try { if (fs.existsSync(activeLockFilePath)) fs.unlinkSync(activeLockFilePath); } catch {}
    activeLockFilePath = null;
  }
  // Check for an existing, non-stale lock
  if (fs.existsSync(lockPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
      if (Date.now() - existing.since < LOCK_STALE_MS) {
        return { locked: true, user: existing.user, since: existing.since };
      }
    } catch {}
  }
  fs.writeFileSync(lockPath, JSON.stringify({
    user: os.userInfo().username,
    since: Date.now(),
  }), "utf-8");
  activeLockFilePath = lockPath;
  return { locked: false };
});

ipcMain.handle("delete-lock-file", (_event, filePath) => {
  const lockPath = filePath + ".lock";
  try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch {}
  if (activeLockFilePath === lockPath) activeLockFilePath = null;
});

// Notify renderer to open a .drafto file by path (used on launch and second-instance)
function sendOpenFile(filePath) {
  if (mainWindow && !mainWindow.isDestroyed() && filePath && filePath.endsWith(".drafto")) {
    // Wait for the renderer to finish mounting before sending
    mainWindow.webContents.send("open-file-path", filePath);
  }
}

// Store path received before renderer is ready
let pendingOpenFilePath = null;

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
    if (process.platform === "darwin") {
      return { success: false, error: "OCR is currently unavailable on macOS." };
    }
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
      const cmd = `"${pythonCommand}" "${ocrScript}" "${inputPdf}" "${outputPdf}"`;
      activeOcrProcess = exec(cmd, { timeout: 1800000, maxBuffer: 10 * 1024 * 1024, env: ocrEnv }, (err, stdout, stderr) => {
        activeOcrProcess = null;
        if (stdout) console.log("[OCR stdout]", stdout.trim());
        if (stderr) console.warn("[OCR stderr]", stderr.trim());
        if (err) {
          fs.unlink(inputPdf, () => {});
          if (err.killed || err.signal) return resolve({ success: false, error: "cancelled" });
          const detail = stderr ? `\n${stderr.trim()}` : "";
          return resolve({ success: false, error: err.message + detail });
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

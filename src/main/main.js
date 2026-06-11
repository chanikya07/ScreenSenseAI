// ScreenSense AI — Main Process
// Handles: floating orb window, panel window, overlay window, IPC bridge, tray icon

const { app, BrowserWindow, ipcMain, screen, systemPreferences, desktopCapturer, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const http = require('http');
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');

function getAppRoot() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, '../..');
}

const appRoot = getAppRoot();

function getResourcePath(...segments) {
  return path.join(appRoot, ...segments);
}

function writeStartupLog(message, error = null) {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const detail = error ? ` ${error.stack || error.message || String(error)}` : '';
    fs.appendFileSync(
      path.join(logDir, 'startup.log'),
      `[${new Date().toISOString()}] ${message}${detail}\n`,
      'utf8'
    );
  } catch (_) {
    // Logging must never be the reason the app cannot start.
  }
}

process.on('uncaughtException', (error) => {
  writeStartupLog('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  writeStartupLog('Unhandled rejection:', reason);
});

function loadEnvLocal(filePath) {
  try {
    const envText = fs.readFileSync(filePath, 'utf8');
    envText.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx < 0) return;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    // ignore missing .env.local or parse errors
  }
}

loadEnvLocal(getResourcePath('.env.local'));

// ── Persistent Settings ────────────────────────────────────────────────
const store = new Store({
  defaults: {
    preferredLanguage: 'auto',
    preferredOutputLanguage: 'default',
    apiKey: process.env.GROQ_API_KEY || process.env.GROQ_KEY || '',
    openaiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '',
    orbPosition: { x: null, y: null },
    theme: 'dark',
    autoTranslate: true,
    speakerDiarization: false,
    captionTranscriptionMode: 'local',
    sceneInterval: 10000, 
    audioDevice: 'default'
  }
});
const savedSceneInterval = Number(store.get('sceneInterval'));
if (!Number.isFinite(savedSceneInterval) || savedSceneInterval < 3000) {
  store.set('sceneInterval', 10000);
}
if (store.get('preferredLanguage') === 'en') {
  store.set('preferredLanguage', 'auto');
}

// ── Window References ──────────────────────────────────────────────────
let orbWin = null;
let panelWin = null;
let overlayWin = null;
let settingsWin = null;
let welcomeWin = null;
let selectorWin = null;
const detachedPanelWins = new Set();
let tray = null;
let isDetachingTaskWindow = false;
let isPanelTabDragActive = false;
let detachedWindowOffset = 0;
let orbSnapFallbackTimer = null;
let localWhisperProcess = null;
let localWhisperLastError = '';
const LOCAL_WHISPER_PORT = 5001;
const ALLOWED_SETTING_KEYS = new Set([
  'preferredLanguage',
  'preferredOutputLanguage',
  'apiKey',
  'openaiKey',
  'orbPosition',
  'theme',
  'autoTranslate',
  'speakerDiarization',
  'captionTranscriptionMode',
  'sceneInterval',
  'audioDevice'
]);

const ORB_WINDOW_SIZE = 96;
const ORB_CENTER_OFFSET = ORB_WINDOW_SIZE / 2;
const ORB_VISIBLE_SIZE = 52;
const ORB_EDGE_GUTTER = 10;
const ORB_VISUAL_PADDING = (ORB_WINDOW_SIZE - ORB_VISIBLE_SIZE) / 2;

// ── Session State ──────────────────────────────────────────────────────
let sessionActive = false;
let currentMode = null;
const activeTaskModes = new Map();
let transcriptBuffer = [];
let sceneBuffer = [];
let faceBuffer = [];
let sessionStartTime = null;
let cachedSources = [];
let sourcesCacheTime = 0;
const SOURCE_CACHE_TTL = 250;

function clampWindowPosition(x, y, win) {
  const bounds = win?.getBounds() || { width: ORB_WINDOW_SIZE, height: ORB_WINDOW_SIZE };
  const safeX = Number.isFinite(Number(x)) ? Math.round(Number(x)) : bounds.x || 0;
  const safeY = Number.isFinite(Number(y)) ? Math.round(Number(y)) : bounds.y || 0;
  const display = screen.getDisplayNearestPoint({ x: safeX, y: safeY }) || screen.getPrimaryDisplay();
  const workArea = display.workArea;
  return {
    x: Math.round(Math.max(workArea.x, Math.min(safeX, workArea.x + workArea.width - bounds.width))),
    y: Math.round(Math.max(workArea.y, Math.min(safeY, workArea.y + workArea.height - bounds.height)))
  };
}

function clampOrbWindowPosition(x, y) {
  const safeX = Number.isFinite(Number(x)) ? Math.round(Number(x)) : orbWin?.getBounds().x || 0;
  const safeY = Number.isFinite(Number(y)) ? Math.round(Number(y)) : orbWin?.getBounds().y || 0;
  const display = screen.getDisplayNearestPoint({ x: safeX + ORB_CENTER_OFFSET, y: safeY + ORB_CENTER_OFFSET }) || screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const minX = workArea.x + ORB_EDGE_GUTTER - ORB_VISUAL_PADDING;
  const maxX = workArea.x + workArea.width - ORB_EDGE_GUTTER - ORB_VISUAL_PADDING - ORB_VISIBLE_SIZE;
  const minY = workArea.y + ORB_EDGE_GUTTER - ORB_VISUAL_PADDING;
  const maxY = workArea.y + workArea.height - ORB_EDGE_GUTTER - ORB_VISUAL_PADDING - ORB_VISIBLE_SIZE;

  return {
    x: Math.round(Math.max(minX, Math.min(safeX, maxX))),
    y: Math.round(Math.max(minY, Math.min(safeY, maxY)))
  };
}

function createOrbTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <radialGradient id="orb-fill" cx="34%" cy="30%" r="74%">
          <stop offset="0%" stop-color="#4d4a7a"/>
          <stop offset="48%" stop-color="#252342"/>
          <stop offset="100%" stop-color="#090913"/>
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#orb-fill)" stroke="#8f83ff" stroke-width="3"/>
      <ellipse cx="32" cy="32" rx="18" ry="12" fill="none" stroke="#d8d1ff" stroke-width="4"/>
      <circle cx="32" cy="32" r="7" fill="#8f83ff"/>
      <circle cx="35" cy="29" r="2.2" fill="#ffffff"/>
    </svg>
  `;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

function sendWindowMaximizeState(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('window:maximized-state', win.isMaximized());
}

function bringWindowToFront(win, options = {}) {
  if (!win || win.isDestroyed()) return;
  const { temporaryAlwaysOnTop = false, topmostMs = 700 } = options;

  if (win.isMinimized()) {
    win.restore();
  }

  win.show();
  if (temporaryAlwaysOnTop) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
    win.focus();
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      win.setAlwaysOnTop(false);
      win.moveTop();
      win.focus();
    }, topmostMs);
    return;
  }

  win.moveTop();
  win.focus();
}

function raiseWindowAfterCreate(win) {
  if (!win || win.isDestroyed()) return;
  [0, 80, 220, 500, 900].forEach((delay) => {
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      win.show();
      win.moveTop();
      win.focus();
    }, delay);
  });
}

function wireWindowStateEvents(win) {
  if (!win) return;
  win.on('maximize', () => sendWindowMaximizeState(win));
  win.on('unmaximize', () => sendWindowMaximizeState(win));
  win.webContents.on('did-finish-load', () => sendWindowMaximizeState(win));
}

function protectAppWindowFromCapture(win) {
  if (!win || win.isDestroyed()) return;
  win.setContentProtection(true);
}

function snapOrbToNearestHorizontalEdge() {
  if (!orbWin || orbWin.isDestroyed()) return;
  clearTimeout(orbSnapFallbackTimer);

  const bounds = orbWin.getBounds();
  const display = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const centerX = bounds.x + bounds.width / 2;
  const workAreaCenterX = workArea.x + workArea.width / 2;
  const snappedX = centerX < workAreaCenterX
    ? workArea.x + ORB_EDGE_GUTTER - ORB_VISUAL_PADDING
    : workArea.x + workArea.width - ORB_EDGE_GUTTER - ORB_VISUAL_PADDING - ORB_VISIBLE_SIZE;
  const next = clampOrbWindowPosition(snappedX, bounds.y);

  orbWin.setPosition(next.x, next.y);
  store.set('orbPosition', next);
}

function scheduleOrbSnapFallback() {
  clearTimeout(orbSnapFallbackTimer);
  orbSnapFallbackTimer = setTimeout(() => {
    snapOrbToNearestHorizontalEdge();
  }, 900);
}

function isScreenSenseSource(source) {
  const name = String(source?.name || '').toLowerCase();
  return name.includes('screensense') || name.includes('screen sense');
}

function sanitizeExportName(value, fallback) {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

// ── App Init ───────────────────────────────────────────────────────────
app.whenReady().then(() => {
  writeStartupLog(`App starting. packaged=${app.isPackaged} root=${appRoot}`);
  createTray();
  createWelcomeWindow();
  setupIPC();
  // Start local admin server for key rotation (only bound to localhost)
  try {
    startKeyRotationServer();
  } catch (err) {
    console.warn('Key rotation server failed to start:', err.message || err);
  }
  setTimeout(() => {
    ensureLocalWhisperProcess().catch((error) => {
      localWhisperLastError = error.message || String(error);
    });
  }, 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWelcomeWindow();
  });
});

app.on('window-all-closed', (e) => {
  e.preventDefault(); // Keep app running in tray
});

app.on('before-quit', () => {
  if (localWhisperProcess && !localWhisperProcess.killed) {
    localWhisperProcess.kill();
  }
});

function checkLocalWhisperHealth(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${LOCAL_WHISPER_PORT}/health`, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

// Small local HTTP server to allow secure, local key rotation by automation tools.
function startKeyRotationServer() {
  const rotationPort = Number(process.env.KEY_ROTATION_PORT || 8765);
  const rotationSecret = process.env.KEY_ROTATION_SECRET || store.get('keyRotationSecret') || '';

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/rotate-keys') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const authHeader = req.headers['x-rotation-secret'] || '';
    const a = Buffer.from(String(authHeader));
    const b = Buffer.from(String(rotationSecret));
    if (!rotationSecret || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.writeHead(401);
      res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (payload.openaiKey != null) {
          await store.set('openaiKey', payload.openaiKey);
          [orbWin, panelWin, overlayWin, settingsWin].forEach(w => {
            if (w && !w.isDestroyed()) w.webContents.send('settings:updated', 'openaiKey', payload.openaiKey);
          });
        }
        if (payload.apiKey != null) {
          await store.set('apiKey', payload.apiKey);
          [orbWin, panelWin, overlayWin, settingsWin].forEach(w => {
            if (w && !w.isDestroyed()) w.webContents.send('settings:updated', 'apiKey', payload.apiKey);
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: String(err) }));
      }
    });
  });

  server.on('error', (error) => {
    console.warn('Key rotation server failed:', error.message || error);
    writeStartupLog('Key rotation server failed:', error);
  });
  server.listen(rotationPort, '127.0.0.1', () => {
    console.log(`Key rotation server listening on http://127.0.0.1:${rotationPort}/rotate-keys`);
  });
}

function execFilePromise(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function findPythonCommand() {
  const candidates = [
    { command: 'py', args: ['-3.13', '--version'], spawnArgs: ['-3.13'] },
    { command: 'py', args: ['-3', '--version'], spawnArgs: ['-3'] },
    { command: 'python', args: ['--version'] },
    { command: 'python3', args: ['--version'] }
  ];

  for (const candidate of candidates) {
    try {
      await execFilePromise(candidate.command, candidate.args);
      return {
        command: candidate.command,
        prefixArgs: candidate.spawnArgs || []
      };
    } catch (error) {
      localWhisperLastError = error.message || String(error);
    }
  }

  return null;
}

function getBundledWhisperServerPath() {
  const platformDir = process.platform === 'win32'
    ? 'win'
    : process.platform === 'darwin'
      ? 'mac'
      : 'linux';
  const executableName = process.platform === 'win32'
    ? 'local-whisper-server.exe'
    : 'local-whisper-server';
  return getResourcePath('local-whisper-bin', platformDir, executableName);
}

function startBundledWhisperServer(serverPath) {
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(serverPath, 0o755);
    } catch (error) {
      writeStartupLog('Unable to mark bundled local Whisper server executable:', error);
    }
  }

  localWhisperLastError = 'Starting bundled local Whisper...';
  localWhisperProcess = spawn(serverPath, [], {
    cwd: appRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  localWhisperProcess.stdout.on('data', (chunk) => {
    localWhisperLastError = String(chunk).trim() || localWhisperLastError;
  });
  localWhisperProcess.stderr.on('data', (chunk) => {
    localWhisperLastError = String(chunk).trim() || localWhisperLastError;
  });
  localWhisperProcess.on('error', (error) => {
    localWhisperLastError = error.message || String(error);
    localWhisperProcess = null;
  });
  localWhisperProcess.on('exit', (code) => {
    if (code !== 0 && !localWhisperLastError) {
      localWhisperLastError = `Bundled local Whisper exited with code ${code}.`;
    }
    localWhisperProcess = null;
  });

  return { ok: false, status: 'starting', error: localWhisperLastError };
}

async function checkLocalWhisperDependencies(python) {
  const dependencyCheck = [
    'import flask',
    'import faster_whisper',
    'import numpy',
    'import imageio_ffmpeg'
  ].join('; ');

  try {
    await execFilePromise(python.command, [
      ...python.prefixArgs,
      '-c',
      dependencyCheck
    ]);
    return { ok: true };
  } catch (error) {
    const detail = error.stderr || error.stdout || error.message || String(error);
    return {
      ok: false,
      error: `Local Whisper Python packages are missing. Run start-local-whisper.bat once from the ScreenSense AI install folder, or run: ${python.command} ${python.prefixArgs.join(' ')} -m pip install -r requirements-local-whisper.txt. Details: ${String(detail).trim()}`
    };
  }
}

async function ensureLocalWhisperProcess() {
  if (await checkLocalWhisperHealth()) {
    return { ok: true, status: 'running' };
  }

  if (localWhisperProcess && !localWhisperProcess.killed) {
    return { ok: false, status: 'starting', error: localWhisperLastError };
  }

  const bundledServerPath = getBundledWhisperServerPath();
  if (fs.existsSync(bundledServerPath)) {
    return startBundledWhisperServer(bundledServerPath);
  }

  const python = await findPythonCommand();
  if (!python) {
    return {
      ok: false,
      status: 'missing-python',
      error: 'Bundled local Whisper server was not found and Python is not installed on PATH. Rebuild with npm run build:whisper before npm run build, or install Python from python.org, tick "Add python.exe to PATH", then restart ScreenSense.'
    };
  }

  const dependencyStatus = await checkLocalWhisperDependencies(python);
  if (!dependencyStatus.ok) {
    localWhisperLastError = dependencyStatus.error;
    return {
      ok: false,
      status: 'missing-dependencies',
      error: localWhisperLastError
    };
  }

  const serverPath = getResourcePath('local_whisper_server.py');
  if (!fs.existsSync(serverPath)) {
    localWhisperLastError = 'Local Whisper server file was not found. Reinstall ScreenSense or run local_whisper_server.py from the app folder.';
    return {
      ok: false,
      status: 'missing-server',
      error: localWhisperLastError
    };
  }

  localWhisperLastError = 'Starting local Whisper...';
  localWhisperProcess = spawn(
    python.command,
    [...python.prefixArgs, serverPath],
    {
      cwd: appRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  localWhisperProcess.stdout.on('data', (chunk) => {
    localWhisperLastError = String(chunk).trim() || localWhisperLastError;
  });
  localWhisperProcess.stderr.on('data', (chunk) => {
    localWhisperLastError = String(chunk).trim() || localWhisperLastError;
  });
  localWhisperProcess.on('error', (error) => {
    localWhisperLastError = error.code === 'ENOENT'
      ? `Unable to start Python command "${python.command}". Install Python and make sure it is available on PATH, then restart ScreenSense.`
      : (error.message || String(error));
    localWhisperProcess = null;
  });
  localWhisperProcess.on('exit', (code) => {
    if (code !== 0 && !localWhisperLastError) {
      localWhisperLastError = `Local Whisper exited with code ${code}.`;
    }
    localWhisperProcess = null;
  });

  return { ok: false, status: 'starting', error: localWhisperLastError };
}

// ── Tray Setup ─────────────────────────────────────────────────────────
function createTray() {
  const trayIconPath = getResourcePath('assets', 'tray-orb.png');
  const icon = fs.existsSync(trayIconPath)
    ? nativeImage.createFromPath(trayIconPath)
    : createOrbTrayIcon();

  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'ScreenSense AI', enabled: false },
    { type: 'separator' },
    { label: 'Welcome', click: () => createWelcomeWindow() },
    { label: 'Show Orb', click: () => {
      createOrbWindow();
      orbWin?.show();
    } },
    { label: 'Settings', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); process.exit(0); } }
  ]);

  tray.setToolTip('ScreenSense AI');
  tray.setContextMenu(contextMenu);
}

// ── Orb Window ─────────────────────────────────────────────────────────
function createWelcomeWindow() {
  if (welcomeWin && !welcomeWin.isDestroyed()) {
    bringWindowToFront(welcomeWin);
    return;
  }

  welcomeWin = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 520,
    minHeight: 420,
    center: true,
    frame: false,
    transparent: true,
    resizable: true,
    maximizable: true,
    minimizable: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  protectAppWindowFromCapture(welcomeWin);
  welcomeWin.loadFile(path.join(__dirname, '../renderer/welcome/welcome.html'));
  wireWindowStateEvents(welcomeWin);
  welcomeWin.once('ready-to-show', () => {
    bringWindowToFront(welcomeWin);
  });
  welcomeWin.on('closed', () => {
    welcomeWin = null;
  });
}

function createAssistantSurface() {
  createOrbWindow();
  createOverlayWindow();
  createPanelWindow();
}

function closeAssistantSurface() {
  activeTaskModes.clear();
  sessionActive = false;
  currentMode = null;
  clearTimeout(orbSnapFallbackTimer);

  if (orbWin && !orbWin.isDestroyed()) {
    orbWin.webContents.send('session:stopped');
  }
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.hide();
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
  }

  detachedPanelWins.forEach((win) => {
    if (win && !win.isDestroyed()) win.close();
  });

  if (panelWin && !panelWin.isDestroyed()) {
    const win = panelWin;
    panelWin = null;
    win.close();
  }
  if (orbWin && !orbWin.isDestroyed()) {
    const win = orbWin;
    orbWin = null;
    win.close();
  }
  if (overlayWin && !overlayWin.isDestroyed()) {
    const win = overlayWin;
    overlayWin = null;
    win.close();
  }
}

function createOrbWindow() {
  if (orbWin && !orbWin.isDestroyed()) {
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const savedPos = store.get('orbPosition');
  const initialX = savedPos.x !== null ? savedPos.x : width - ORB_WINDOW_SIZE - 18;
  const initialY = savedPos.y !== null ? savedPos.y : Math.floor(height / 2);
  const { x, y } = clampOrbWindowPosition(initialX, initialY);

  orbWin = new BrowserWindow({
    width: ORB_WINDOW_SIZE, height: ORB_WINDOW_SIZE, x, y,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false,
    skipTaskbar: true, hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') // preload.js is in the same folder as main.js
    }
  });
  protectAppWindowFromCapture(orbWin);

  // PATH FIXED: Going up from src/main to src/renderer
  orbWin.loadFile(path.join(__dirname, '../renderer/orb/orb.html'));
  orbWin.on('closed', () => {
    orbWin = null;
  });
}

// ── Panel Window ───────────────────────────────────────────────────────
function createPanelWindow() {
  if (!orbWin || orbWin.isDestroyed()) {
    createOrbWindow();
  }

  if (panelWin && !panelWin.isDestroyed()) {
    if (!panelWin.isMaximized()) {
      panelWin.setAlwaysOnTop(true);
      panelWin.setSkipTaskbar(true);
    }
    bringWindowToFront(panelWin);
    return;
  }

  const [orbX, orbY] = orbWin.getPosition();
  const panelWidth = 320;
  const panelHeight = 480;
  let panelX = orbX - panelWidth - 12;
  if (panelX < 0) panelX = orbX + ORB_WINDOW_SIZE + 8;

  panelWin = new BrowserWindow({
    width: panelWidth, height: panelHeight, x: panelX,
    y: Math.max(0, orbY - panelHeight / 2 + ORB_CENTER_OFFSET),
    minWidth: panelWidth, minHeight: panelHeight,
    maximizable: true, minimizable: true,
    frame: false, transparent: true, alwaysOnTop: true, resizable: true,
    skipTaskbar: true, hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  protectAppWindowFromCapture(panelWin);

  // PATH FIXED
  panelWin.loadFile(path.join(__dirname, '../renderer/panel/panel.html'));
  wireWindowStateEvents(panelWin);
  panelWin.on('closed', () => {
    panelWin = null;
  });

  panelWin.on('blur', () => {
    if (isDetachingTaskWindow || isPanelTabDragActive) return;
    if (!sessionActive) panelWin?.hide();
  });
}

function createDetachedPanelWindow(taskSnapshot = null) {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const panelWidth = 360;
  const panelHeight = 520;
  const offsetStep = 34;
  const maxOffset = 180;
  const offset = detachedWindowOffset;
  detachedWindowOffset = (detachedWindowOffset + offsetStep) % maxOffset;

  const win = new BrowserWindow({
    width: panelWidth,
    height: panelHeight,
    x: Math.round(Math.min(workArea.x + workArea.width - panelWidth, workArea.x + 48 + offset)),
    y: Math.round(Math.min(workArea.y + workArea.height - panelHeight, workArea.y + 48 + offset)),
    minWidth: 320,
    minHeight: 480,
    maximizable: true,
    minimizable: true,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    resizable: true,
    skipTaskbar: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  detachedPanelWins.add(win);
  protectAppWindowFromCapture(win);
  win.loadFile(path.join(__dirname, '../renderer/panel/panel.html'));
  wireWindowStateEvents(win);
  win.on('closed', () => detachedPanelWins.delete(win));
  win.on('focus', () => win.moveTop());
  win.once('ready-to-show', () => {
    bringWindowToFront(win, { temporaryAlwaysOnTop: true, topmostMs: 1000 });
    raiseWindowAfterCreate(win);
  });
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('task:detached-init', taskSnapshot);
    bringWindowToFront(win, { temporaryAlwaysOnTop: true, topmostMs: 1000 });
    raiseWindowAfterCreate(win);
  });
  return win;
}

function broadcastToPanelWindows(channel, ...args) {
  panelWin?.webContents.send(channel, ...args);
  detachedPanelWins.forEach((win) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
  });
}

// ── Overlay Window ────────────────────────────────────────────────────
function createOverlayWindow() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWin = new BrowserWindow({
    width: 860, height: 220,
    x: Math.floor((width - 860) / 2),
    y: height - 240,
    frame: false, transparent: true, alwaysOnTop: true,
    resizable: true, skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  protectAppWindowFromCapture(overlayWin);

  // PATH FIXED
  overlayWin.loadFile(path.join(__dirname, '../renderer/overlay/overlay.html'));
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.hide();
  overlayWin.on('closed', () => {
    overlayWin = null;
  });
}

function resolveDisplayForSource(source) {
  const sourceDisplayId = String(source?.display_id || '');
  if (sourceDisplayId) {
    const directMatch = screen.getAllDisplays().find((display) => String(display.id) === sourceDisplayId);
    if (directMatch) return directMatch;
  }

  const parsed = /^screen:([^:]+):/.exec(source?.id || '');
  if (parsed?.[1]) {
    const parsedMatch = screen.getAllDisplays().find((display) => String(display.id) === parsed[1]);
    if (parsedMatch) return parsedMatch;
  }

  return screen.getPrimaryDisplay();
}

function cropThumbnailToRegion(thumbnail, region, source) {
  if (!region || !thumbnail || thumbnail.isEmpty() || !source || !String(source.id || '').startsWith('screen:')) {
    return thumbnail;
  }

  const display = resolveDisplayForSource(source);
  if (!display?.bounds) return thumbnail;

  const thumbSize = thumbnail.getSize();
  const bounds = display.bounds;
  const scaleX = thumbSize.width / bounds.width;
  const scaleY = thumbSize.height / bounds.height;

  const cropX = Math.max(0, Math.round((region.x - bounds.x) * scaleX));
  const cropY = Math.max(0, Math.round((region.y - bounds.y) * scaleY));
  const cropWidth = Math.max(1, Math.round(region.width * scaleX));
  const cropHeight = Math.max(1, Math.round(region.height * scaleY));

  const safeWidth = Math.min(cropWidth, thumbSize.width - cropX);
  const safeHeight = Math.min(cropHeight, thumbSize.height - cropY);
  if (safeWidth <= 0 || safeHeight <= 0) {
    return thumbnail;
  }

  return thumbnail.crop({
    x: cropX,
    y: cropY,
    width: safeWidth,
    height: safeHeight
  });
}

async function pickRegionForSource(sourceId) {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 320, height: 180 }
  });
  const source = sources.find((entry) => entry.id === sourceId);
  if (!source) {
    throw new Error('Area selection is available only for full-screen sources.');
  }

  const display = resolveDisplayForSource(source);

  if (selectorWin && !selectorWin.isDestroyed()) {
    selectorWin.close();
  }

  panelWin?.hide();
  await new Promise((resolve) => setTimeout(resolve, 80));

  const mirrorSources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.max(1, Math.round(display.bounds.width)),
      height: Math.max(1, Math.round(display.bounds.height))
    }
  });
  const mirrorSource = mirrorSources.find((entry) => entry.id === sourceId);
  const backgroundImage = mirrorSource?.thumbnail && !mirrorSource.thumbnail.isEmpty()
    ? mirrorSource.thumbnail.toDataURL()
    : '';

  selectorWin = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'selector-preload.js')
    }
  });
  selectorWin.setAlwaysOnTop(true, 'screen-saver');
  selectorWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  selectorWin.loadFile(path.join(__dirname, '../renderer/selector/selector.html'));

  return await new Promise((resolve) => {
    let settled = false;

    const finalize = (value, options = {}) => {
      const { closeWindow = true } = options;
      if (settled) return;
      settled = true;
      const win = selectorWin;
      ipcMain.removeListener('selector:submit', onSubmit);
      ipcMain.removeListener('selector:cancel', onCancel);
      if (panelWin && !panelWin.isDestroyed() && !sessionActive) {
        panelWin.show();
      }
      if (closeWindow && win && !win.isDestroyed()) {
        win.close();
      }
      if (selectorWin === win) {
        selectorWin = null;
      }
      resolve(value);
    };

    const onSubmit = (event, region) => {
      if (!selectorWin || event.sender !== selectorWin.webContents) return;
      finalize(region);
    };

    const onCancel = (event) => {
      if (!selectorWin || event.sender !== selectorWin.webContents) return;
      finalize(null);
    };

    ipcMain.on('selector:submit', onSubmit);
    ipcMain.on('selector:cancel', onCancel);

    selectorWin.once('closed', () => finalize(null, { closeWindow: false }));
    selectorWin.once('ready-to-show', () => {
      selectorWin?.show();
      selectorWin?.focus();
      selectorWin?.moveTop();
    });
    selectorWin.webContents.once('did-finish-load', () => {
      selectorWin?.webContents.send('selector:init', {
        sourceId,
        backgroundImage,
        displayBounds: {
          ...display.bounds,
          id: display.id
        }
      });
    });
  });
}

// ── Settings Window ────────────────────────────────────────────────────
function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    bringWindowToFront(settingsWin);
    return;
  }

  settingsWin = new BrowserWindow({
    width: 520, height: 640, minWidth: 520, minHeight: 640, resizable: true, maximizable: true, minimizable: true, frame: false, transparent: true,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  protectAppWindowFromCapture(settingsWin);

  // PATH FIXED
  settingsWin.loadFile(path.join(__dirname, '../renderer/settings/settings.html'));
  wireWindowStateEvents(settingsWin);
}

// ── IPC Bridge ─────────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.on('orb:click', () => createPanelWindow());

  ipcMain.on('welcome:open', () => createWelcomeWindow());

  ipcMain.on('welcome:start', () => {
    createAssistantSurface();
    if (welcomeWin && !welcomeWin.isDestroyed()) {
      welcomeWin.close();
    }
  });

  ipcMain.on('mode:start', (event, payload) => {
    const mode = typeof payload === 'object' ? payload.mode : payload;
    const taskId = typeof payload === 'object' ? payload.taskId : 'default';
    createOverlayWindow();
    currentMode = mode;
    activeTaskModes.set(taskId || 'default', mode);
    sessionActive = true;
    sessionStartTime = Date.now();
    transcriptBuffer = [];
    sceneBuffer = [];
    faceBuffer = [];

    orbWin?.webContents.send('session:started', mode);
    overlayWin?.show();
    overlayWin?.setIgnoreMouseEvents(false);
    overlayWin?.webContents.send('mode:active', mode);
    broadcastToPanelWindows('session:active', mode);
  });

  ipcMain.on('overlay:setClickThrough', (event, value) => {
    if (!overlayWin || event.sender !== overlayWin.webContents) return;
    overlayWin.setIgnoreMouseEvents(Boolean(value), { forward: true });
  });

  ipcMain.on('mode:stop', (event, payload = {}) => {
    const taskId = typeof payload === 'object' ? payload.taskId : 'default';
    activeTaskModes.delete(taskId || 'default');
    sessionActive = activeTaskModes.size > 0;
    currentMode = Array.from(activeTaskModes.values()).pop() || null;
    if (!sessionActive) {
      orbWin?.webContents.send('session:stopped');
      overlayWin?.hide();
      overlayWin?.setIgnoreMouseEvents(true, { forward: true });
      return;
    }
    orbWin?.webContents.send('session:started', currentMode);
    overlayWin?.webContents.send('mode:active', currentMode);
  });

  ipcMain.handle('capture:getSources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 160, height: 90 }
      });
      return sources.filter((source) => !isScreenSenseSource(source)).map((s) => ({
        id: s.id,
        name: s.name,
        type: String(s.id || '').startsWith('screen:') ? 'screen' : 'window',
        displayId: s.display_id || null,
        thumbnail: (s.thumbnail && !s.thumbnail.isEmpty()) ? s.thumbnail.toDataURL() : ''
      }));
    } catch (error) {
      console.error('capture:getSources failed:', error);
      return [];
    }
  });

  ipcMain.handle('capture:frame', async (event, payload) => {
    try {
      const sourceId = typeof payload === 'string' ? payload : payload?.sourceId;
      const region = typeof payload === 'object' ? payload?.region : null;

      const now = Date.now();
      if (!cachedSources.length || now - sourcesCacheTime > SOURCE_CACHE_TTL) {
        cachedSources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 640, height: 360 }
        });
        sourcesCacheTime = now;
      }

      const source = sourceId
        ? cachedSources.find((s) => s.id === sourceId)
        : cachedSources[0];
      if (!source || !source.thumbnail || source.thumbnail.isEmpty()) return null;
      const output = cropThumbnailToRegion(source.thumbnail, region, source);
      return output.toDataURL();
    } catch (error) {
      console.error('capture:frame failed:', error);
      return null;
    }
  });

  ipcMain.handle('region:pick', async (event, sourceId) => {
    try {
      return await pickRegionForSource(sourceId);
    } catch (error) {
      console.error('region:pick failed:', error);
      throw error;
    }
  });

  ipcMain.handle('settings:get', (event, key) => {
    if (!ALLOWED_SETTING_KEYS.has(key)) return undefined;
    return store.get(key);
  });
  ipcMain.handle('settings:set', (event, key, value) => {
    if (!ALLOWED_SETTING_KEYS.has(key)) {
      throw new Error('Unsupported setting key.');
    }
    store.set(key, value);
    [orbWin, panelWin, overlayWin, settingsWin].forEach(w => {
      if (w && !w.isDestroyed()) w.webContents.send('settings:updated', key, value);
    });
    detachedPanelWins.forEach(w => {
      if (w && !w.isDestroyed()) w.webContents.send('settings:updated', key, value);
    });
  });
  ipcMain.handle('settings:getAll', () => store.store);

  ipcMain.handle('local-whisper:ensure', async () => ensureLocalWhisperProcess());

  ipcMain.on('transcript:append', (event, entry) => {
    transcriptBuffer.push(entry);
    overlayWin?.webContents.send('transcript:new', entry);
    broadcastToPanelWindows('transcript:new', entry);
  });

  ipcMain.on('scene:append', (event, entry) => {
    sceneBuffer.push(entry);
    overlayWin?.webContents.send('scene:new', entry);
    broadcastToPanelWindows('scene:new', entry);
  });

  ipcMain.on('face:append', (event, entry) => {
    faceBuffer.push(entry);
    broadcastToPanelWindows('face:new', entry);
  });

  ipcMain.on('task:detach-window', (event, taskSnapshot) => {
    isDetachingTaskWindow = true;
    createDetachedPanelWindow(taskSnapshot);
    setTimeout(() => {
      isDetachingTaskWindow = false;
    }, 500);
  });

  ipcMain.on('panel:tab-drag-start', (event) => {
    if (panelWin && event.sender === panelWin.webContents) {
      isPanelTabDragActive = true;
    }
  });

  ipcMain.on('panel:tab-drag-end', (event) => {
    if (panelWin && event.sender === panelWin.webContents) {
      setTimeout(() => {
        isPanelTabDragActive = false;
      }, 250);
    }
  });

  ipcMain.handle('export:file', async (event, { content, filename, type }) => {
    const downloadsPath = app.getPath('downloads');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeFilename = sanitizeExportName(filename, 'screensense-export');
    const safeType = sanitizeExportName(type, 'txt').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'txt';
    const filePath = path.join(downloadsPath, `${safeFilename}_${ts}.${safeType}`);
    fs.writeFileSync(filePath, content, 'utf-8');
    shell.showItemInFolder(filePath);
    return filePath;
  });

  ipcMain.handle('export:binary', async (event, { base64, filename, type }) => {
    const downloadsPath = app.getPath('downloads');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeFilename = sanitizeExportName(filename, 'screensense-export');
    const safeType = sanitizeExportName(type, 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'bin';
    const filePath = path.join(downloadsPath, `${safeFilename}_${ts}.${safeType}`);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buffer);
    shell.showItemInFolder(filePath);
    return filePath;
  });

  ipcMain.handle('session:getData', () => ({
    transcript: transcriptBuffer,
    scenes: sceneBuffer,
    faces: faceBuffer,
    startTime: sessionStartTime,
    duration: sessionStartTime ? Date.now() - sessionStartTime : 0,
    mode: currentMode
  }));

  ipcMain.on('orb:drag', (event, payload = {}) => {
    if (!orbWin) return;
    const [x, y] = orbWin.getPosition();
    const hasAbsolutePosition = Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.y));
    const rawX = hasAbsolutePosition ? payload.x : x + Number(payload.dx || 0);
    const rawY = hasAbsolutePosition ? payload.y : y + Number(payload.dy || 0);
    const next = clampOrbWindowPosition(rawX, rawY);
    orbWin.setPosition(next.x, next.y);
    scheduleOrbSnapFallback();
  });

  ipcMain.on('orb:drag-end', () => {
    snapOrbToNearestHorizontalEdge();
  });

  ipcMain.on('window:close', (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) return;

    if (panelWin && targetWindow === panelWin) {
      closeAssistantSurface();
      return;
    }

    if (overlayWin && targetWindow === overlayWin) {
      overlayWin.hide();
      return;
    }

    targetWindow.close();
  });
  
  ipcMain.on('window:minimize', (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) return;
    if (targetWindow === panelWin) {
      targetWindow.setAlwaysOnTop(false);
    }
    targetWindow.minimize();
  });

  ipcMain.on('window:toggle-maximize', (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) return;
    if ([orbWin, overlayWin].includes(targetWindow)) return;
    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize();
      if (panelWin && targetWindow === panelWin) {
        targetWindow.setAlwaysOnTop(true);
        targetWindow.setSkipTaskbar(true);
      }
      sendWindowMaximizeState(targetWindow);
      return;
    }
    if (panelWin && targetWindow === panelWin) {
      targetWindow.setAlwaysOnTop(false);
      targetWindow.setSkipTaskbar(false);
    }
    targetWindow.maximize();
    sendWindowMaximizeState(targetWindow);
  });

  ipcMain.on('settings:open', () => createSettingsWindow());

}

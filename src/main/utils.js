// Pure utility functions extracted from main.js for testability.

const fs = require('fs');
const path = require('path');

/**
 * Parse a .env-style file and set any keys not already present in process.env.
 */
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

/**
 * Return true when the source name looks like a ScreenSense window.
 */
function isScreenSenseSource(source) {
  const name = String(source?.name || '').toLowerCase();
  return name.includes('screensense') || name.includes('screen sense');
}

/**
 * Sanitise a filename component – strips dangerous characters, limits length.
 */
function sanitizeExportName(value, fallback) {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

/**
 * Append a timestamped log line to the startup log.
 * `getLogDir` must return the directory to write into.
 */
function writeStartupLog(message, error, getLogDir) {
  try {
    const logDir = getLogDir();
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

/**
 * Map platform name to platform directory string.
 */
function getPlatformDir(platformName) {
  if (platformName === 'darwin') return 'mac';
  if (platformName === 'win32') return 'win';
  return 'linux';
}

/**
 * Return the executable file name for the local whisper server.
 */
function getExecutableName(platformName) {
  return platformName === 'win32'
    ? 'local-whisper-server.exe'
    : 'local-whisper-server';
}

module.exports = {
  loadEnvLocal,
  isScreenSenseSource,
  sanitizeExportName,
  writeStartupLog,
  getPlatformDir,
  getExecutableName,
};

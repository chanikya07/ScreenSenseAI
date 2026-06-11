const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  loadEnvLocal,
  isScreenSenseSource,
  sanitizeExportName,
  writeStartupLog,
  getPlatformDir,
  getExecutableName,
} = require('../src/main/utils');

// ── isScreenSenseSource ─────────────────────────────────────────────────

describe('isScreenSenseSource', () => {
  it('returns true for source named "ScreenSense AI"', () => {
    expect(isScreenSenseSource({ name: 'ScreenSense AI' })).toBe(true);
  });

  it('returns true for lower-case variant', () => {
    expect(isScreenSenseSource({ name: 'screensense' })).toBe(true);
  });

  it('returns true for "Screen Sense" with a space', () => {
    expect(isScreenSenseSource({ name: 'Screen Sense - Panel' })).toBe(true);
  });

  it('returns false for unrelated source', () => {
    expect(isScreenSenseSource({ name: 'Google Chrome' })).toBe(false);
  });

  it('returns false for null/undefined source', () => {
    expect(isScreenSenseSource(null)).toBe(false);
    expect(isScreenSenseSource(undefined)).toBe(false);
  });

  it('returns false for source with no name property', () => {
    expect(isScreenSenseSource({})).toBe(false);
  });
});

// ── sanitizeExportName ─────────────────────────────────────────────────

describe('sanitizeExportName', () => {
  it('removes dangerous characters', () => {
    expect(sanitizeExportName('file<>name', 'default')).toBe('file__name');
  });

  it('replaces consecutive dots with single dot', () => {
    expect(sanitizeExportName('file...name', 'default')).toBe('file.name');
  });

  it('strips leading and trailing dots', () => {
    expect(sanitizeExportName('.hidden.', 'default')).toBe('hidden');
  });

  it('returns fallback when value is empty', () => {
    expect(sanitizeExportName('', 'fallback')).toBe('fallback');
  });

  it('returns fallback when value is null', () => {
    expect(sanitizeExportName(null, 'fallback')).toBe('fallback');
  });

  it('truncates to 80 characters', () => {
    const longName = 'a'.repeat(100);
    expect(sanitizeExportName(longName, 'fb').length).toBe(80);
  });

  it('removes control characters', () => {
    expect(sanitizeExportName('file\x05name', 'default')).toBe('file_name');
  });

  it('handles colons, slashes, pipes, question marks', () => {
    const result = sanitizeExportName('path:/to\\file|name?', 'default');
    expect(result).not.toMatch(/[<>:"/\\|?*]/);
  });
});

// ── loadEnvLocal ───────────────────────────────────────────────────────

describe('loadEnvLocal', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadenv-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Clean up test env vars
    delete process.env.TEST_LOAD_ENV_A;
    delete process.env.TEST_LOAD_ENV_B;
    delete process.env.TEST_LOAD_ENV_C;
    delete process.env.TEST_LOAD_ENV_QUOTED;
    delete process.env.TEST_LOAD_ENV_SINGLE;
  });

  it('loads key=value pairs into process.env', () => {
    const envFile = path.join(tmpDir, '.env.local');
    fs.writeFileSync(envFile, 'TEST_LOAD_ENV_A=hello\nTEST_LOAD_ENV_B=world\n');
    loadEnvLocal(envFile);
    expect(process.env.TEST_LOAD_ENV_A).toBe('hello');
    expect(process.env.TEST_LOAD_ENV_B).toBe('world');
  });

  it('strips double quotes from values', () => {
    const envFile = path.join(tmpDir, '.env.local');
    fs.writeFileSync(envFile, 'TEST_LOAD_ENV_QUOTED="quoted_value"\n');
    loadEnvLocal(envFile);
    expect(process.env.TEST_LOAD_ENV_QUOTED).toBe('quoted_value');
  });

  it('strips single quotes from values', () => {
    const envFile = path.join(tmpDir, '.env.local');
    fs.writeFileSync(envFile, "TEST_LOAD_ENV_SINGLE='single_value'\n");
    loadEnvLocal(envFile);
    expect(process.env.TEST_LOAD_ENV_SINGLE).toBe('single_value');
  });

  it('does not override existing env vars', () => {
    process.env.TEST_LOAD_ENV_C = 'existing';
    const envFile = path.join(tmpDir, '.env.local');
    fs.writeFileSync(envFile, 'TEST_LOAD_ENV_C=new_value\n');
    loadEnvLocal(envFile);
    expect(process.env.TEST_LOAD_ENV_C).toBe('existing');
  });

  it('skips comments and blank lines', () => {
    const envFile = path.join(tmpDir, '.env.local');
    fs.writeFileSync(envFile, '# comment\n\n  \nTEST_LOAD_ENV_A=valid\n');
    loadEnvLocal(envFile);
    expect(process.env.TEST_LOAD_ENV_A).toBe('valid');
  });

  it('skips lines without an equals sign', () => {
    const envFile = path.join(tmpDir, '.env.local');
    fs.writeFileSync(envFile, 'NOEQUALS\nTEST_LOAD_ENV_A=ok\n');
    loadEnvLocal(envFile);
    expect(process.env.TEST_LOAD_ENV_A).toBe('ok');
    expect(process.env.NOEQUALS).toBeUndefined();
  });

  it('does not throw when file is missing', () => {
    expect(() => loadEnvLocal('/nonexistent/path/.env.local')).not.toThrow();
  });

  it('handles Windows-style line endings', () => {
    const envFile = path.join(tmpDir, '.env.local');
    fs.writeFileSync(envFile, 'TEST_LOAD_ENV_A=crlf\r\nTEST_LOAD_ENV_B=val\r\n');
    loadEnvLocal(envFile);
    expect(process.env.TEST_LOAD_ENV_A).toBe('crlf');
    expect(process.env.TEST_LOAD_ENV_B).toBe('val');
  });
});

// ── writeStartupLog ────────────────────────────────────────────────────

describe('writeStartupLog', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-log-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates log directory and writes a log entry', () => {
    const logDir = path.join(tmpDir, 'logs');
    writeStartupLog('Test message', null, () => logDir);
    const logContent = fs.readFileSync(path.join(logDir, 'startup.log'), 'utf8');
    expect(logContent).toContain('Test message');
  });

  it('includes error stack when error is provided', () => {
    const logDir = path.join(tmpDir, 'logs');
    const err = new Error('something went wrong');
    writeStartupLog('Error occurred:', err, () => logDir);
    const logContent = fs.readFileSync(path.join(logDir, 'startup.log'), 'utf8');
    expect(logContent).toContain('something went wrong');
  });

  it('appends to existing log file', () => {
    const logDir = path.join(tmpDir, 'logs');
    writeStartupLog('First', null, () => logDir);
    writeStartupLog('Second', null, () => logDir);
    const logContent = fs.readFileSync(path.join(logDir, 'startup.log'), 'utf8');
    expect(logContent).toContain('First');
    expect(logContent).toContain('Second');
  });

  it('does not throw when log directory cannot be created', () => {
    expect(() => writeStartupLog('msg', null, () => '/root/noperm/nested')).not.toThrow();
  });
});

// ── getPlatformDir ─────────────────────────────────────────────────────

describe('getPlatformDir', () => {
  it('returns "mac" for darwin', () => {
    expect(getPlatformDir('darwin')).toBe('mac');
  });

  it('returns "win" for win32', () => {
    expect(getPlatformDir('win32')).toBe('win');
  });

  it('returns "linux" for linux', () => {
    expect(getPlatformDir('linux')).toBe('linux');
  });

  it('returns "linux" for unknown platforms', () => {
    expect(getPlatformDir('freebsd')).toBe('linux');
  });
});

// ── getExecutableName ──────────────────────────────────────────────────

describe('getExecutableName', () => {
  it('returns .exe name on win32', () => {
    expect(getExecutableName('win32')).toBe('local-whisper-server.exe');
  });

  it('returns plain name on linux', () => {
    expect(getExecutableName('linux')).toBe('local-whisper-server');
  });

  it('returns plain name on darwin', () => {
    expect(getExecutableName('darwin')).toBe('local-whisper-server');
  });
});

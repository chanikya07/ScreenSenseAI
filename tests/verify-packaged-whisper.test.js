const path = require('path');
const fs = require('fs');
const os = require('os');

const { default: verifyPackagedWhisper } = require('../scripts/verify-packaged-whisper');

describe('verifyPackagedWhisper', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-whisper-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeContext(platformName, productFilename) {
    return {
      electronPlatformName: platformName,
      appOutDir: tmpDir,
      packager: { appInfo: { productFilename } },
    };
  }

  it('succeeds when the bundled server exists at resources path (linux)', async () => {
    const serverDir = path.join(tmpDir, 'resources', 'local-whisper-bin', 'linux');
    fs.mkdirSync(serverDir, { recursive: true });
    fs.writeFileSync(path.join(serverDir, 'local-whisper-server'), 'binary-data');

    await expect(
      verifyPackagedWhisper(makeContext('linux', 'ScreenSense AI'))
    ).resolves.toBeUndefined();
  });

  it('succeeds when the bundled server exists at macOS app bundle path', async () => {
    const serverDir = path.join(
      tmpDir, 'ScreenSense AI.app', 'Contents', 'Resources', 'local-whisper-bin', 'mac'
    );
    fs.mkdirSync(serverDir, { recursive: true });
    fs.writeFileSync(path.join(serverDir, 'local-whisper-server'), 'binary-data');

    await expect(
      verifyPackagedWhisper(makeContext('darwin', 'ScreenSense AI'))
    ).resolves.toBeUndefined();
  });

  it('succeeds for win32 platform with .exe extension', async () => {
    const serverDir = path.join(tmpDir, 'resources', 'local-whisper-bin', 'win');
    fs.mkdirSync(serverDir, { recursive: true });
    fs.writeFileSync(path.join(serverDir, 'local-whisper-server.exe'), 'binary-data');

    await expect(
      verifyPackagedWhisper(makeContext('win32', 'ScreenSense AI'))
    ).resolves.toBeUndefined();
  });

  it('throws when the bundled server is missing', async () => {
    await expect(
      verifyPackagedWhisper(makeContext('linux', 'ScreenSense AI'))
    ).rejects.toThrow('Packaged local Whisper server is missing');
  });

  it('throws when the bundled server file is empty', async () => {
    const serverDir = path.join(tmpDir, 'resources', 'local-whisper-bin', 'linux');
    fs.mkdirSync(serverDir, { recursive: true });
    fs.writeFileSync(path.join(serverDir, 'local-whisper-server'), '');

    await expect(
      verifyPackagedWhisper(makeContext('linux', 'ScreenSense AI'))
    ).rejects.toThrow('Packaged local Whisper server is invalid');
  });

  it('uses process.platform when electronPlatformName is absent', async () => {
    const platformDir = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
    const exeName = process.platform === 'win32' ? 'local-whisper-server.exe' : 'local-whisper-server';
    const serverDir = path.join(tmpDir, 'resources', 'local-whisper-bin', platformDir);
    fs.mkdirSync(serverDir, { recursive: true });
    fs.writeFileSync(path.join(serverDir, exeName), 'binary-data');

    const ctx = {
      appOutDir: tmpDir,
      packager: { appInfo: { productFilename: 'ScreenSense AI' } },
    };
    await expect(verifyPackagedWhisper(ctx)).resolves.toBeUndefined();
  });
});

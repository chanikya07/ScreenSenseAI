const path = require('path');
const fs = require('fs');
const os = require('os');

// The module calls main() at load-time which triggers process.exit.
// We need to prevent process.exit from killing the test runner.
let N8nHelper;

beforeAll(() => {
  const realExit = process.exit;
  process.exit = () => {}; // no-op while loading
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  N8nHelper = require('../scripts/load-n8n-config');
  process.exit = realExit;
  console.error.mockRestore();
  console.log.mockRestore();
});

describe('N8nHelper', () => {
  let helper;
  let tmpDir;
  let origReadFileSync;

  beforeEach(() => {
    helper = new N8nHelper();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
    origReadFileSync = fs.readFileSync;
  });

  afterEach(() => {
    fs.readFileSync = origReadFileSync;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── validateWorkflow ──────────────────────────────────────────────

  describe('validateWorkflow', () => {
    it('returns true for a valid workflow', () => {
      const workflow = {
        name: 'Test Workflow',
        nodes: [{ name: 'Start', type: 'n8n-nodes-base.start' }],
        connections: {},
        active: true,
      };
      const workflowPath = path.join(__dirname, '..', 'n8n-bedrock-workflow.json');
      fs.readFileSync = (p, enc) => {
        if (p === workflowPath) return JSON.stringify(workflow);
        return origReadFileSync(p, enc);
      };
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      expect(helper.validateWorkflow()).toBe(true);
      spy.mockRestore();
    });

    it('returns false when required fields are missing', () => {
      const workflowPath = path.join(__dirname, '..', 'n8n-bedrock-workflow.json');
      fs.readFileSync = (p, enc) => {
        if (p === workflowPath) return JSON.stringify({ name: 'Incomplete' });
        return origReadFileSync(p, enc);
      };
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(helper.validateWorkflow()).toBe(false);
      spy.mockRestore();
    });

    it('returns false when the file is invalid JSON', () => {
      const workflowPath = path.join(__dirname, '..', 'n8n-bedrock-workflow.json');
      fs.readFileSync = (p, enc) => {
        if (p === workflowPath) return '{ bad json';
        return origReadFileSync(p, enc);
      };
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(helper.validateWorkflow()).toBe(false);
      spy.mockRestore();
    });

    it('returns false when the file does not exist', () => {
      const workflowPath = path.join(__dirname, '..', 'n8n-bedrock-workflow.json');
      fs.readFileSync = (p, enc) => {
        if (p === workflowPath) throw new Error('ENOENT');
        return origReadFileSync(p, enc);
      };
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(helper.validateWorkflow()).toBe(false);
      spy.mockRestore();
    });
  });

  // ── validateConfig ────────────────────────────────────────────────

  describe('validateConfig', () => {
    it('returns true for a valid config', () => {
      const config = {
        n8nCredentials: { groq: {}, openai: {} },
        rotationRules: [{ provider: 'groq' }],
        apiKeyPool: { groq: [], openai: [] },
      };
      const configPath = path.join(__dirname, '..', 'n8n-bedrock-config.json');
      fs.readFileSync = (p, enc) => {
        if (p === configPath) return JSON.stringify(config);
        return origReadFileSync(p, enc);
      };
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      expect(helper.validateConfig()).toBe(true);
      spy.mockRestore();
    });

    it('returns false when the file is invalid JSON', () => {
      const configPath = path.join(__dirname, '..', 'n8n-bedrock-config.json');
      fs.readFileSync = (p, enc) => {
        if (p === configPath) return 'not json';
        return origReadFileSync(p, enc);
      };
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(helper.validateConfig()).toBe(false);
      spy.mockRestore();
    });

    it('returns false when the file does not exist', () => {
      const configPath = path.join(__dirname, '..', 'n8n-bedrock-config.json');
      fs.readFileSync = (p, enc) => {
        if (p === configPath) throw new Error('ENOENT');
        return origReadFileSync(p, enc);
      };
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(helper.validateConfig()).toBe(false);
      spy.mockRestore();
    });
  });

  // ── exportEnv ─────────────────────────────────────────────────────

  describe('exportEnv', () => {
    it('writes an .env.n8n file when config is loadable', () => {
      const config = {
        environmentVariables: {
          GROQ_API_KEY: 'YOUR_GROQ_KEY',
          N8N_URL: 'http://localhost:5678',
        },
      };
      const configPath = path.join(__dirname, '..', 'n8n-bedrock-config.json');
      const envPath = path.join(__dirname, '..', '.env.n8n');
      let writtenContent = null;

      fs.readFileSync = (p, enc) => {
        if (p === configPath) return JSON.stringify(config);
        return origReadFileSync(p, enc);
      };
      const origWriteFileSync = fs.writeFileSync;
      fs.writeFileSync = (p, content) => {
        if (p === envPath) {
          writtenContent = content;
          return;
        }
        origWriteFileSync(p, content);
      };

      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      helper.exportEnv();
      spy.mockRestore();

      expect(writtenContent).toContain('GROQ_API_KEY=YOUR_GROQ_KEY');
      expect(writtenContent).toContain('N8N_URL=http://localhost:5678');
      expect(writtenContent).toContain('# TODO: Replace with actual value');

      fs.writeFileSync = origWriteFileSync;
    });

    it('does not throw when config file is missing', () => {
      const configPath = path.join(__dirname, '..', 'n8n-bedrock-config.json');
      fs.readFileSync = (p, enc) => {
        if (p === configPath) throw new Error('ENOENT');
        return origReadFileSync(p, enc);
      };
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => helper.exportEnv()).not.toThrow();
      spy.mockRestore();
    });
  });

  // ── listModels ────────────────────────────────────────────────────

  describe('listModels', () => {
    it('logs model information from config', () => {
      const config = {
        bedrockModels: {
          models: [
            {
              name: 'Claude 3',
              id: 'anthropic.claude-3',
              maxTokens: 100000,
              costPerMTok: 3.0,
              costPerOutputMTok: 15.0,
            },
          ],
        },
      };
      const configPath = path.join(__dirname, '..', 'n8n-bedrock-config.json');
      fs.readFileSync = (p, enc) => {
        if (p === configPath) return JSON.stringify(config);
        return origReadFileSync(p, enc);
      };

      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      helper.listModels();
      const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(output).toContain('Claude 3');
      expect(output).toContain('anthropic.claude-3');
      spy.mockRestore();
    });

    it('does not throw when config is missing', () => {
      const configPath = path.join(__dirname, '..', 'n8n-bedrock-config.json');
      fs.readFileSync = (p, enc) => {
        if (p === configPath) throw new Error('ENOENT');
        return origReadFileSync(p, enc);
      };
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => helper.listModels()).not.toThrow();
      spy.mockRestore();
    });
  });
});

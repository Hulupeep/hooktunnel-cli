// npx detection so printed commands work for `npx hooktunnel-cli` users (Hulupeep/hooktunnel#59)
import { describe, test, expect, vi, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isNpxInvocation, cliCommand, cliPrefix, maskApiKey } from '../../src/lib/invocation.js';
import { CLIError } from '../../src/lib/errors.js';

const GLOBAL_ARGV = ['/usr/bin/node', '/usr/local/lib/node_modules/hooktunnel-cli/dist/index.js'];
const NPX_ARGV = ['/usr/bin/node', '/home/u/.npm/_npx/4f2a/node_modules/hooktunnel-cli/dist/index.js'];
const NPX_WIN_ARGV = ['C:\\node.exe', 'C:\\Users\\u\\AppData\\Local\\npm-cache\\_npx\\4f2a\\node_modules\\hooktunnel-cli\\dist\\index.js'];

afterEach(() => {
  delete process.env.npm_command;
  vi.restoreAllMocks();
});

describe('isNpxInvocation', () => {
  test('npm_command=exec (npx / npm exec) is detected', () => {
    expect(isNpxInvocation({ npm_command: 'exec' }, GLOBAL_ARGV)).toBe(true);
  });

  test('script under the npm cache _npx dir is detected (POSIX and Windows)', () => {
    expect(isNpxInvocation({}, NPX_ARGV)).toBe(true);
    expect(isNpxInvocation({}, NPX_WIN_ARGV)).toBe(true);
  });

  test('global install is not npx, even when launched from an npm script', () => {
    expect(isNpxInvocation({}, GLOBAL_ARGV)).toBe(false);
    expect(isNpxInvocation({ npm_command: 'run-script', npm_execpath: '/usr/lib/npm-cli.js' }, GLOBAL_ARGV)).toBe(false);
  });

  test('cliCommand / cliPrefix pick the runnable form', () => {
    expect(cliPrefix({}, NPX_ARGV)).toBe('npx hooktunnel-cli');
    expect(cliCommand('login --key <key>', {}, NPX_ARGV)).toBe('npx hooktunnel-cli login --key <key>');
    expect(cliCommand('login --key <key>', {}, GLOBAL_ARGV)).toBe('hooktunnel login --key <key>');
  });
});

describe('instructions use the npx form when running under npx', () => {
  test('login key instructions', async () => {
    process.env.npm_command = 'exec';
    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
    const { printKeyInstructions } = await import('../../src/commands/login.js');
    printKeyInstructions();
    const text = out.join('\n');
    expect(text).toContain('Run: npx hooktunnel-cli login --key <your-api-key>');
    expect(text).not.toMatch(/Run: hooktunnel login/);
  });

  test('login key instructions for a global install', async () => {
    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
    const { printKeyInstructions } = await import('../../src/commands/login.js');
    printKeyInstructions();
    expect(out.join('\n')).toContain('Run: hooktunnel login --key <your-api-key>');
  });

  test('error suggestions', () => {
    process.env.npm_command = 'exec';
    expect(new CLIError('AUTH_REQUIRED').info.suggestion).toContain('npx hooktunnel-cli login');
    delete process.env.npm_command;
    expect(new CLIError('AUTH_REQUIRED').info.suggestion).toContain('"hooktunnel login"');
  });

  test('end-to-end: `login` with no key and no TTY prints npx instructions and a clear error', () => {
    const cwd = process.cwd();
    const result = spawnSync(process.execPath, ['--import', 'tsx', join(cwd, 'src/index.ts'), 'login'], {
      cwd,
      env: {
        ...process.env,
        npm_command: 'exec',
        FORCE_COLOR: '0',
        HOOKTUNNEL_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'hooktunnel-e2e-')),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      input: '',
      encoding: 'utf8',
      timeout: 30_000,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain('npx hooktunnel-cli login --key <your-api-key>');
    expect(output).toMatch(/not an interactive terminal/);
    expect(output).not.toMatch(/hooktunnel: command not found/);
  });
});

describe('maskApiKey', () => {
  test('never reveals the full key', () => {
    const key = 'ht_live_abcdefghijklmnopqrstuvwxyz123456';
    const masked = maskApiKey(key);
    expect(masked).toBe('ht_live_****3456');
    expect(masked).not.toContain('abcdefghijklmnop');
  });

  test('short keys show no tail at all', () => {
    expect(maskApiKey('ht_live_abc')).toBe('ht_live_****');
    expect(maskApiKey('short')).toBe('****');
  });
});

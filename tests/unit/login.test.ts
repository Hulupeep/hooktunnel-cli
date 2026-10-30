// `login` verifies via GET /api/keys/whoami and degrades gracefully (Hulupeep/hooktunnel#59)
import { describe, test, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { startServer, closedPort, type TestServer } from '../helpers/httpServer.js';

// Route spinner output through console.log so it can be asserted on
vi.mock('ora', () => ({
  default: () => {
    const spinner = {
      start: () => spinner,
      stop: () => spinner,
      succeed: (t: string) => (console.log(`[succeed] ${t}`), spinner),
      fail: (t: string) => (console.log(`[fail] ${t}`), spinner),
      warn: (t: string) => (console.log(`[warn] ${t}`), spinner),
    };
    return spinner;
  },
}));

vi.mock('../../src/lib/prompt.js', () => ({ promptHidden: vi.fn() }));

import { loginCommand } from '../../src/commands/login.js';
import { config, getApiKey, clearApiKey } from '../../src/lib/config.js';
import { promptHidden } from '../../src/lib/prompt.js';
import { CLIError } from '../../src/lib/errors.js';

const KEY = 'ht_live_FIXTUREkey0123456789abcdefWXYZ';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let handler: Handler;
let server: TestServer;
let seen: { method?: string; url?: string; auth?: string }[] = [];
let output: string[] = [];

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

beforeAll(async () => {
  server = await startServer((req, res) => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    handler(req, res);
  });
});
afterAll(() => server.close());

beforeEach(() => {
  seen = [];
  output = [];
  clearApiKey();
  config.set('apiUrl', server.url);
  const capture = (...a: unknown[]) => void output.push(a.map(String).join(' '));
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
});
afterEach(() => {
  vi.restoreAllMocks();
  const text = output.join('\n');
  // The full key must never be printed, whatever the outcome
  expect(text).not.toContain(KEY);
});

describe('login --key via /api/keys/whoami', () => {
  test('200: saves the key and prints scopes', async () => {
    handler = (_req, res) =>
      json(res, 200, { valid: true, user_id: 'u_1', key_id: 'k_1', scopes: ['tunnel:connect', 'hooks:read'], tier: 'pro' });

    await loginCommand({ key: KEY });

    expect(seen).toEqual([{ method: 'GET', url: '/api/keys/whoami', auth: `Bearer ${KEY}` }]);
    expect(getApiKey()).toBe(KEY);
    const text = output.join('\n');
    expect(text).toContain('[succeed] Logged in with API key ht_live_****WXYZ');
    expect(text).toContain('Scopes: tunnel:connect, hooks:read');
    expect(text).toContain('Plan:   pro');
  });

  test.each([
    ['INVALID_TOKEN', /does not recognise this API key/],
    ['TOKEN_REVOKED', /This API key was revoked/],
    ['TOKEN_EXPIRED', /This API key has expired/],
    ['MISSING_TOKEN', /No API key was sent/],
  ])('401 %s: does not save the key and shows the specific reason', async (code, expected) => {
    handler = (_req, res) => json(res, 401, { error: { code, message: `server says ${code}` } });

    const err = await loginCommand({ key: KEY }).catch((e) => e);

    expect(err).toBeInstanceOf(CLIError);
    expect(err.message).toMatch(expected);
    expect(err.serverCode).toBe(code);
    expect(err.details).toBe(`server says ${code}`);
    expect(err.info.suggestion).not.toMatch(/internet/i);
    expect(getApiKey()).toBeNull();
    expect(output.join('\n')).toContain('[fail] API key ht_live_****WXYZ was rejected; it has not been saved');
  });

  test('401 with no body: rejected as an invalid key, not saved', async () => {
    handler = (_req, res) => {
      res.writeHead(401);
      res.end();
    };
    const err = await loginCommand({ key: KEY }).catch((e) => e);
    expect(err).toBeInstanceOf(CLIError);
    expect(err.code).toBe('AUTH_INVALID');
    expect(getApiKey()).toBeNull();
  });

  test('404 (endpoint not deployed yet): saves the key with a warning', async () => {
    handler = (_req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><h1>404</h1>');
    };

    await loginCommand({ key: KEY });

    expect(getApiKey()).toBe(KEY);
    const text = output.join('\n');
    expect(text).toContain('[warn] Saved API key ht_live_****WXYZ, but could not verify it');
    expect(text).toMatch(/not available on .* yet \(HTTP 404\)/);
  });

  test('5xx: saves the key with a warning', async () => {
    handler = (_req, res) => json(res, 503, { error: { code: 'AUTH_BACKEND_UNAVAILABLE', message: 'down' } });
    await loginCommand({ key: KEY });
    expect(getApiKey()).toBe(KEY);
    expect(output.join('\n')).toMatch(/HTTP 503 AUTH_BACKEND_UNAVAILABLE/);
  });

  test('network error: saves the key with a warning', async () => {
    const port = await closedPort();
    config.set('apiUrl', `http://127.0.0.1:${port}`);

    await loginCommand({ key: KEY });

    expect(getApiKey()).toBe(KEY);
    const text = output.join('\n');
    expect(text).toContain('[warn] Saved API key ht_live_****WXYZ, but could not verify it');
    expect(text).toMatch(/could not reach http:\/\/127\.0\.0\.1:\d+ \(ECONNREFUSED\)/);
  });

  test('200 without valid:true is treated as unverified, not as success', async () => {
    handler = (_req, res) => json(res, 200, { hello: 'world' });
    await loginCommand({ key: KEY });
    expect(getApiKey()).toBe(KEY);
    expect(output.join('\n')).toContain('[warn]');
  });
});

describe('login without --key', () => {
  const stdin = process.stdin as { isTTY?: boolean };
  const originalIsTTY = stdin.isTTY;
  afterEach(() => {
    stdin.isTTY = originalIsTTY;
  });

  test('TTY: prompts for the key with hidden input and logs in', async () => {
    stdin.isTTY = true;
    vi.mocked(promptHidden).mockResolvedValueOnce(KEY);
    handler = (_req, res) => json(res, 200, { valid: true, user_id: 'u', key_id: 'k', scopes: ['tunnel:connect'], tier: 'free' });

    await loginCommand({});

    expect(promptHidden).toHaveBeenCalledWith(expect.stringMatching(/API key \(input hidden\)/));
    expect(getApiKey()).toBe(KEY);
  });

  test('TTY: empty input is an error', async () => {
    stdin.isTTY = true;
    vi.mocked(promptHidden).mockResolvedValueOnce('');
    const err = await loginCommand({}).catch((e) => e);
    expect(err).toBeInstanceOf(CLIError);
    expect(err.details).toBe('No API key entered');
    expect(seen).toHaveLength(0);
  });

  test('not a TTY: clear error telling the user to pass --key', async () => {
    stdin.isTTY = false;
    vi.mocked(promptHidden).mockClear();
    const err = await loginCommand({}).catch((e) => e);
    expect(err).toBeInstanceOf(CLIError);
    expect(err.code).toBe('AUTH_REQUIRED');
    expect(err.details).toMatch(/not an interactive terminal/);
    expect(err.info.suggestion).toContain('hooktunnel login --key <your-api-key>');
    expect(promptHidden).not.toHaveBeenCalled();
  });
});

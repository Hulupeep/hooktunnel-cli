// hooks/logs API error mapping, incl. 403 INSUFFICIENT_SCOPE (Hulupeep/hooktunnel#60)
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { ServerResponse } from 'node:http';
import { startServer, closedPort, type TestServer } from '../helpers/httpServer.js';
import { fetchHooks, fetchLogs } from '../../src/lib/api.js';
import { config, setApiKey } from '../../src/lib/config.js';
import { CLIError } from '../../src/lib/errors.js';

let server: TestServer;
let respond: (res: ServerResponse) => void;

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

beforeAll(async () => {
  server = await startServer((_req, res) => respond(res));
});
afterAll(() => server.close());
beforeEach(() => {
  config.set('apiUrl', server.url);
  setApiKey('ht_live_fixture_api_key');
});

describe('API errors', () => {
  test('403 INSUFFICIENT_SCOPE names the missing scope (hooks)', async () => {
    respond = (res) =>
      json(res, 403, { error: { code: 'INSUFFICIENT_SCOPE', message: 'Missing scope', required_scope: 'hooks:read' } });
    const err = (await fetchHooks().catch((e) => e)) as CLIError;
    expect(err).toBeInstanceOf(CLIError);
    expect(err.code).toBe('INSUFFICIENT_SCOPE');
    expect(err.message).toBe('Your API key lacks the hooks:read scope');
    expect(err.info.suggestion).toContain('Create a key with hooks:read at https://hooktunnel.com/app/settings');
  });

  test('403 INSUFFICIENT_SCOPE names the missing scope (logs)', async () => {
    respond = (res) =>
      json(res, 403, { error: { code: 'INSUFFICIENT_SCOPE', message: 'Missing scope', required_scope: 'logs:read' } });
    const err = (await fetchLogs('hook_1').catch((e) => e)) as CLIError;
    expect(err.message).toBe('Your API key lacks the logs:read scope');
  });

  test('401 TOKEN_REVOKED', async () => {
    respond = (res) => json(res, 401, { error: { code: 'TOKEN_REVOKED', message: 'revoked' } });
    const err = (await fetchHooks().catch((e) => e)) as CLIError;
    expect(err.message).toBe('This API key was revoked');
  });

  test('legacy 401 {"error":{"code":"UNAUTHORIZED"}} still maps to an invalid key', async () => {
    respond = (res) => json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Invalid or revoked API key' } });
    const err = (await fetchHooks().catch((e) => e)) as CLIError;
    expect(err.code).toBe('AUTH_INVALID');
    expect(err.details).toBe('Invalid or revoked API key');
  });

  test('legacy 403 PLAN_LIMIT still maps to PRO_REQUIRED', async () => {
    respond = (res) => json(res, 403, { code: 'PLAN_LIMIT', error: 'Upgrade' });
    const err = (await fetchHooks().catch((e) => e)) as CLIError;
    expect(err.code).toBe('PRO_REQUIRED');
  });

  test('network error maps to NETWORK_ERROR', async () => {
    config.set('apiUrl', `http://127.0.0.1:${await closedPort()}`);
    const err = (await fetchHooks().catch((e) => e)) as CLIError;
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.info.suggestion).toMatch(/internet connection/);
  });
});

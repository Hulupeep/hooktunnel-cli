// Real WebSocket client against a local server that rejects/accepts upgrades (Hulupeep/hooktunnel#60)
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { TunnelClient } from '../../src/lib/tunnel.js';
import { CLIError } from '../../src/lib/errors.js';
import { startServer, closedPort, type TestServer } from '../helpers/httpServer.js';

let server: TestServer | undefined;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await server?.close();
  server = undefined;
});

function rawReject(socket: Duplex, status: number, reason: string, headers: Record<string, string> = {}, body = '') {
  const lines = [`HTTP/1.1 ${status} ${reason}`];
  for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
  if (body) lines.push('Content-Type: application/json', `Content-Length: ${Buffer.byteLength(body)}`);
  socket.write(`${lines.join('\r\n')}\r\n\r\n${body}`);
  socket.destroy();
}

function client(url: string, retryDelaysMs?: number[]) {
  return new TunnelClient({ env: 'dev', port: 3000, apiKey: 'ht_live_fixture', tunnelUrl: url, retryDelaysMs });
}

async function connectError(url: string): Promise<CLIError> {
  const err = await client(url).connect().then(
    () => {
      throw new Error('expected connect to fail');
    },
    (e) => e
  );
  expect(err).toBeInstanceOf(CLIError);
  return err as CLIError;
}

describe('TunnelClient.connect upgrade rejections', () => {
  test('401 + X-HookTunnel-Error: TOKEN_REVOKED + JSON body', async () => {
    let auth: string | undefined;
    server = await startServer(() => undefined, (req: IncomingMessage, socket) => {
      auth = req.headers.authorization;
      rawReject(
        socket,
        401,
        'Unauthorized',
        { 'X-HookTunnel-Error': 'TOKEN_REVOKED' },
        JSON.stringify({ error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked' } })
      );
    });

    const err = await connectError(server.url.replace('http', 'ws') + '/ws/tunnel');
    expect(auth).toBe('Bearer ht_live_fixture');
    expect(err.message).toBe('This API key was revoked');
    expect(err.info.suggestion).toContain('Generate a new one at https://hooktunnel.com/app/settings');
    expect(err.details).toBe('Token has been revoked');
    expect(err.status).toBe(401);
  });

  test('403 MISSING_SCOPE via JSON body only', async () => {
    server = await startServer(() => undefined, (_req, socket) =>
      rawReject(socket, 403, 'Forbidden', {}, JSON.stringify({ error: { code: 'MISSING_SCOPE', message: 'needs tunnel:connect' } }))
    );
    const err = await connectError(server.url.replace('http', 'ws'));
    expect(err.code).toBe('INSUFFICIENT_SCOPE');
    expect(err.message).toBe('Your API key lacks the tunnel:connect scope');
  });

  test('bare "HTTP/1.1 401 Unauthorized" with no body (current data plane)', async () => {
    server = await startServer(() => undefined, (_req, socket) => {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    });
    const err = await connectError(server.url.replace('http', 'ws'));
    expect(err.code).toBe('AUTH_INVALID');
    expect(err.message).toMatch(/rejected your API key/);
    expect(err.info.suggestion).not.toMatch(/check your internet/i);
    expect(err.message).not.toMatch(/Unexpected server response/);
  });

  test('network error (ECONNREFUSED) suggests checking the connection', async () => {
    const port = await closedPort();
    const err = await connectError(`ws://127.0.0.1:${port}/ws/tunnel`);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.details).toContain('ECONNREFUSED');
    expect(err.info.suggestion).toBe('Check your internet connection and try again');
  });
});

describe('TunnelClient.connectWithRetry', () => {
  test('401 is not retried', async () => {
    let attempts = 0;
    server = await startServer(() => undefined, (_req, socket) => {
      attempts++;
      rawReject(socket, 401, 'Unauthorized', { 'X-HookTunnel-Error': 'INVALID_TOKEN' });
    });
    const err = await client(server.url.replace('http', 'ws'), [5, 5, 5]).connectWithRetry().catch((e) => e);
    expect(err.message).toMatch(/does not recognise this API key/);
    expect(attempts).toBe(1);
  });

  test('503 AUTH_BACKEND_UNAVAILABLE retries with backoff, then connects', async () => {
    let attempts = 0;
    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (ws) => {
      ws.on('message', () =>
        ws.send(
          JSON.stringify({
            type: 'hello_ack',
            tunnel_session_id: 'sess_12345678',
            tenant_id: 't',
            env: 'dev',
            policies: { idle_timeout_seconds: 60, ping_interval_seconds: 30, max_inflight_enforced: 50, max_body_bytes_enforced: 1 },
          })
        )
      );
    });
    server = await startServer(() => undefined, (req, socket) => {
      attempts++;
      if (attempts <= 2) {
        rawReject(socket, 503, 'Service Unavailable', { 'X-HookTunnel-Error': 'AUTH_BACKEND_UNAVAILABLE' });
        return;
      }
      wss.handleUpgrade(req, socket, Buffer.alloc(0), (ws) => wss.emit('connection', ws, req));
    });

    const c = client(server.url.replace('http', 'ws'), [5, 5, 5]);
    await c.connectWithRetry();
    expect(attempts).toBe(3);
    expect(c.getState()).toBe('connected');
    c.disconnect();
    wss.close();
  });

  test('503 gives up after the configured attempts', async () => {
    let attempts = 0;
    server = await startServer(() => undefined, (_req, socket) => {
      attempts++;
      rawReject(socket, 503, 'Service Unavailable', { 'X-HookTunnel-Error': 'AUTH_BACKEND_UNAVAILABLE' });
    });
    const err = await client(server.url.replace('http', 'ws'), [5, 5]).connectWithRetry().catch((e) => e);
    expect(err.code).toBe('AUTH_SERVICE_UNAVAILABLE');
    expect(attempts).toBe(3);
  });
});

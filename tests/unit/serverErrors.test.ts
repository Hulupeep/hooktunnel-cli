// Tunnel upgrade rejection + network error mapping (Hulupeep/hooktunnel#60)
import { describe, test, expect } from 'vitest';
import {
  errorFromUpgradeRejection,
  errorFromConnectionError,
  networkErrorCode,
  parseServerErrorBody,
} from '../../src/lib/serverErrors.js';
import { shouldRetry } from '../../src/lib/tunnel.js';
import { CLIError } from '../../src/lib/errors.js';

const SETTINGS = 'https://hooktunnel.com/app/settings';
const body = (code: string, message = 'server message', extra: Record<string, string> = {}) =>
  JSON.stringify({ error: { code, message, ...extra } });

const CASES = [
  { code: 'MISSING_TOKEN', status: 401, cli: 'AUTH_REQUIRED', message: /No API key was sent/, suggestion: /login/, retry: false },
  { code: 'INVALID_TOKEN', status: 401, cli: 'AUTH_INVALID', message: /does not recognise this API key/, suggestion: new RegExp(SETTINGS), retry: false },
  { code: 'TOKEN_REVOKED', status: 401, cli: 'AUTH_INVALID', message: /^This API key was revoked$/, suggestion: new RegExp(`Generate a new one at ${SETTINGS}`), retry: false },
  { code: 'TOKEN_EXPIRED', status: 401, cli: 'AUTH_INVALID', message: /^This API key has expired$/, suggestion: new RegExp(`Generate a new one at ${SETTINGS}`), retry: false },
  { code: 'MISSING_SCOPE', status: 403, cli: 'INSUFFICIENT_SCOPE', message: /lacks the tunnel:connect scope/, suggestion: new RegExp(SETTINGS), retry: false },
  { code: 'AUTH_BACKEND_UNAVAILABLE', status: 503, cli: 'AUTH_SERVICE_UNAVAILABLE', message: /auth service is unavailable; this is a server-side problem, retry shortly/, suggestion: /probably fine/, retry: true },
  { code: 'INTERNAL_ERROR', status: 500, cli: 'SERVER_ERROR', message: /internal error/, suggestion: /server-side problem/, retry: true },
] as const;

describe('errorFromUpgradeRejection: X-HookTunnel-Error codes', () => {
  test.each(CASES)('$code (header + body) -> $cli', (c) => {
    const err = errorFromUpgradeRejection({ status: c.status, headerCode: c.code, body: body(c.code) });
    expect(err.code).toBe(c.cli);
    expect(err.serverCode).toBe(c.code);
    expect(err.status).toBe(c.status);
    expect(err.message).toMatch(c.message);
    expect(err.info.suggestion).toMatch(c.suggestion);
    expect(err.details).toBe('server message');
    expect(err.info.suggestion).not.toMatch(/internet/i);
    expect(shouldRetry(err)).toBe(c.retry);
  });

  test.each(CASES)('$code (JSON body only, no header) -> $cli', (c) => {
    const err = errorFromUpgradeRejection({ status: c.status, body: body(c.code) });
    expect(err.code).toBe(c.cli);
    expect(err.message).toMatch(c.message);
  });

  test.each(CASES)('$code (header only, empty body) -> $cli', (c) => {
    const err = errorFromUpgradeRejection({ status: c.status, headerCode: c.code, body: '' });
    expect(err.code).toBe(c.cli);
    expect(err.message).toMatch(c.message);
  });

  test('header takes precedence over body code', () => {
    const err = errorFromUpgradeRejection({ status: 401, headerCode: 'TOKEN_REVOKED', body: body('INVALID_TOKEN') });
    expect(err.message).toBe('This API key was revoked');
  });

  test('MISSING_SCOPE uses required_scope from the body when present', () => {
    const err = errorFromUpgradeRejection({
      status: 403,
      headerCode: 'MISSING_SCOPE',
      body: body('MISSING_SCOPE', 'nope', { required_scope: 'tunnel:connect:prod' }),
    });
    expect(err.message).toBe('Your API key lacks the tunnel:connect:prod scope');
  });
});

describe('errorFromUpgradeRejection: older servers (bare status, no body)', () => {
  test('bare 401 is an auth rejection, not an internet problem', () => {
    const err = errorFromUpgradeRejection({ status: 401, body: '' });
    expect(err.code).toBe('AUTH_INVALID');
    expect(err.message).toMatch(/rejected your API key/);
    expect(err.info.suggestion).toMatch(/not a network problem/);
    expect(err.info.suggestion).not.toMatch(/check your internet/i);
    expect(err.details).toBe('HTTP 401');
    expect(shouldRetry(err)).toBe(false);
  });

  test('bare 403 is a permissions problem, no retry', () => {
    const err = errorFromUpgradeRejection({ status: 403 });
    expect(err.code).toBe('INSUFFICIENT_SCOPE');
    expect(err.info.suggestion).toMatch(/tunnel:connect/);
    expect(err.info.suggestion).not.toMatch(/check your internet/i);
    expect(shouldRetry(err)).toBe(false);
  });

  test('bare 503 is server-side and retryable', () => {
    const err = errorFromUpgradeRejection({ status: 503 });
    expect(err.code).toBe('AUTH_SERVICE_UNAVAILABLE');
    expect(err.message).toMatch(/server-side problem/);
    expect(shouldRetry(err)).toBe(true);
  });

  test('unknown code with 401 still falls back to the auth message', () => {
    const err = errorFromUpgradeRejection({ status: 401, headerCode: 'SOMETHING_NEW', body: '' });
    expect(err.code).toBe('AUTH_INVALID');
    expect(err.details).toBe('HTTP 401 SOMETHING_NEW');
  });

  test('404 points at the tunnel URL, not the internet connection', () => {
    const err = errorFromUpgradeRejection({ status: 404, url: 'wss://example.test/ws/tunnel' });
    expect(err.message).toContain('wss://example.test/ws/tunnel');
    expect(err.info.suggestion).not.toMatch(/internet/i);
    expect(shouldRetry(err)).toBe(false);
  });
});

describe('errorFromConnectionError: only real network errors mention the internet', () => {
  test.each(['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNRESET', 'ENETUNREACH'])(
    '%s -> NETWORK_ERROR',
    (code) => {
      const e = Object.assign(new Error(`connect ${code} tunnel.hooktunnel.com`), { code });
      const err = errorFromConnectionError(e, 'wss://tunnel.hooktunnel.com/ws/tunnel');
      expect(err.code).toBe('NETWORK_ERROR');
      expect(err.message).toBe('Could not reach HookTunnel at wss://tunnel.hooktunnel.com/ws/tunnel');
      expect(err.info.suggestion).toBe('Check your internet connection and try again');
      expect(err.details).toContain(code);
      expect(shouldRetry(err)).toBe(true);
    }
  );

  test('fetch-style TypeError with cause.code is recognised', () => {
    const e = new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ENOTFOUND' }) });
    expect(networkErrorCode(e)).toBe('ENOTFOUND');
    expect(errorFromConnectionError(e).details).toBe('ENOTFOUND (fetch failed)');
  });

  test('AggregateError (all addresses refused) is recognised', () => {
    const e = new AggregateError([Object.assign(new Error('a'), { code: 'ECONNREFUSED' })], 'boom');
    expect(networkErrorCode(e)).toBe('ECONNREFUSED');
  });

  test('timeout abort is a network error', () => {
    const e = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    expect(networkErrorCode(e)).toBe('ETIMEDOUT');
  });

  test('a non-network error does not suggest checking the internet', () => {
    const err = errorFromConnectionError(new Error('Invalid Sec-WebSocket-Accept header'));
    expect(err.code).toBe('CONNECTION_FAILED');
    expect(err.info.suggestion).not.toMatch(/internet/i);
  });

  test('CLIErrors pass through unchanged', () => {
    const original = new CLIError('AUTH_INVALID');
    expect(errorFromConnectionError(original)).toBe(original);
  });
});

describe('parseServerErrorBody', () => {
  test('nested error object', () => {
    expect(parseServerErrorBody(body('INSUFFICIENT_SCOPE', 'm', { required_scope: 'hooks:read' }))).toEqual({
      code: 'INSUFFICIENT_SCOPE',
      message: 'm',
      requiredScope: 'hooks:read',
    });
  });
  test('legacy flat shape', () => {
    expect(parseServerErrorBody({ code: 'PLAN_LIMIT', error: 'Upgrade' })).toEqual({
      code: 'PLAN_LIMIT',
      message: 'Upgrade',
      requiredScope: undefined,
    });
  });
  test('empty / non-JSON bodies', () => {
    expect(parseServerErrorBody('')).toEqual({});
    expect(parseServerErrorBody('<html>401</html>')).toEqual({});
    expect(parseServerErrorBody(undefined)).toEqual({});
  });
});

describe('shouldRetry', () => {
  test('unexplained close before establishment is retryable (reconnect loop)', () => {
    expect(shouldRetry(new CLIError('CONNECTION_FAILED', 'code 1006'))).toBe(true);
  });
  test('auth errors from in-band server messages are not retryable', () => {
    expect(shouldRetry(new CLIError('AUTH_INVALID'))).toBe(false);
  });
});

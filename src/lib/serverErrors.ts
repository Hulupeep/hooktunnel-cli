/**
 * Map HookTunnel server errors (HTTP API responses and WebSocket upgrade
 * rejections) and network failures to specific, actionable CLI errors.
 * CLI-ERR-001: Helpful error messages
 * CLI-ERR-002: Network failures handled gracefully
 *
 * Server error shape (control plane and data plane):
 *   {"error": {"code": "TOKEN_REVOKED", "message": "...", "required_scope"?: "hooks:read"}}
 * Data-plane upgrade rejections also send `X-HookTunnel-Error: <CODE>`.
 */

import { CLIError } from './errors.js';
import { cliCommand, SETTINGS_URL } from './invocation.js';

export interface ParsedServerError {
  code?: string;
  message?: string;
  requiredScope?: string;
}

/** Parse `{"error":{code,message,required_scope}}`, legacy `{code,message}` or `{error:"msg"}`. */
export function parseServerErrorBody(body: unknown): ParsedServerError {
  let data = body;
  if (typeof data === 'string') {
    if (!data.trim()) return {};
    try {
      data = JSON.parse(data);
    } catch {
      return {};
    }
  }
  if (!data || typeof data !== 'object') return {};

  const obj = data as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

  if (obj.error && typeof obj.error === 'object') {
    const err = obj.error as Record<string, unknown>;
    return {
      code: str(err.code),
      message: str(err.message),
      requiredScope: str(err.required_scope) ?? str(obj.required_scope),
    };
  }

  return {
    code: str(obj.code),
    message: str(obj.message) ?? str(obj.error),
    requiredScope: str(obj.required_scope),
  };
}

const relogin = () => `then run "${cliCommand('login --key <your-api-key>')}"`;

export type AuthContext = 'tunnel' | 'api' | 'login';

/**
 * Map a known server auth error code to a CLIError. Returns undefined for
 * codes we don't recognise so callers can fall back on the HTTP status.
 */
export function errorFromServerCode(
  code: string,
  opts: { status?: number; serverMessage?: string; requiredScope?: string; context?: AuthContext } = {}
): CLIError | undefined {
  const { status, serverMessage, requiredScope, context = 'api' } = opts;
  const details = serverMessage;

  switch (code) {
    case 'MISSING_TOKEN':
      return new CLIError('AUTH_REQUIRED', details, {
        message: 'No API key was sent to HookTunnel',
        suggestion: `Run "${cliCommand('login')}" to save your API key`,
        serverCode: code,
        status,
      });
    case 'INVALID_TOKEN':
      return new CLIError('AUTH_INVALID', details, {
        message: 'HookTunnel does not recognise this API key',
        suggestion: `Check for typos, or generate a new key at ${SETTINGS_URL} and ${relogin()}`,
        serverCode: code,
        status,
      });
    case 'TOKEN_REVOKED':
      return new CLIError('AUTH_INVALID', details, {
        message: 'This API key was revoked',
        suggestion: `Generate a new one at ${SETTINGS_URL}, ${relogin()}`,
        serverCode: code,
        status,
      });
    case 'TOKEN_EXPIRED':
      return new CLIError('AUTH_INVALID', details, {
        message: 'This API key has expired',
        suggestion: `Generate a new one at ${SETTINGS_URL}, ${relogin()}`,
        serverCode: code,
        status,
      });
    case 'MISSING_SCOPE':
    case 'INSUFFICIENT_SCOPE': {
      const scope = requiredScope ?? (context === 'tunnel' ? 'tunnel:connect' : undefined);
      const what = scope ? `the ${scope} scope` : 'a scope required for this command';
      return new CLIError('INSUFFICIENT_SCOPE', details, {
        message: `Your API key lacks ${what}`,
        suggestion: `Create a key with ${scope ?? 'that scope'} at ${SETTINGS_URL}, ${relogin()}`,
        serverCode: code,
        status,
      });
    }
    case 'AUTH_BACKEND_UNAVAILABLE':
      return new CLIError('AUTH_SERVICE_UNAVAILABLE', details, {
        message: "HookTunnel's auth service is unavailable; this is a server-side problem, retry shortly",
        suggestion: 'Your API key is probably fine. Retry in a minute or check https://status.hooktunnel.com',
        serverCode: code,
        status: status ?? 503,
        retryable: true,
      });
    case 'INTERNAL_ERROR':
      return new CLIError('SERVER_ERROR', details, {
        message: 'HookTunnel hit an internal error while checking your API key',
        suggestion: 'This is a server-side problem, not your key or network. Retry shortly or check https://status.hooktunnel.com',
        serverCode: code,
        status: status ?? 500,
        retryable: true,
      });
    default:
      return undefined;
  }
}

export interface UpgradeRejection {
  status: number;
  /** Value of the X-HookTunnel-Error response header, if present. */
  headerCode?: string;
  /** Raw response body (may be empty). */
  body?: string;
  url?: string;
}

/** Map a failed WebSocket upgrade (non-101 response) to a CLIError. */
export function errorFromUpgradeRejection(rej: UpgradeRejection): CLIError {
  const parsed = parseServerErrorBody(rej.body ?? '');
  const code = (rej.headerCode?.trim() || parsed.code)?.toUpperCase();
  const status = rej.status;

  if (code) {
    const mapped = errorFromServerCode(code, {
      status,
      serverMessage: parsed.message,
      requiredScope: parsed.requiredScope,
      context: 'tunnel',
    });
    if (mapped) return mapped;
  }

  const httpDetail = `HTTP ${status}${code ? ` ${code}` : ''}${parsed.message ? `: ${parsed.message}` : ''}`;

  // Older servers: bare status with no body. 401/403 are auth rejections, not network problems.
  if (status === 401) {
    return new CLIError('AUTH_INVALID', httpDetail, {
      message: 'HookTunnel rejected your API key (authentication failed)',
      suggestion: `This is an authentication problem, not a network problem. The key may be invalid, revoked or expired: generate a new one at ${SETTINGS_URL} and ${relogin()}`,
      serverCode: code,
      status,
    });
  }
  if (status === 403) {
    return new CLIError('INSUFFICIENT_SCOPE', httpDetail, {
      message: 'HookTunnel refused the tunnel connection (forbidden)',
      suggestion: `This is a permissions problem, not a network problem. Make sure your API key has the tunnel:connect scope (${SETTINGS_URL}), ${relogin()}`,
      serverCode: code,
      status,
    });
  }
  if (status === 503) {
    return new CLIError('AUTH_SERVICE_UNAVAILABLE', httpDetail, {
      message: 'HookTunnel is temporarily unavailable; this is a server-side problem, retry shortly',
      serverCode: code,
      status,
      retryable: true,
    });
  }
  if (status >= 500) {
    return new CLIError('SERVER_ERROR', httpDetail, { serverCode: code, status, retryable: true });
  }
  if (status === 404) {
    return new CLIError('CONNECTION_FAILED', httpDetail, {
      message: `Tunnel endpoint not found${rej.url ? ` at ${rej.url}` : ''}`,
      suggestion: 'Check the tunnelUrl in your HookTunnel config, or update the CLI',
      serverCode: code,
      status,
    });
  }
  return new CLIError('CONNECTION_FAILED', httpDetail, {
    message: 'HookTunnel rejected the tunnel connection',
    serverCode: code,
    status,
  });
}

/** Errno-style codes that mean "couldn't reach the server". */
const NETWORK_ERROR_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'EHOSTUNREACH',
  'EHOSTDOWN',
  'ENETUNREACH',
  'ENETDOWN',
  'ECONNABORTED',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** Extract a network errno code from a Node/undici error (fetch wraps it in `cause`). */
export function networkErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const err = current as { code?: unknown; name?: unknown; cause?: unknown; errors?: unknown };
    if (typeof err.code === 'string' && NETWORK_ERROR_CODES.has(err.code)) return err.code;
    if (err.name === 'TimeoutError') return 'ETIMEDOUT';
    // AggregateError (e.g. happy-eyeballs IPv4+IPv6 both refused)
    if (Array.isArray(err.errors) && err.errors.length > 0) {
      const inner = networkErrorCode(err.errors[0]);
      if (inner) return inner;
    }
    current = err.cause;
  }
  return undefined;
}

/**
 * Map a low-level connection error. Only genuine network failures suggest
 * checking the internet connection.
 */
export function errorFromConnectionError(error: unknown, target?: string): CLIError {
  if (error instanceof CLIError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const netCode = networkErrorCode(error);
  if (netCode) {
    const details = !message ? netCode : message.includes(netCode) ? message : `${netCode} (${message})`;
    return new CLIError('NETWORK_ERROR', details, {
      message: `Could not reach HookTunnel${target ? ` at ${target}` : ''}`,
      retryable: true,
    });
  }
  return new CLIError('CONNECTION_FAILED', message);
}

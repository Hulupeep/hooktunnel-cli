/**
 * HookTunnel API Client
 * CLI-API: Fetch hooks, logs, replay
 */

import { getApiKey, getApiUrl } from './config.js';
import { CLIError } from './errors.js';
import {
  errorFromConnectionError,
  errorFromServerCode,
  networkErrorCode,
  parseServerErrorBody,
} from './serverErrors.js';
import type {
  Hook,
  HooksResponse,
  LogsResponse,
  ReplayResponse,
  RequestLog,
  UserInfo,
  WhoamiResponse,
} from '../types/api.js';

const REQUEST_TIMEOUT_MS = 15_000;

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new CLIError('AUTH_REQUIRED');
  }

  const baseUrl = getApiUrl();
  const url = `${baseUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (error) {
    throw errorFromConnectionError(error, baseUrl);
  }

  if (response.ok) {
    return response.json() as Promise<T>;
  }

  const parsed = parseServerErrorBody(await readJson(response));
  const mapped = parsed.code
    ? errorFromServerCode(parsed.code, {
        status: response.status,
        serverMessage: parsed.message,
        requiredScope: parsed.requiredScope,
        context: 'api',
      })
    : undefined;
  if (mapped) throw mapped;

  if (response.status === 401) {
    throw new CLIError('AUTH_INVALID', parsed.message);
  }

  if (response.status === 403) {
    if (parsed.code === 'PLAN_LIMIT') {
      throw new CLIError('PRO_REQUIRED');
    }
    throw new CLIError('API_ERROR', parsed.message || 'Access denied', { status: 403 });
  }

  if (response.status === 404) {
    throw new CLIError('HOOK_NOT_FOUND');
  }

  throw new CLIError('API_ERROR', parsed.message || `HTTP ${response.status}`, {
    status: response.status,
  });
}

export type WhoamiResult =
  /** Server confirmed the key. */
  | { status: 'valid'; info: WhoamiResponse }
  /** Server rejected the key (401). */
  | { status: 'invalid'; error: CLIError }
  /** Could not verify (endpoint missing, network error, server error). */
  | { status: 'unverified'; reason: string };

/**
 * Verify an API key via GET /api/keys/whoami on the control plane.
 * Never throws: callers decide what to do with each outcome.
 *
 * Contract: Authorization: Bearer <key>
 *   200 {valid:true,user_id,key_id,scopes,tier}
 *   401 {error:{code: INVALID_TOKEN|TOKEN_REVOKED|TOKEN_EXPIRED|MISSING_TOKEN, message}}
 */
export async function whoami(apiKey: string, baseUrl: string = getApiUrl()): Promise<WhoamiResult> {
  const url = `${baseUrl}/api/keys/whoami`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const code = networkErrorCode(error);
    const msg = error instanceof Error ? error.message : String(error);
    return {
      status: 'unverified',
      reason: `could not reach ${baseUrl} (${code ?? msg})`,
    };
  }

  const body = await readJson(response);

  if (response.status === 200) {
    const data = body as Partial<WhoamiResponse> | undefined;
    if (data && typeof data === 'object' && data.valid === true) {
      return {
        status: 'valid',
        info: {
          valid: true,
          user_id: data.user_id ?? '',
          key_id: data.key_id ?? '',
          scopes: Array.isArray(data.scopes) ? data.scopes : [],
          tier: data.tier ?? 'unknown',
        },
      };
    }
    return { status: 'unverified', reason: `unexpected response from ${url}` };
  }

  if (response.status === 401) {
    const parsed = parseServerErrorBody(body);
    const mapped =
      (parsed.code &&
        errorFromServerCode(parsed.code, {
          status: 401,
          serverMessage: parsed.message,
          context: 'login',
        })) ||
      new CLIError('AUTH_INVALID', parsed.message ?? 'HTTP 401', { status: 401 });
    return { status: 'invalid', error: mapped };
  }

  if (response.status === 404) {
    return {
      status: 'unverified',
      reason: `the key verification endpoint is not available on ${baseUrl} yet (HTTP 404)`,
    };
  }

  const parsed = parseServerErrorBody(body);
  return {
    status: 'unverified',
    reason: `${baseUrl} returned HTTP ${response.status}${parsed.code ? ` ${parsed.code}` : ''}`,
  };
}

export async function fetchHooks(): Promise<Hook[]> {
  const data = await apiRequest<HooksResponse>('/api/hooks');
  return data.hooks;
}

export async function fetchLogs(hookId: string, limit = 20): Promise<RequestLog[]> {
  const data = await apiRequest<LogsResponse>(`/api/hooks/${hookId}/logs?limit=${limit}`);
  return data.logs;
}

export async function replayRequest(logId: string, targetUrl?: string): Promise<ReplayResponse> {
  const body: Record<string, string> = { logId };
  if (targetUrl) {
    body.targetUrl = targetUrl;
  }

  return apiRequest<ReplayResponse>('/api/replay', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getUserInfo(): Promise<UserInfo> {
  return apiRequest<UserInfo>('/api/me');
}

export async function getHook(hookId: string): Promise<Hook> {
  return apiRequest<Hook>(`/api/hooks/${hookId}`);
}

/**
 * HookTunnel API Client
 * CLI-API: Fetch hooks, logs, replay
 */

import { getApiKey, getApiUrl } from './config.js';
import { CLIError } from './errors.js';
import type { Hook, RequestLog, HooksResponse, LogsResponse, ReplayResponse, UserInfo } from '../types/api.js';

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new CLIError('AUTH_REQUIRED');
  }

  const url = `${getApiUrl()}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401) {
    throw new CLIError('AUTH_INVALID');
  }

  if (response.status === 403) {
    const data = await response.json() as { code?: string; error?: string };
    if (data.code === 'PLAN_LIMIT') {
      throw new CLIError('PRO_REQUIRED');
    }
    throw new CLIError('API_ERROR', data.error || 'Access denied');
  }

  if (response.status === 404) {
    throw new CLIError('HOOK_NOT_FOUND');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new CLIError('API_ERROR', data.error || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  const url = `${getApiUrl()}/api/keys/validate`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  return response.ok;
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

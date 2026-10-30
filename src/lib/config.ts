/**
 * CLI Configuration Management
 * CLI-AUTH-001: API key storage
 * CLI-AUTH-002: Persist between sessions
 */

import Conf from 'conf';

interface ConfigSchema {
  apiKey: string | null;
  apiUrl: string;
  tunnelUrl: string;
  defaultEnv: 'dev' | 'staging' | 'prod';
}

/** Control plane (Next.js on Vercel): serves /api/keys/whoami, /api/hooks, /api/replay. */
export const DEFAULT_API_URL = 'https://app.hooktunnel.com';

/**
 * Former default. api.hooktunnel.com does not reliably serve the control-plane
 * API (it has answered with the data plane's "Cannot POST" 404s), so configs
 * still holding this exact value are migrated to DEFAULT_API_URL.
 */
export const LEGACY_DEFAULT_API_URLS: readonly string[] = [
  'https://api.hooktunnel.com',
  'https://api.hooktunnel.com/',
];

export const DEFAULT_TUNNEL_URL = 'wss://tunnel.hooktunnel.com/ws/tunnel';

interface KeyValueStore {
  get(key: 'apiUrl'): unknown;
  set(key: 'apiUrl', value: string): void;
}

export function isLegacyDefaultApiUrl(url: unknown): boolean {
  return typeof url === 'string' && LEGACY_DEFAULT_API_URLS.includes(url);
}

/**
 * Migrate stored config written by older CLI versions. Only rewrites apiUrl if
 * it still equals the old default; user-customised URLs are left alone.
 * Returns true if anything changed.
 */
export function migrateConfig(store: KeyValueStore): boolean {
  if (isLegacyDefaultApiUrl(store.get('apiUrl'))) {
    store.set('apiUrl', DEFAULT_API_URL);
    return true;
  }
  return false;
}

const config = new Conf<ConfigSchema>({
  projectName: 'hooktunnel-cli',
  // Override the config directory (used by tests; also handy for multiple accounts)
  ...(process.env.HOOKTUNNEL_CONFIG_DIR ? { cwd: process.env.HOOKTUNNEL_CONFIG_DIR } : {}),
  defaults: {
    apiKey: null,
    apiUrl: DEFAULT_API_URL,
    tunnelUrl: DEFAULT_TUNNEL_URL,
    defaultEnv: 'dev',
  },
});

try {
  migrateConfig(config);
} catch {
  // Read-only config dir etc. getApiUrl() still applies the migration in memory.
}

export function getApiKey(): string | null {
  return config.get('apiKey') ?? null;
}

export function setApiKey(key: string): void {
  config.set('apiKey', key);
}

export function clearApiKey(): void {
  config.delete('apiKey');
}

export function getApiUrl(): string {
  const url = config.get('apiUrl');
  const resolved = isLegacyDefaultApiUrl(url) ? DEFAULT_API_URL : url;
  return resolved.replace(/\/+$/, '');
}

export function getTunnelUrl(): string {
  return config.get('tunnelUrl');
}

export function getDefaultEnv(): 'dev' | 'staging' | 'prod' {
  return config.get('defaultEnv');
}

export function setDefaultEnv(env: 'dev' | 'staging' | 'prod'): void {
  config.set('defaultEnv', env);
}

export function isAuthenticated(): boolean {
  return !!getApiKey();
}

export function getConfigPath(): string {
  return config.path;
}

export { config };

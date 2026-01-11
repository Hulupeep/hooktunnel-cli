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

const config = new Conf<ConfigSchema>({
  projectName: 'hooktunnel-cli',
  defaults: {
    apiKey: null,
    apiUrl: 'https://api.hooktunnel.com',
    tunnelUrl: 'wss://tunnel.hooktunnel.com/ws/tunnel',
    defaultEnv: 'dev',
  },
});

export function getApiKey(): string | null {
  return config.get('apiKey');
}

export function setApiKey(key: string): void {
  config.set('apiKey', key);
}

export function clearApiKey(): void {
  config.delete('apiKey');
}

export function getApiUrl(): string {
  return config.get('apiUrl');
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

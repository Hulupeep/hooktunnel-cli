// Config default + migration of the old api.hooktunnel.com default (Hulupeep/hooktunnel#59)
import { describe, test, expect, vi, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const originalDir = process.env.HOOKTUNNEL_CONFIG_DIR;
afterAll(() => {
  process.env.HOOKTUNNEL_CONFIG_DIR = originalDir;
});

async function loadConfig(initial?: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'hooktunnel-cfg-'));
  const file = join(dir, 'config.json');
  if (initial) writeFileSync(file, JSON.stringify(initial));
  process.env.HOOKTUNNEL_CONFIG_DIR = dir;
  vi.resetModules();
  const mod = await import('../../src/lib/config.js');
  return { mod, readStored: () => JSON.parse(readFileSync(file, 'utf8')) };
}

describe('config: control-plane default API URL', () => {
  test('fresh config defaults to https://app.hooktunnel.com', async () => {
    const { mod } = await loadConfig();
    expect(mod.DEFAULT_API_URL).toBe('https://app.hooktunnel.com');
    expect(mod.getApiUrl()).toBe('https://app.hooktunnel.com');
  });

  test('stored old default (https://api.hooktunnel.com) is migrated on disk, other values kept', async () => {
    const { mod, readStored } = await loadConfig({
      apiKey: 'ht_live_fixture_key_0000',
      apiUrl: 'https://api.hooktunnel.com',
      tunnelUrl: 'wss://tunnel.hooktunnel.com/ws/tunnel',
      defaultEnv: 'staging',
    });
    expect(mod.getApiUrl()).toBe('https://app.hooktunnel.com');
    const stored = readStored();
    expect(stored.apiUrl).toBe('https://app.hooktunnel.com');
    expect(stored.apiKey).toBe('ht_live_fixture_key_0000');
    expect(stored.defaultEnv).toBe('staging');
  });

  test('old default with trailing slash is also migrated', async () => {
    const { mod, readStored } = await loadConfig({ apiUrl: 'https://api.hooktunnel.com/' });
    expect(mod.getApiUrl()).toBe('https://app.hooktunnel.com');
    expect(readStored().apiUrl).toBe('https://app.hooktunnel.com');
  });

  test.each([
    'https://hooktunnel.internal.example.com',
    'http://localhost:3000',
    'https://api.hooktunnel.com/v2',
    'https://staging.app.hooktunnel.com',
  ])('user-customised apiUrl %s is not overridden', async (custom) => {
    const { mod, readStored } = await loadConfig({ apiUrl: custom });
    expect(readStored().apiUrl).toBe(custom);
    expect(mod.getApiUrl()).toBe(custom.replace(/\/+$/, ''));
  });

  test('migrateConfig only rewrites the exact legacy value', async () => {
    const { mod } = await loadConfig();
    const store = new Map<string, unknown>();
    const kv = {
      get: (k: 'apiUrl') => store.get(k),
      set: (k: 'apiUrl', v: string) => void store.set(k, v),
    };

    store.set('apiUrl', 'https://api.hooktunnel.com');
    expect(mod.migrateConfig(kv)).toBe(true);
    expect(store.get('apiUrl')).toBe('https://app.hooktunnel.com');

    store.set('apiUrl', 'https://custom.example.com');
    expect(mod.migrateConfig(kv)).toBe(false);
    expect(store.get('apiUrl')).toBe('https://custom.example.com');

    store.delete('apiUrl');
    expect(mod.migrateConfig(kv)).toBe(false);
  });
});

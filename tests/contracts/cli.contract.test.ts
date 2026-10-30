// CLI Contract Tests
// Validates CLI-* requirements from feature_cli.yml

import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

describe('CLI Contract Tests', () => {
  // CLI-AUTH-001: API key authentication
  test('CLI-AUTH-001: Config module supports API key storage', () => {
    const filePath = join(ROOT, 'src/lib/config.ts');
    expect(existsSync(filePath), 'config.ts should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/apiKey|api_key/i);
    expect(content).toMatch(/getApiKey|get.*key/i);
    expect(content).toMatch(/setApiKey|set.*key/i);
  });

  // CLI-AUTH-002: Persist auth between sessions
  test('CLI-AUTH-002: Config persists to disk', () => {
    const filePath = join(ROOT, 'src/lib/config.ts');
    const content = readFileSync(filePath, 'utf-8');

    // Should use conf or similar for persistence
    expect(content).toMatch(/conf|Conf|configstore/i);
  });

  // CLI-CONN-001: WebSocket connection
  test('CLI-CONN-001: Tunnel client connects to WebSocket', () => {
    const filePath = join(ROOT, 'src/lib/tunnel.ts');
    expect(existsSync(filePath), 'tunnel.ts should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/wss:\/\/.*tunnel/);
    expect(content).toMatch(/WebSocket|ws/);
    expect(content).toMatch(/hello/);
  });

  // CLI-CONN-002: Forward to localhost
  test('CLI-CONN-002: Tunnel forwards requests to localhost', () => {
    const filePath = join(ROOT, 'src/lib/tunnel.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/localhost|127\.0\.0\.1/);
    expect(content).toMatch(/fetch|http\.request/i);
    expect(content).toMatch(/response/i);
  });

  // CLI-CONN-003: Heartbeat handling
  test('CLI-CONN-003: Tunnel handles ping/pong', () => {
    const filePath = join(ROOT, 'src/lib/tunnel.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/ping/);
    expect(content).toMatch(/pong/);
  });

  // CLI-CONN-004: Real-time log display
  test('CLI-CONN-004: Tunnel displays request log', () => {
    const filePath = join(ROOT, 'src/lib/tunnel.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/console|log|print|chalk/i);
    expect(content).toMatch(/method|status/i);
  });

  // CLI-CMD-001: Connect command
  test('CLI-CMD-001: Connect command exists', () => {
    const filePath = join(ROOT, 'src/commands/connect.ts');
    expect(existsSync(filePath), 'connect.ts should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/connect/);
    expect(content).toMatch(/port/);
    expect(content).toMatch(/env|environment/i);
  });

  // CLI-CMD-002: Login command
  test('CLI-CMD-002: Login command exists', () => {
    const filePath = join(ROOT, 'src/commands/login.ts');
    expect(existsSync(filePath), 'login.ts should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/login/);
    expect(content).toMatch(/key|apiKey/i);
  });

  // CLI-CMD-003: Hooks command
  test('CLI-CMD-003: Hooks command exists', () => {
    const filePath = join(ROOT, 'src/commands/hooks.ts');
    expect(existsSync(filePath), 'hooks.ts should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/hooks/);
    expect(content).toMatch(/list|fetch/i);
  });

  // CLI-CMD-004: Logs command
  test('CLI-CMD-004: Logs command exists', () => {
    const filePath = join(ROOT, 'src/commands/logs.ts');
    expect(existsSync(filePath), 'logs.ts should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/logs/);
    expect(content).toMatch(/hookId/);
    expect(content).toMatch(/limit/);
  });

  // CLI-CMD-005: Replay command
  test('CLI-CMD-005: Replay command exists', () => {
    const filePath = join(ROOT, 'src/commands/replay.ts');
    expect(existsSync(filePath), 'replay.ts should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/replay/);
    expect(content).toMatch(/logId/);
  });

  // CLI-CMD-006: Status command
  test('CLI-CMD-006: Status command exists', () => {
    const filePath = join(ROOT, 'src/commands/status.ts');
    expect(existsSync(filePath), 'status.ts should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/status/);
  });

  // CLI-CMD-007: Logout command
  test('CLI-CMD-007: Logout command exists', () => {
    const filePath = join(ROOT, 'src/commands/logout.ts');
    expect(existsSync(filePath), 'logout.ts should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/logout/);
    expect(content).toMatch(/clear|delete|remove/i);
  });

  // CLI-ERR-001: Helpful error messages
  test('CLI-ERR-001: Error handling module exists', () => {
    const filePath = join(ROOT, 'src/lib/errors.ts');
    expect(existsSync(filePath), 'errors.ts should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/CLIError|HookTunnelError/);
    expect(content).toMatch(/code/);
    expect(content).toMatch(/message/);
  });

  // Main entry point
  test('CLI-ENTRY: Main entry point exists', () => {
    const filePath = join(ROOT, 'src/index.ts');
    expect(existsSync(filePath), 'index.ts should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/commander|Command/);
    expect(content).toMatch(/program/);
  });

  // Types defined
  test('CLI-TYPES: Tunnel types defined', () => {
    const filePath = join(ROOT, 'src/types/tunnel.ts');
    expect(existsSync(filePath), 'tunnel.ts types should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/HelloMessage/);
    expect(content).toMatch(/RequestMessage/);
    expect(content).toMatch(/ResponseMessage/);
  });

  // API client exists
  test('CLI-API: API client exists', () => {
    const filePath = join(ROOT, 'src/lib/api.ts');
    expect(existsSync(filePath), 'api.ts should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/fetchHooks|getHooks/);
    expect(content).toMatch(/fetchLogs|getLogs/);
  });

  // CLI-AUTH-003: whoami-based login against the control plane
  test('CLI-AUTH-003: Login verifies via control-plane /api/keys/whoami', () => {
    const api = readFileSync(join(ROOT, 'src/lib/api.ts'), 'utf-8');
    expect(api).toMatch(/\/api\/keys\/whoami/);
    expect(api).not.toMatch(/\/api\/keys\/validate/); // service-to-service only

    const config = readFileSync(join(ROOT, 'src/lib/config.ts'), 'utf-8');
    expect(config).toMatch(/DEFAULT_API_URL = 'https:\/\/app\.hooktunnel\.com'/);
    expect(config).toMatch(/migrateConfig/);

    const login = readFileSync(join(ROOT, 'src/commands/login.ts'), 'utf-8');
    expect(login).toMatch(/promptHidden/);
    expect(login).toMatch(/maskApiKey/);
  });

  // CLI-ERR-003: specific auth errors on tunnel upgrade
  test('CLI-ERR-003: Tunnel reads upgrade rejections and does not retry auth failures', () => {
    const tunnel = readFileSync(join(ROOT, 'src/lib/tunnel.ts'), 'utf-8');
    expect(tunnel).toMatch(/'unexpected-response'/);
    expect(tunnel).toMatch(/x-hooktunnel-error/i);
    expect(tunnel).toMatch(/shouldRetry/);

    const errors = readFileSync(join(ROOT, 'src/lib/serverErrors.ts'), 'utf-8');
    for (const code of ['MISSING_TOKEN', 'INVALID_TOKEN', 'TOKEN_REVOKED', 'TOKEN_EXPIRED', 'MISSING_SCOPE', 'INSUFFICIENT_SCOPE', 'AUTH_BACKEND_UNAVAILABLE', 'INTERNAL_ERROR']) {
      expect(errors).toContain(`'${code}'`);
    }
  });

  // CLI-ERR-004: npx-aware instructions
  test('CLI-ERR-004: Printed commands are npx-aware', () => {
    const inv = readFileSync(join(ROOT, 'src/lib/invocation.ts'), 'utf-8');
    expect(inv).toMatch(/isNpxInvocation/);
    expect(inv).toMatch(/npx \$\{PACKAGE_NAME\}/);
    const login = readFileSync(join(ROOT, 'src/commands/login.ts'), 'utf-8');
    expect(login).toMatch(/cliCommand\(/);
  });

  // Contract YAML exists
  test('CLI-CONTRACT: Contract YAML is defined', () => {
    const filePath = join(ROOT, 'docs/contracts/feature_cli.yml');
    expect(existsSync(filePath), 'Contract YAML should exist').toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/feature: hooktunnel-cli/);
    expect(content).toMatch(/CLI-AUTH-001/);
    expect(content).toMatch(/CLI-CONN-001/);
    expect(content).toMatch(/CLI-CMD-001/);
    expect(content).toMatch(/CLI-AUTH-003/);
    expect(content).toMatch(/CLI-ERR-003/);
  });
});

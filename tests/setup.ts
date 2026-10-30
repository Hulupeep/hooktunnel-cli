// Isolate every test file from the real user config (~/.config/hooktunnel-cli-nodejs).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.HOOKTUNNEL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'hooktunnel-cli-test-'));
// Tests assume a global install unless they opt in to npx detection
delete process.env.npm_command;

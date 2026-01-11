/**
 * Connect Command
 * CLI-CMD-001: Connect command
 */

import chalk from 'chalk';
import { getApiKey, isAuthenticated } from '../lib/config.js';
import { TunnelClient } from '../lib/tunnel.js';
import { CLIError } from '../lib/errors.js';
import type { Environment } from '../types/tunnel.js';

interface ConnectOptions {
  verbose?: boolean;
  host?: string;
}

export async function connectCommand(
  env: string,
  port: string,
  options: ConnectOptions
): Promise<void> {
  // Validate auth
  if (!isAuthenticated()) {
    throw new CLIError('AUTH_REQUIRED');
  }

  // Validate environment
  const validEnvs: Environment[] = ['dev', 'staging', 'prod'];
  if (!validEnvs.includes(env as Environment)) {
    console.log(chalk.red(`Invalid environment: ${env}`));
    console.log(chalk.gray(`Valid environments: ${validEnvs.join(', ')}`));
    process.exit(1);
  }

  // Validate port
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    throw new CLIError('INVALID_PORT');
  }

  const apiKey = getApiKey()!;

  console.log(chalk.cyan('\n🔗 HookTunnel'));
  console.log(chalk.gray(`  Environment: ${env}`));
  console.log(chalk.gray(`  Local port: ${portNum}`));
  if (options.host) {
    console.log(chalk.gray(`  Local host: ${options.host}`));
  }
  console.log();

  const client = new TunnelClient({
    env: env as Environment,
    port: portNum,
    host: options.host,
    verbose: options.verbose,
    apiKey,
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.log(chalk.yellow('\n\nDisconnecting...'));
    client.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await client.connect();
    console.log(chalk.gray('Waiting for webhooks... (Ctrl+C to stop)\n'));

    // Keep the process alive
    await new Promise(() => {});
  } catch (error) {
    throw error;
  }
}

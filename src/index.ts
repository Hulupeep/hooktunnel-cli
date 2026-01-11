#!/usr/bin/env node
/**
 * HookTunnel CLI
 * Forward webhooks to localhost
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { handleError } from './lib/errors.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { connectCommand } from './commands/connect.js';
import { hooksCommand } from './commands/hooks.js';
import { logsCommand } from './commands/logs.js';
import { replayCommand } from './commands/replay.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('hooktunnel')
  .description('Forward webhooks to localhost for development')
  .version('0.1.0');

// Login command
program
  .command('login')
  .description('Authenticate with HookTunnel')
  .option('-k, --key <apiKey>', 'API key for authentication')
  .action(async (options) => {
    try {
      await loginCommand(options);
    } catch (error) {
      handleError(error);
    }
  });

// Logout command
program
  .command('logout')
  .description('Clear stored credentials')
  .action(async () => {
    try {
      await logoutCommand();
    } catch (error) {
      handleError(error);
    }
  });

// Connect command
program
  .command('connect <env> <port>')
  .description('Connect tunnel and forward webhooks to localhost')
  .option('-v, --verbose', 'Show verbose output')
  .option('-h, --host <host>', 'Local host to forward to (default: localhost)')
  .action(async (env, port, options) => {
    try {
      await connectCommand(env, port, options);
    } catch (error) {
      handleError(error);
    }
  });

// Hooks command
program
  .command('hooks')
  .description('List your webhook endpoints')
  .action(async () => {
    try {
      await hooksCommand();
    } catch (error) {
      handleError(error);
    }
  });

// Logs command
program
  .command('logs <hookId>')
  .description('View request logs for a hook')
  .option('-l, --limit <count>', 'Number of logs to show (default: 20)')
  .action(async (hookId, options) => {
    try {
      await logsCommand(hookId, options);
    } catch (error) {
      handleError(error);
    }
  });

// Replay command
program
  .command('replay <logId>')
  .description('Replay a captured request (Pro feature)')
  .option('-t, --to <url>', 'Target URL to send replay to')
  .action(async (logId, options) => {
    try {
      await replayCommand(logId, options);
    } catch (error) {
      handleError(error);
    }
  });

// Status command
program
  .command('status')
  .description('Show connection and authentication status')
  .action(async () => {
    try {
      await statusCommand();
    } catch (error) {
      handleError(error);
    }
  });

// Default action - show help
program.action(() => {
  console.log(chalk.cyan(`
  🔗 HookTunnel CLI

  Forward webhooks to localhost for development.
  `));
  program.help();
});

program.parse();

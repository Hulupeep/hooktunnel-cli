#!/usr/bin/env node
/**
 * HookTunnel CLI
 * Webhook infrastructure - never lose a request
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
import { cliCommand, cliPrefix } from './lib/invocation.js';

const program = new Command();

program
  .name(cliPrefix())
  .description('Webhook infrastructure, not just a tunnel. Captures every request, replay anywhere.')
  .version('0.1.3');

// Login command
program
  .command('login')
  .description('Authenticate with HookTunnel (prompts for the key if --key is omitted)')
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
  .description('Forward live webhooks to localhost or any target server')
  .option('-v, --verbose', 'Show verbose output')
  .option('-h, --host <host>', 'Target host or full URL (e.g., https://api.staging.com)')
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
  HookTunnel CLI

  Webhook infrastructure, not just a tunnel.

  ngrok loses webhooks when you're offline. HookTunnel captures every request
  24/7, stores full history, and lets you replay to localhost OR production.

  Get started:
    ${cliCommand('login --key <your-api-key>')}
    ${cliCommand('hooks')}
    ${cliCommand('connect dev 3000')}

  Why HookTunnel?
    - Never lose a webhook: Captured even when you're offline
    - Replay anywhere: Send stored webhooks to localhost, staging, or prod
    - Fix & reprocess: Bug caused a failure? Fix it, replay to prod, done
    - Stable URLs: No more updating configs when URLs rotate
    - Semantic search: Find webhooks by payload content
    - Investigations: Link related requests for debugging
    - Full history: Up to 1 year retention (by plan)
  `));
  program.help();
});

program.parse();

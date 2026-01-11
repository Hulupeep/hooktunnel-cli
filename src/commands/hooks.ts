/**
 * Hooks Command
 * CLI-CMD-003: Hooks command
 */

import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated } from '../lib/config.js';
import { fetchHooks } from '../lib/api.js';
import { CLIError } from '../lib/errors.js';

export async function hooksCommand(): Promise<void> {
  if (!isAuthenticated()) {
    throw new CLIError('AUTH_REQUIRED');
  }

  const spinner = ora('Fetching hooks...').start();

  try {
    const hooks = await fetchHooks();
    spinner.stop();

    if (hooks.length === 0) {
      console.log(chalk.yellow('\nNo hooks found.'));
      console.log(chalk.gray('Create one at https://hooktunnel.com/app\n'));
      return;
    }

    console.log(chalk.cyan(`\n📌 Your Hooks (${hooks.length})\n`));

    // Table header
    console.log(
      chalk.gray('  ') +
      chalk.gray('ID'.padEnd(24)) +
      chalk.gray('Provider'.padEnd(12)) +
      chalk.gray('Status'.padEnd(10)) +
      chalk.gray('Requests')
    );
    console.log(chalk.gray('  ' + '-'.repeat(60)));

    for (const hook of hooks) {
      const statusColor = hook.status === 'active' ? chalk.green : chalk.yellow;
      const providerColor =
        hook.provider === 'stripe' ? chalk.magenta :
        hook.provider === 'twilio' ? chalk.red :
        chalk.blue;

      console.log(
        '  ' +
        chalk.white(hook.hook_id.padEnd(24)) +
        providerColor(hook.provider.padEnd(12)) +
        statusColor(hook.status.padEnd(10)) +
        chalk.gray(hook.request_count.toString())
      );
    }

    console.log();
    console.log(chalk.gray('  Webhook URL: https://hooks.hooktunnel.com/h/<hook_id>'));
    console.log(chalk.gray('  To forward: hooktunnel connect dev <port>\n'));
  } catch (error) {
    spinner.fail('Failed to fetch hooks');
    throw error;
  }
}

/**
 * Replay Command
 * CLI-CMD-005: Replay command
 */

import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated } from '../lib/config.js';
import { replayRequest } from '../lib/api.js';
import { CLIError } from '../lib/errors.js';

interface ReplayOptions {
  to?: string;
}

export async function replayCommand(logId: string, options: ReplayOptions): Promise<void> {
  if (!isAuthenticated()) {
    throw new CLIError('AUTH_REQUIRED');
  }

  const targetUrl = options.to;

  console.log(chalk.cyan('\n🔄 Replay Request'));
  console.log(chalk.gray(`  Log ID: ${logId}`));
  if (targetUrl) {
    console.log(chalk.gray(`  Target: ${targetUrl}`));
  }
  console.log();

  const spinner = ora('Replaying request...').start();

  try {
    const result = await replayRequest(logId, targetUrl);
    spinner.stop();

    if (result.success) {
      const statusColor =
        result.replay.responseStatus >= 200 && result.replay.responseStatus < 300 ? chalk.green :
        result.replay.responseStatus >= 400 ? chalk.red :
        chalk.yellow;

      console.log(chalk.green('✓ Replay successful'));
      console.log(chalk.gray(`  Response status: `) + statusColor(result.replay.responseStatus.toString()));
      console.log(chalk.gray(`  Replay ID: ${result.replay.id}\n`));
    } else {
      console.log(chalk.red('✗ Replay failed'));
      console.log(chalk.gray(`  Status: ${result.replay.status}\n`));
    }
  } catch (error) {
    spinner.fail('Replay failed');
    throw error;
  }
}

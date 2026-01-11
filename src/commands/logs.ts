/**
 * Logs Command
 * CLI-CMD-004: Logs command
 */

import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated } from '../lib/config.js';
import { fetchLogs } from '../lib/api.js';
import { CLIError } from '../lib/errors.js';

interface LogsOptions {
  limit?: string;
}

export async function logsCommand(hookId: string, options: LogsOptions): Promise<void> {
  if (!isAuthenticated()) {
    throw new CLIError('AUTH_REQUIRED');
  }

  const limit = options.limit ? parseInt(options.limit, 10) : 20;
  const spinner = ora('Fetching logs...').start();

  try {
    const logs = await fetchLogs(hookId, limit);
    spinner.stop();

    if (logs.length === 0) {
      console.log(chalk.yellow('\nNo logs found for this hook.'));
      console.log(chalk.gray('Logs will appear after webhooks are received.\n'));
      return;
    }

    console.log(chalk.cyan(`\n📋 Request Logs for ${hookId.slice(0, 12)}... (${logs.length})\n`));

    // Table header
    console.log(
      chalk.gray('  ') +
      chalk.gray('Time'.padEnd(20)) +
      chalk.gray('Method'.padEnd(8)) +
      chalk.gray('Path'.padEnd(30)) +
      chalk.gray('Status'.padEnd(8)) +
      chalk.gray('Size')
    );
    console.log(chalk.gray('  ' + '-'.repeat(75)));

    for (const log of logs) {
      const time = new Date(log.received_at).toLocaleString();
      const path = log.path.length > 28 ? log.path.slice(0, 25) + '...' : log.path;

      const methodColor =
        log.method === 'GET' ? chalk.blue :
        log.method === 'POST' ? chalk.green :
        log.method === 'PUT' ? chalk.yellow :
        log.method === 'DELETE' ? chalk.red :
        chalk.gray;

      const statusColor =
        log.response_status >= 200 && log.response_status < 300 ? chalk.green :
        log.response_status >= 400 && log.response_status < 500 ? chalk.yellow :
        log.response_status >= 500 ? chalk.red :
        chalk.gray;

      const size = log.body_size > 1024
        ? `${(log.body_size / 1024).toFixed(1)}KB`
        : `${log.body_size}B`;

      console.log(
        '  ' +
        chalk.gray(time.padEnd(20)) +
        methodColor(log.method.padEnd(8)) +
        chalk.white(path.padEnd(30)) +
        statusColor(log.response_status.toString().padEnd(8)) +
        chalk.gray(size)
      );
    }

    console.log();
    console.log(chalk.gray(`  Log ID (for replay): ${logs[0]?.id || 'N/A'}`));
    console.log(chalk.gray('  To replay: hooktunnel replay <logId>\n'));
  } catch (error) {
    spinner.fail('Failed to fetch logs');
    throw error;
  }
}

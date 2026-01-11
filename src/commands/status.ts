/**
 * Status Command
 * CLI-CMD-006: Status command
 */

import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated, getApiKey, getConfigPath } from '../lib/config.js';
import { fetchHooks, getUserInfo } from '../lib/api.js';

export async function statusCommand(): Promise<void> {
  console.log(chalk.cyan('\n📊 HookTunnel Status\n'));

  // Auth status
  const isAuth = isAuthenticated();
  console.log(
    chalk.gray('  Authentication: ') +
    (isAuth ? chalk.green('✓ Logged in') : chalk.red('✗ Not logged in'))
  );

  if (!isAuth) {
    console.log(chalk.gray(`\n  Run "hooktunnel login" to authenticate\n`));
    return;
  }

  // Fetch user info and hooks
  const spinner = ora('Fetching status...').start();

  try {
    const [hooks] = await Promise.all([
      fetchHooks().catch(() => []),
    ]);

    spinner.stop();

    // API key info
    const apiKey = getApiKey();
    console.log(chalk.gray('  API Key: ') + chalk.white(`${apiKey?.slice(0, 8)}...`));
    console.log(chalk.gray('  Config: ') + chalk.gray(getConfigPath()));

    console.log();

    // Hooks summary
    console.log(chalk.gray('  Hooks: ') + chalk.white(hooks.length.toString()));
    const activeHooks = hooks.filter(h => h.status === 'active');
    console.log(chalk.gray('  Active: ') + chalk.green(activeHooks.length.toString()));

    if (hooks.length > 0) {
      console.log();
      console.log(chalk.gray('  Recent hooks:'));
      for (const hook of hooks.slice(0, 3)) {
        const statusColor = hook.status === 'active' ? chalk.green : chalk.yellow;
        console.log(
          chalk.gray('    - ') +
          chalk.white(hook.hook_id.slice(0, 12) + '...') +
          ' ' +
          statusColor(`(${hook.status})`)
        );
      }
    }

    console.log();
    console.log(chalk.gray('  To forward webhooks: hooktunnel connect dev <port>\n'));
  } catch (error) {
    spinner.fail('Failed to fetch status');

    // Still show local status
    console.log(chalk.gray('  Config: ') + chalk.gray(getConfigPath()));
    console.log();
  }
}

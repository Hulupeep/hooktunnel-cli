/**
 * Login Command
 * CLI-CMD-002: Login command
 *
 * Verifies the key with GET /api/keys/whoami on the control plane:
 *   200          -> save key, show scopes
 *   401          -> do not save, show the specific reason
 *   404 / network / 5xx -> save anyway with a warning (login is never hard-blocked
 *                   because the server could not be reached or is older)
 */

import chalk from 'chalk';
import ora from 'ora';
import { setApiKey, getConfigPath } from '../lib/config.js';
import { whoami } from '../lib/api.js';
import { CLIError } from '../lib/errors.js';
import { cliCommand, maskApiKey, SETTINGS_URL } from '../lib/invocation.js';
import { promptHidden } from '../lib/prompt.js';

interface LoginOptions {
  key?: string;
}

export function printKeyInstructions(): void {
  console.log(chalk.yellow('\nTo get an API key:'));
  console.log(chalk.gray(`  1. Go to ${SETTINGS_URL}`));
  console.log(chalk.gray('  2. Generate an API key'));
  console.log(chalk.gray(`  3. Run: ${cliCommand('login --key <your-api-key>')}`));
  console.log(chalk.gray('     (or run it without --key to paste the key at a hidden prompt)\n'));
}

async function resolveApiKey(options: LoginOptions): Promise<string> {
  const fromFlag = options.key?.trim();
  if (fromFlag) return fromFlag;

  printKeyInstructions();

  if (!process.stdin.isTTY) {
    throw new CLIError(
      'AUTH_REQUIRED',
      'No API key given, and input is not an interactive terminal so the CLI cannot prompt for one.',
      { suggestion: `Pass the key explicitly: ${cliCommand('login --key <your-api-key>')}` }
    );
  }

  const entered = await promptHidden('Paste your API key (input hidden): ');
  if (!entered) {
    throw new CLIError('AUTH_REQUIRED', 'No API key entered');
  }
  return entered;
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  const apiKey = await resolveApiKey(options);
  const masked = maskApiKey(apiKey);

  const spinner = ora('Verifying API key...').start();
  const result = await whoami(apiKey);

  if (result.status === 'invalid') {
    spinner.fail(`API key ${masked} was rejected; it has not been saved`);
    throw result.error;
  }

  setApiKey(apiKey);

  if (result.status === 'valid') {
    const { scopes, tier } = result.info;
    spinner.succeed(`Logged in with API key ${masked}`);
    console.log(chalk.gray(`  Scopes: ${scopes.length ? scopes.join(', ') : '(none)'}`));
    if (tier && tier !== 'unknown') {
      console.log(chalk.gray(`  Plan:   ${tier}`));
    }
  } else {
    spinner.warn(`Saved API key ${masked}, but could not verify it`);
    console.log(chalk.yellow(`  Reason: ${result.reason}`));
    console.log(chalk.gray('  The key will be checked when you connect; if it is wrong you will see why then.'));
  }

  console.log(chalk.gray(`\nCredentials saved to: ${getConfigPath()}`));
  console.log(chalk.gray(`You can now run: ${cliCommand('connect dev <port>')}\n`));
}

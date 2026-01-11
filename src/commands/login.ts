/**
 * Login Command
 * CLI-CMD-002: Login command
 */

import chalk from 'chalk';
import ora from 'ora';
import { setApiKey, getConfigPath } from '../lib/config.js';
import { validateApiKey } from '../lib/api.js';
import { CLIError } from '../lib/errors.js';

interface LoginOptions {
  key?: string;
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  const apiKey = options.key;

  if (!apiKey) {
    console.log(chalk.yellow('\nTo get an API key:'));
    console.log(chalk.gray('  1. Go to https://hooktunnel.com/app/settings'));
    console.log(chalk.gray('  2. Generate an API key'));
    console.log(chalk.gray('  3. Run: hooktunnel login --key <your-api-key>\n'));
    throw new CLIError('AUTH_REQUIRED', 'API key is required');
  }

  const spinner = ora('Validating API key...').start();

  try {
    const isValid = await validateApiKey(apiKey);

    if (!isValid) {
      spinner.fail('Invalid API key');
      throw new CLIError('AUTH_INVALID');
    }

    setApiKey(apiKey);
    spinner.succeed('Logged in successfully');

    console.log(chalk.gray(`\nCredentials saved to: ${getConfigPath()}`));
    console.log(chalk.gray('You can now run: hooktunnel connect dev <port>\n'));
  } catch (error) {
    spinner.fail('Login failed');
    throw error;
  }
}

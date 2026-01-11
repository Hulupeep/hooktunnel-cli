/**
 * Logout Command
 * CLI-CMD-007: Logout command
 */

import chalk from 'chalk';
import { clearApiKey, isAuthenticated } from '../lib/config.js';

export async function logoutCommand(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.yellow('Not logged in'));
    return;
  }

  clearApiKey();
  console.log(chalk.green('✓ Logged out successfully'));
  console.log(chalk.gray('  Your API key has been removed from this device\n'));
}

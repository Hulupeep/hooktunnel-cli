/**
 * CLI Error Handling
 * CLI-ERR-001: Helpful error messages
 */

import chalk from 'chalk';

export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'CONNECTION_FAILED'
  | 'CONNECTION_LOST'
  | 'TUNNEL_ERROR'
  | 'API_ERROR'
  | 'HOOK_NOT_FOUND'
  | 'LOG_NOT_FOUND'
  | 'PRO_REQUIRED'
  | 'INVALID_PORT'
  | 'LOCAL_SERVER_ERROR'
  | 'UNKNOWN';

interface ErrorInfo {
  message: string;
  suggestion?: string;
}

const ERROR_INFO: Record<ErrorCode, ErrorInfo> = {
  AUTH_REQUIRED: {
    message: 'Authentication required',
    suggestion: 'Run "hooktunnel login" to authenticate',
  },
  AUTH_INVALID: {
    message: 'Invalid API key',
    suggestion: 'Check your API key and try again with "hooktunnel login"',
  },
  CONNECTION_FAILED: {
    message: 'Failed to connect to HookTunnel',
    suggestion: 'Check your internet connection and try again',
  },
  CONNECTION_LOST: {
    message: 'Connection lost',
    suggestion: 'Attempting to reconnect...',
  },
  TUNNEL_ERROR: {
    message: 'Tunnel error',
    suggestion: 'Try reconnecting with "hooktunnel connect"',
  },
  API_ERROR: {
    message: 'API request failed',
    suggestion: 'Try again later or check https://status.hooktunnel.com',
  },
  HOOK_NOT_FOUND: {
    message: 'Hook not found',
    suggestion: 'Run "hooktunnel hooks" to list your hooks',
  },
  LOG_NOT_FOUND: {
    message: 'Request log not found',
    suggestion: 'Run "hooktunnel logs <hookId>" to list logs',
  },
  PRO_REQUIRED: {
    message: 'Pro tier required',
    suggestion: 'Upgrade at https://hooktunnel.com/#pricing',
  },
  INVALID_PORT: {
    message: 'Invalid port number',
    suggestion: 'Port must be a number between 1 and 65535',
  },
  LOCAL_SERVER_ERROR: {
    message: 'Local server error',
    suggestion: 'Make sure your local server is running',
  },
  UNKNOWN: {
    message: 'An unexpected error occurred',
    suggestion: 'Try again or report at https://github.com/Hulupeep/hooktunnel-cli/issues',
  },
};

export class CLIError extends Error {
  constructor(
    public code: ErrorCode,
    public details?: string
  ) {
    const info = ERROR_INFO[code];
    super(info.message);
    this.name = 'CLIError';
  }

  display(): void {
    const info = ERROR_INFO[this.code];
    console.error(chalk.red(`\nError: ${info.message}`));
    if (this.details) {
      console.error(chalk.gray(`  ${this.details}`));
    }
    if (info.suggestion) {
      console.error(chalk.yellow(`\nSuggestion: ${info.suggestion}`));
    }
    console.error();
  }
}

export function handleError(error: unknown): never {
  if (error instanceof CLIError) {
    error.display();
  } else if (error instanceof Error) {
    console.error(chalk.red(`\nError: ${error.message}`));
    console.error(chalk.gray(error.stack || ''));
  } else {
    console.error(chalk.red('\nAn unexpected error occurred'));
  }
  process.exit(1);
}

export function requireAuth(): void {
  const { isAuthenticated } = require('./config.js');
  if (!isAuthenticated()) {
    throw new CLIError('AUTH_REQUIRED');
  }
}

/**
 * CLI Error Handling
 * CLI-ERR-001: Helpful error messages
 */

import chalk from 'chalk';
import { cliCommand, SETTINGS_URL } from './invocation.js';

export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'AUTH_SERVICE_UNAVAILABLE'
  | 'INSUFFICIENT_SCOPE'
  | 'CONNECTION_FAILED'
  | 'CONNECTION_LOST'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'TUNNEL_ERROR'
  | 'API_ERROR'
  | 'HOOK_NOT_FOUND'
  | 'LOG_NOT_FOUND'
  | 'PRO_REQUIRED'
  | 'INVALID_PORT'
  | 'LOCAL_SERVER_ERROR'
  | 'UNKNOWN';

export interface ErrorInfo {
  message: string;
  suggestion?: string;
}

// Built on demand so suggested commands reflect how the CLI was invoked (npx vs global).
function defaultErrorInfo(code: ErrorCode): ErrorInfo {
  switch (code) {
    case 'AUTH_REQUIRED':
      return {
        message: 'Authentication required',
        suggestion: `Run "${cliCommand('login')}" to authenticate`,
      };
    case 'AUTH_INVALID':
      return {
        message: 'Invalid API key',
        suggestion: `Check your API key (or generate a new one at ${SETTINGS_URL}) and run "${cliCommand('login --key <your-api-key>')}"`,
      };
    case 'AUTH_SERVICE_UNAVAILABLE':
      return {
        message: "HookTunnel's auth service is unavailable; this is a server-side problem",
        suggestion: 'Your API key is probably fine. Retry shortly.',
      };
    case 'INSUFFICIENT_SCOPE':
      return {
        message: 'Your API key lacks a required scope',
        suggestion: `Create a key with the required scope at ${SETTINGS_URL}, then run "${cliCommand('login --key <your-api-key>')}"`,
      };
    case 'CONNECTION_FAILED':
      return {
        message: 'Failed to connect to HookTunnel',
        suggestion: `Retry with "${cliCommand('connect <env> <port> --verbose')}" for details`,
      };
    case 'CONNECTION_LOST':
      return { message: 'Connection lost', suggestion: 'Attempting to reconnect...' };
    case 'NETWORK_ERROR':
      return {
        message: 'Could not reach HookTunnel',
        suggestion: 'Check your internet connection and try again',
      };
    case 'SERVER_ERROR':
      return {
        message: 'HookTunnel server error',
        suggestion: 'This is a server-side problem. Retry shortly or check https://status.hooktunnel.com',
      };
    case 'TUNNEL_ERROR':
      return { message: 'Tunnel error', suggestion: `Try reconnecting with "${cliCommand('connect')}"` };
    case 'API_ERROR':
      return {
        message: 'API request failed',
        suggestion: 'Try again later or check https://status.hooktunnel.com',
      };
    case 'HOOK_NOT_FOUND':
      return { message: 'Hook not found', suggestion: `Run "${cliCommand('hooks')}" to list your hooks` };
    case 'LOG_NOT_FOUND':
      return {
        message: 'Request log not found',
        suggestion: `Run "${cliCommand('logs <hookId>')}" to list logs`,
      };
    case 'PRO_REQUIRED':
      return { message: 'Pro tier required', suggestion: 'Upgrade at https://hooktunnel.com/#pricing' };
    case 'INVALID_PORT':
      return {
        message: 'Invalid port number',
        suggestion: 'Port must be a number between 1 and 65535',
      };
    case 'LOCAL_SERVER_ERROR':
      return { message: 'Local server error', suggestion: 'Make sure your local server is running' };
    case 'UNKNOWN':
    default:
      return {
        message: 'An unexpected error occurred',
        suggestion: 'Try again or report at https://github.com/Hulupeep/hooktunnel-cli/issues',
      };
  }
}

export interface CLIErrorOptions extends Partial<ErrorInfo> {
  /** Server-provided error code (e.g. TOKEN_REVOKED), if any. */
  serverCode?: string;
  /** HTTP status that produced this error, if any. */
  status?: number;
  /** Whether retrying the same operation could succeed (transient failure). */
  retryable?: boolean;
}

export class CLIError extends Error {
  public readonly info: ErrorInfo;
  public readonly serverCode?: string;
  public readonly status?: number;
  public readonly retryable: boolean;

  constructor(
    public code: ErrorCode,
    public details?: string,
    options: CLIErrorOptions = {}
  ) {
    const defaults = defaultErrorInfo(code);
    const info: ErrorInfo = {
      message: options.message ?? defaults.message,
      suggestion: options.suggestion ?? defaults.suggestion,
    };
    super(info.message);
    this.name = 'CLIError';
    this.info = info;
    this.serverCode = options.serverCode;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }

  display(): void {
    console.error(chalk.red(`\nError: ${this.info.message}`));
    if (this.details) {
      console.error(chalk.gray(`  ${this.details}`));
    }
    if (this.info.suggestion) {
      console.error(chalk.yellow(`\nSuggestion: ${this.info.suggestion}`));
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

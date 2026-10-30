/**
 * Minimal hidden-input prompt (no echo) for secrets such as API keys.
 * Uses raw mode on a TTY; no extra dependencies.
 */

import { CLIError } from './errors.js';

export interface PromptInput extends NodeJS.EventEmitter {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?(mode: boolean): unknown;
  setEncoding(encoding: BufferEncoding): unknown;
  resume(): unknown;
  pause(): unknown;
}

export interface PromptOutput {
  write(chunk: string): unknown;
}

// Bracketed-paste markers some terminals wrap pasted text in
const BRACKETED_PASTE = /\u001b\[20[01]~/g;

export function promptHidden(
  question: string,
  input: PromptInput = process.stdin,
  output: PromptOutput = process.stdout
): Promise<string> {
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw ?? false;
    let value = '';

    const cleanup = () => {
      input.removeListener('data', onData);
      input.setRawMode?.(wasRaw);
      input.pause();
      output.write('\n');
    };

    const onData = (chunk: string | Buffer) => {
      const text = chunk.toString().replace(BRACKETED_PASTE, '');
      for (const ch of text) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          cleanup();
          resolve(value.trim());
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          reject(new CLIError('AUTH_REQUIRED', 'Login cancelled'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1);
        } else if (ch >= ' ') {
          value += ch;
        }
        // other control characters (arrow-key escapes etc.) are ignored
      }
    };

    output.write(question);
    input.setRawMode?.(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.resume();
  });
}

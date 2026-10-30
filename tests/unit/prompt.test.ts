import { describe, test, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { promptHidden } from '../../src/lib/prompt.js';

function fakeTty() {
  const input = Object.assign(new EventEmitter(), {
    isTTY: true,
    isRaw: false,
    setRawMode: vi.fn(function (this: { isRaw: boolean }, mode: boolean) {
      this.isRaw = mode;
    }),
    setEncoding: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
  });
  const written: string[] = [];
  const output = { write: (s: string) => void written.push(s) };
  return { input, output, written };
}

describe('promptHidden', () => {
  test('reads input without echoing it, supports backspace, restores raw mode', async () => {
    const { input, output, written } = fakeTty();
    const p = promptHidden('Key: ', input, output);
    input.emit('data', 'ht_live_sec');
    input.emit('data', 'X\u007f');
    input.emit('data', 'ret\r');
    await expect(p).resolves.toBe('ht_live_secret');
    expect(written.join('')).toBe('Key: \n');
    expect(input.setRawMode).toHaveBeenNthCalledWith(1, true);
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(input.listenerCount('data')).toBe(0);
  });

  test('strips bracketed-paste markers', async () => {
    const { input, output } = fakeTty();
    const p = promptHidden('Key: ', input, output);
    input.emit('data', '\u001b[200~ht_live_pasted\u001b[201~\n');
    await expect(p).resolves.toBe('ht_live_pasted');
  });

  test('Ctrl+C cancels', async () => {
    const { input, output } = fakeTty();
    const p = promptHidden('Key: ', input, output);
    input.emit('data', 'abc\u0003');
    await expect(p).rejects.toMatchObject({ details: 'Login cancelled' });
  });
});

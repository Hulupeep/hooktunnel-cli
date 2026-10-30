/**
 * How the CLI was invoked (global install vs npx), so the commands we print
 * in instructions and error suggestions are copy-pasteable.
 * CLI-ERR-001: Helpful error messages
 */

export const PACKAGE_NAME = 'hooktunnel-cli';
export const BIN_NAME = 'hooktunnel';
export const SETTINGS_URL = 'https://hooktunnel.com/app/settings';

type Env = Record<string, string | undefined>;

/**
 * True when running via `npx hooktunnel-cli` / `npm exec`, where there is no
 * `hooktunnel` binary on PATH afterwards.
 */
export function isNpxInvocation(
  env: Env = process.env,
  argv: readonly string[] = process.argv
): boolean {
  // npm >= 7 sets npm_command=exec for both `npx` and `npm exec`
  if (env.npm_command === 'exec') return true;
  // npx-installed packages live under the npm cache's _npx directory
  const script = argv[1] ?? '';
  return /[\\/]_npx[\\/]/.test(script);
}

/** The command prefix a user should type to run the CLI again. */
export function cliPrefix(env: Env = process.env, argv: readonly string[] = process.argv): string {
  return isNpxInvocation(env, argv) ? `npx ${PACKAGE_NAME}` : BIN_NAME;
}

/** e.g. cliCommand('login --key <key>') -> "npx hooktunnel-cli login --key <key>" under npx. */
export function cliCommand(
  args: string,
  env: Env = process.env,
  argv: readonly string[] = process.argv
): string {
  return `${cliPrefix(env, argv)} ${args}`;
}

/** Show enough of a key to recognise it without revealing it. */
export function maskApiKey(key: string): string {
  const prefixMatch = key.match(/^([a-z]+_(?:live|test)_)/i);
  const prefix = prefixMatch ? prefixMatch[1] : '';
  if (key.length - prefix.length < 12) {
    return `${prefix}****`;
  }
  return `${prefix}****${key.slice(-4)}`;
}

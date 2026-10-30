/**
 * Tunnel Client
 * CLI-CONN-001: WebSocket connection
 * CLI-CONN-002: Forward to localhost
 * CLI-CONN-003: Heartbeat handling
 * CLI-CONN-004: Real-time log display
 */

import WebSocket from 'ws';
import chalk from 'chalk';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { v4 as uuidv4 } from 'uuid';
import { getTunnelUrl } from './config.js';
import { CLIError } from './errors.js';
import { errorFromConnectionError, errorFromServerCode, errorFromUpgradeRejection } from './serverErrors.js';
import type {
  TunnelOptions,
  ConnectionState,
  HelloMessage,
  ResponseMessage,
  PongMessage,
  ServerMessage,
  RequestMessage,
  RequestLogEntry,
} from '../types/tunnel.js';

const CLIENT_VERSION = '0.1.4';
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
// Default tunnel endpoint: wss://tunnel.hooktunnel.com/ws/tunnel
const HANDSHAKE_TIMEOUT_MS = 15_000;
const MAX_ERROR_BODY_BYTES = 16 * 1024;
const ERROR_BODY_TIMEOUT_MS = 3_000;

/**
 * Whether a failed (re)connection is worth retrying. Auth and permission
 * rejections (401/403) and other HTTP-level refusals are not; network errors,
 * 5xx and unexplained socket closes are.
 */
export function shouldRetry(error: unknown): boolean {
  if (!(error instanceof CLIError)) return true;
  if (error.retryable) return true;
  if (error.status !== undefined) return false;
  return error.code === 'CONNECTION_FAILED' || error.code === 'CONNECTION_LOST';
}

/** Read (a bounded amount of) an HTTP response body; resolves on end, close, error or timeout. */
function readResponseBody(res: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const timer = setTimeout(finish, ERROR_BODY_TIMEOUT_MS);
    res.on('data', (chunk: Buffer) => {
      if (size < MAX_ERROR_BODY_BYTES) {
        chunks.push(chunk);
        size += chunk.length;
      }
    });
    res.on('end', finish);
    res.on('close', finish);
    res.on('error', finish);
  });
}

interface ParsedTarget {
  baseUrl: string;
  displayUrl: string;
}

/**
 * Parse the target host/URL for forwarding.
 * Supports:
 *   - localhost (default) → http://localhost:PORT
 *   - custom-host → http://custom-host:PORT
 *   - http://host:port → http://host:port (as-is)
 *   - https://api.prod.com → https://api.prod.com (no port appended)
 */
function parseTarget(host: string | undefined, port: number): ParsedTarget {
  // Default: localhost with port
  if (!host) {
    return {
      baseUrl: `http://localhost:${port}`,
      displayUrl: `http://localhost:${port}`,
    };
  }

  // Full URL provided (http:// or https://)
  if (host.startsWith('http://') || host.startsWith('https://')) {
    // Don't append port to full URLs - they manage their own ports
    return {
      baseUrl: host.replace(/\/$/, ''), // Remove trailing slash
      displayUrl: host.replace(/\/$/, ''),
    };
  }

  // Plain hostname - treat as local, add http:// and port
  return {
    baseUrl: `http://${host}:${port}`,
    displayUrl: `http://${host}:${port}`,
  };
}

export class TunnelClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private options: TunnelOptions;
  private sessionId: string | null = null;
  private reconnectAttempt = 0;
  private clientInstanceId: string;
  private requestLog: RequestLogEntry[] = [];
  private target: ParsedTarget;
  private closedByClient = false;

  constructor(options: TunnelOptions) {
    this.options = options;
    this.clientInstanceId = uuidv4();
    this.target = parseTarget(options.host, options.port);
  }

  /**
   * Single connection attempt. Rejects with a CLIError describing why the
   * server refused the upgrade (auth code, status) or why it was unreachable.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.state = 'connecting';
      const tunnelUrl = this.options.tunnelUrl ?? getTunnelUrl();
      let settled = false;

      const succeed = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fail = (error: CLIError) => {
        if (settled) return;
        settled = true;
        if (this.state === 'connecting') this.state = 'disconnected';
        reject(error);
      };

      if (this.options.verbose) {
        console.log(chalk.gray(`[DEBUG] Connecting to ${tunnelUrl}`));
      }

      const ws = new WebSocket(tunnelUrl, {
        headers: {
          'Authorization': `Bearer ${this.options.apiKey}`,
        },
        handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
      });
      this.ws = ws;

      // Non-101 upgrade response: read status, X-HookTunnel-Error header and JSON body
      ws.on('unexpected-response', (_req: ClientRequest, res: IncomingMessage) => {
        const header = res.headers['x-hooktunnel-error'];
        readResponseBody(res).then((body) => {
          if (this.options.verbose) {
            console.log(chalk.gray(`[DEBUG] Upgrade rejected: HTTP ${res.statusCode} ${header ?? ''} ${body}`));
          }
          fail(
            errorFromUpgradeRejection({
              status: res.statusCode ?? 0,
              headerCode: Array.isArray(header) ? header[0] : header,
              body,
              url: tunnelUrl,
            })
          );
          ws.terminate();
        });
      });

      ws.on('open', () => {
        if (this.options.verbose) {
          console.log(chalk.gray('[DEBUG] WebSocket connected, sending hello'));
        }
        this.sendHello();
      });

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as ServerMessage;
          this.handleMessage(message, succeed, fail);
        } catch (error) {
          console.error(chalk.red('Failed to parse message'));
        }
      });

      ws.on('close', (code: number, reason: Buffer) => {
        const wasConnected = this.state === 'connected';
        this.state = 'disconnected';

        if (wasConnected && !this.closedByClient) {
          console.log(chalk.yellow(`\nConnection closed (${code}): ${reason.toString()}`));
          this.attemptReconnect();
        } else {
          fail(new CLIError('CONNECTION_FAILED', `Connection closed before the tunnel was established (code ${code})`));
        }
      });

      ws.on('error', (error: Error) => {
        if (!settled) {
          fail(errorFromConnectionError(error, tunnelUrl));
        } else if (this.state === 'connected') {
          console.error(chalk.red(`Connection error: ${error.message}`));
        }
      });
    });
  }

  /**
   * Initial connection. Retries with backoff only when the server says it is
   * temporarily unavailable (503, e.g. AUTH_BACKEND_UNAVAILABLE). Auth
   * failures and network errors are reported immediately.
   */
  async connectWithRetry(): Promise<void> {
    const delays = this.options.retryDelaysMs ?? RECONNECT_DELAYS;
    for (let attempt = 0; ; attempt++) {
      try {
        await this.connect();
        return;
      } catch (error) {
        const temporarilyUnavailable = error instanceof CLIError && error.status === 503;
        if (!temporarilyUnavailable || attempt >= delays.length) {
          throw error;
        }
        const delay = delays[attempt];
        console.log(
          chalk.yellow(
            `${(error as CLIError).info.message}. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${delays.length})`
          )
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  private sendHello(): void {
    const hello: HelloMessage = {
      type: 'hello',
      client_instance_id: this.clientInstanceId,
      env: this.options.env,
      local_base_url: this.target.baseUrl,
      capabilities: {
        max_inflight: 50,
        max_body_bytes: 10 * 1024 * 1024, // 10MB
        supports_gzip: false,
      },
      client_version: CLIENT_VERSION,
    };

    this.ws?.send(JSON.stringify(hello));
  }

  private handleMessage(
    message: ServerMessage,
    resolveConnect?: () => void,
    rejectConnect?: (err: CLIError) => void
  ): void {
    switch (message.type) {
      case 'hello_ack':
        this.state = 'connected';
        this.sessionId = message.tunnel_session_id;
        this.reconnectAttempt = 0;

        if (this.options.verbose) {
          console.log(chalk.gray(`[DEBUG] Session established: ${this.sessionId}`));
          console.log(chalk.gray(`[DEBUG] Policies: ${JSON.stringify(message.policies)}`));
        }

        console.log(chalk.green('✓ Connected to HookTunnel'));
        console.log(chalk.gray(`  Session: ${this.sessionId?.slice(0, 8)}...`));
        console.log(chalk.gray(`  Forwarding to: ${this.target.displayUrl}`));
        console.log();

        resolveConnect?.();
        break;

      case 'request':
        this.handleRequest(message);
        break;

      case 'ping':
        this.sendPong(message.timestamp);
        break;

      case 'error': {
        const mapped =
          errorFromServerCode(message.code, { serverMessage: message.message, context: 'tunnel' }) ??
          (message.code === 'AUTH_FAILED' ? new CLIError('AUTH_INVALID', message.message) : undefined);
        if (mapped && this.state === 'connecting') {
          rejectConnect?.(mapped);
        } else {
          console.error(chalk.red(`Server error: ${message.message}`));
        }
        break;
      }
    }
  }

  private async handleRequest(request: RequestMessage): Promise<void> {
    const startTime = Date.now();

    if (this.options.verbose) {
      console.log(chalk.gray(`[DEBUG] Received request: ${request.request_id}`));
    }

    try {
      // Forward to target server (local or remote)
      const targetUrl = `${this.target.baseUrl}${request.path}${request.query ? '?' + request.query : ''}`;

      const headers: Record<string, string> = { ...request.headers };
      delete headers['host'];
      delete headers['connection'];

      const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: request.body_base64 ? Buffer.from(request.body_base64, 'base64') : undefined,
      });

      const duration = Date.now() - startTime;
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const responseBody = await response.arrayBuffer();

      // Send response back
      const responseMsg: ResponseMessage = {
        type: 'response',
        request_id: request.request_id,
        status: response.status,
        headers: responseHeaders,
        body_base64: Buffer.from(responseBody).toString('base64'),
      };

      this.ws?.send(JSON.stringify(responseMsg));

      // Log the request
      this.logRequest(request, response.status, duration);
    } catch (error) {
      const duration = Date.now() - startTime;

      // Send error response
      const responseMsg: ResponseMessage = {
        type: 'response',
        request_id: request.request_id,
        status: 502,
        headers: { 'content-type': 'text/plain' },
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.ws?.send(JSON.stringify(responseMsg));

      // Log the error
      this.logRequest(request, 502, duration, true);
    }
  }

  private logRequest(request: RequestMessage, status: number, duration: number, isError = false): void {
    const time = new Date().toLocaleTimeString();
    const method = request.method.padEnd(6);
    const path = request.path.length > 40 ? request.path.slice(0, 37) + '...' : request.path;

    let statusColor = chalk.green;
    if (status >= 400 && status < 500) statusColor = chalk.yellow;
    if (status >= 500 || isError) statusColor = chalk.red;

    const methodColor =
      request.method === 'GET' ? chalk.blue :
      request.method === 'POST' ? chalk.green :
      request.method === 'PUT' ? chalk.yellow :
      request.method === 'DELETE' ? chalk.red :
      chalk.gray;

    console.log(
      chalk.gray(`[${time}]`),
      methodColor(method),
      chalk.white(path),
      statusColor(`${status}`),
      chalk.gray(`(${duration}ms)`)
    );

    this.requestLog.push({
      id: request.request_id,
      method: request.method,
      path: request.path,
      status,
      duration,
      timestamp: new Date(),
    });
  }

  private sendPong(timestamp: string): void {
    const pong: PongMessage = {
      type: 'pong',
      timestamp,
    };
    this.ws?.send(JSON.stringify(pong));

    if (this.options.verbose) {
      console.log(chalk.gray('[DEBUG] Sent pong'));
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempt >= RECONNECT_DELAYS.length) {
      console.error(chalk.red('Max reconnection attempts reached. Exiting.'));
      process.exit(1);
    }

    const delay = RECONNECT_DELAYS[this.reconnectAttempt];
    this.reconnectAttempt++;
    this.state = 'reconnecting';

    console.log(chalk.yellow(`Reconnecting in ${delay / 1000}s... (attempt ${this.reconnectAttempt})`));

    setTimeout(() => {
      this.connect().catch((error) => {
        if (!shouldRetry(error)) {
          // Auth/permission problems will not fix themselves by reconnecting
          if (error instanceof CLIError) {
            error.display();
          } else {
            console.error(chalk.red(`Reconnection failed: ${error.message}`));
          }
          process.exit(1);
        }
        const detail = error instanceof CLIError && error.details ? ` (${error.details})` : '';
        console.error(chalk.red(`Reconnection failed: ${error.message}${detail}`));
        this.attemptReconnect();
      });
    }, delay);
  }

  disconnect(): void {
    this.closedByClient = true;
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    this.state = 'disconnected';
  }

  getState(): ConnectionState {
    return this.state;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getRequestLog(): RequestLogEntry[] {
    return this.requestLog;
  }
}

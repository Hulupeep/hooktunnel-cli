/**
 * Tunnel Client
 * CLI-CONN-001: WebSocket connection
 * CLI-CONN-002: Forward to localhost
 * CLI-CONN-003: Heartbeat handling
 * CLI-CONN-004: Real-time log display
 */

import WebSocket from 'ws';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import { getTunnelUrl } from './config.js';
import { CLIError } from './errors.js';
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

const CLIENT_VERSION = '0.1.0';
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
// Default tunnel endpoint: wss://tunnel.hooktunnel.com/ws/tunnel

export class TunnelClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private options: TunnelOptions;
  private sessionId: string | null = null;
  private reconnectAttempt = 0;
  private clientInstanceId: string;
  private requestLog: RequestLogEntry[] = [];

  constructor(options: TunnelOptions) {
    this.options = options;
    this.clientInstanceId = uuidv4();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.state = 'connecting';
      const tunnelUrl = getTunnelUrl();

      if (this.options.verbose) {
        console.log(chalk.gray(`[DEBUG] Connecting to ${tunnelUrl}`));
      }

      this.ws = new WebSocket(tunnelUrl, {
        headers: {
          'Authorization': `Bearer ${this.options.apiKey}`,
        },
      });

      this.ws.on('open', () => {
        if (this.options.verbose) {
          console.log(chalk.gray('[DEBUG] WebSocket connected, sending hello'));
        }
        this.sendHello();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as ServerMessage;
          this.handleMessage(message, resolve, reject);
        } catch (error) {
          console.error(chalk.red('Failed to parse message'));
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        const wasConnected = this.state === 'connected';
        this.state = 'disconnected';

        if (wasConnected) {
          console.log(chalk.yellow(`\nConnection closed (${code}): ${reason.toString()}`));
          this.attemptReconnect();
        } else {
          reject(new CLIError('CONNECTION_FAILED', `Code: ${code}`));
        }
      });

      this.ws.on('error', (error: Error) => {
        if (this.state === 'connecting') {
          reject(new CLIError('CONNECTION_FAILED', error.message));
        } else {
          console.error(chalk.red(`Connection error: ${error.message}`));
        }
      });
    });
  }

  private sendHello(): void {
    const hello: HelloMessage = {
      type: 'hello',
      client_instance_id: this.clientInstanceId,
      env: this.options.env,
      local_base_url: `http://${this.options.host || 'localhost'}:${this.options.port}`,
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
    rejectConnect?: (err: Error) => void
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
        console.log(chalk.gray(`  Forwarding to: http://${this.options.host || 'localhost'}:${this.options.port}`));
        console.log();

        resolveConnect?.();
        break;

      case 'request':
        this.handleRequest(message);
        break;

      case 'ping':
        this.sendPong(message.timestamp);
        break;

      case 'error':
        console.error(chalk.red(`Server error: ${message.message}`));
        if (message.code === 'AUTH_FAILED') {
          rejectConnect?.(new CLIError('AUTH_INVALID'));
        }
        break;
    }
  }

  private async handleRequest(request: RequestMessage): Promise<void> {
    const startTime = Date.now();

    if (this.options.verbose) {
      console.log(chalk.gray(`[DEBUG] Received request: ${request.request_id}`));
    }

    try {
      // Forward to local server
      const localUrl = `http://${this.options.host || 'localhost'}:${this.options.port}${request.path}${request.query ? '?' + request.query : ''}`;

      const headers: Record<string, string> = { ...request.headers };
      delete headers['host'];
      delete headers['connection'];

      const response = await fetch(localUrl, {
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
        console.error(chalk.red(`Reconnection failed: ${error.message}`));
        this.attemptReconnect();
      });
    }, delay);
  }

  disconnect(): void {
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

/**
 * Tunnel Protocol Types
 * Based on ngrokky tunnel gateway protocol
 */

export type Environment = 'dev' | 'staging' | 'prod';

// Client -> Server Messages
export interface HelloMessage {
  type: 'hello';
  client_instance_id: string;
  env: Environment;
  local_base_url: string;
  capabilities: {
    max_inflight: number;
    max_body_bytes: number;
    supports_gzip: boolean;
  };
  client_version: string;
}

export interface ResponseMessage {
  type: 'response';
  request_id: string;
  status: number;
  headers: Record<string, string>;
  body_base64?: string;
  error?: string;
}

export interface PongMessage {
  type: 'pong';
  timestamp: string;
}

export type ClientMessage = HelloMessage | ResponseMessage | PongMessage;

// Server -> Client Messages
export interface HelloAckMessage {
  type: 'hello_ack';
  tunnel_session_id: string;
  tenant_id: string;
  env: Environment;
  policies: {
    idle_timeout_seconds: number;
    ping_interval_seconds: number;
    max_inflight_enforced: number;
    max_body_bytes_enforced: number;
  };
}

export interface RequestMessage {
  type: 'request';
  request_id: string;
  hook_id: string;
  method: string;
  path: string;
  query: string;
  headers: Record<string, string>;
  body_base64?: string;
  received_at: string;
  remote_ip: string;
  provider: string;
}

export interface PingMessage {
  type: 'ping';
  timestamp: string;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export type ServerMessage = HelloAckMessage | RequestMessage | PingMessage | ErrorMessage;

// Connection state
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// Tunnel options
export interface TunnelOptions {
  env: Environment;
  port: number;
  host?: string;
  verbose?: boolean;
  apiKey: string;
}

// Request log for display
export interface RequestLogEntry {
  id: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  timestamp: Date;
}

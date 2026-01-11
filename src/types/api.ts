/**
 * API Response Types
 */

export interface Hook {
  id: string;
  hook_id: string;
  provider: 'generic' | 'twilio' | 'stripe';
  env: string;
  status: 'active' | 'paused' | 'deleted';
  created_at: string;
  request_count: number;
}

export interface RequestLog {
  id: string;
  hook_id: string;
  method: string;
  path: string;
  content_type: string | null;
  body_size: number;
  response_status: number;
  received_at: string;
  body_redacted: boolean;
}

export interface HooksResponse {
  hooks: Hook[];
}

export interface LogsResponse {
  logs: RequestLog[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ReplayResponse {
  success: boolean;
  replay: {
    id: string;
    status: string;
    responseStatus: number;
  };
}

export interface UserInfo {
  id: string;
  email: string;
  tier: string;
}

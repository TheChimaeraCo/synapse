// ============================================================
// lib/types.ts - Shared types across frontend + backend
// ============================================================

import type { Id } from "../convex/_generated/dataModel";

// --- API Request/Response Contracts ---

/** POST /api/chat - Send a message from Hub */
export interface SendMessageRequest {
  sessionId: string;             // Convex session ID
  content: string;
  gatewayId: string;
}

export interface SendMessageResponse {
  messageId: string;
  sessionId: string;
}

/** GET /api/chat/stream?sessionId=X - SSE stream */
// SSE events:
// event: status   data: { status: "thinking" | "streaming" | "complete" | "error" }
// event: chunk    data: { content: string }
// event: done     data: { messageId: string, tokens: TokenUsage, cost: number }
// event: error    data: { message: string }

// --- Domain Types ---

export interface TokenUsage {
  input: number;
  output: number;
}

export interface MessageDisplay {
  _id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens?: TokenUsage;
  cost?: number;
  model?: string;
  latencyMs?: number;
  _creationTime: number;
  metadata?: any;
}

export interface SessionDisplay {
  _id: string;
  title?: string;
  status: "active" | "archived";
  lastMessageAt: number;
  messageCount: number;
  agentName: string;
  channelPlatform: string;
}

export interface AgentConfig {
  _id: string;
  name: string;
  slug: string;
  model: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  isActive: boolean;
}

export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  messageCount: number;
  period: string;               // "today" | "this_week" | "this_month"
}

export interface DashboardStats {
  totalMessages: number;
  totalCost: number;
  totalSessions: number;
  activeSessions: number;
  todayMessages: number;
  todayCost: number;
}

export interface StreamEvent {
  type: "status" | "chunk" | "done" | "error";
  data: Record<string, unknown>;
}

// --- Telegram Types (for Agent 3) ---

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
    };
    date: number;
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>;
    document?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
    voice?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number };
  };
}

export interface NormalizedInbound {
  platform: "telegram" | "hub";
  externalUserId: string;
  externalChatId: string;
  externalMessageId: string;
  displayName: string;
  text: string;
  isGroup: boolean;
  timestamp: number;
  attachments?: Array<{
    type: string;
    fileId: string;
    filename?: string;
    mimeType?: string;
  }>;
}

// --- Claude Types (for Agent 3) ---

export interface ClaudeRequest {
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  temperature?: number;
}

export interface ClaudeResponse {
  content: string;
  usage: TokenUsage;
  model: string;
  stopReason: string;
}

// --- Channel Types ---

export type ChannelPlatform = "telegram" | "hub" | "discord" | "whatsapp" | "custom";

export interface ChannelDisplay {
  _id: string;
  platform: ChannelPlatform;
  name: string;
  description?: string;
  icon?: string;
  isPublic?: boolean;
  category?: string;
  sortOrder?: number;
  isActive: boolean;
  lastActivityAt?: number;
}

// --- Cost Constants ---

export const MODEL_COSTS: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "claude-sonnet-4-20250514": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-opus-4-20250514": { inputPerMillion: 15, outputPerMillion: 75 },
  "claude-haiku-3-20250514": { inputPerMillion: 0.25, outputPerMillion: 1.25 },
};

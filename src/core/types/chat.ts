export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  contextWindow: number;
  contextTokens: number;
  percentage: number;
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export type AssistantContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'thinking'; thinking: string };

export type ApiMessage =
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | AssistantContent[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type StreamChunk =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; content: string; isError: boolean }
  | { type: 'assistant_message_start' }
  | { type: 'done' }
  | { type: 'error'; content: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallDisplay[];
  thinkingBlocks?: string[];
  timestamp: number;
  isSummary?: boolean;
}

export interface ToolCallDisplay {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  status: 'running' | 'completed' | 'error';
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  providerId: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

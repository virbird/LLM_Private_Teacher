import type { ProviderId, ProviderCapabilities, ModelInfo } from '../types/provider';
import type { ProviderToolDefinition, NormalizedToolCall } from '../types/tools';
import type { ApiMessage } from '../types/chat';

export interface ChatRequest {
  messages: ApiMessage[];
  model: string;
  system?: string;
  tools?: ProviderToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  thinking?: { type: 'enabled'; budget_tokens: number } | { type: 'disabled' };
  stream: true;
  signal?: AbortSignal;
}

export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; inputJson: string }
  | { type: 'tool_call_end'; id: string }
  | { type: 'message_start' }
  | { type: 'message_end'; stopReason: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheCreationTokens?: number; cacheReadTokens?: number }
  | { type: 'error'; message: string };

export interface LlmProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  chat(request: ChatRequest): AsyncGenerator<StreamEvent>;
  getModels(): ModelInfo[];
  buildToolDefinitions(tools: ProviderToolDefinition[]): unknown[];
  normalizeToolCall(raw: unknown): NormalizedToolCall;
}

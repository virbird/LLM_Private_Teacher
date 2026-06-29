export type ProviderId = 'anthropic' | 'openai' | 'openai-compat'
  | 'claude-cli' | 'pi-cli' | 'codex-cli' | 'acp-cli' | 'opencode-cli';

export interface ProviderCapabilities {
  providerId: ProviderId;
  displayName: string;
  supportsStreaming: boolean;
  supportsToolUse: boolean;
  supportsThinking: boolean;
  supportsVision: boolean;
  reasoningControl: 'budget' | 'effort' | 'none';
  maxContextTokens: number;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsThinking: boolean;
  supportsVision: boolean;
}

export interface ProviderConfig {
  providerId: ProviderId;
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  customHeaders?: Record<string, string>;
}

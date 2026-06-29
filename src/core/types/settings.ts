import type { ProviderId } from './provider';

export interface AnthropicAccount {
  apiKey: string;
  model: string;
  maxTokens: number;
  thinkingBudget: number;
}

export interface OpenAIAccount {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export interface OpenAICompatAccount {
  baseUrl: string;
  apiKey: string;
  model: string;
  contextWindow: number;
  maxTokens: number;
  customHeaders: Record<string, string>;
  customModels: string[];
}

export interface CliProviderAccount {
  /** Path to the CLI executable. If empty, auto-detect from PATH. */
  cliPath: string;
  /** Model identifier for the CLI. */
  model: string;
  /** Maximum tokens for response. */
  maxTokens: number;
  /** Thinking budget tokens (Claude-specific, 0 = disabled). */
  thinkingBudget: number;
}

export interface LearningMaterial {
  path: string;
  title: string;
  tags: string[];
  confirmed: boolean;
  createdAt: string;
}

export interface LearningConfig {
  flashcardFolder: string;
  logFolder: string;
  mapFolder: string;
  planFolder: string;
  quizFolder: string;
  noteFolder: string;
}

export interface PluginSettings {
  activeProvider: ProviderId;
  providers: {
    anthropic: AnthropicAccount;
    openai: OpenAIAccount;
    openaiCompat: OpenAICompatAccount;
    claudeCli: CliProviderAccount;
    piCli: CliProviderAccount;
    codexCli: CliProviderAccount;
    acpCli: CliProviderAccount;
    opencodeCli: CliProviderAccount;
  };
  systemPrompt: string;
  permissionMode: 'normal' | 'plan';
  enableAutoTitleGeneration: boolean;
  maxTabs: number;
  locale: string;
  learningMaterials: LearningMaterial[];
  activeMaterialPath: string;
  learning: LearningConfig;
  contextCompressionEnabled: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  activeProvider: 'anthropic',
  providers: {
    anthropic: {
      apiKey: '',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 256000,
      thinkingBudget: 0,
    },
    openai: {
      apiKey: '',
      model: 'gpt-4o',
      maxTokens: 256000,
    },
    openaiCompat: {
      baseUrl: '',
      apiKey: '',
      model: '',
      contextWindow: 128000,
      maxTokens: 256000,
      customHeaders: {},
      customModels: [],
    },
    claudeCli: {
      cliPath: '',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 256000,
      thinkingBudget: 0,
    },
    piCli: {
      cliPath: '',
      model: 'default',
      maxTokens: 256000,
      thinkingBudget: 0,
    },
    codexCli: {
      cliPath: '',
      model: 'o3',
      maxTokens: 256000,
      thinkingBudget: 0,
    },
    acpCli: {
      cliPath: '',
      model: 'default',
      maxTokens: 256000,
      thinkingBudget: 0,
    },
    opencodeCli: {
      cliPath: '',
      model: 'default',
      maxTokens: 256000,
      thinkingBudget: 0,
    },
  },
  systemPrompt: '',
  permissionMode: 'normal',
  enableAutoTitleGeneration: true,
  maxTabs: 3,
  locale: 'en',
  learningMaterials: [],
  activeMaterialPath: '',
  learning: {
    flashcardFolder: 'learning/flashcards',
    logFolder: 'learning/logs',
    mapFolder: 'learning/maps',
    planFolder: 'learning/plans',
    quizFolder: 'learning/quizzes',
    noteFolder: '学习笔记',
  },
  contextCompressionEnabled: true,
};

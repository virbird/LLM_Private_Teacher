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
  };
  systemPrompt: string;
  permissionMode: 'normal' | 'plan';
  enableAutoTitleGeneration: boolean;
  maxTabs: number;
  locale: string;
  learningMaterials: LearningMaterial[];
  activeMaterialPath: string;
  learning: LearningConfig;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  activeProvider: 'anthropic',
  providers: {
    anthropic: {
      apiKey: '',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 8192,
      thinkingBudget: 0,
    },
    openai: {
      apiKey: '',
      model: 'gpt-4o',
      maxTokens: 4096,
    },
    openaiCompat: {
      baseUrl: '',
      apiKey: '',
      model: '',
      contextWindow: 128000,
      maxTokens: 4096,
      customHeaders: {},
      customModels: [],
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
};

import type { ProviderCapabilities, ModelInfo } from '../types/provider';
import type { ProviderToolDefinition, NormalizedToolCall } from '../types/tools';
import type { LlmProvider, ChatRequest, StreamEvent } from './LlmProvider';
import { streamRequest } from '../../utils/request';
import { parseOpenAISSE } from '../agent/StreamingParser';

export class OpenAICompatProvider implements LlmProvider {
  readonly id = 'openai-compat' as const;
  readonly capabilities: ProviderCapabilities;

  private customModels: string[];

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private modelName: string,
    contextWindow: number,
    private customHeaders: Record<string, string> = {},
    customModels: string[] = [],
  ) {
    this.customModels = customModels;
    this.capabilities = {
      providerId: 'openai-compat',
      displayName: `OpenAI Compatible (${modelName})`,
      supportsStreaming: true,
      supportsToolUse: true,
      supportsThinking: false,
      supportsVision: false,
      reasoningControl: 'none',
      maxContextTokens: contextWindow,
    };
  }

  getModels(): ModelInfo[] {
    const modelIds = new Set<string>();
    const models: ModelInfo[] = [];

    // Default model first
    if (this.modelName) {
      modelIds.add(this.modelName);
      models.push({
        id: this.modelName,
        displayName: this.modelName + ' (default)',
        contextWindow: this.capabilities.maxContextTokens,
        supportsTools: true,
        supportsThinking: false,
        supportsVision: false,
      });
    }

    // Additional custom models
    for (const id of this.customModels) {
      if (id && !modelIds.has(id)) {
        modelIds.add(id);
        models.push({
          id,
          displayName: id,
          contextWindow: this.capabilities.maxContextTokens,
          supportsTools: true,
          supportsThinking: false,
          supportsVision: false,
        });
      }
    }

    return models;
  }

  buildToolDefinitions(tools: ProviderToolDefinition[]): unknown[] {
    return tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }

  normalizeToolCall(raw: unknown): NormalizedToolCall {
    const r = raw as { id: string; function: { name: string; arguments: string } };
    const parsedArgs: unknown = JSON.parse(r.function.arguments);
    return { id: r.id, name: r.function.name, input: parsedArgs as Record<string, unknown> };
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const url = this.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const messages: unknown[] = [];
    if (request.system) messages.push({ role: 'system', content: request.system });
    for (const msg of request.messages) {
      if (msg.role === 'tool') {
        messages.push({ role: 'tool', tool_call_id: msg.tool_call_id, content: msg.content });
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = { model: request.model, messages, stream: true, stream_options: { include_usage: true } };
    if (request.maxTokens) body.max_tokens = request.maxTokens;
    if (request.tools?.length) body.tools = this.buildToolDefinitions(request.tools);

    let buffer = '';
    const eventQueue: StreamEvent[] = [];
    let notifyResolve: (() => void) | null = null;
    const streamPromise = streamRequest(
      {
        url, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}`, ...this.customHeaders },
        body: JSON.stringify(body), signal: request.signal,
      },
      (chunk) => {
        buffer += chunk;
        const result = parseOpenAISSE(buffer);
        buffer = result.remaining;
        eventQueue.push(...result.events);
        if (notifyResolve) { notifyResolve(); notifyResolve = null; }
      },
    );

    let lastYielded = 0;
    let done = false;
    let streamError: Error | null = null;
    streamPromise.then(() => { done = true; if (notifyResolve) { notifyResolve(); notifyResolve = null; } })
      .catch((err: unknown) => {
        streamError = err instanceof Error ? err : new Error(String(err));
        done = true;
        if (notifyResolve) { notifyResolve(); notifyResolve = null; }
      });
    while (!done || lastYielded < eventQueue.length) {
      if (lastYielded < eventQueue.length) {
        while (lastYielded < eventQueue.length) yield eventQueue[lastYielded++];
      } else {
        await new Promise<void>(resolve => { notifyResolve = resolve; });
      }
    }
    if (buffer.trim()) {
      const result = parseOpenAISSE(buffer + '\n');
      for (const event of result.events) yield event;
    }
    if (streamError !== null) {
      yield { type: 'error', message: streamError!.message };
    }
  }
}

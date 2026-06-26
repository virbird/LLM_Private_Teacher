import type { ProviderCapabilities, ModelInfo } from '../types/provider';
import type { ProviderToolDefinition, NormalizedToolCall } from '../types/tools';
import type { ApiMessage } from '../types/chat';
import type { LlmProvider, ChatRequest, StreamEvent } from './LlmProvider';
import { streamRequest } from '../../utils/request';
import { parseClaudeSSE } from '../agent/StreamingParser';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic' as const;
  readonly capabilities: ProviderCapabilities = {
    providerId: 'anthropic',
    displayName: 'Anthropic Claude',
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: true,
    supportsVision: true,
    reasoningControl: 'budget',
    maxContextTokens: 200000,
  };

  constructor(private apiKey: string) {}

  getModels(): ModelInfo[] {
    return [
      { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', contextWindow: 200000, supportsTools: true, supportsThinking: true, supportsVision: true },
      { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', contextWindow: 200000, supportsTools: true, supportsThinking: false, supportsVision: true },
      { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', contextWindow: 200000, supportsTools: true, supportsThinking: true, supportsVision: true },
    ];
  }

  buildToolDefinitions(tools: ProviderToolDefinition[]): unknown[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }

  normalizeToolCall(raw: unknown): NormalizedToolCall {
    const r = raw as { id: string; name: string; input: Record<string, unknown> };
    return { id: r.id, name: r.name, input: r.input };
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const body = this.buildRequestBody(request);

    let buffer = '';
    const eventQueue: StreamEvent[] = [];
    let notifyResolve: (() => void) | null = null;

    const streamPromise = streamRequest(
      {
        url: ANTHROPIC_API_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'output-128k-2025-02-19',
        },
        body: JSON.stringify(body),
        signal: request.signal,
      },
      (chunk) => {
        buffer += chunk;
        const result = parseClaudeSSE(buffer);
        buffer = result.remaining;
        eventQueue.push(...result.events);
        if (notifyResolve) { notifyResolve(); notifyResolve = null; }
      },
    );

    let lastYielded = 0;
    let done = false;

    streamPromise.then(() => { done = true; if (notifyResolve) { notifyResolve(); notifyResolve = null; } })
      .catch(() => { done = true; if (notifyResolve) { notifyResolve(); notifyResolve = null; } });

    while (!done || lastYielded < eventQueue.length) {
      if (lastYielded < eventQueue.length) {
        while (lastYielded < eventQueue.length) {
          yield eventQueue[lastYielded++];
        }
      } else {
        await new Promise<void>(resolve => { notifyResolve = resolve; });
      }
    }

    // Flush remaining
    if (buffer.trim()) {
      const result = parseClaudeSSE(buffer + '\n');
      for (const event of result.events) {
        yield event;
      }
    }

    await streamPromise;
  }

  private buildRequestBody(request: ChatRequest): Record<string, unknown> {
    const messages = this.convertMessages(request.messages);
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 8192,
      messages,
      stream: true,
    };

    if (request.system) {
      body.system = request.system;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = this.buildToolDefinitions(request.tools);
    }

    if (request.thinking?.type === 'enabled') {
      body.thinking = { type: 'enabled', budget_tokens: request.thinking.budget_tokens };
    }

    return body;
  }

  private convertMessages(messages: ApiMessage[]): unknown[] {
    return messages.map(msg => {
      if (msg.role === 'user') {
        return { role: 'user', content: msg.content };
      }
      if (msg.role === 'assistant') {
        return { role: 'assistant', content: msg.content };
      }
      if (msg.role === 'tool') {
        return {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: msg.content,
          }],
        };
      }
      return msg;
    });
  }
}

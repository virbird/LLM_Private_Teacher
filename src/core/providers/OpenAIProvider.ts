import type { ProviderCapabilities, ModelInfo } from '../types/provider';
import type { ProviderToolDefinition, NormalizedToolCall } from '../types/tools';
import type { LlmProvider, ChatRequest, StreamEvent } from './LlmProvider';
import { streamRequest } from '../../utils/request';
import { parseOpenAISSE } from '../agent/StreamingParser';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAIProvider implements LlmProvider {
  readonly id = 'openai' as const;
  readonly capabilities: ProviderCapabilities = {
    providerId: 'openai',
    displayName: 'OpenAI',
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsVision: true,
    reasoningControl: 'none',
    maxContextTokens: 128000,
  };

  constructor(private apiKey: string) {}

  getModels(): ModelInfo[] {
    return [
      { id: 'gpt-4o', displayName: 'GPT-4o', contextWindow: 128000, supportsTools: true, supportsThinking: false, supportsVision: true },
      { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', contextWindow: 128000, supportsTools: true, supportsThinking: false, supportsVision: true },
      { id: 'o3', displayName: 'o3', contextWindow: 200000, supportsTools: true, supportsThinking: false, supportsVision: true },
    ];
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
    const body = this.buildRequestBody(request);
    let buffer = '';
    const eventQueue: StreamEvent[] = [];

    const streamPromise = streamRequest(
      {
        url: OPENAI_API_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      },
      (chunk) => {
        buffer += chunk;
        const result = parseOpenAISSE(buffer);
        buffer = result.remaining;
        eventQueue.push(...result.events);
      },
    );

    let lastYielded = 0;
    let done = false;
    streamPromise.then(() => { done = true; }).catch(() => { done = true; });

    while (!done || lastYielded < eventQueue.length) {
      if (lastYielded < eventQueue.length) {
        while (lastYielded < eventQueue.length) yield eventQueue[lastYielded++];
      } else {
        await new Promise(r => window.setTimeout(r, 20));
      }
    }

    if (buffer.trim()) {
      const result = parseOpenAISSE(buffer + '\n');
      for (const event of result.events) yield event;
    }

    await streamPromise;
  }

  private buildRequestBody(request: ChatRequest): Record<string, unknown> {
    const messages: unknown[] = [];
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    for (const msg of request.messages) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: msg.content });
      } else if (msg.role === 'tool') {
        messages.push({ role: 'tool', tool_call_id: msg.tool_call_id, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      stream: true,
    };

    if (request.maxTokens) body.max_tokens = request.maxTokens;
    if (request.tools && request.tools.length > 0) {
      body.tools = this.buildToolDefinitions(request.tools);
    }

    return body;
  }
}

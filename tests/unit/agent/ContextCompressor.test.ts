import { ContextCompressor } from '../../../src/core/agent/ContextCompressor';
import type { LlmProvider, ChatRequest, StreamEvent } from '../../../src/core/providers/LlmProvider';
import type { ChatMessage } from '../../../src/core/types/chat';
import type { ProviderCapabilities, ModelInfo, ProviderId } from '../../../src/core/types/provider';
import type { ProviderToolDefinition, NormalizedToolCall } from '../../../src/core/types/tools';

/** Mock provider that returns a fixed summary string */
class MockSummaryProvider implements LlmProvider {
  readonly id: ProviderId = 'anthropic';
  readonly capabilities: ProviderCapabilities = {
    providerId: 'anthropic',
    displayName: 'Mock',
    supportsStreaming: true,
    supportsToolUse: false,
    supportsThinking: false,
    supportsVision: false,
    reasoningControl: 'none',
    maxContextTokens: 200000,
  };

  private summaryText: string;
  private shouldError: boolean;
  callCount = 0;

  constructor(summaryText = 'Summary of conversation', shouldError = false) {
    this.summaryText = summaryText;
    this.shouldError = shouldError;
  }

  async *chat(_request: ChatRequest): AsyncGenerator<StreamEvent> {
    this.callCount++;
    if (this.shouldError) {
      yield { type: 'error', message: 'API error' };
      return;
    }
    yield { type: 'text_delta', text: this.summaryText };
    yield { type: 'message_end', stopReason: 'end_turn' };
  }

  getModels(): ModelInfo[] { return []; }
  buildToolDefinitions(tools: ProviderToolDefinition[]): unknown[] { return tools; }
  normalizeToolCall(raw: unknown): NormalizedToolCall {
    return raw as NormalizedToolCall;
  }
}

/** Helper: create N mock messages */
function makeMessages(count: number): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (let i = 0; i < count; i++) {
    msgs.push({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `Message ${i}`,
      timestamp: Date.now() + i,
    });
  }
  return msgs;
}

describe('ContextCompressor', () => {
  it('should split messages correctly keeping the last keepCount', async () => {
    const messages = makeMessages(30);
    const provider = new MockSummaryProvider('Test summary');
    const keepCount = 20;

    const result = await ContextCompressor.compress(messages, keepCount, provider, 'test-model');

    expect(result.keptMessages).toHaveLength(keepCount);
    expect(result.keptMessages[0].id).toBe('msg-10');
    expect(result.keptMessages[keepCount - 1].id).toBe('msg-29');
  });

  it('should return summary from provider', async () => {
    const messages = makeMessages(30);
    const provider = new MockSummaryProvider('Topics: physics, math');

    const result = await ContextCompressor.compress(messages, 20, provider, 'test-model');

    expect(result.summary).toBe('Topics: physics, math');
    expect(provider.callCount).toBe(1);
  });

  it('should return empty summary when no messages to compress', async () => {
    const messages = makeMessages(10);
    const provider = new MockSummaryProvider();

    const result = await ContextCompressor.compress(messages, 20, provider, 'test-model');

    expect(result.summary).toBe('');
    expect(result.keptMessages).toHaveLength(10);
    expect(provider.callCount).toBe(0);
  });

  it('should throw on provider error', async () => {
    const messages = makeMessages(30);
    const provider = new MockSummaryProvider('summary', true);

    await expect(
      ContextCompressor.compress(messages, 20, provider, 'test-model'),
    ).rejects.toThrow('API error');
  });
});

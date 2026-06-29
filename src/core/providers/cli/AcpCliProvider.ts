import type { ProviderCapabilities, ModelInfo, ProviderId } from '../../types/provider';
import type { ProviderToolDefinition, NormalizedToolCall } from '../../types/tools';
import type { LlmProvider, ChatRequest, StreamEvent } from '../LlmProvider';
import { CliSubprocess } from './CliSubprocess';
import { JsonRpcTransport } from './JsonRpcTransport';
import { serializeMessages } from './messageSerializer';

/**
 * ACP (Agent Client Protocol) CLI provider — uses `--acp` persistent subprocess
 * with JSON-RPC 2.0 protocol.
 *
 * Flow:
 * 1. Start server (once): <cli> --acp
 * 2. initialize → initialized notification
 * 3. Per chat(): session/new (if needed) → session/prompt → receive notifications → turn/done
 *
 * This is a generic ACP provider. The `id` and `displayName` are passed in
 * the constructor, allowing OpenCodeCliProvider to reuse the same logic
 * with a different CLI binary.
 */
export class AcpCliProvider implements LlmProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;

  private subprocess: CliSubprocess | null = null;
  private transport: JsonRpcTransport | null = null;
  private sessionId: string | null = null;

  constructor(
    private cliPath: string,
    private model: string,
    private maxTokens: number,
    id: ProviderId = 'acp-cli',
    displayName = 'ACP CLI (Local)',
  ) {
    this.id = id;
    this.capabilities = {
      providerId: id,
      displayName,
      supportsStreaming: true,
      supportsToolUse: true,
      supportsThinking: true,
      supportsVision: false,
      reasoningControl: 'none',
      maxContextTokens: 200000,
    };
  }

  private async ensureServer(): Promise<JsonRpcTransport> {
    if (this.subprocess?.isAlive && this.transport) return this.transport;

    this.subprocess = new CliSubprocess({
      command: this.cliPath,
      args: ['--acp'],
      cwd: process.env.HOME ?? process.cwd(),
    });

    this.subprocess.onExit(() => {
      this.subprocess = null;
      this.transport = null;
      this.sessionId = null;
    });

    this.subprocess.start();
    this.transport = new JsonRpcTransport(this.subprocess);
    this.transport.start();

    // ACP initialize handshake
    await this.transport.request('initialize', {
      protocolVersion: 1,
      clientInfo: { name: 'ai-study-buddy', version: '1.0' },
    });
    this.transport.notify('initialized');

    return this.transport;
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const transport = await this.ensureServer();

    const prompt = request.system
      ? `${request.system}\n\n${serializeMessages(request.messages)}`
      : serializeMessages(request.messages);

    // Create or reuse session
    if (!this.sessionId) {
      const result = await transport.request<{ sessionId: string }>('session/new');
      this.sessionId = result.sessionId;
    }

    // Abort handling
    let aborted = false;
    if (request.signal) {
      if (request.signal.aborted) {
        aborted = true;
        this.subprocess?.kill();
      } else {
        request.signal.addEventListener('abort', () => {
          aborted = true;
          this.subprocess?.kill();
        }, { once: true });
      }
    }

    yield { type: 'message_start' };

    if (aborted) {
      yield { type: 'message_end', stopReason: 'aborted' };
      return;
    }

    // Event queue for streaming
    const eventQueue: StreamEvent[] = [];
    let done = false;
    let resolveWait: (() => void) | null = null;

    const signalNewEvent = () => {
      resolveWait?.();
      resolveWait = null;
    };

    const unsub = transport.onNotification('session/update', (params: unknown) => {
      const p = params as Record<string, unknown>;
      const evtType = p.type as string;

      if (evtType === 'text' || evtType === 'text_delta') {
        eventQueue.push({ type: 'text_delta', text: p.text as string });
      } else if (evtType === 'thinking' || evtType === 'thinking_delta') {
        eventQueue.push({ type: 'thinking_delta', text: p.text as string });
      } else if (evtType === 'tool_use') {
        const id = (p.id as string) ?? 'tool_call';
        const name = p.name as string;
        const input = p.input as Record<string, unknown>;
        eventQueue.push({ type: 'tool_call_start', id, name });
        eventQueue.push({ type: 'tool_call_delta', id, inputJson: JSON.stringify(input) });
        eventQueue.push({ type: 'tool_call_end', id });
      } else if (evtType === 'usage') {
        const usage = (p.usage as Record<string, unknown>) ?? p;
        eventQueue.push({
          type: 'usage',
          inputTokens: (usage.input_tokens as number) ?? 0,
          outputTokens: (usage.output_tokens as number) ?? 0,
        });
      } else if (evtType === 'turn/done' || evtType === 'done') {
        done = true;
        eventQueue.push({ type: 'message_end', stopReason: 'end_turn' });
      } else if (evtType === 'error') {
        done = true;
        eventQueue.push({ type: 'error', message: (p.message as string) ?? 'ACP CLI error' });
        eventQueue.push({ type: 'message_end', stopReason: 'end_turn' });
      }

      signalNewEvent();
    });

    // Send session/prompt request
    try {
      await transport.request('session/prompt', {
        sessionId: this.sessionId,
        prompt,
        model: request.model || this.model,
      });
    } catch (error) {
      unsub();
      yield {
        type: 'error',
        message: `Failed to send prompt: ${error instanceof Error ? error.message : String(error)}`,
      };
      yield { type: 'message_end', stopReason: 'end_turn' };
      return;
    }

    // Consume events
    while (!done && !aborted) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      } else {
        await new Promise<void>(resolve => { resolveWait = resolve; });
      }
    }

    // Drain remaining events
    while (eventQueue.length > 0) {
      yield eventQueue.shift()!;
    }

    unsub();
  }

  getModels(): ModelInfo[] {
    return [
      { id: this.model, displayName: this.model, contextWindow: 200000, supportsTools: true, supportsThinking: false, supportsVision: false },
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
}

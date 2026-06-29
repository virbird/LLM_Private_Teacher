import type { ProviderCapabilities, ModelInfo } from '../../types/provider';
import type { ProviderToolDefinition, NormalizedToolCall } from '../../types/tools';
import type { LlmProvider, ChatRequest, StreamEvent } from '../LlmProvider';
import { CliSubprocess } from './CliSubprocess';
import { JsonRpcTransport } from './JsonRpcTransport';
import { serializeMessages } from './messageSerializer';

/**
 * Codex CLI provider — uses `codex --app-server` persistent subprocess
 * with JSON-RPC 2.0 protocol.
 *
 * Flow:
 * 1. Start server (once): codex --app-server
 * 2. initialize → initialized notification
 * 3. Per chat(): thread/start → turn/start → receive notifications → turn/done
 */
export class CodexCliProvider implements LlmProvider {
  readonly id = 'codex-cli' as const;
  readonly capabilities: ProviderCapabilities = {
    providerId: 'codex-cli',
    displayName: 'Codex CLI (Local)',
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: true,
    supportsVision: false,
    reasoningControl: 'effort',
    maxContextTokens: 200000,
  };

  private subprocess: CliSubprocess | null = null;
  private transport: JsonRpcTransport | null = null;
  private threadId: string | null = null;

  constructor(
    private cliPath: string,
    private model: string,
    private maxTokens: number,
  ) {}

  private async ensureServer(): Promise<JsonRpcTransport> {
    if (this.subprocess?.isAlive && this.transport) return this.transport;

    this.subprocess = new CliSubprocess({
      command: this.cliPath,
      args: ['--app-server'],
      cwd: process.env.HOME ?? process.cwd(),
    });

    this.subprocess.onExit(() => {
      this.subprocess = null;
      this.transport = null;
      this.threadId = null;
    });

    this.subprocess.start();
    this.transport = new JsonRpcTransport(this.subprocess);
    this.transport.start();

    // Initialize handshake
    await this.transport.request('initialize', {
      client_info: { name: 'ai-study-buddy', version: '1.0' },
    });
    this.transport.notify('initialized');

    return this.transport;
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const transport = await this.ensureServer();

    const prompt = request.system
      ? `${request.system}\n\n${serializeMessages(request.messages)}`
      : serializeMessages(request.messages);

    // Create or reuse thread
    if (!this.threadId) {
      const result = await transport.request<{ thread_id: string }>('thread/start');
      this.threadId = result.thread_id;
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
        eventQueue.push({ type: 'error', message: (p.message as string) ?? 'Codex CLI error' });
        eventQueue.push({ type: 'message_end', stopReason: 'end_turn' });
      }

      signalNewEvent();
    });

    // Send turn/start request
    try {
      await transport.request('turn/start', {
        thread_id: this.threadId,
        prompt,
        model: request.model || this.model,
      });
    } catch (error) {
      unsub();
      yield {
        type: 'error',
        message: `Failed to start turn: ${error instanceof Error ? error.message : String(error)}`,
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
    const known = [
      { id: 'o3', displayName: 'OpenAI o3', contextWindow: 200000, supportsTools: true, supportsThinking: true, supportsVision: false },
      { id: 'o4-mini', displayName: 'OpenAI o4-mini', contextWindow: 200000, supportsTools: true, supportsThinking: true, supportsVision: false },
    ];
    if (!known.some(m => m.id === this.model)) {
      return [
        { id: this.model, displayName: this.model, contextWindow: 200000, supportsTools: true, supportsThinking: true, supportsVision: false },
        ...known,
      ];
    }
    return known;
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

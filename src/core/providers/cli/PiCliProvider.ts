import type { Readable } from 'stream';

import type { ProviderCapabilities, ModelInfo } from '../../types/provider';
import type { ProviderToolDefinition, NormalizedToolCall } from '../../types/tools';
import type { LlmProvider, ChatRequest, StreamEvent } from '../LlmProvider';
import { CliSubprocess } from './CliSubprocess';
import { serializeMessages } from './messageSerializer';

/**
 * Pi CLI provider — uses `pi --mode rpc` persistent subprocess.
 *
 * Communication is via JSONL (newline-delimited JSON):
 * - Send: { type: "prompt", message: "..." }
 * - Receive: { type: "text"|"thinking"|"usage"|"done"|"error", ... }
 *
 * The subprocess persists across chat() calls for lower latency.
 */
export class PiCliProvider implements LlmProvider {
  readonly id = 'pi-cli' as const;
  readonly capabilities: ProviderCapabilities = {
    providerId: 'pi-cli',
    displayName: 'Pi CLI (Local)',
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: true,
    supportsVision: false,
    reasoningControl: 'none',
    maxContextTokens: 200000,
  };

  private subprocess: CliSubprocess | null = null;
  private lineBuffer = '';

  constructor(
    private cliPath: string,
    private model: string,
    private maxTokens: number,
  ) {}

  /**
   * Ensure the persistent subprocess is alive; start it if not.
   */
  private ensureProcess(): CliSubprocess {
    if (this.subprocess?.isAlive) return this.subprocess;

    this.subprocess = new CliSubprocess({
      command: this.cliPath,
      args: ['--mode', 'rpc', '--model', this.model],
      cwd: process.env.HOME ?? process.cwd(),
    });

    this.subprocess.onExit(() => {
      this.subprocess = null;
      this.lineBuffer = '';
    });

    this.subprocess.start();
    return this.subprocess;
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const proc = this.ensureProcess();

    const prompt = request.system
      ? `${request.system}\n\n${serializeMessages(request.messages)}`
      : serializeMessages(request.messages);

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

    // Capture stderr for error reporting
    let stderrText = '';
    proc.stderr.on('data', (chunk: Buffer | string) => {
      stderrText += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    });

    // Send prompt request
    proc.stdin.write(JSON.stringify({ type: 'prompt', message: prompt }) + '\n');

    yield { type: 'message_start' };

    if (aborted) {
      yield { type: 'message_end', stopReason: 'aborted' };
      return;
    }

    try {
      yield* this.readJsonlStream(proc.stdout);
    } catch (error) {
      if (!aborted) {
        const errMsg = error instanceof Error ? error.message : String(error);
        yield {
          type: 'error',
          message: stderrText.trim() ? `${errMsg}\n${stderrText.trim()}` : errMsg,
        };
      }
    }
  }

  private async *readJsonlStream(stdout: Readable): AsyncGenerator<StreamEvent> {
    let sawMessageEnd = false;

    for await (const chunk of stdout as AsyncIterable<Buffer>) {
      this.lineBuffer += chunk.toString();
      const lines = this.lineBuffer.split('\n');
      this.lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line) as Record<string, unknown>;
          for (const event of this.mapPiEvent(evt)) {
            if (event.type === 'message_end') sawMessageEnd = true;
            yield event;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }

    // Process remaining buffer
    if (this.lineBuffer.trim()) {
      try {
        const evt = JSON.parse(this.lineBuffer) as Record<string, unknown>;
        for (const event of this.mapPiEvent(evt)) {
          if (event.type === 'message_end') sawMessageEnd = true;
          yield event;
        }
      } catch {
        // Skip invalid final buffer
      }
    }

    this.lineBuffer = '';

    if (!sawMessageEnd) {
      yield { type: 'message_end', stopReason: 'end_turn' };
    }
  }

  private *mapPiEvent(evt: Record<string, unknown>): Generator<StreamEvent> {
    const type = evt.type as string;

    if (type === 'text') {
      yield { type: 'text_delta', text: evt.text as string };
    } else if (type === 'thinking') {
      yield { type: 'thinking_delta', text: evt.text as string };
    } else if (type === 'tool_use') {
      const id = (evt.id as string) ?? 'tool_call';
      const name = evt.name as string;
      const input = evt.input as Record<string, unknown>;
      yield { type: 'tool_call_start', id, name };
      yield { type: 'tool_call_delta', id, inputJson: JSON.stringify(input) };
      yield { type: 'tool_call_end', id };
    } else if (type === 'usage') {
      const usage = evt.usage as Record<string, unknown> ?? evt;
      yield {
        type: 'usage',
        inputTokens: (usage.input_tokens as number) ?? (usage.inputTokens as number) ?? 0,
        outputTokens: (usage.output_tokens as number) ?? (usage.outputTokens as number) ?? 0,
      };
    } else if (type === 'done') {
      yield { type: 'message_end', stopReason: 'end_turn' };
    } else if (type === 'error') {
      const message = (evt.message as string) ?? (evt.error as string) ?? 'Unknown Pi CLI error';
      yield { type: 'error', message };
    }
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

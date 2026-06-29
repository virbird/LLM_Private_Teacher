// eslint-disable-next-line obsidianmd/no-nodejs-modules -- Required for typing CLI subprocess stdio (Electron environment)
import type { Readable } from 'stream';

import type { ProviderCapabilities, ModelInfo } from '../../types/provider';
import type { ProviderToolDefinition, NormalizedToolCall } from '../../types/tools';
import type { LlmProvider, ChatRequest, StreamEvent } from '../LlmProvider';
import { CliSubprocess } from './CliSubprocess';
import { serializeMessages } from './messageSerializer';

/**
 * Claude CLI provider — uses `claude -p` (print mode) as a one-shot LLM call.
 *
 * Each chat() call spawns a fresh `claude` process with --output-format stream-json,
 * parses stdout JSON lines, and maps them to StreamEvent.
 *
 * Tools are NOT passed to the CLI — the CLI acts as a pure LLM.
 * Tool execution is managed by AgentLoop + ToolExecutor as usual.
 */
export class ClaudeCliProvider implements LlmProvider {
  readonly id = 'claude-cli' as const;
  readonly capabilities: ProviderCapabilities = {
    providerId: 'claude-cli',
    displayName: 'Claude CLI (Local)',
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: true,
    supportsVision: false,
    reasoningControl: 'budget',
    maxContextTokens: 200000,
  };

  constructor(
    private cliPath: string,
    private model: string,
    private maxTokens: number,
  ) {}

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const prompt = request.system
      ? `${request.system}\n\n${serializeMessages(request.messages)}`
      : serializeMessages(request.messages);

    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--model', request.model || this.model,
    ];
    if (request.maxTokens ?? this.maxTokens) {
      args.push('--max-tokens', String(request.maxTokens ?? this.maxTokens));
    }
    if (request.thinking?.type === 'enabled' && request.thinking.budget_tokens > 0) {
      args.push('--thinking-budget', String(request.thinking.budget_tokens));
    }

    const subprocess = new CliSubprocess({
      command: this.cliPath,
      args,
      cwd: process.env.HOME ?? process.cwd(),
    });

    try {
      subprocess.start();
    } catch (error) {
      yield { type: 'error', message: `Failed to start Claude CLI: ${error instanceof Error ? error.message : String(error)}` };
      return;
    }

    // Abort handling — do not pass signal to spawn (Obsidian Electron realm issue)
    let aborted = false;
    if (request.signal) {
      if (request.signal.aborted) {
        aborted = true;
        subprocess.kill();
      } else {
        const onAbort = () => {
          aborted = true;
          subprocess.kill();
        };
        request.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    // Capture stderr for error reporting
    let stderrText = '';
    subprocess.stderr.on('data', (chunk: Buffer | string) => {
      stderrText += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    });

    yield { type: 'message_start' };

    if (aborted) {
      yield { type: 'message_end', stopReason: 'aborted' };
      return;
    }

    try {
      yield* this.parseStreamJson(subprocess.stdout);
    } catch (error) {
      if (!aborted) {
        const errMsg = error instanceof Error ? error.message : String(error);
        yield { type: 'error', message: stderrText.trim() ? `${errMsg}\n${stderrText.trim()}` : errMsg };
      }
    }

    // If no message_end was emitted (process exited without result), emit one
    // parseStreamJson will have already emitted message_end if it saw a result message
  }

  private async *parseStreamJson(stdout: Readable): AsyncGenerator<StreamEvent> {
    let buffer = '';
    let sawMessageEnd = false;

    for await (const chunk of stdout as AsyncIterable<Buffer>) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          for (const event of this.mapCliMessageToEvents(msg)) {
            if (event.type === 'message_end') sawMessageEnd = true;
            yield event;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }

    // Process any remaining buffered content
    if (buffer.trim()) {
      try {
        const msg = JSON.parse(buffer) as Record<string, unknown>;
        for (const event of this.mapCliMessageToEvents(msg)) {
          if (event.type === 'message_end') sawMessageEnd = true;
          yield event;
        }
      } catch {
        // Skip invalid final buffer
      }
    }

    // Ensure message_end is always emitted
    if (!sawMessageEnd) {
      yield { type: 'message_end', stopReason: 'end_turn' };
    }
  }

  private *mapCliMessageToEvents(msg: Record<string, unknown>): Generator<StreamEvent> {
    const type = msg.type as string;

    if (type === 'stream_event') {
      const evt = msg.event as Record<string, unknown>;
      const eventType = evt.type as string;

      if (eventType === 'content_block_delta') {
        const delta = evt.delta as Record<string, unknown>;
        const deltaType = delta.type as string;

        if (deltaType === 'text_delta') {
          yield { type: 'text_delta', text: delta.text as string };
        } else if (deltaType === 'thinking_delta') {
          yield { type: 'thinking_delta', text: delta.thinking as string };
        }
      }
    } else if (type === 'assistant') {
      const message = msg.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (content) {
        for (const block of content) {
          if (block.type === 'tool_use') {
            yield { type: 'tool_call_start', id: block.id as string, name: block.name as string };
            yield {
              type: 'tool_call_delta',
              id: block.id as string,
              inputJson: JSON.stringify(block.input),
            };
            yield { type: 'tool_call_end', id: block.id as string };
          }
        }
      }
    } else if (type === 'result') {
      const usage = msg.usage as Record<string, unknown> | undefined;
      if (usage) {
        yield {
          type: 'usage',
          inputTokens: (usage.input_tokens as number) ?? 0,
          outputTokens: (usage.output_tokens as number) ?? 0,
          cacheCreationTokens: usage.cache_creation_input_tokens as number | undefined,
          cacheReadTokens: usage.cache_read_input_tokens as number | undefined,
        };
      }
      const subtype = msg.subtype as string;
      yield {
        type: 'message_end',
        stopReason: subtype === 'success' ? 'end_turn' : (subtype === 'error_max_tokens' ? 'max_tokens' : 'end_turn'),
      };
    } else if (type === 'error') {
      const message = (msg.message as string) ?? (msg.error as string) ?? 'Unknown CLI error';
      yield { type: 'error', message };
    }
  }

  getModels(): ModelInfo[] {
    // Return configured model + known defaults (deduplicated)
    const known = [
      { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', contextWindow: 200000, supportsTools: true, supportsThinking: true, supportsVision: false },
      { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', contextWindow: 200000, supportsTools: true, supportsThinking: true, supportsVision: false },
      { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', contextWindow: 200000, supportsTools: true, supportsThinking: false, supportsVision: false },
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
    // Same format as AnthropicProvider — Claude CLI uses the same API schema
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

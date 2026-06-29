import { Readable, EventEmitter } from 'stream';
import type { ChatRequest, StreamEvent } from '../../src/core/providers/LlmProvider';

// Mock child_process.spawn
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

import { spawn } from 'child_process';
import { ClaudeCliProvider } from '../../src/core/providers/cli/ClaudeCliProvider';

/**
 * Create a mock ChildProcess with controllable stdout/stderr streams.
 */
function createMockChild() {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const child = new EventEmitter() as any;
  child.stdin = { write: jest.fn(), end: jest.fn() };
  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = 12345;
  child.exitCode = null;
  child.killed = false;
  child.kill = jest.fn(() => {
    child.killed = true;
    child.exitCode = 0;
    child.emit('exit', 0, null);
  });
  return child;
}

/**
 * Feed JSON lines to the mock stdout stream, then close it.
 */
function feedStdout(child: any, lines: string[]) {
  for (const line of lines) {
    child.stdout.push(line + '\n');
  }
  child.stdout.push(null); // end
}

/**
 * Collect all StreamEvents from a chat() call.
 */
async function collectEvents(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

describe('ClaudeCliProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('capabilities', () => {
    it('should have correct provider id', () => {
      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      expect(provider.id).toBe('claude-cli');
    });

    it('should have correct display name', () => {
      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      expect(provider.capabilities.displayName).toBe('Claude CLI (Local)');
    });

    it('should support streaming, tools, and thinking', () => {
      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      expect(provider.capabilities.supportsStreaming).toBe(true);
      expect(provider.capabilities.supportsToolUse).toBe(true);
      expect(provider.capabilities.supportsThinking).toBe(true);
    });
  });

  describe('chat() event mapping', () => {
    it('should map text_delta stream events', async () => {
      const mockChild = createMockChild();
      (spawn as jest.Mock).mockReturnValue(mockChild);

      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-20250514',
        stream: true,
      };

      const gen = provider.chat(request);

      // Wait for message_start, then feed stdout
      const firstEvent = await gen.next();
      expect(firstEvent.value).toEqual({ type: 'message_start' });

      feedStdout(mockChild, [
        JSON.stringify({
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello!' } },
        }),
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      ]);

      const events: StreamEvent[] = [];
      for await (const event of gen) {
        events.push(event);
      }

      expect(events).toContainEqual({ type: 'text_delta', text: 'Hello!' });
      expect(events).toContainEqual({ type: 'usage', inputTokens: 10, outputTokens: 5, cacheCreationTokens: undefined, cacheReadTokens: undefined });
      const endEvent = events.find(e => e.type === 'message_end');
      expect(endEvent).toBeDefined();
      expect((endEvent as any).stopReason).toBe('end_turn');
    });

    it('should map thinking_delta stream events', async () => {
      const mockChild = createMockChild();
      (spawn as jest.Mock).mockReturnValue(mockChild);

      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Think about this' }],
        model: 'claude-sonnet-4-20250514',
        stream: true,
      };

      const gen = provider.chat(request);
      await gen.next(); // message_start

      feedStdout(mockChild, [
        JSON.stringify({
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Let me think...' } },
        }),
        JSON.stringify({ type: 'result', subtype: 'success', usage: { input_tokens: 5, output_tokens: 10 } }),
      ]);

      const events = await collectEvents(gen);
      expect(events).toContainEqual({ type: 'thinking_delta', text: 'Let me think...' });
    });

    it('should map assistant tool_use blocks', async () => {
      const mockChild = createMockChild();
      (spawn as jest.Mock).mockReturnValue(mockChild);

      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Read file' }],
        model: 'claude-sonnet-4-20250514',
        stream: true,
      };

      const gen = provider.chat(request);
      await gen.next(); // message_start

      feedStdout(mockChild, [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 'tool_1', name: 'read_file', input: { path: 'test.txt' } },
            ],
          },
        }),
        JSON.stringify({ type: 'result', subtype: 'success', usage: { input_tokens: 5, output_tokens: 10 } }),
      ]);

      const events = await collectEvents(gen);
      expect(events).toContainEqual({ type: 'tool_call_start', id: 'tool_1', name: 'read_file' });
      expect(events.some(e => e.type === 'tool_call_delta' && e.id === 'tool_1')).toBe(true);
      expect(events).toContainEqual({ type: 'tool_call_end', id: 'tool_1' });
    });

    it('should map error messages from CLI', async () => {
      const mockChild = createMockChild();
      (spawn as jest.Mock).mockReturnValue(mockChild);

      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-20250514',
        stream: true,
      };

      const gen = provider.chat(request);
      await gen.next(); // message_start

      feedStdout(mockChild, [
        JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }),
        JSON.stringify({ type: 'result', subtype: 'error', usage: { input_tokens: 0, output_tokens: 0 } }),
      ]);

      const events = await collectEvents(gen);
      expect(events).toContainEqual({ type: 'error', message: 'Rate limit exceeded' });
    });

    it('should emit message_end even when process exits without result', async () => {
      const mockChild = createMockChild();
      (spawn as jest.Mock).mockReturnValue(mockChild);

      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-20250514',
        stream: true,
      };

      const gen = provider.chat(request);
      await gen.next(); // message_start

      // Feed only a text_delta, no result message
      feedStdout(mockChild, [
        JSON.stringify({
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
        }),
      ]);

      const events = await collectEvents(gen);
      const endEvent = events.find(e => e.type === 'message_end');
      expect(endEvent).toBeDefined();
    });
  });

  describe('abort handling', () => {
    it('should kill subprocess when signal is already aborted', async () => {
      const mockChild = createMockChild();
      (spawn as jest.Mock).mockReturnValue(mockChild);

      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      const controller = new AbortController();
      controller.abort();

      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-20250514',
        stream: true,
        signal: controller.signal,
      };

      const events = await collectEvents(provider.chat(request));
      expect(mockChild.kill).toHaveBeenCalled();
      const endEvent = events.find(e => e.type === 'message_end');
      expect(endEvent).toBeDefined();
      expect((endEvent as any).stopReason).toBe('aborted');
    });

    it('should kill subprocess when signal aborts during streaming', async () => {
      const mockChild = createMockChild();
      (spawn as jest.Mock).mockReturnValue(mockChild);

      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      const controller = new AbortController();

      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-20250514',
        stream: true,
        signal: controller.signal,
      };

      const gen = provider.chat(request);
      await gen.next(); // message_start

      // Abort during streaming
      controller.abort();

      // Feed some data after abort
      feedStdout(mockChild, [
        JSON.stringify({ type: 'result', subtype: 'success', usage: { input_tokens: 5, output_tokens: 5 } }),
      ]);

      const events = await collectEvents(gen);
      expect(mockChild.kill).toHaveBeenCalled();
    });
  });

  describe('getModels()', () => {
    it('should return Claude models', () => {
      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      const models = provider.getModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id === 'claude-sonnet-4-20250514')).toBe(true);
      expect(models.some(m => m.id === 'claude-opus-4-20250514')).toBe(true);
    });
  });

  describe('buildToolDefinitions()', () => {
    it('should return Anthropic-compatible tool definitions', () => {
      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      const tools = [
        { name: 'read_file', description: 'Read a file', input_schema: { type: 'object', properties: {} } },
      ];
      const result = provider.buildToolDefinitions(tools);
      expect(result).toHaveLength(1);
      expect((result[0] as any).name).toBe('read_file');
      expect((result[0] as any).input_schema).toBeDefined();
    });
  });

  describe('normalizeToolCall()', () => {
    it('should normalize a tool call object', () => {
      const provider = new ClaudeCliProvider('/usr/local/bin/claude', 'claude-sonnet-4-20250514', 8192);
      const result = provider.normalizeToolCall({
        id: 'call_1',
        name: 'read_file',
        input: { path: 'test.txt' },
      });
      expect(result).toEqual({ id: 'call_1', name: 'read_file', input: { path: 'test.txt' } });
    });
  });
});

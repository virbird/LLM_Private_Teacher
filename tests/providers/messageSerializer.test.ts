import { serializeMessages } from '../../src/core/providers/cli/messageSerializer';
import type { ApiMessage } from '../../src/core/types/chat';

describe('serializeMessages', () => {
  it('should serialize a simple user message', () => {
    const messages: ApiMessage[] = [
      { role: 'user', content: 'Hello, how are you?' },
    ];
    const result = serializeMessages(messages);
    expect(result).toBe('Human: Hello, how are you?');
  });

  it('should serialize a simple assistant message', () => {
    const messages: ApiMessage[] = [
      { role: 'assistant', content: 'I am fine, thank you!' },
    ];
    const result = serializeMessages(messages);
    expect(result).toBe('Assistant: I am fine, thank you!');
  });

  it('should serialize multiple messages with proper separators', () => {
    const messages: ApiMessage[] = [
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: '4' },
      { role: 'user', content: 'Thanks!' },
    ];
    const result = serializeMessages(messages);
    expect(result).toBe('Human: What is 2+2?\n\nAssistant: 4\n\nHuman: Thanks!');
  });

  it('should serialize tool result messages', () => {
    const messages: ApiMessage[] = [
      { role: 'user', content: 'Read file.txt' },
      { role: 'tool', tool_call_id: 'call_123', content: 'File contents here' },
    ];
    const result = serializeMessages(messages);
    expect(result).toContain('[Tool Result (call_123)]: File contents here');
  });

  it('should serialize assistant messages with content blocks', () => {
    const messages: ApiMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me read that file.' },
          { type: 'tool_use', id: 'call_456', name: 'read_file', input: { path: 'test.txt' } },
        ],
      },
    ];
    const result = serializeMessages(messages);
    expect(result).toContain('Assistant: Let me read that file.');
    expect(result).toContain('[Tool Call: read_file(');
  });

  it('should skip thinking blocks in serialization', () => {
    const messages: ApiMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', text: 'internal reasoning...' },
          { type: 'text', text: 'Here is my answer.' },
        ],
      },
    ];
    const result = serializeMessages(messages);
    expect(result).not.toContain('internal reasoning');
    expect(result).toContain('Assistant: Here is my answer.');
  });

  it('should handle empty messages array', () => {
    const result = serializeMessages([]);
    expect(result).toBe('');
  });
});

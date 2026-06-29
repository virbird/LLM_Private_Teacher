import type { ApiMessage, AssistantContent } from '../../types/chat';

/**
 * Serializes a ChatRequest messages array into a single text prompt
 * for CLI providers that only accept a string prompt (e.g. `claude -p "..."`).
 */
export function serializeMessages(messages: ApiMessage[]): string {
  return messages.map(msg => {
    if (msg.role === 'tool') {
      return `[Tool Result (${msg.tool_call_id})]: ${msg.content}`;
    }

    if (typeof msg.content === 'string') {
      return msg.role === 'user' ? `Human: ${msg.content}` : `Assistant: ${msg.content}`;
    }

    // Array content (user ContentPart[] or assistant AssistantContent[])
    const parts: string[] = [];
    for (const block of msg.content as Array<Record<string, unknown>>) {
      const b = block as AssistantContent & { type: string };
      if (b.type === 'text') {
        parts.push(b.text);
      } else if (b.type === 'tool_use') {
        parts.push(`[Tool Call: ${b.name}(${JSON.stringify(b.input)})]`);
      } else if (b.type === 'thinking') {
        // Skip thinking blocks in serialization — they are internal
      }
    }
    const text = parts.filter(Boolean).join('\n');
    return msg.role === 'user' ? `Human: ${text}` : `Assistant: ${text}`;
  }).join('\n\n');
}

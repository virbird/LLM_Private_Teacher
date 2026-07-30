import type { ApiMessage } from '../../types/chat';

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
      const type = block.type as string;
      if (type === 'text') {
        parts.push(block.text as string);
      } else if (type === 'tool_use') {
        parts.push(`[Tool Call: ${block.name as string}(${JSON.stringify(block.input)})]`);
      } else if (type === 'image') {
        // CLI providers cannot transmit images; note the attachment for context
        parts.push('[Image attached — not viewable via CLI provider]');
      } else if (type === 'thinking') {
        // Skip thinking blocks in serialization — they are internal
      }
    }
    const text = parts.filter(Boolean).join('\n');
    return msg.role === 'user' ? `Human: ${text}` : `Assistant: ${text}`;
  }).join('\n\n');
}

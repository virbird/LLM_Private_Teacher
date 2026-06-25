import type { StreamEvent } from '../providers/LlmProvider';

export function parseClaudeSSE(buffer: string): { events: StreamEvent[]; remaining: string } {
  const events: StreamEvent[] = [];
  const lines = buffer.split('\n');
  const remaining = lines.pop() ?? '';
  let currentEvent = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('event:')) {
      currentEvent = trimmed.slice(6).trim();
    } else if (trimmed.startsWith('data:')) {
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;
      try {
        const data = JSON.parse(jsonStr);
        const parsed = handleClaudeEvent(data);
        events.push(...parsed);
      } catch {
        // skip malformed JSON lines
      }
    }
  }
  return { events, remaining };
}

function handleClaudeEvent(data: Record<string, unknown>): StreamEvent[] {
  const events: StreamEvent[] = [];
  const type = data.type as string;

  switch (type) {
    case 'message_start': {
      events.push({ type: 'message_start' });
      const msg = data.message as Record<string, unknown> | undefined;
      const usage = msg?.usage as Record<string, number> | undefined;
      if (usage) {
        events.push({
          type: 'usage',
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: 0,
          cacheCreationTokens: usage.cache_creation_input_tokens,
          cacheReadTokens: usage.cache_read_input_tokens,
        });
      }
      break;
    }
    case 'content_block_start': {
      const block = data.content_block as Record<string, unknown>;
      if (block?.type === 'tool_use') {
        events.push({ type: 'tool_call_start', id: block.id as string, name: block.name as string });
      }
      break;
    }
    case 'content_block_delta': {
      const delta = data.delta as Record<string, unknown>;
      if (delta?.type === 'text_delta') {
        events.push({ type: 'text_delta', text: delta.text as string });
      } else if (delta?.type === 'thinking_delta') {
        events.push({ type: 'thinking_delta', text: delta.thinking as string });
      } else if (delta?.type === 'input_json_delta') {
        const idx = data.index as number;
        events.push({ type: 'tool_call_delta', id: `block_${idx}`, inputJson: delta.partial_json as string });
      }
      break;
    }
    case 'content_block_stop': {
      const idx = data.index as number;
      events.push({ type: 'tool_call_end', id: `block_${idx}` });
      break;
    }
    case 'message_delta': {
      const delta = data.delta as Record<string, unknown>;
      const usage = data.usage as Record<string, number> | undefined;
      events.push({
        type: 'message_end',
        stopReason: (delta?.stop_reason as string) ?? 'end_turn',
      });
      if (usage) {
        events.push({ type: 'usage', inputTokens: 0, outputTokens: usage.output_tokens ?? 0 });
      }
      break;
    }
    case 'message_stop':
      break;
    case 'error': {
      events.push({ type: 'error', message: (data.message as string) ?? 'Unknown error' });
      break;
    }
  }
  return events;
}

export function parseOpenAISSE(buffer: string): { events: StreamEvent[]; remaining: string } {
  const events: StreamEvent[] = [];
  const lines = buffer.split('\n');
  const remaining = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') {
      events.push({ type: 'message_end', stopReason: 'end_turn' });
      return { events, remaining: '' };
    }
    try {
      const data = JSON.parse(payload);
      const choice = data.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta ?? {};
      if (delta.content) {
        events.push({ type: 'text_delta', text: delta.content });
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            events.push({ type: 'tool_call_start', id: tc.id, name: tc.function?.name ?? '' });
          }
          if (tc.function?.arguments) {
            events.push({ type: 'tool_call_delta', id: tc.id ?? '', inputJson: tc.function.arguments });
          }
        }
      }
      if (choice.finish_reason) {
        if (choice.finish_reason === 'tool_calls') {
          events.push({ type: 'message_end', stopReason: 'tool_use' });
        } else {
          events.push({ type: 'message_end', stopReason: choice.finish_reason });
        }
      }
    } catch {
      // skip malformed
    }
  }
  return { events, remaining };
}

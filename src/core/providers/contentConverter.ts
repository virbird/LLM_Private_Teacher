/**
 * Converts internal ContentPart[] (Anthropic-style) to OpenAI-compatible
 * multimodal content format for chat completion requests.
 */
import type { ContentPart } from '../types/chat';

/**
 * Convert user ContentPart[] to OpenAI content array:
 * - text parts → { type: 'text', text }
 * - image parts → { type: 'image_url', image_url: { url: 'data:<mime>;base64,<data>' } }
 */
export function toOpenAIUserContent(parts: ContentPart[]): unknown[] {
  return parts.map(p => {
    if (p.type === 'text') {
      return { type: 'text', text: p.text };
    }
    return {
      type: 'image_url',
      image_url: { url: `data:${p.source.media_type};base64,${p.source.data}` },
    };
  });
}

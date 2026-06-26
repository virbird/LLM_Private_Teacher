import type { LlmProvider, ChatRequest } from '../providers/LlmProvider';
import type { ChatMessage, ApiMessage } from '../types/chat';

export interface CompressResult {
  summary: string;
  keptMessages: ChatMessage[];
}

const SUMMARY_SYSTEM =
  'You are a conversation summarizer. Summarize the conversation concisely, ' +
  'preserving: key topics discussed, important facts/decisions, context needed for future questions. ' +
  'Output in the same language as the conversation. Be concise but complete.';

const SUMMARY_PROMPT =
  'Please summarize the above conversation. Focus on: ' +
  '1) Topics discussed 2) Key conclusions and decisions 3) Important context for future questions. ' +
  'Output a structured summary in markdown.';

export class ContextCompressor {
  /**
   * Compress old messages into a summary, keeping the most recent `keepCount` messages.
   * @param messages  All chat messages
   * @param keepCount Number of recent messages to keep (not rounds)
   * @param provider  LLM provider for summarization
   * @param model     Model name
   * @param signal    Optional abort signal
   */
  static async compress(
    messages: ChatMessage[],
    keepCount: number,
    provider: LlmProvider,
    model: string,
    signal?: AbortSignal,
  ): Promise<CompressResult> {
    const toCompress = messages.slice(0, messages.length - keepCount);
    const keptMessages = messages.slice(messages.length - keepCount);

    if (toCompress.length === 0) {
      return { summary: '', keptMessages };
    }

    // Build API messages from old chat messages
    const apiMessages: ApiMessage[] = toCompress
      .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
      .map(m => ({ role: m.role, content: m.content } as ApiMessage));

    const summaryRequest: ChatRequest = {
      messages: [
        ...apiMessages,
        { role: 'user', content: SUMMARY_PROMPT },
      ],
      model,
      system: SUMMARY_SYSTEM,
      maxTokens: 1024,
      stream: true,
      signal,
    };

    let summary = '';
    for await (const event of provider.chat(summaryRequest)) {
      if (event.type === 'text_delta') summary += event.text;
      if (event.type === 'error') throw new Error(event.message);
    }

    return { summary, keptMessages };
  }
}

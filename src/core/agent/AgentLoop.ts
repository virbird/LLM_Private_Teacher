import type { LlmProvider, ChatRequest } from '../providers/LlmProvider';
import type { ApiMessage, StreamChunk, AssistantContent, UsageInfo } from '../types/chat';
import type { ToolCallInfo } from '../types/tools';
import type { ToolExecutor } from '../tools/ToolExecutor';

export interface AgentLoopConfig {
  provider: LlmProvider;
  toolExecutor: ToolExecutor;
  systemPrompt: string;
  model: string;
  maxTokens?: number;
  maxIterations?: number;
  thinking?: { type: 'enabled'; budget_tokens: number } | { type: 'disabled' };
  onStreamChunk: (chunk: StreamChunk) => void;
  signal?: AbortSignal;
}

export interface AgentLoopResult {
  finalText: string;
  totalUsage: UsageInfo;
  toolCalls: ToolCallInfo[];
  iterations: number;
  stopReason: 'end_turn' | 'max_tokens' | 'max_iterations' | 'aborted';
}

export class AgentLoop {
  async run(messages: ApiMessage[], config: AgentLoopConfig): Promise<AgentLoopResult> {
    const maxIter = config.maxIterations ?? 25;
    const allToolCalls: ToolCallInfo[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let iterations = 0;
    let finalText = '';

    while (iterations < maxIter) {
      if (config.signal?.aborted) break;
      iterations++;

      const request: ChatRequest = {
        messages,
        model: config.model,
        system: config.systemPrompt,
        tools: config.toolExecutor.getDefinitions(config.provider.id),
        maxTokens: config.maxTokens,
        thinking: config.thinking,
        stream: true,
        signal: config.signal,
      };

      let assistantText = '';
      let stopReason = 'end_turn';
      const pendingToolCalls: { id: string; name: string; inputBuffer: string }[] = [];
      let currentToolId = '';

      config.onStreamChunk({ type: 'assistant_message_start' });

      for await (const event of config.provider.chat(request)) {
        if (config.signal?.aborted) break;
        switch (event.type) {
          case 'text_delta':
            assistantText += event.text;
            config.onStreamChunk({ type: 'text', content: event.text });
            break;
          case 'thinking_delta':
            config.onStreamChunk({ type: 'thinking', content: event.text });
            break;
          case 'tool_call_start':
            currentToolId = event.id;
            pendingToolCalls.push({ id: event.id, name: event.name, inputBuffer: '' });
            break;
          case 'tool_call_delta': {
            const tc = pendingToolCalls.find(t => t.id === event.id || t.id === currentToolId);
            if (tc) tc.inputBuffer += event.inputJson;
            break;
          }
          case 'tool_call_end':
            break;
          case 'usage':
            totalInputTokens += event.inputTokens;
            totalOutputTokens += event.outputTokens;
            break;
          case 'message_end':
            stopReason = event.stopReason;
            break;
          case 'error':
            config.onStreamChunk({ type: 'error', content: event.message });
            break;
        }
      }

      finalText += assistantText;

      if (pendingToolCalls.length === 0 || stopReason !== 'tool_use') {
        config.onStreamChunk({ type: 'done' });
        break;
      }

      // Build assistant message with tool_use blocks
      const assistantContent: AssistantContent[] = [];
      if (assistantText) assistantContent.push({ type: 'text', text: assistantText });

      const toolResultMessages: ApiMessage[] = [];
      for (const tc of pendingToolCalls) {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.inputBuffer || '{}') as Record<string, unknown>; } catch { /* empty */ }

        const toolCall: ToolCallInfo = { id: tc.id, name: tc.name, input, status: 'running' };
        allToolCalls.push(toolCall);

        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
        config.onStreamChunk({ type: 'tool_use', id: tc.id, name: tc.name, input });

        const result = await config.toolExecutor.execute(tc.name, input, config.signal);
        toolCall.status = result.isError ? 'error' : 'completed';
        toolCall.result = result.content;

        config.onStreamChunk({ type: 'tool_result', id: tc.id, content: result.content, isError: !!result.isError });
        toolResultMessages.push({ role: 'tool', tool_call_id: tc.id, content: result.content });
      }

      messages.push({ role: 'assistant', content: assistantContent });
      messages.push(...toolResultMessages);
    }

    const maxContext = config.provider.capabilities.maxContextTokens;
    return {
      finalText,
      totalUsage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        contextWindow: maxContext,
        contextTokens: totalInputTokens,
        percentage: maxContext > 0 ? (totalInputTokens / maxContext) * 100 : 0,
      },
      toolCalls: allToolCalls,
      iterations,
      stopReason: config.signal?.aborted ? 'aborted' : iterations >= maxIter ? 'max_iterations' : 'end_turn',
    };
  }
}

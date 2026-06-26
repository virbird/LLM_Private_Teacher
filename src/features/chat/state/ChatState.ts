import type { ChatMessage, StreamChunk, UsageInfo, ToolCallDisplay } from '../../../core/types/chat';

export interface ChatStateCallbacks {
  onMessagesChanged: () => void;
  onStreamingChanged: (isStreaming: boolean) => void;
  onUsageChanged: (usage: UsageInfo | null) => void;
}

export class ChatState {
  messages: ChatMessage[] = [];
  isStreaming = false;
  currentTextContent = '';
  currentThinkingContent = '';
  currentToolCalls: ToolCallDisplay[] = [];
  usage: UsageInfo | null = null;
  isCompressing = false;
  autoScrollEnabled = true;
  conversationId = '';
  selectedMessageIds = new Set<string>();
  private onSelectionChanged?: () => void;

  private callbacks: ChatStateCallbacks;

  constructor(callbacks: ChatStateCallbacks) {
    this.callbacks = callbacks;
  }

  setOnSelectionChanged(fn: () => void): void {
    this.onSelectionChanged = fn;
  }

  toggleSelection(id: string): void {
    if (this.selectedMessageIds.has(id)) {
      this.selectedMessageIds.delete(id);
    } else {
      this.selectedMessageIds.add(id);
    }
    this.onSelectionChanged?.();
    this.callbacks.onMessagesChanged();
  }

  clearSelection(): void {
    this.selectedMessageIds.clear();
    this.onSelectionChanged?.();
    this.callbacks.onMessagesChanged();
  }

  getSelectedCount(): number {
    return this.selectedMessageIds.size;
  }

  addUserMessage(content: string): ChatMessage {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    this.messages.push(msg);
    this.callbacks.onMessagesChanged();
    return msg;
  }

  startAssistantMessage(): ChatMessage {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      thinkingBlocks: [],
      timestamp: Date.now(),
    };
    this.messages.push(msg);
    this.isStreaming = true;
    this.currentTextContent = '';
    this.currentThinkingContent = '';
    this.currentToolCalls = [];
    this.callbacks.onStreamingChanged(true);
    this.callbacks.onMessagesChanged();
    return msg;
  }

  handleStreamChunk(chunk: StreamChunk): void {
    const lastMsg = this.messages[this.messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    switch (chunk.type) {
      case 'text':
        this.currentTextContent += chunk.content;
        lastMsg.content = this.currentTextContent;
        this.callbacks.onMessagesChanged();
        break;
      case 'thinking':
        this.currentThinkingContent += chunk.content;
        break;
      case 'tool_use': {
        const tc: ToolCallDisplay = {
          id: chunk.id, name: chunk.name,
          input: chunk.input, status: 'running',
        };
        this.currentToolCalls.push(tc);
        lastMsg.toolCalls = [...this.currentToolCalls];
        this.callbacks.onMessagesChanged();
        break;
      }
      case 'tool_result': {
        const tc = this.currentToolCalls.find(t => t.id === chunk.id);
        if (tc) {
          tc.result = chunk.content;
          tc.isError = chunk.isError;
          tc.status = chunk.isError ? 'error' : 'completed';
          lastMsg.toolCalls = [...this.currentToolCalls];
          this.callbacks.onMessagesChanged();
        }
        break;
      }
      case 'done':
        if (this.currentThinkingContent) {
          lastMsg.thinkingBlocks = [...(lastMsg.thinkingBlocks ?? []), this.currentThinkingContent];
        }
        this.isStreaming = false;
        this.callbacks.onStreamingChanged(false);
        this.callbacks.onMessagesChanged();
        break;
      case 'error':
        lastMsg.content += `\n\n**Error**: ${chunk.content}`;
        this.isStreaming = false;
        this.callbacks.onStreamingChanged(false);
        this.callbacks.onMessagesChanged();
        break;
    }
  }

  setUsage(usage: UsageInfo): void {
    this.usage = usage;
    this.callbacks.onUsageChanged(usage);
  }

  compressMessages(summary: string, keptMessages: ChatMessage[]): void {
    const summaryMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `<conversation_summary>\n${summary}\n</conversation_summary>`,
      timestamp: Date.now(),
      isSummary: true,
    };
    this.messages = [summaryMsg, ...keptMessages];
    this.usage = null;
    this.callbacks.onMessagesChanged();
  }

  clear(): void {
    this.messages = [];
    this.isStreaming = false;
    this.currentTextContent = '';
    this.usage = null;
    this.selectedMessageIds.clear();
    this.callbacks.onMessagesChanged();
    this.callbacks.onStreamingChanged(false);
    this.onSelectionChanged?.();
  }
}

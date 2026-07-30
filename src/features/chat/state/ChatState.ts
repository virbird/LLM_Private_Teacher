import type { ChatMessage, StreamChunk, UsageInfo, ToolCallDisplay, ContentPart } from '../../../core/types/chat';

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
  /**
   * Image attachments per user message id (in-memory only, not persisted).
   * Keeps recent images available for follow-up turns without bloating session files.
   */
  private imageAttachments = new Map<string, ContentPart[]>();
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

  /** Ids of assistant messages that can be saved to a note */
  getSelectableIds(): string[] {
    return this.messages
      .filter(m => m.role === 'assistant' && m.content)
      .map(m => m.id);
  }

  /** Select every saveable assistant message */
  selectAll(): void {
    for (const id of this.getSelectableIds()) {
      this.selectedMessageIds.add(id);
    }
    this.onSelectionChanged?.();
    this.callbacks.onMessagesChanged();
  }

  getSelectedCount(): number {
    return this.selectedMessageIds.size;
  }

  /** Attach resolved image content parts to a user message (in-memory only) */
  attachImages(messageId: string, parts: ContentPart[]): void {
    if (parts.length > 0) {
      this.imageAttachments.set(messageId, parts);
    }
  }

  /** Get image content parts previously attached to a user message */
  getImages(messageId: string): ContentPart[] | undefined {
    return this.imageAttachments.get(messageId);
  }

  /** Returns true if any message in the conversation has image attachments */
  hasImages(): boolean {
    return this.imageAttachments.size > 0;
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
    // Drop image attachments for messages no longer in the conversation
    const keptIds = new Set(keptMessages.map(m => m.id));
    for (const id of [...this.imageAttachments.keys()]) {
      if (!keptIds.has(id)) this.imageAttachments.delete(id);
    }
    this.usage = null;
    this.callbacks.onMessagesChanged();
  }

  clear(): void {
    this.messages = [];
    this.isStreaming = false;
    this.currentTextContent = '';
    this.usage = null;
    this.selectedMessageIds.clear();
    this.imageAttachments.clear();
    this.callbacks.onMessagesChanged();
    this.callbacks.onStreamingChanged(false);
    this.callbacks.onUsageChanged(null);
    this.onSelectionChanged?.();
  }
}

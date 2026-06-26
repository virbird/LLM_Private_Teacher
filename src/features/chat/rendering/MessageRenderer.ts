import { MarkdownRenderer, type App, type Component } from 'obsidian';
import type { ChatMessage } from '../../../core/types/chat';

export interface RenderOptions {
  selectedIds: Set<string>;
  onToggle?: (id: string) => void;
  /** ID of the message currently being streamed (checkbox disabled) */
  streamingMsgId?: string;
}

export class MessageRenderer {
  constructor(private app: App, private containerEl: HTMLElement) {}

  renderAll(messages: ChatMessage[], component: Component, opts: RenderOptions): void {
    this.containerEl.empty();
    for (const msg of messages) {
      this.renderMessage(msg, component, opts);
    }
  }

  renderMessage(msg: ChatMessage, component: Component, opts: RenderOptions): HTMLElement {
    const msgEl = this.containerEl.createDiv({ cls: `claudian-message claudian-message-${msg.role}` });

    if (msg.isSummary) {
      msgEl.addClass('claudian-summary-message');
    }

    const headerEl = msgEl.createDiv({ cls: 'claudian-message-header' });
    headerEl.createSpan({ cls: 'claudian-message-role', text: msg.isSummary ? '📝 Summary' : (msg.role === 'user' ? 'You' : 'AI Study Buddy') });

    // Checkbox for assistant messages only
    if (msg.role === 'assistant') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'claudian-checkbox';
      cb.checked = opts.selectedIds.has(msg.id);
      // Disable checkbox while this message is still streaming
      if (opts.streamingMsgId === msg.id) {
        cb.disabled = true;
      }
      cb.onclick = (e) => {
        e.stopPropagation();
        opts.onToggle?.(msg.id);
      };
      headerEl.appendChild(cb);
      console.log('[AI Study Buddy] checkbox created for msg:', msg.id.substring(0, 8));
    }

    const contentEl = msgEl.createDiv({ cls: 'claudian-message-content' });

    if (msg.role === 'user') {
      contentEl.createSpan({ text: msg.content });
    } else {
      // Render thinking blocks
      if (msg.thinkingBlocks?.length) {
        for (const thinking of msg.thinkingBlocks) {
          const thinkEl = contentEl.createDiv({ cls: 'claudian-thinking' });
          const details = thinkEl.createEl('details');
          details.createEl('summary', { text: 'Thinking...' });
          const thinkContent = details.createDiv({ cls: 'claudian-thinking-content' });
          void MarkdownRenderer.render(this.app, thinking, thinkContent, '', component);
        }
      }

      // Render tool calls
      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          const tcEl = contentEl.createDiv({ cls: `claudian-tool-call claudian-tool-${tc.status}` });
          tcEl.createDiv({ cls: 'claudian-tool-header', text: `🔧 ${tc.name}` });
          const inputEl = tcEl.createDiv({ cls: 'claudian-tool-input' });
          inputEl.createEl('pre', { text: JSON.stringify(tc.input, null, 2) });
          if (tc.result) {
            const resultEl = tcEl.createDiv({ cls: `claudian-tool-result ${tc.isError ? 'claudian-tool-error' : ''}` });
            const details = resultEl.createEl('details');
            details.createEl('summary', { text: tc.isError ? 'Error' : 'Result' });
            const resultContent = details.createDiv();
            void MarkdownRenderer.render(this.app, tc.result, resultContent, '', component);
          }
        }
      }

      // Render main text content
      if (msg.content) {
        const mdEl = contentEl.createDiv({ cls: 'claudian-markdown-content' });
        void MarkdownRenderer.render(this.app, msg.content, mdEl, '', component);
      }
    }

    return msgEl;
  }

  updateLastMessage(msg: ChatMessage, component: Component, opts: RenderOptions): void {
    const existing = this.containerEl.lastElementChild;
    if (existing) existing.remove();
    this.renderMessage(msg, component, opts);
  }
}

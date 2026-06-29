import { Plugin, type Editor, type Menu, Platform } from 'obsidian';
import type { PluginSettings } from './core/types/settings';
import { ProviderRegistry } from './core/providers/ProviderRegistry';
import { AnthropicProvider } from './core/providers/AnthropicProvider';
import { OpenAIProvider } from './core/providers/OpenAIProvider';
import { OpenAICompatProvider } from './core/providers/OpenAICompatProvider';
import { ClaudeCliProvider } from './core/providers/cli/ClaudeCliProvider';
import { PiCliProvider } from './core/providers/cli/PiCliProvider';
import { CodexCliProvider } from './core/providers/cli/CodexCliProvider';
import { AcpCliProvider } from './core/providers/cli/AcpCliProvider';
import { OpenCodeCliProvider } from './core/providers/cli/OpenCodeCliProvider';
import { CliResolver } from './core/providers/cli/CliResolver';
import { VaultStorage } from './core/storage/VaultStorage';
import { SessionStorage } from './core/storage/SessionStorage';
import { SettingsStorage } from './core/storage/SettingsStorage';
import { setLocale } from './core/i18n';
import { ChatView, VIEW_TYPE_CLAUDIAN } from './features/chat/ChatView';
import { ClaudianSettingsTab } from './features/settings/SettingsTab';

export default class ClaudianPlugin extends Plugin {
  declare settings: PluginSettings;
  sessionStorage!: SessionStorage;
  private vaultStorage!: VaultStorage;
  private settingsStorage!: SettingsStorage;

  /**
   * Get the current editor selection.
   * On iPad, editor.getSelection() may return empty at the time editor-menu fires.
   * Fall back to window.getSelection() which reflects the native iOS text selection.
   */
  private getEditorSelection(editor: Editor): string {
    let selection = editor.getSelection();
    if (!selection) {
      selection = window.getSelection()?.toString() ?? '';
    }
    return selection;
  }

  async onload() {
    this.vaultStorage = new VaultStorage(this.app);
    this.sessionStorage = new SessionStorage(this.vaultStorage);
    this.settingsStorage = new SettingsStorage(this.vaultStorage);

    this.settings = await this.settingsStorage.load();
    setLocale(this.settings.locale || 'en');
    this.refreshProviders();

    this.registerView(VIEW_TYPE_CLAUDIAN, (leaf) => new ChatView(leaf, this));

    this.addRibbonIcon('bot', 'Open AI Study Buddy', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-chat-view',
      name: 'Open chat view',
      callback: () => { void this.activateView(); },
    });

    // --- Quote to conversation ---
    this.addCommand({
      id: 'quote-selection',
      name: 'Quote selection to chat',
      editorCallback: (editor: Editor) => {
        const selection = this.getEditorSelection(editor);
        if (!selection.trim()) return;
        const file = this.app.workspace.getActiveFile();
        const filePath = file?.path ?? 'current file';
        const quoted = this.buildQuote(filePath, selection);
        void this.insertQuoteToChat(quoted);
      },
    });

    // --- Inline edit commands ---
    this.addCommand({
      id: 'edit-selection',
      name: 'Edit selection with AI',
      editorCallback: (editor: Editor) => {
        const selection = this.getEditorSelection(editor);
        if (!selection.trim()) return;
        const file = this.app.workspace.getActiveFile();
        const filePath = file?.path ?? 'current file';
        const prompt = `Please improve/edit the following text from "${filePath}". ` +
          `Keep the same language and style, just improve clarity, grammar, and flow. ` +
          `Output ONLY the improved text, no explanations.\n\n${selection}`;
        void this.sendToChat(prompt);
      },
    });

    this.addCommand({
      id: 'explain-selection',
      name: 'Explain selection with AI',
      editorCallback: (editor: Editor) => {
        const selection = this.getEditorSelection(editor);
        if (!selection.trim()) return;
        const prompt = `Please explain the following content clearly and concisely:\n\n${selection}`;
        void this.sendToChat(prompt);
      },
    });

    this.addCommand({
      id: 'translate-selection',
      name: 'Translate selection with AI',
      editorCallback: (editor: Editor) => {
        const selection = this.getEditorSelection(editor);
        if (!selection.trim()) return;
        const prompt = `Please translate the following text. If it's in English, translate to Chinese. ` +
          `If it's in Chinese, translate to English. Output ONLY the translation.\n\n${selection}`;
        void this.sendToChat(prompt);
      },
    });

    this.addCommand({
      id: 'summarize-selection',
      name: 'Summarize selection with AI',
      editorCallback: (editor: Editor) => {
        const selection = this.getEditorSelection(editor);
        if (!selection.trim()) return;
        const prompt = `Please provide a concise summary of the following content:\n\n${selection}`;
        void this.sendToChat(prompt);
      },
    });

    // --- Right-click context menu ---
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
        const selection = this.getEditorSelection(editor);
        if (!selection.trim()) return;

        menu.addSeparator();

        menu.addItem(item => {
          item.setTitle('💬 Quote to chat')
            .setIcon('message-square-quote')
            .onClick(() => {
              const file = this.app.workspace.getActiveFile();
              const filePath = file?.path ?? 'current file';
              const quoted = this.buildQuote(filePath, selection);
              void this.insertQuoteToChat(quoted);
            });
        });

        menu.addItem(item => {
          item.setTitle('✏️ Edit')
            .setIcon('pencil')
            .onClick(() => {
              const file = this.app.workspace.getActiveFile();
              const filePath = file?.path ?? 'current file';
              const prompt = `Please improve/edit the following text from "${filePath}". ` +
                `Keep the same language and style, just improve clarity, grammar, and flow. ` +
                `Output ONLY the improved text, no explanations.\n\n${selection}`;
              void this.sendToChat(prompt);
            });
        });

        menu.addItem(item => {
          item.setTitle('🔍 Explain')
            .setIcon('info')
            .onClick(() => {
              const prompt = `Please explain the following content clearly and concisely:\n\n${selection}`;
              void this.sendToChat(prompt);
            });
        });

        menu.addItem(item => {
          item.setTitle('🌐 Translate')
            .setIcon('languages')
            .onClick(() => {
              const prompt = `Please translate the following text. If it's in English, translate to Chinese. ` +
                `If it's in Chinese, translate to English. Output ONLY the translation.\n\n${selection}`;
              void this.sendToChat(prompt);
            });
        });

        menu.addItem(item => {
          item.setTitle('📝 Summarize')
            .setIcon('file-text')
            .onClick(() => {
              const prompt = `Please provide a concise summary of the following content:\n\n${selection}`;
              void this.sendToChat(prompt);
            });
        });
      })
    );

    this.addSettingTab(new ClaudianSettingsTab(this.app, this));
  }

  refreshProviders(): void {
    ProviderRegistry.clear();
    const { anthropic, openai, openaiCompat, claudeCli, piCli, codexCli, acpCli, opencodeCli } = this.settings.providers;
    if (anthropic.apiKey) ProviderRegistry.register(new AnthropicProvider(anthropic.apiKey));
    if (openai.apiKey) ProviderRegistry.register(new OpenAIProvider(openai.apiKey));
    if (openaiCompat.apiKey && openaiCompat.baseUrl && openaiCompat.model) {
      ProviderRegistry.register(new OpenAICompatProvider(
        openaiCompat.baseUrl, openaiCompat.apiKey, openaiCompat.model,
        openaiCompat.contextWindow, openaiCompat.customHeaders, openaiCompat.customModels,
      ));
    }
    // CLI providers — desktop only
    if (Platform.isDesktopApp) {
      const claudePath = CliResolver.resolve(claudeCli.cliPath, ['claude']);
      if (claudePath) {
        ProviderRegistry.register(new ClaudeCliProvider(
          claudePath, claudeCli.model, claudeCli.maxTokens,
        ));
      }
      const piPath = CliResolver.resolve(piCli.cliPath, ['pi']);
      if (piPath) {
        ProviderRegistry.register(new PiCliProvider(
          piPath, piCli.model, piCli.maxTokens,
        ));
      }
      const codexPath = CliResolver.resolve(codexCli.cliPath, ['codex']);
      if (codexPath) {
        ProviderRegistry.register(new CodexCliProvider(
          codexPath, codexCli.model, codexCli.maxTokens,
        ));
      }
      const acpPath = CliResolver.resolve(acpCli.cliPath, ['acp']);
      if (acpPath) {
        ProviderRegistry.register(new AcpCliProvider(
          acpPath, acpCli.model, acpCli.maxTokens,
        ));
      }
      const opencodePath = CliResolver.resolve(opencodeCli.cliPath, ['opencode']);
      if (opencodePath) {
        ProviderRegistry.register(new OpenCodeCliProvider(
          opencodePath, opencodeCli.model, opencodeCli.maxTokens,
        ));
      }
    }
  }

  async saveSettings(): Promise<void> {
    this.refreshProviders();
    await this.settingsStorage.save(this.settings);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CLAUDIAN)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({ type: VIEW_TYPE_CLAUDIAN, active: true });
      }
    }
    if (leaf) await workspace.revealLeaf(leaf);
  }

  private buildQuote(filePath: string, selection: string): string {
    // Truncate long selections for the quote display
    const truncated = selection.length > 2000
      ? selection.substring(0, 2000) + '\n...(truncated)'
      : selection;
    return `> 📄 **${filePath}**\n> ${truncated.split('\n').join('\n> ')}\n\n`;
  }

  /** Insert quoted text into the chat input (doesn't auto-send, lets user add their question) */
  private async insertQuoteToChat(quotedText: string): Promise<void> {
    await this.activateView();
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDIAN);
    if (leaves.length > 0) {
      const view = leaves[0].view as ChatView;
      view.insertText(quotedText);
    }
  }

  /** Send text directly (auto-sends the message) */
  private async sendToChat(text: string): Promise<void> {
    await this.activateView();
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDIAN);
    if (leaves.length > 0) {
      const view = leaves[0].view as ChatView;
      view.sendText(text);
    }
  }
}

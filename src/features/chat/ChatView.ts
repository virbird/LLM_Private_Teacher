import { ItemView, Component, SuggestModal, Notice, MarkdownRenderer, TFile, TFolder, type App, type WorkspaceLeaf } from 'obsidian';
import type ClaudianPlugin from '../../main';
import { ChatState } from './state/ChatState';
import { MessageRenderer } from './rendering/MessageRenderer';
import { AgentLoop } from '../../core/agent/AgentLoop';
import { ToolExecutor } from '../../core/tools/ToolExecutor';
import { ToolRegistry } from '../../core/tools/ToolRegistry';
import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import { buildSystemPrompt } from '../../core/prompt/systemPrompt';
import { ROLE_PRESETS, type RolePreset } from '../../core/prompt/roles';
import { MethodRegistry } from '../../core/learning/MethodRegistry';
import type { ApiMessage, Conversation } from '../../core/types/chat';
import type { LearningMaterial } from '../../core/types/settings';
import type { ProviderId } from '../../core/types/provider';
import type { ConversationMeta } from '../../core/storage/SessionStorage';
import { ReadFileTool } from '../../core/tools/tools/ReadFileTool';
import { WriteFileTool } from '../../core/tools/tools/WriteFileTool';
import { EditFileTool } from '../../core/tools/tools/EditFileTool';
import { ListFilesTool } from '../../core/tools/tools/ListFilesTool';
import { SearchTool } from '../../core/tools/tools/SearchTool';
import { t } from '../../core/i18n';
import { LearningCommandDispatcher, type CommandContext } from '../../core/learning/LearningCommandDispatcher';
import { ContextCompressor } from '../../core/agent/ContextCompressor';
import type { LlmProvider } from '../../core/providers/LlmProvider';
import type { en as EnMap } from '../../core/i18n/en';

export const VIEW_TYPE_CLAUDIAN = 'claudian-api-view';

const REQUEST_TIMEOUT_MS = 300_000; // 300 seconds (5 min) idle timeout

type I18nKey = keyof typeof EnMap;

const BASE_SLASH_COMMANDS = [
  { cmd: '/new', descKey: 'cmd.new' as I18nKey, category: 'general' as const },
  { cmd: '/clear', descKey: 'cmd.clear' as I18nKey, category: 'general' as const },
  { cmd: '/history', descKey: 'cmd.history' as I18nKey, category: 'general' as const },
  { cmd: '/help', descKey: 'cmd.help' as I18nKey, category: 'general' as const },
  { cmd: '/flashcard', descKey: 'cmd.flashcard' as I18nKey, category: 'learning' as const },
  { cmd: '/summary', descKey: 'cmd.summary' as I18nKey, category: 'learning' as const },
  { cmd: '/map', descKey: 'cmd.map' as I18nKey, category: 'learning' as const },
  { cmd: '/plan', descKey: 'cmd.plan' as I18nKey, category: 'learning' as const },
  { cmd: '/review', descKey: 'cmd.review' as I18nKey, category: 'learning' as const },
  { cmd: '/checkup', descKey: 'cmd.checkup' as I18nKey, category: 'learning' as const },
  { cmd: '/stats', descKey: 'cmd.stats' as I18nKey, category: 'learning' as const },
  { cmd: '/mistakes', descKey: 'cmd.mistakes' as I18nKey, category: 'learning' as const },
  { cmd: '/buddy', descKey: 'cmd.buddy' as I18nKey, category: 'learning' as const },
];

function getAllSlashCommands(): Array<{ cmd: string; desc: string; category: string }> {
  const methods = MethodRegistry.getCommandList().map(m => ({
    cmd: m.command,
    desc: `${t(m.i18nKey + '.name' as I18nKey)} — ${t(m.i18nKey + '.desc' as I18nKey)}`,
    category: 'learning',
  }));
  const base = BASE_SLASH_COMMANDS.map(c => ({ cmd: c.cmd, desc: t(c.descKey), category: c.category }));
  return [...base, ...methods];
}

class MaterialPickerModal extends SuggestModal<TFile> {
  private onSelect: (file: TFile) => void;

  constructor(app: App, onSelect: (file: TFile) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder(t('picker.placeholder'));
    this.setInstructions([
      { command: '↑↓', purpose: t('picker.navigate') },
      { command: '↵', purpose: t('picker.select') },
      { command: 'esc', purpose: t('picker.cancel') },
    ]);
  }

  getSuggestions(query: string): TFile[] {
    const files = this.app.vault.getMarkdownFiles();
    const q = query.toLowerCase();
    return files
      .filter(f => f.path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    const container = el.createDiv({ cls: 'claudian-material-picker-item' });
    container.createDiv({ cls: 'claudian-material-picker-title', text: file.basename });
    container.createDiv({ cls: 'claudian-material-picker-path', text: file.path });
  }

  onChooseSuggestion(file: TFile): void {
    this.onSelect(file);
  }
}

export class ChatView extends ItemView {
  plugin: ClaudianPlugin;
  private chatState!: ChatState;
  private messageRenderer!: MessageRenderer;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private statusEl!: HTMLElement;
  private loadingEl!: HTMLElement;
  private headerEl!: HTMLElement;
  private historyEl!: HTMLElement;
  private autocompleteEl!: HTMLElement;
  private providerSelect!: HTMLSelectElement;
  private modelSelect!: HTMLSelectElement;
  private materialSelect!: HTMLSelectElement;
  private abortController: AbortController | null = null;
  private activeRole: RolePreset | null = ROLE_PRESETS[0] ?? null;
  private roleBarEl!: HTMLElement;
  private component!: Component;
  private conversationMetas: ConversationMeta[] = [];
  private helpEl!: HTMLElement;
  private learningDispatcher: LearningCommandDispatcher;
  private stopBtn!: HTMLButtonElement;
  private sendBtn!: HTMLButtonElement;
  private idleTimer: ReturnType<typeof window.setTimeout> | null = null;
  private saveBarEl!: HTMLElement;
  private streamingMsgId = '';

  constructor(leaf: WorkspaceLeaf, plugin: ClaudianPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.learningDispatcher = new LearningCommandDispatcher(plugin.app);
  }

  getViewType(): string { return VIEW_TYPE_CLAUDIAN; }
  getDisplayText(): string { return 'AI Study Buddy'; }
  getIcon(): string { return 'bot'; }

  /** Re-render all UI elements after locale change */
  refreshUI(): void {
    this.buildHeader();
    this.buildRoleBar();
    this.buildHelpPanel();
    this.inputEl.placeholder = t('input.placeholder');
    this.stopBtn.setText(t('stop'));
    this.sendBtn.setText(t('send'));
    // Refresh save bar labels
    this.saveBarEl.empty();
    const countEl = this.saveBarEl.createSpan({ cls: 'claudian-save-bar-count' });
    countEl.textContent = t('note.selectedCount', { count: String(this.chatState.getSelectedCount()) });
    const saveBtn = this.saveBarEl.createEl('button', { cls: 'claudian-btn claudian-btn-send claudian-save-bar-btn', text: t('note.saveSelected') });
    saveBtn.addEventListener('click', () => { void this.saveSelectedNotes(); });
    const clearBtn = this.saveBarEl.createEl('button', { cls: 'claudian-btn claudian-save-bar-btn', text: t('note.clear') });
    clearBtn.addEventListener('click', () => { this.chatState.clearSelection(); });
    this.updateSaveBar();
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('claudian-container');

    // Initialize component early — needed by MarkdownRenderer in buildHelpPanel
    this.component = new Component();

    // Header with provider/model switching + history
    this.headerEl = container.createDiv({ cls: 'claudian-header' });
    this.buildHeader();

    // Role selector bar
    this.roleBarEl = container.createDiv({ cls: 'claudian-role-bar' });
    this.buildRoleBar();

    // Conversation history panel (hidden by default)
    this.historyEl = container.createDiv({ cls: 'claudian-history is-hidden' });

    // Help panel (hidden by default)
    this.helpEl = container.createDiv({ cls: 'claudian-help is-hidden' });
    this.buildHelpPanel();

    // Messages area
    this.messagesEl = container.createDiv({ cls: 'claudian-messages' });

    // Floating save bar (shown when >= 1 message is selected)
    this.saveBarEl = container.createDiv({ cls: 'claudian-save-bar is-hidden' });
    const saveBarCountEl = this.saveBarEl.createSpan({ cls: 'claudian-save-bar-count' });
    saveBarCountEl.textContent = t('note.selectedCount', { count: '0' });
    const saveBtn = this.saveBarEl.createEl('button', { cls: 'claudian-btn claudian-btn-send claudian-save-bar-btn', text: t('note.saveSelected') });
    saveBtn.addEventListener('click', () => { void this.saveSelectedNotes(); });
    const clearBtn = this.saveBarEl.createEl('button', { cls: 'claudian-btn claudian-save-bar-btn', text: t('note.clear') });
    clearBtn.addEventListener('click', () => { this.chatState.clearSelection(); });

    // Input area
    const inputArea = container.createDiv({ cls: 'claudian-input-area' });

    // Autocomplete popup
    this.autocompleteEl = inputArea.createDiv({ cls: 'claudian-autocomplete is-hidden' });

    this.inputEl = inputArea.createEl('textarea', { cls: 'claudian-input' });
    this.inputEl.placeholder = t('input.placeholder');
    this.inputEl.rows = 1;

    // Auto-resize textarea
    this.inputEl.addEventListener('input', () => {
      this.inputEl.setCssStyles({ height: 'auto' });
      this.inputEl.setCssStyles({ height: Math.min(this.inputEl.scrollHeight, 200) + 'px' });
      this.handleAutocomplete();
    });

    // Keyboard handling
    this.inputEl.addEventListener('keydown', (e) => {
      // Autocomplete navigation
      if (!this.autocompleteEl.hasClass('is-hidden')) {
        if (e.key === 'Escape') {
          this.hideAutocomplete();
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          const active = this.autocompleteEl.querySelector('.claudian-ac-item.is-active');
          if (active) {
            e.preventDefault();
            (active as HTMLElement).click();
            return;
          }
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.sendMessage();
      }
    });

    // Toolbar
    const toolbar = inputArea.createDiv({ cls: 'claudian-toolbar' });
    this.statusEl = toolbar.createSpan({ cls: 'claudian-status' });

    const btnGroup = toolbar.createDiv({ cls: 'claudian-btn-group' });

    this.stopBtn = btnGroup.createEl('button', { cls: 'claudian-btn claudian-btn-stop is-hidden', text: t('stop') });
    this.stopBtn.addEventListener('click', () => {
      this.abortController?.abort();
      this.abortController = null;
    });

    this.sendBtn = btnGroup.createEl('button', { cls: 'claudian-btn claudian-btn-send', text: t('send') });
    this.sendBtn.addEventListener('click', () => { void this.sendMessage(); });

    // Loading indicator
    this.loadingEl = this.messagesEl.createDiv({ cls: 'claudian-loading is-hidden' });
    this.loadingEl.createSpan({ cls: 'claudian-loading-spinner' });
    this.loadingEl.createSpan({ text: t('thinking') });

    // Initialize state
    this.chatState = new ChatState({
      onMessagesChanged: () => this.renderMessages(),
      onStreamingChanged: (streaming) => {
        this.stopBtn.toggleClass('is-hidden', !streaming);
        this.sendBtn.disabled = streaming;
        this.inputEl.disabled = streaming;
        this.loadingEl.toggleClass('is-hidden', !streaming);
      },
      onUsageChanged: (usage) => {
        if (usage) {
          this.statusEl.textContent = t('tokens', { in: usage.inputTokens.toLocaleString(), out: usage.outputTokens.toLocaleString(), pct: usage.percentage.toFixed(1) });
        }
      },
    });

    this.messageRenderer = new MessageRenderer(this.app, this.messagesEl);

    // Wire up selection-changed callback to update floating save bar
    this.chatState.setOnSelectionChanged(() => this.updateSaveBar());
  }

  private buildHeader(): void {
    this.headerEl.empty();

    const row1 = this.headerEl.createDiv({ cls: 'claudian-header-row' });

    // New chat button
    const newBtn = row1.createEl('button', { cls: 'claudian-btn claudian-header-btn', text: t('new') });
    newBtn.title = t('new.title');
    newBtn.addEventListener('click', () => this.startNewConversation());

    // History toggle
    const historyBtn = row1.createEl('button', { cls: 'claudian-btn claudian-header-btn', text: t('history') });
    historyBtn.addEventListener('click', () => { void this.toggleHistory(); });

    // Help toggle
    const helpBtn = row1.createEl('button', { cls: 'claudian-btn claudian-header-btn', text: t('help') });
    helpBtn.addEventListener('click', () => this.toggleHelp());

    row1.createDiv({ cls: 'claudian-header-spacer' });

    // Provider dropdown
    row1.createSpan({ cls: 'claudian-header-label', text: t('provider') });
    this.providerSelect = row1.createEl('select', { cls: 'claudian-select claudian-provider-select' });
    this.populateProviderSelect();
    this.providerSelect.addEventListener('change', () => {
      const val = this.providerSelect.value as ProviderId;
      this.plugin.settings.activeProvider = val;
      void this.plugin.saveSettings();
      this.populateModelSelect();
    });

    // Model dropdown
    this.modelSelect = row1.createEl('select', { cls: 'claudian-select claudian-model-select' });
    this.populateModelSelect();
    this.modelSelect.addEventListener('change', () => {
      this.updateActiveModel(this.modelSelect.value);
      void this.plugin.saveSettings();
    });

    // Material dropdown
    row1.createSpan({ cls: 'claudian-header-label', text: t('material') });
    this.materialSelect = row1.createEl('select', { cls: 'claudian-select claudian-material-select' });
    this.populateMaterialSelect();
    this.materialSelect.addEventListener('change', () => {
      this.plugin.settings.activeMaterialPath = this.materialSelect.value;
      void this.plugin.saveSettings();
    });

    const addMaterialBtn = row1.createEl('button', { cls: 'claudian-btn claudian-header-btn claudian-material-add-btn', text: t('addMaterial') });
    addMaterialBtn.title = t('addMaterial.title');
    addMaterialBtn.addEventListener('click', () => this.openMaterialPicker());
  }

  private populateProviderSelect(): void {
    this.providerSelect.empty();
    const providers = ProviderRegistry.getAll();
    const currentActive = this.plugin.settings.activeProvider;

    if (providers.length === 0) {
      this.providerSelect.createEl('option', { text: t('noneConfigured'), value: '' });
      this.providerSelect.disabled = true;
    } else {
      for (const p of providers) {
        const opt = this.providerSelect.createEl('option', {
          text: p.capabilities.displayName,
          value: p.id,
        });
        if (p.id === currentActive) opt.selected = true;
      }
      this.providerSelect.disabled = false;
    }
  }

  private populateModelSelect(): void {
    this.modelSelect.empty();
    const provider = ProviderRegistry.get(this.plugin.settings.activeProvider);
    if (!provider) {
      this.modelSelect.createEl('option', { text: t('noProvider'), value: '' });
      return;
    }

    const models = provider.getModels();
    const currentModel = this.getActiveModel();
    for (const m of models) {
      const opt = this.modelSelect.createEl('option', { text: m.displayName, value: m.id });
      if (m.id === currentModel) opt.selected = true;
    }

    // For openai-compat, allow custom model input
    if (provider.id === 'openai-compat' && models.length === 0) {
      const opt = this.modelSelect.createEl('option', {
        text: this.plugin.settings.providers.openaiCompat.model,
        value: this.plugin.settings.providers.openaiCompat.model,
      });
      opt.selected = true;
    }
  }

  private buildRoleBar(): void {
    this.roleBarEl.empty();
    this.roleBarEl.createSpan({ cls: 'claudian-role-label', text: t('role') });

    // "None" button (default)
    const noneBtn = this.roleBarEl.createEl('button', {
      cls: `claudian-role-btn${this.activeRole === null ? ' is-active' : ''}`,
      text: t('role.none'),
    });
    noneBtn.addEventListener('click', () => {
      this.activeRole = null;
      this.buildRoleBar();
    });

    // Preset role buttons
    for (const role of ROLE_PRESETS) {
      const btn = this.roleBarEl.createEl('button', {
        cls: `claudian-role-btn${this.activeRole?.id === role.id ? ' is-active' : ''}`,
      });
      btn.createSpan({ text: role.icon + ' ' + t((role.i18nKey + '.name') as I18nKey) });
      btn.title = t((role.i18nKey + '.desc') as I18nKey);
      btn.addEventListener('click', () => {
        this.activeRole = this.activeRole?.id === role.id ? null : role;
        this.buildRoleBar();
      });
    }
  }

  private updateActiveModel(modelId: string): void {
    const providerId = this.plugin.settings.activeProvider;
    if (providerId === 'anthropic') this.plugin.settings.providers.anthropic.model = modelId;
    else if (providerId === 'openai') this.plugin.settings.providers.openai.model = modelId;
    else this.plugin.settings.providers.openaiCompat.model = modelId;
  }

  private populateMaterialSelect(): void {
    this.materialSelect.empty();
    this.materialSelect.createEl('option', { text: t('none'), value: '' });

    const confirmed = (this.plugin.settings.learningMaterials || []).filter(m => m.confirmed);
    const activePath = this.plugin.settings.activeMaterialPath;

    // Group by parent folder to mirror Obsidian vault structure
    const grouped = new Map<string, LearningMaterial[]>();
    for (const material of confirmed) {
      const folder = material.path.includes('/')
        ? material.path.substring(0, material.path.lastIndexOf('/'))
        : t('root');
      if (!grouped.has(folder)) grouped.set(folder, []);
      grouped.get(folder)!.push(material);
    }

    const sortedFolders = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
    for (const folder of sortedFolders) {
      const group = this.materialSelect.createEl('optgroup');
      group.setAttribute('label', folder);
      for (const material of grouped.get(folder)!) {
        const displayText = material.path.includes('/')
          ? material.path.split('/').pop() || material.title || material.path
          : material.title || material.path;
        const opt = group.createEl('option', {
          text: displayText,
          value: material.path,
        });
        opt.title = material.path;
        if (material.path === activePath) opt.selected = true;
      }
    }
  }

  private openMaterialPicker(): void {
    const modal = new MaterialPickerModal(this.app, (file) => {
      void this.addMaterial(file);
    });
    modal.open();
  }

  private async addMaterial(file: TFile): Promise<void> {
    const materials = this.plugin.settings.learningMaterials || [];
    if (materials.some(m => m.path === file.path)) {
      // Already exists: confirm it and select it
      const existing = materials.find(m => m.path === file.path);
      if (existing && !existing.confirmed) {
        existing.confirmed = true;
        this.plugin.settings.activeMaterialPath = file.path;
        await this.plugin.saveSettings();
        this.populateMaterialSelect();
        new Notice(t('material.confirmed', { name: file.basename }), 3000);
      } else {
        this.plugin.settings.activeMaterialPath = file.path;
        await this.plugin.saveSettings();
        this.populateMaterialSelect();
        new Notice(t('material.exists', { name: file.basename }), 3000);
      }
      return;
    }

    const newMaterial = {
      path: file.path,
      title: file.basename,
      tags: [],
      confirmed: true,
      createdAt: new Date().toISOString(),
    };
    materials.push(newMaterial);
    this.plugin.settings.learningMaterials = materials;
    this.plugin.settings.activeMaterialPath = file.path;
    await this.plugin.saveSettings();
    this.populateMaterialSelect();
    new Notice(t('material.added', { name: file.basename }), 3000);
  }

  /** Refresh provider/model/material dropdowns and auto-select first available provider */
  private refreshHeader(): void {
    const providers = ProviderRegistry.getAll();

    // Auto-select: if current active provider is not registered, switch to first available
    if (providers.length > 0 && !ProviderRegistry.get(this.plugin.settings.activeProvider)) {
      this.plugin.settings.activeProvider = providers[0].id;
      void this.plugin.saveSettings();
    }

    this.populateProviderSelect();
    this.populateModelSelect();
  }

  // --- Conversation History ---

  private async toggleHistory(): Promise<void> {
    const isVisible = !this.historyEl.hasClass('is-hidden');
    if (isVisible) {
      this.historyEl.addClass('is-hidden');
      return;
    }

    this.historyEl.removeClass('is-hidden');
    this.historyEl.empty();

    const title = this.historyEl.createDiv({ cls: 'claudian-history-title' });
    title.createSpan({ text: t('history.title') });
    const closeBtn = title.createEl('button', { cls: 'claudian-btn claudian-header-btn', text: '✕' });
    closeBtn.addEventListener('click', () => { this.historyEl.addClass('is-hidden'); });

    try {
      this.conversationMetas = await this.plugin.sessionStorage.listAll();
    } catch {
      this.conversationMetas = [];
    }

    if (this.conversationMetas.length === 0) {
      this.historyEl.createDiv({ cls: 'claudian-history-empty', text: t('history.empty') });
      return;
    }

    const list = this.historyEl.createDiv({ cls: 'claudian-history-list' });
    for (const meta of this.conversationMetas) {
      const item = list.createDiv({ cls: 'claudian-history-item' });
      if (meta.id === this.chatState.conversationId) item.addClass('is-active');

      const info = item.createDiv({ cls: 'claudian-history-info' });
      info.createDiv({ cls: 'claudian-history-item-title', text: meta.title || t('history.untitled') });
      const date = new Date(meta.updatedAt).toLocaleString();
      info.createDiv({ cls: 'claudian-history-item-meta', text: `${meta.providerId} · ${date}` });

      const actions = item.createDiv({ cls: 'claudian-history-actions' });
      const loadBtn = actions.createEl('button', { cls: 'claudian-btn claudian-btn-sm', text: t('history.load') });
      loadBtn.addEventListener('click', () => { void this.loadConversation(meta.id); });

      const delBtn = actions.createEl('button', { cls: 'claudian-btn claudian-btn-sm claudian-btn-danger', text: '✕' });
      delBtn.addEventListener('click', () => {
        void this.plugin.sessionStorage.delete(meta.id).then(() => {
          void this.toggleHistory();
        });
      });
    }
  }

  private async loadConversation(id: string): Promise<void> {
    const conv = await this.plugin.sessionStorage.load(id);
    if (!conv) return;

    this.chatState.clear();
    this.chatState.conversationId = conv.id;
    for (const msg of conv.messages) {
      if (msg.role === 'user') {
        this.chatState.addUserMessage(msg.content);
      } else {
        const assistantMsg = this.chatState.startAssistantMessage();
        assistantMsg.content = msg.content;
        assistantMsg.toolCalls = msg.toolCalls;
        assistantMsg.thinkingBlocks = msg.thinkingBlocks;
        this.chatState.handleStreamChunk({ type: 'done' });
      }
    }
    this.historyEl.addClass('is-hidden');
    this.statusEl.textContent = t('loaded', { title: conv.title });
  }

  private toggleHelp(): void {
    const isVisible = !this.helpEl.hasClass('is-hidden');
    this.helpEl.toggleClass('is-hidden', isVisible);
    if (!isVisible) {
      this.historyEl.addClass('is-hidden');
    }
  }

  private buildHelpPanel(): void {
    this.helpEl.empty();

    const title = this.helpEl.createDiv({ cls: 'claudian-help-title' });
    title.createSpan({ text: t('help.title') });
    const closeBtn = title.createEl('button', { cls: 'claudian-btn claudian-header-btn', text: '✕' });
    closeBtn.addEventListener('click', () => { this.helpEl.addClass('is-hidden'); });

    const content = this.helpEl.createDiv({ cls: 'claudian-help-content' });

    const addSection = (heading: string, items: string[]) => {
      const section = content.createDiv({ cls: 'claudian-help-section' });
      section.createEl('h4', { text: heading });
      const ul = section.createEl('ul');
      for (const item of items) {
        const li = ul.createEl('li');
        void MarkdownRenderer.render(this.app, item, li, '', this.component);
      }
    };

    addSection(t('help.material.heading'), [
      t('help.material.1'),
      t('help.material.2'),
      t('help.material.3'),
    ]);

    addSection(t('help.role.heading'), [
      t('help.role.1'),
      t('help.role.tutor'),
      t('help.role.socratic'),
      t('help.role.language'),
    ]);

    addSection(t('help.commands.heading'), [
      t('help.commands.1'),
      t('help.commands.guide'),
      t('help.commands.quiz'),
      t('help.commands.confuse'),
      t('help.commands.gap'),
      t('help.commands.predict'),
      t('help.commands.audio'),
      t('help.commands.feynman'),
      t('help.commands.mock'),
    ]);

    addSection(t('help.reference.heading'), [
      t('help.reference.1'),
      t('help.reference.2'),
    ]);

    addSection(t('help.misc.heading'), [
      t('help.misc.1'),
      t('help.misc.2'),
      t('help.misc.3'),
    ]);

    const footer = content.createDiv({ cls: 'claudian-help-footer' });
    footer.setText(t('help.footer'));
  }

  private startNewConversation(): void {
    this.chatState.clear();
    this.chatState.conversationId = '';
    this.statusEl.textContent = '';
  }

  // --- Autocomplete (@mention and /command) ---

  private handleAutocomplete(): void {
    const text = this.inputEl.value;
    const cursorPos = this.inputEl.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);

    // Check for /command at start
    if (textBeforeCursor.startsWith('/') && !textBeforeCursor.includes(' ')) {
      this.showCommandAutocomplete(textBeforeCursor);
      return;
    }

    // Check for @mention
    const atMatch = textBeforeCursor.match(/@(\S*)$/);
    if (atMatch) {
      this.showFileAutocomplete(atMatch[1]);
      return;
    }

    this.hideAutocomplete();
  }

  private showCommandAutocomplete(query: string): void {
    const matches = getAllSlashCommands().filter(c => c.cmd.startsWith(query));
    if (matches.length === 0) { this.hideAutocomplete(); return; }

    this.autocompleteEl.empty();
    this.autocompleteEl.removeClass('is-hidden');

    for (let i = 0; i < matches.length; i++) {
      const item = this.autocompleteEl.createDiv({ cls: 'claudian-ac-item' + (i === 0 ? ' is-active' : '') });
      item.createSpan({ cls: 'claudian-ac-cmd', text: matches[i].cmd });
      item.createSpan({ cls: 'claudian-ac-desc', text: matches[i].desc });
      item.addEventListener('click', () => {
        this.inputEl.value = matches[i].cmd + ' ';
        this.inputEl.focus();
        this.hideAutocomplete();
      });
      item.addEventListener('mouseenter', () => {
        this.autocompleteEl.querySelectorAll('.claudian-ac-item').forEach(el => el.removeClass('is-active'));
        item.addClass('is-active');
      });
    }
  }

  private showFileAutocomplete(query: string): void {
    const files = this.app.vault.getMarkdownFiles();
    const q = query.toLowerCase();
    const matches = files
      .filter(f => f.path.toLowerCase().includes(q))
      .slice(0, 10);

    if (matches.length === 0) { this.hideAutocomplete(); return; }

    this.autocompleteEl.empty();
    this.autocompleteEl.removeClass('is-hidden');

    for (let i = 0; i < matches.length; i++) {
      const item = this.autocompleteEl.createDiv({ cls: 'claudian-ac-item' + (i === 0 ? ' is-active' : '') });
      item.createSpan({ cls: 'claudian-ac-cmd', text: matches[i].path });
      item.addEventListener('click', () => {
        this.insertFileReference(matches[i]);
      });
      item.addEventListener('mouseenter', () => {
        this.autocompleteEl.querySelectorAll('.claudian-ac-item').forEach(el => el.removeClass('is-active'));
        item.addClass('is-active');
      });
    }
  }

  private insertFileReference(file: TFile): void {
    const text = this.inputEl.value;
    const cursorPos = this.inputEl.selectionStart;
    const textBefore = text.substring(0, cursorPos);
    const textAfter = text.substring(cursorPos);
    const atIdx = textBefore.lastIndexOf('@');
    const newText = text.substring(0, atIdx) + `@${file.path} ` + textAfter;
    this.inputEl.value = newText;
    this.inputEl.focus();
    this.hideAutocomplete();
  }

  private hideAutocomplete(): void {
    this.autocompleteEl.addClass('is-hidden');
    this.autocompleteEl.empty();
  }

  // --- Rendering ---

  private renderMessages(): void {
    const lastAssistant = [...this.chatState.messages].reverse().find(m => m.role === 'assistant');
    const streamingId = this.chatState.isStreaming && lastAssistant ? lastAssistant.id : '';
    this.streamingMsgId = streamingId;
    const assistantCount = this.chatState.messages.filter(m => m.role === 'assistant').length;
    console.log(`[AI Study Buddy] renderMessages: ${this.chatState.messages.length} msgs, ${assistantCount} assistant, streaming: ${streamingId || 'none'}`);
    this.messageRenderer.renderAll(this.chatState.messages, this.component, {
      selectedIds: this.chatState.selectedMessageIds,
      onToggle: (id) => this.chatState.toggleSelection(id),
      streamingMsgId: streamingId || undefined,
    });
    if (this.chatState.isStreaming) {
      this.messagesEl.appendChild(this.loadingEl);
    }
    if (this.chatState.autoScrollEnabled) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  private updateSaveBar(): void {
    const count = this.chatState.getSelectedCount();
    if (count > 0) {
      this.saveBarEl.removeClass('is-hidden');
      const countEl = this.saveBarEl.querySelector('.claudian-save-bar-count');
      if (countEl) countEl.textContent = t('note.selectedCount', { count: String(count) });
    } else {
      this.saveBarEl.addClass('is-hidden');
    }
  }

  // --- Send message ---

  /** Programmatic send — used by inline edit commands */
  sendText(text: string): void {
    if (this.chatState.isStreaming) return;
    this.inputEl.value = text;
    void this.sendMessage();
  }

  /** Insert text into input without sending — for quote/reference */
  insertText(text: string): void {
    const current = this.inputEl.value;
    this.inputEl.value = current + text;
    this.inputEl.setCssStyles({ height: 'auto' });
    this.inputEl.setCssStyles({ height: Math.min(this.inputEl.scrollHeight, 200) + 'px' });
    this.inputEl.focus();
    // Place cursor at end
    const pos = this.inputEl.value.length;
    this.inputEl.setSelectionRange(pos, pos);
  }


  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.chatState.isStreaming) return;

    // Refresh provider dropdown in case settings changed since view opened
    this.refreshHeader();

    // Handle slash commands
    if (text.startsWith('/')) {
      if (await this.handleSlashCommand(text)) {
        this.inputEl.value = '';
        this.inputEl.setCssStyles({ height: 'auto' });
        return;
      }
    }

    this.inputEl.value = '';
    this.inputEl.setCssStyles({ height: 'auto' });
    this.hideAutocomplete();

    // Resolve @mentions — read file contents and append as context
    let resolvedText = await this.resolveMentions(text);

    // Auto-inject active learning material so the AI tutor can reference it
    const materialPath = this.plugin.settings.activeMaterialPath;
    console.log('[AI Study Buddy] activeMaterialPath:', materialPath || '(none)');
    if (materialPath && !resolvedText.includes(materialPath)) {
      const materialContent = await this.loadActiveMaterialContent();
      console.log('[AI Study Buddy] material loaded:', materialContent ? `${materialContent.length} chars` : 'undefined');
      if (materialContent) {
        resolvedText += `\n\n<learning_material path="${materialPath}">\n${materialContent}\n</learning_material>\n\n[IMPORTANT: The above is the user's selected learning material. You MUST base your response on this material content. Do NOT suggest selecting a material — it is already provided.]`;
      }
    } else if (materialPath) {
      console.log('[AI Study Buddy] material already in @mention, skipping auto-inject');
    }

    this.chatState.addUserMessage(text);
    const assistantMsg = this.chatState.startAssistantMessage();
    this.streamingMsgId = assistantMsg.id;

    this.statusEl.textContent = t('sending');

    this.abortController = new AbortController();
    const settings = this.plugin.settings;
    const provider = ProviderRegistry.get(settings.activeProvider);

    if (!provider) {
      const errMsg = t('providerNotConfigured', { provider: settings.activeProvider });
      this.statusEl.textContent = `Error: ${errMsg}`;
      this.chatState.handleStreamChunk({ type: 'error', content: errMsg });
      return;
    }

    // Build tool system
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new ReadFileTool());
    toolRegistry.register(new WriteFileTool());
    toolRegistry.register(new EditFileTool());
    toolRegistry.register(new ListFilesTool());
    toolRegistry.register(new SearchTool());
    const toolExecutor = new ToolExecutor(toolRegistry, { app: this.app });

    // Build messages for API (with resolved mentions)
    // Note: filter removes the empty assistant placeholder; no slice needed
    const allUserMsgs = this.chatState.messages.filter(mm => mm.role === 'user');
    const lastUserMsg = allUserMsgs[allUserMsgs.length - 1];
    const apiMessages: ApiMessage[] = this.chatState.messages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
      .map(m => {
        // Replace the last user message with resolved text (includes material)
        if (m === lastUserMsg) {
          return { role: 'user' as const, content: resolvedText };
        }
        return { role: m.role, content: m.content };
      });

    this.statusEl.textContent = t('calling', { provider: settings.activeProvider, model: this.getActiveModel() });
    console.log('[AI Study Buddy] sending to API:', apiMessages.length, 'messages, last user msg length:', apiMessages.filter(m => m.role === 'user').slice(-1)[0]?.content?.length ?? 0);

    // Idle timeout: abort if no stream activity for REQUEST_TIMEOUT_MS
    this.resetIdleTimer();

    const agentLoop = new AgentLoop();
    try {
      const result = await agentLoop.run(apiMessages, {
        provider,
        toolExecutor,
        systemPrompt: buildSystemPrompt({ customPrompt: settings.systemPrompt, activeRole: this.activeRole }),
        model: this.getActiveModel(),
        maxTokens: this.getMaxTokens(),
        onStreamChunk: (chunk) => {
          this.resetIdleTimer();
          this.chatState.handleStreamChunk(chunk);
        },
        signal: this.abortController.signal,
      });

      this.clearIdleTimer();
      this.chatState.setUsage(result.totalUsage);

      // Auto context compression when usage exceeds threshold
      if (this.plugin.settings.contextCompressionEnabled) {
        const pct = result.totalUsage.percentage;
        if (pct >= 80) {
          const keepRounds = pct >= 90 ? 5 : 10;
          await this.compressContext(provider, keepRounds);
        }
      }

      try { await this.saveConversation(); } catch (e: unknown) { console.warn('[AI Study Buddy] Save failed:', e); }

      this.statusEl.textContent = t('done', { turns: String(result.iterations), tokens: String(result.totalUsage.outputTokens) });
    } catch (error: unknown) {
      this.clearIdleTimer();
      console.error('[AI Study Buddy] sendMessage error:', error);
      if (this.abortController.signal.aborted) {
        this.chatState.handleStreamChunk({ type: 'done' });
        this.statusEl.textContent = t('aborted');
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.statusEl.textContent = `Error: ${errMsg}`;
        this.chatState.handleStreamChunk({ type: 'error', content: errMsg });
      }
    } finally {
      this.abortController = null;
    }
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = window.setTimeout(() => {
      if (this.abortController && !this.abortController.signal.aborted) {
        this.abortController.abort();
        const timeoutMsg = t('request.timeout', { seconds: String(REQUEST_TIMEOUT_MS / 1000) });
        this.statusEl.textContent = timeoutMsg;
        this.chatState.handleStreamChunk({ type: 'error', content: timeoutMsg });
      }
    }, REQUEST_TIMEOUT_MS);
  }

  private async compressContext(provider: LlmProvider, keepRounds: number): Promise<void> {
    const messages = this.chatState.messages;
    const keepCount = keepRounds * 2;

    // Need at least keepCount + 10 messages to compress meaningfully
    if (messages.length < keepCount + 10) return;

    this.chatState.isCompressing = true;
    this.statusEl.textContent = t('context.compressing');

    try {
      const result = await ContextCompressor.compress(
        messages,
        keepCount,
        provider,
        this.getActiveModel(),
      );

      if (result.summary) {
        this.chatState.compressMessages(result.summary, result.keptMessages);
        this.statusEl.textContent = t('context.compressed', {
          before: String(messages.length),
          after: String(result.keptMessages.length + 1),
        });
      }
    } catch (e: unknown) {
      console.warn('[AI Study Buddy] Context compression failed:', e);
      this.statusEl.textContent = t('context.compressFailed');
    } finally {
      this.chatState.isCompressing = false;
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private async handleSlashCommand(text: string): Promise<boolean> {
    const cmd = text.split(' ')[0].toLowerCase();
    const restArgs = text.substring(cmd.length).trim();

    // /command ? → show detailed help for that command
    if (restArgs === '?') {
      const helpKeyName = `cmd.help.${cmd.slice(1)}` as I18nKey;
      let helpText = t(helpKeyName);
      // If key not found, t() returns the key string itself
      if (helpText === helpKeyName) {
        helpText = t('cmd.help.unknown' as I18nKey);
      }
      this.chatState.addUserMessage(text);
      this.chatState.startAssistantMessage();
      this.chatState.handleStreamChunk({ type: 'text', content: helpText });
      this.chatState.handleStreamChunk({ type: 'done' });
      return true;
    }

    // Learning action commands: call AI, save results to vault
    if (this.learningDispatcher.isLearningCommand(cmd)) {
      const args = text.substring(cmd.length).trim();
      const materialContent = await this.loadActiveMaterialContent();
      const cmdCtx: CommandContext = {
        app: this.app,
        settings: this.plugin.settings,
        messages: this.chatState.messages,
        materialContent,
        activeModel: this.getActiveModel(),
        maxTokens: this.getMaxTokens(),
        activeRole: this.activeRole,
        onStatus: (statusText: string) => { this.statusEl.textContent = statusText; },
      };
      this.chatState.addUserMessage(text);
      this.chatState.startAssistantMessage();
      const result = await this.learningDispatcher.execute(cmd, args, cmdCtx);
      if (result) {
        this.chatState.handleStreamChunk({ type: 'text', content: result });
        this.chatState.handleStreamChunk({ type: 'done' });
      }
      this.statusEl.textContent = '';
      return true;
    }

    // Learning method commands: wrap user query with method-specific prompt
    if (MethodRegistry.isMethodCommand(cmd)) {
      const method = MethodRegistry.getByCommand(cmd)!;
      const query = text.substring(cmd.length).trim();
      const materialContent = await this.loadActiveMaterialContent();
      const wrappedPrompt = method.buildPrompt(query, materialContent);
      this.inputEl.value = wrappedPrompt;
      void this.sendMessage();
      return true;
    }

    switch (cmd) {
      case '/new':
        this.startNewConversation();
        return true;
      case '/clear':
        this.chatState.clear();
        this.statusEl.textContent = t('conversationCleared');
        return true;
      case '/history':
        void this.toggleHistory();
        return true;
      case '/help': {
        this.chatState.addUserMessage('/help');
        this.chatState.startAssistantMessage();
        const general = BASE_SLASH_COMMANDS
          .filter(c => c.cmd !== '/help')
          .map(c => `**${c.cmd}** — ${t(c.descKey)}`)
          .join('\n');
        const learning = MethodRegistry.getCommandList()
          .map(m => `**${m.command}** — ${t((m.i18nKey + '.name') as I18nKey)}：${t((m.i18nKey + '.desc') as I18nKey)}`)
          .join('\n');
        const helpText = `${t('cmd.general')}\n${general}\n\n${t('cmd.learning')}\n${learning}\n\n${t('cmd.atRef')}`;
        this.chatState.handleStreamChunk({ type: 'text', content: helpText });
        this.chatState.handleStreamChunk({ type: 'done' });
        return true;
      }
      default:
        return false;
    }
  }

  private async loadActiveMaterialContent(): Promise<string | undefined> {
    const path = this.plugin.settings.activeMaterialPath;
    if (!path) return undefined;

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return undefined;

    try {
      const content = await this.app.vault.read(file);
      const maxLen = 8000;
      if (content.length > maxLen) {
        return content.substring(0, maxLen) + '\n...(truncated)';
      }
      return content;
    } catch (e: unknown) {
      console.warn('[AI Study Buddy] Failed to load material:', path, e);
      return undefined;
    }
  }

  private async resolveMentions(text: string): Promise<string> {
    const mentionRegex = /@([^\s@]+)/g;
    let match;
    const contexts: string[] = [];

    while ((match = mentionRegex.exec(text)) !== null) {
      const filePath = match[1];
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        try {
          const content = await this.app.vault.read(file);
          const truncated = content.length > 4000 ? content.substring(0, 4000) + '\n...(truncated)' : content;
          contexts.push(`\n--- File: ${filePath} ---\n${truncated}\n--- End of ${filePath} ---`);
        } catch { /* skip unreadable files */ }
      }
    }

    if (contexts.length === 0) return text;
    return text + '\n\n<referenced_files>' + contexts.join('\n') + '\n</referenced_files>';
  }

  private getActiveModel(): string {
    const s = this.plugin.settings;
    const p = s.activeProvider;
    if (p === 'anthropic') return s.providers.anthropic.model;
    if (p === 'openai') return s.providers.openai.model;
    return s.providers.openaiCompat.model;
  }

  private getMaxTokens(): number {
    const s = this.plugin.settings;
    const p = s.activeProvider;
    if (p === 'anthropic') return s.providers.anthropic.maxTokens;
    if (p === 'openai') return s.providers.openai.maxTokens;
    return s.providers.openaiCompat.maxTokens;
  }

  private async saveConversation(): Promise<void> {
    const conv: Conversation = {
      id: this.chatState.conversationId || crypto.randomUUID(),
      title: this.chatState.messages[0]?.content?.slice(0, 50) ?? 'New Chat',
      messages: [...this.chatState.messages],
      providerId: this.plugin.settings.activeProvider,
      model: this.getActiveModel(),
      createdAt: this.chatState.messages[0]?.timestamp ?? Date.now(),
      updatedAt: Date.now(),
    };
    this.chatState.conversationId = conv.id;
    await this.plugin.sessionStorage.save(conv);
  }

  private async saveSelectedNotes(): Promise<void> {
    const messages = this.chatState.messages;
    const selectedIds = this.chatState.selectedMessageIds;
    if (selectedIds.size === 0) return;

    // Collect Q&A pairs: each selected assistant message + its preceding user message
    const qaPairs: Array<{ question: string; answer: string }> = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'assistant' && selectedIds.has(msg.id)) {
        // Find the preceding user message
        let question = '';
        for (let j = i - 1; j >= 0; j--) {
          if (messages[j].role === 'user') {
            question = messages[j].content;
            break;
          }
        }
        qaPairs.push({ question, answer: msg.content });
      }
    }

    if (qaPairs.length === 0) return;

    // Build Markdown with YAML frontmatter
    const now = new Date();
    const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const fileDateStr = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '-' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');

    let md = `---\ndate: ${dateStr} ${timeStr}\nsource: AI Study Buddy\ntags: [qa-note]\n---\n`;
    md += `# 学习笔记 - ${dateStr}\n\n`;

    qaPairs.forEach((pair, idx) => {
      const qSummary = pair.question.replace(/[\n#*_~`>\[\]]/g, ' ').trim().slice(0, 40) || '(no question)';
      md += `## Q${idx + 1}: ${qSummary}\n\n`;
      md += `### ${t('note.question')}\n\n${pair.question || '(empty)'}\n\n`;
      md += `### ${t('note.answer')}\n\n${pair.answer}\n\n`;
      if (idx < qaPairs.length - 1) md += '---\n\n';
    });

    // Ensure folder exists
    const folderPath = this.plugin.settings.learning.noteFolder;
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    } else if (!(folder instanceof TFolder)) {
      // Path exists but is a file, not a folder — use root
      new Notice('Error: note folder path is a file, not a folder');
      return;
    }

    const filePath = `${folderPath}/qa-note-${fileDateStr}.md`;
    // Avoid overwriting: append suffix if file already exists
    let finalPath = filePath;
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(finalPath)) {
      finalPath = `${folderPath}/qa-note-${fileDateStr}-${counter}.md`;
      counter++;
    }

    await this.app.vault.create(finalPath, md);
    new Notice(t('note.saved', { path: finalPath }), 4000);

    // Clear selection and hide bar
    this.chatState.clearSelection();
  }

  async onClose(): Promise<void> {
    this.clearIdleTimer();
    this.abortController?.abort();
  }
}

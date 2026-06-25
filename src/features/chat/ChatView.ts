import { ItemView, Component, SuggestModal, Notice, MarkdownRenderer, type App, type WorkspaceLeaf, type TFile } from 'obsidian';
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

export const VIEW_TYPE_CLAUDIAN = 'claudian-api-view';

const BASE_SLASH_COMMANDS = [
  { cmd: '/new', desc: 'Start a new conversation', category: 'general' as const },
  { cmd: '/clear', desc: 'Clear current conversation', category: 'general' as const },
  { cmd: '/history', desc: 'Show conversation history', category: 'general' as const },
  { cmd: '/help', desc: 'Show available commands', category: 'general' as const },
];

function getAllSlashCommands(): Array<{ cmd: string; desc: string; category: string }> {
  const methods = MethodRegistry.getCommandList().map(m => ({
    cmd: m.command,
    desc: `${m.name} — ${m.description}`,
    category: 'learning',
  }));
  return [...BASE_SLASH_COMMANDS, ...methods];
}

class MaterialPickerModal extends SuggestModal<TFile> {
  private onSelect: (file: TFile) => void;

  constructor(app: App, onSelect: (file: TFile) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder('Select a Markdown file from your vault...');
    this.setInstructions([
      { command: '↑↓', purpose: 'navigate' },
      { command: '↵', purpose: 'select as learning material' },
      { command: 'esc', purpose: 'cancel' },
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
  private activeRole: RolePreset | null = null;
  private roleBarEl!: HTMLElement;
  private component!: Component;
  private conversationMetas: ConversationMeta[] = [];
  private helpEl!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: ClaudianPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_CLAUDIAN; }
  getDisplayText(): string { return 'AI Study Buddy'; }
  getIcon(): string { return 'bot'; }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('claudian-container');

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

    // Input area
    const inputArea = container.createDiv({ cls: 'claudian-input-area' });

    // Autocomplete popup
    this.autocompleteEl = inputArea.createDiv({ cls: 'claudian-autocomplete is-hidden' });

    this.inputEl = inputArea.createEl('textarea', { cls: 'claudian-input' });
    this.inputEl.placeholder = 'Ask anything... (@ to reference files, / for commands)';
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

    const stopBtn = btnGroup.createEl('button', { cls: 'claudian-btn claudian-btn-stop is-hidden', text: 'Stop' });
    stopBtn.addEventListener('click', () => {
      this.abortController?.abort();
      this.abortController = null;
    });

    const sendBtn = btnGroup.createEl('button', { cls: 'claudian-btn claudian-btn-send', text: 'Send' });
    sendBtn.addEventListener('click', () => { void this.sendMessage(); });

    // Loading indicator
    this.loadingEl = this.messagesEl.createDiv({ cls: 'claudian-loading is-hidden' });
    this.loadingEl.createSpan({ cls: 'claudian-loading-spinner' });
    this.loadingEl.createSpan({ text: 'Thinking...' });

    // Initialize state
    this.component = new Component();
    this.chatState = new ChatState({
      onMessagesChanged: () => this.renderMessages(),
      onStreamingChanged: (streaming) => {
        stopBtn.toggleClass('is-hidden', !streaming);
        sendBtn.disabled = streaming;
        this.inputEl.disabled = streaming;
        this.loadingEl.toggleClass('is-hidden', !streaming);
      },
      onUsageChanged: (usage) => {
        if (usage) {
          this.statusEl.textContent = `Tokens: ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out (${usage.percentage.toFixed(1)}% context)`;
        }
      },
    });

    this.messageRenderer = new MessageRenderer(this.app, this.messagesEl);
  }

  private buildHeader(): void {
    this.headerEl.empty();

    const row1 = this.headerEl.createDiv({ cls: 'claudian-header-row' });

    // New chat button
    const newBtn = row1.createEl('button', { cls: 'claudian-btn claudian-header-btn', text: '+ New' });
    newBtn.title = 'New conversation';
    newBtn.addEventListener('click', () => this.startNewConversation());

    // History toggle
    const historyBtn = row1.createEl('button', { cls: 'claudian-btn claudian-header-btn', text: '📋 History' });
    historyBtn.addEventListener('click', () => { void this.toggleHistory(); });

    // Help toggle
    const helpBtn = row1.createEl('button', { cls: 'claudian-btn claudian-header-btn', text: '❓ Help' });
    helpBtn.addEventListener('click', () => this.toggleHelp());

    row1.createDiv({ cls: 'claudian-header-spacer' });

    // Provider dropdown
    row1.createSpan({ cls: 'claudian-header-label', text: 'Provider:' });
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
    row1.createSpan({ cls: 'claudian-header-label', text: 'Material:' });
    this.materialSelect = row1.createEl('select', { cls: 'claudian-select claudian-material-select' });
    this.populateMaterialSelect();
    this.materialSelect.addEventListener('change', () => {
      this.plugin.settings.activeMaterialPath = this.materialSelect.value;
      void this.plugin.saveSettings();
    });

    const addMaterialBtn = row1.createEl('button', { cls: 'claudian-btn claudian-header-btn claudian-material-add-btn', text: '+ Material' });
    addMaterialBtn.title = 'Add a Markdown file from vault as learning material';
    addMaterialBtn.addEventListener('click', () => this.openMaterialPicker());
  }

  private populateProviderSelect(): void {
    this.providerSelect.empty();
    const providers = ProviderRegistry.getAll();
    const currentActive = this.plugin.settings.activeProvider;

    if (providers.length === 0) {
      this.providerSelect.createEl('option', { text: '(none configured)', value: '' });
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
      this.modelSelect.createEl('option', { text: '(no provider)', value: '' });
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
    this.roleBarEl.createSpan({ cls: 'claudian-role-label', text: 'Role:' });

    // "None" button (default)
    const noneBtn = this.roleBarEl.createEl('button', {
      cls: `claudian-role-btn${this.activeRole === null ? ' is-active' : ''}`,
      text: 'None',
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
      btn.createSpan({ text: role.icon + ' ' + role.name });
      btn.title = role.description;
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
    this.materialSelect.createEl('option', { text: 'None', value: '' });

    const confirmed = (this.plugin.settings.learningMaterials || []).filter(m => m.confirmed);
    const activePath = this.plugin.settings.activeMaterialPath;

    // Group by parent folder to mirror Obsidian vault structure
    const grouped = new Map<string, LearningMaterial[]>();
    for (const material of confirmed) {
      const folder = material.path.includes('/')
        ? material.path.substring(0, material.path.lastIndexOf('/'))
        : '(root)';
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
        new Notice(`✅ Confirmed "${file.basename}" as learning material`, 3000);
      } else {
        this.plugin.settings.activeMaterialPath = file.path;
        await this.plugin.saveSettings();
        this.populateMaterialSelect();
        new Notice(`"${file.basename}" is already a learning material`, 3000);
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
    new Notice(`✅ Added "${file.basename}" as learning material`, 3000);
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
    title.createSpan({ text: 'Conversation History' });
    const closeBtn = title.createEl('button', { cls: 'claudian-btn claudian-header-btn', text: '✕' });
    closeBtn.addEventListener('click', () => { this.historyEl.addClass('is-hidden'); });

    try {
      this.conversationMetas = await this.plugin.sessionStorage.listAll();
    } catch {
      this.conversationMetas = [];
    }

    if (this.conversationMetas.length === 0) {
      this.historyEl.createDiv({ cls: 'claudian-history-empty', text: 'No conversations yet.' });
      return;
    }

    const list = this.historyEl.createDiv({ cls: 'claudian-history-list' });
    for (const meta of this.conversationMetas) {
      const item = list.createDiv({ cls: 'claudian-history-item' });
      if (meta.id === this.chatState.conversationId) item.addClass('is-active');

      const info = item.createDiv({ cls: 'claudian-history-info' });
      info.createDiv({ cls: 'claudian-history-item-title', text: meta.title || 'Untitled' });
      const date = new Date(meta.updatedAt).toLocaleString();
      info.createDiv({ cls: 'claudian-history-item-meta', text: `${meta.providerId} · ${date}` });

      const actions = item.createDiv({ cls: 'claudian-history-actions' });
      const loadBtn = actions.createEl('button', { cls: 'claudian-btn claudian-btn-sm', text: 'Load' });
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
    this.statusEl.textContent = `Loaded: ${conv.title}`;
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
    title.createSpan({ text: 'Claudian 快速上手' });
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

    addSection('1. 选择学习材料', [
      '点击 header 中的 <strong>+ Material</strong>，搜索并选择 Vault 中的笔记。',
      '下拉框会按文件夹分组，选中后所有学习命令会自动引用该材料。',
      '想不用材料时，选择 <strong>None</strong>。',
    ]);

    addSection('2. 选择学习角色', [
      'Role 栏可在三种学习角色间切换，默认 None 为通用助手：',
      '<strong>私人导师</strong>：严格基于学习材料，按「概念拆解 → 规则技巧 → 逻辑训练 → 知识迁移 → 自评检查」五步循环教学，适合系统深入学习。',
      '<strong>苏格拉底教学(理工)</strong>：不直接给答案，用提问引导你自己推导出结论，适合理科问题求解。',
      '<strong>语言学习伙伴(文科)</strong>：专注于词汇、语法、翻译、改写和文化背景，适合语言类材料学习。',
    ]);

    addSection('3. 使用学习命令', [
      '在输入框输入 <code>/</code> 查看命令，空格后写你的问题。',
      '<code>/guide 量子力学</code>：生成学习指南',
      '<code>/quiz 量子力学</code>：苏格拉底式测验',
      '<code>/confuse 量子力学</code>：多角度解释易混淆概念',
      '<code>/gap 量子力学</code>：找出知识盲区',
      '<code>/predict 量子力学</code>：预测考点',
      '<code>/audio 量子力学</code>：生成播客对话',
      '<code>/feynman</code>：用费曼技巧检验理解',
      '<code>/mock 量子力学</code>：模拟考试',
    ]);

    addSection('4. 引用笔记内容', [
      '输入 <code>@文件名</code> 可引用 Vault 文件作为上下文。',
      '在编辑器中选中文本 → 右键 → <strong>Claudian: Quote to chat</strong> 可引用到输入框。',
    ]);

    addSection('5. 常用操作', [
      '<code>/new</code>：新建对话，<code>/clear</code>：清空当前对话',
      '<code>/history</code>：查看历史对话',
      'Provider / Model 下拉框可快速切换模型。',
    ]);

    const footer = content.createDiv({ cls: 'claudian-help-footer' });
    footer.setText('提示：学习命令会携带当前选中的材料和角色设定一起发送给 AI。');
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
    this.messageRenderer.renderAll(this.chatState.messages, this.component);
    if (this.chatState.isStreaming) {
      this.messagesEl.appendChild(this.loadingEl);
    }
    if (this.chatState.autoScrollEnabled) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  // --- Send message ---

  /** Programmatic send — used by inline edit commands */
  sendText(text: string): void {
    if (this.chatState.isStreaming) return;
    this.inputEl.value = text;
    this.sendMessage();
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
    const resolvedText = await this.resolveMentions(text);

    this.chatState.addUserMessage(text);
    this.chatState.startAssistantMessage();

    this.statusEl.textContent = 'Sending...';

    this.abortController = new AbortController();
    const settings = this.plugin.settings;
    const provider = ProviderRegistry.get(settings.activeProvider);

    if (!provider) {
      const errMsg = `Provider "${settings.activeProvider}" not configured. Please set your API key in Settings → Claudian API.`;
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
    const apiMessages: ApiMessage[] = this.chatState.messages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
      .slice(0, -1)
      .map(m => {
        // Replace the last user message with resolved text
        if (m === this.chatState.messages.filter(mm => mm.role === 'user').slice(-1)[0]) {
          return { role: 'user' as const, content: resolvedText };
        }
        return { role: m.role as 'user' | 'assistant', content: m.content };
      });

    this.statusEl.textContent = `Calling ${settings.activeProvider} (${this.getActiveModel()})...`;

    const agentLoop = new AgentLoop();
    try {
      const result = await agentLoop.run(apiMessages, {
        provider,
        toolExecutor,
        systemPrompt: buildSystemPrompt({ customPrompt: settings.systemPrompt, activeRole: this.activeRole }),
        model: this.getActiveModel(),
        maxTokens: this.getMaxTokens(),
        onStreamChunk: (chunk) => this.chatState.handleStreamChunk(chunk),
        signal: this.abortController.signal,
      });

      this.chatState.setUsage(result.totalUsage);

      try { await this.saveConversation(); } catch (e: unknown) { console.warn('[Claudian] Save failed:', e); }

      this.statusEl.textContent = `Done — ${result.iterations} turn(s), ${result.totalUsage.outputTokens} tokens`;
    } catch (error: unknown) {
      console.error('[Claudian] sendMessage error:', error);
      if (this.abortController.signal.aborted) {
        this.chatState.handleStreamChunk({ type: 'done' });
        this.statusEl.textContent = 'Aborted';
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.statusEl.textContent = `Error: ${errMsg}`;
        this.chatState.handleStreamChunk({ type: 'error', content: errMsg });
      }
    } finally {
      this.abortController = null;
    }
  }

  private async handleSlashCommand(text: string): Promise<boolean> {
    const cmd = text.split(' ')[0].toLowerCase();

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
        this.statusEl.textContent = 'Conversation cleared';
        return true;
      case '/history':
        void this.toggleHistory();
        return true;
      case '/help': {
        this.chatState.addUserMessage('/help');
        this.chatState.startAssistantMessage();
        const general = BASE_SLASH_COMMANDS
          .filter(c => c.cmd !== '/help')
          .map(c => `**${c.cmd}** — ${c.desc}`)
          .join('\n');
        const learning = MethodRegistry.getCommandList()
          .map(m => `**${m.command}** — ${m.name}：${m.description}`)
          .join('\n');
        const helpText = `**General commands**\n${general}\n\n**Learning methods**\n${learning}\n\n**@filename** — Reference a vault file as context`;
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
    if (!file || 'children' in file) return undefined;

    try {
      const content = await this.app.vault.read(file as TFile);
      const maxLen = 8000;
      if (content.length > maxLen) {
        return content.substring(0, maxLen) + '\n...(truncated)';
      }
      return content;
    } catch (e) {
      console.warn('[Claudian] Failed to load material:', path, e);
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
      if (file && !('children' in file)) {
        try {
          const content = await this.app.vault.read(file as TFile);
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

  async onClose(): Promise<void> {
    this.abortController?.abort();
  }
}

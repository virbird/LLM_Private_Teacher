import { PluginSettingTab, Setting, Notice, type App } from 'obsidian';
import type ClaudianPlugin from '../../main';
import type { ProviderId } from '../../core/types/provider';
import { testAnthropic, testOpenAI, type TestResult } from '../../utils/testConnection';

export class ClaudianSettingsTab extends PluginSettingTab {
  plugin: ClaudianPlugin;

  constructor(app: App, plugin: ClaudianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Active Provider')
      .setDesc('Choose which LLM provider to use')
      .addDropdown(dropdown => dropdown
        .addOption('anthropic', 'Anthropic Claude')
        .addOption('openai', 'OpenAI')
        .addOption('openai-compat', 'OpenAI Compatible')
        .setValue(this.plugin.settings.activeProvider)
        .onChange(async (value) => {
          this.plugin.settings.activeProvider = value as ProviderId;
          await this.plugin.saveSettings();
        }));

    // === Anthropic section ===
    containerEl.createEl('h3', { text: 'Anthropic Claude' });

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your Anthropic API key')
      .addText(text => text
        .setPlaceholder('sk-ant-...')
        .setValue(this.plugin.settings.providers.anthropic.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.providers.anthropic.apiKey = value;
          await this.plugin.saveSettings();
          this.plugin.refreshProviders();
        }));

    new Setting(containerEl)
      .setName('Model')
      .addDropdown(dropdown => dropdown
        .addOption('claude-sonnet-4-20250514', 'Claude Sonnet 4')
        .addOption('claude-opus-4-20250514', 'Claude Opus 4')
        .addOption('claude-3-5-haiku-20241022', 'Claude 3.5 Haiku')
        .setValue(this.plugin.settings.providers.anthropic.model)
        .onChange(async (value) => {
          this.plugin.settings.providers.anthropic.model = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Max Tokens')
      .addText(text => text
        .setValue(String(this.plugin.settings.providers.anthropic.maxTokens))
        .onChange(async (value) => {
          this.plugin.settings.providers.anthropic.maxTokens = parseInt(value) || 8192;
          await this.plugin.saveSettings();
        }));

    this.addTestButton(
      containerEl,
      'Test Anthropic Connection',
      () => testAnthropic(
        this.plugin.settings.providers.anthropic.apiKey,
        this.plugin.settings.providers.anthropic.model,
      ),
    );

    // === OpenAI section ===
    containerEl.createEl('h3', { text: 'OpenAI' });

    new Setting(containerEl)
      .setName('API Key')
      .addText(text => text
        .setPlaceholder('sk-...')
        .setValue(this.plugin.settings.providers.openai.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.providers.openai.apiKey = value;
          await this.plugin.saveSettings();
          this.plugin.refreshProviders();
        }));

    new Setting(containerEl)
      .setName('Model')
      .addDropdown(dropdown => dropdown
        .addOption('gpt-4o', 'GPT-4o')
        .addOption('gpt-4o-mini', 'GPT-4o Mini')
        .addOption('o3', 'o3')
        .setValue(this.plugin.settings.providers.openai.model)
        .onChange(async (value) => {
          this.plugin.settings.providers.openai.model = value;
          await this.plugin.saveSettings();
        }));

    this.addTestButton(
      containerEl,
      'Test OpenAI Connection',
      () => testOpenAI(
        this.plugin.settings.providers.openai.apiKey,
        this.plugin.settings.providers.openai.model,
        'https://api.openai.com/v1',
      ),
    );

    // === OpenAI Compatible section ===
    containerEl.createEl('h3', { text: 'OpenAI Compatible' });
    containerEl.createEl('p', {
      text: 'Works with DeepSeek, Qwen, Moonshot, and other OpenAI-compatible APIs.',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('Base URL')
      .setDesc('API endpoint (e.g., https://api.deepseek.com/v1)')
      .addText(text => text
        .setPlaceholder('https://api.deepseek.com/v1')
        .setValue(this.plugin.settings.providers.openaiCompat.baseUrl)
        .onChange(async (value) => {
          this.plugin.settings.providers.openaiCompat.baseUrl = value;
          await this.plugin.saveSettings();
          this.plugin.refreshProviders();
        }));

    new Setting(containerEl)
      .setName('API Key')
      .addText(text => text
        .setValue(this.plugin.settings.providers.openaiCompat.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.providers.openaiCompat.apiKey = value;
          await this.plugin.saveSettings();
          this.plugin.refreshProviders();
        }));

    new Setting(containerEl)
      .setName('Context Window')
      .addText(text => text
        .setValue(String(this.plugin.settings.providers.openaiCompat.contextWindow))
        .onChange(async (value) => {
          this.plugin.settings.providers.openaiCompat.contextWindow = parseInt(value) || 128000;
          await this.plugin.saveSettings();
        }));

    // --- Multi-model management ---
    this.addModelManager(containerEl);

    this.addTestButton(
      containerEl,
      'Test Connection',
      () => testOpenAI(
        this.plugin.settings.providers.openaiCompat.apiKey,
        this.plugin.settings.providers.openaiCompat.model,
        this.plugin.settings.providers.openaiCompat.baseUrl,
      ),
    );

    // === General section ===
    containerEl.createEl('h3', { text: 'General' });

    new Setting(containerEl)
      .setName('Custom System Prompt')
      .setDesc('Additional instructions appended to the system prompt')
      .addTextArea(text => text
        .setPlaceholder('Custom instructions...')
        .setValue(this.plugin.settings.systemPrompt)
        .onChange(async (value) => {
          this.plugin.settings.systemPrompt = value;
          await this.plugin.saveSettings();
        }));

  }


  private addModelManager(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: 'Models' });
    containerEl.createEl('p', {
      text: 'Add multiple models and set one as default. The default model is marked with \u2605.',
      cls: 'setting-item-description',
    });

    // Model list
    const listEl = containerEl.createDiv({ cls: 'claudian-model-list' });
    this.renderModelList(listEl);

    // Add model input + button
    const addRow = containerEl.createDiv({ cls: 'claudian-model-add-row' });

    const inputEl = addRow.createEl('input', {
      cls: 'claudian-model-add-input',
      type: 'text',
      placeholder: 'Model name (e.g., qwen-max)',
    });

    const addBtn = addRow.createEl('button', { cls: 'claudian-btn claudian-btn-send', text: '+ Add' });

    const handleAdd = async () => {
      const modelName = inputEl.value.trim();
      if (!modelName) return;

      // Read current state directly from settings
      const compat = this.plugin.settings.providers.openaiCompat;
      if (!compat.customModels) compat.customModels = [];

      const allModels = [compat.model, ...compat.customModels].filter(Boolean);
      console.log('[Claudian] Add model:', modelName, 'existing:', allModels);

      if (allModels.includes(modelName)) {
        new Notice(`\u26a0\ufe0f "${modelName}" is already configured`, 3000);
        inputEl.value = '';
        return;
      }

      compat.customModels.push(modelName);
      if (!compat.model) {
        compat.model = modelName;
      }
      await this.plugin.saveSettings();
      inputEl.value = '';
      new Notice(`\u2705 Added "${modelName}"`, 3000);
      console.log('[Claudian] Model added. default:', compat.model, 'custom:', compat.customModels);
      this.renderModelList(listEl);
    };

    addBtn.addEventListener('click', handleAdd);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });
  }

  private renderModelList(listEl: HTMLElement): void {
    listEl.empty();

    // Always read fresh state from settings (no stale closures)
    const compat = this.plugin.settings.providers.openaiCompat;
    if (!compat.customModels) compat.customModels = [];
    const defaultModel = compat.model;
    console.log('[Claudian] renderModelList: default=', defaultModel, 'custom=', compat.customModels);

    // Build model list: default + custom (deduplicated)
    const allModels: Array<{ id: string; isDefault: boolean }> = [];
    const seen = new Set<string>();

    if (defaultModel) {
      allModels.push({ id: defaultModel, isDefault: true });
      seen.add(defaultModel);
    }
    for (const m of compat.customModels) {
      if (!seen.has(m)) {
        allModels.push({ id: m, isDefault: false });
        seen.add(m);
      }
    }

    if (allModels.length === 0) {
      listEl.createDiv({ cls: 'claudian-model-empty', text: 'No models configured. Add one above.' });
      return;
    }

    for (const model of allModels) {
      const item = listEl.createDiv({ cls: 'claudian-model-item' });

      const nameDiv = item.createDiv({ cls: 'claudian-model-name' });
      if (model.isDefault) {
        nameDiv.createSpan({ cls: 'claudian-model-star', text: '\u2605 ' });
      }
      nameDiv.createSpan({ text: model.id });
      if (model.isDefault) {
        nameDiv.createSpan({ cls: 'claudian-model-badge', text: 'default' });
      }

      const actions = item.createDiv({ cls: 'claudian-model-actions' });

      if (!model.isDefault) {
        const setDefaultBtn = actions.createEl('button', {
          cls: 'claudian-btn claudian-btn-sm',
          text: 'Set Default',
        });
        setDefaultBtn.addEventListener('click', async () => {
          const c = this.plugin.settings.providers.openaiCompat;
          if (!c.customModels) c.customModels = [];
          // Move current default to customModels if it exists
          if (c.model && c.model !== model.id && !c.customModels.includes(c.model)) {
            c.customModels.push(c.model);
          }
          c.model = model.id;
          c.customModels = c.customModels.filter(m => m !== model.id);
          await this.plugin.saveSettings();
          this.renderModelList(listEl);
        });

        const removeBtn = actions.createEl('button', {
          cls: 'claudian-btn claudian-btn-sm claudian-btn-danger',
          text: '\u2715',
        });
        removeBtn.addEventListener('click', async () => {
          const c = this.plugin.settings.providers.openaiCompat;
          if (!c.customModels) c.customModels = [];
          c.customModels = c.customModels.filter(m => m !== model.id);
          await this.plugin.saveSettings();
          this.renderModelList(listEl);
        });
      }
    }
  }

  private addTestButton(
    containerEl: HTMLElement,
    label: string,
    testFn: () => Promise<TestResult>,
  ): void {
    const statusEl = containerEl.createEl('div', { cls: 'claudian-test-status' });

    new Setting(containerEl)
      .setName(label)
      .setDesc('Sends a minimal request to verify your configuration')
      .addButton(button => button
        .setButtonText('Test')
        .setCta()
        .onClick(async () => {
          button.setDisabled(true);
          button.setButtonText('Testing...');
          statusEl.textContent = '';
          statusEl.className = 'claudian-test-status';

          try {
            const result = await testFn();
            if (result.success) {
              statusEl.textContent = `\u2705 ${result.message} (${result.latencyMs}ms)`;
              statusEl.className = 'claudian-test-status is-success';
            } else {
              statusEl.textContent = `\u274c ${result.message} (${result.latencyMs}ms)`;
              statusEl.className = 'claudian-test-status is-error';
            }
          } catch (e: any) {
            statusEl.textContent = `\u274c Unexpected error: ${e?.message || e}`;
            statusEl.className = 'claudian-test-status is-error';
          } finally {
            button.setDisabled(false);
            button.setButtonText('Test');
          }
        }));
  }
}

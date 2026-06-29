import { PluginSettingTab, Setting, Notice, Platform, type App } from 'obsidian';
import type ClaudianPlugin from '../../main';
import type { ProviderId } from '../../core/types/provider';
import { testAnthropic, testOpenAI, testCli, type TestResult } from '../../utils/testConnection';
import { t, setLocale } from '../../core/i18n';
import { ChatView } from '../chat/ChatView';
import { CliResolver } from '../../core/providers/cli/CliResolver';

export class ClaudianSettingsTab extends PluginSettingTab {
  plugin: ClaudianPlugin;

  constructor(app: App, plugin: ClaudianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Language selector
    new Setting(containerEl)
      .setName(t('settings.language'))
      .setDesc(t('settings.language.desc'))
      .addDropdown(dropdown => dropdown
        .addOption('en', 'English')
        .addOption('zh', '中文')
        .setValue(this.plugin.settings.locale || 'en')
        .onChange(async (value) => {
          this.plugin.settings.locale = value;
          setLocale(value);
          await this.plugin.saveSettings();
          this.display();
          // Refresh all open ChatView instances
          const leaves = this.plugin.app.workspace.getLeavesOfType('claudian-api-view');
          for (const leaf of leaves) {
            const view = leaf.view as ChatView;
            if (view && typeof view.refreshUI === 'function') {
              view.refreshUI();
            }
          }
        }));

    new Setting(containerEl)
      .setName(t('settings.activeProvider'))
      .setDesc(t('settings.activeProvider.desc'))
      .addDropdown(dropdown => {
        dropdown
          .addOption('anthropic', 'Anthropic Claude')
          .addOption('openai', 'OpenAI')
          .addOption('openai-compat', 'OpenAI Compatible');
        // CLI providers — desktop only
        if (Platform.isDesktopApp) {
          dropdown.addOption('claude-cli', 'Claude CLI (Local)');
          dropdown.addOption('pi-cli', 'Pi CLI (Local)');
          dropdown.addOption('codex-cli', 'Codex CLI (Local)');
          dropdown.addOption('acp-cli', 'ACP CLI (Local)');
          dropdown.addOption('opencode-cli', 'OpenCode CLI (Local)');
        }
        dropdown
          .setValue(this.plugin.settings.activeProvider)
          .onChange(async (value) => {
            this.plugin.settings.activeProvider = value as ProviderId;
            await this.plugin.saveSettings();
          });
      });

    // === Anthropic section ===
    new Setting(containerEl).setName('Anthropic Claude').setHeading();

    new Setting(containerEl)
      .setName(t('settings.apiKey'))
      .setDesc(t('settings.apiKey.anthropic.desc'))
      .addText(text => text
        .setPlaceholder('sk-ant-...')
        .setValue(this.plugin.settings.providers.anthropic.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.providers.anthropic.apiKey = value;
          await this.plugin.saveSettings();
          this.plugin.refreshProviders();
        }));

    new Setting(containerEl)
      .setName(t('settings.model'))
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
      .setName(t('settings.maxTokens'))
      .addText(text => text
        .setValue(String(this.plugin.settings.providers.anthropic.maxTokens))
        .onChange(async (value) => {
          this.plugin.settings.providers.anthropic.maxTokens = parseInt(value) || 8192;
          await this.plugin.saveSettings();
        }));

    this.addTestButton(
      containerEl,
      t('settings.test.anthropic'),
      () => testAnthropic(
        this.plugin.settings.providers.anthropic.apiKey,
        this.plugin.settings.providers.anthropic.model,
      ),
    );

    // === OpenAI section ===
    new Setting(containerEl).setName('OpenAI').setHeading();

    new Setting(containerEl)
      .setName(t('settings.apiKey'))
      .addText(text => text
        .setPlaceholder('sk-...')
        .setValue(this.plugin.settings.providers.openai.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.providers.openai.apiKey = value;
          await this.plugin.saveSettings();
          this.plugin.refreshProviders();
        }));

    new Setting(containerEl)
      .setName(t('settings.model'))
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
      t('settings.test.openai'),
      () => testOpenAI(
        this.plugin.settings.providers.openai.apiKey,
        this.plugin.settings.providers.openai.model,
        'https://api.openai.com/v1',
      ),
    );

    // === OpenAI Compatible section ===
    new Setting(containerEl).setName('OpenAI Compatible').setHeading();
    containerEl.createEl('p', {
      text: t('settings.openaiCompat.desc'),
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName(t('settings.baseUrl'))
      .setDesc(t('settings.baseUrl.desc'))
      .addText(text => text
        .setPlaceholder('https://api.deepseek.com/v1')
        .setValue(this.plugin.settings.providers.openaiCompat.baseUrl)
        .onChange(async (value) => {
          this.plugin.settings.providers.openaiCompat.baseUrl = value;
          await this.plugin.saveSettings();
          this.plugin.refreshProviders();
        }));

    new Setting(containerEl)
      .setName(t('settings.apiKey'))
      .addText(text => text
        .setValue(this.plugin.settings.providers.openaiCompat.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.providers.openaiCompat.apiKey = value;
          await this.plugin.saveSettings();
          this.plugin.refreshProviders();
        }));

    new Setting(containerEl)
      .setName(t('settings.contextWindow'))
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
      t('settings.test.openaiCompat'),
      () => testOpenAI(
        this.plugin.settings.providers.openaiCompat.apiKey,
        this.plugin.settings.providers.openaiCompat.model,
        this.plugin.settings.providers.openaiCompat.baseUrl,
      ),
    );

    // === CLI Providers (Desktop Only) ===
    if (Platform.isDesktopApp) {
      new Setting(containerEl).setName(t('settings.cliProviders')).setHeading();
      containerEl.createEl('p', {
        text: t('settings.cliProviders.desc'),
        cls: 'setting-item-description',
      });

      // --- Claude CLI ---
      this.addCliProviderSettings(containerEl, 'claudeCli', 'Claude CLI', ['claude'],
        'claude-sonnet-4-20250514', true);

      // --- Pi CLI ---
      this.addCliProviderSettings(containerEl, 'piCli', 'Pi CLI', ['pi'],
        'default', false);

      // --- Codex CLI ---
      this.addCliProviderSettings(containerEl, 'codexCli', 'Codex CLI', ['codex'],
        'o3', false);

      // --- OpenCode CLI ---
      this.addCliProviderSettings(containerEl, 'opencodeCli', 'OpenCode CLI', ['opencode'],
        'default', false);

      // --- ACP CLI ---
      this.addCliProviderSettings(containerEl, 'acpCli', 'ACP CLI', ['acp'],
        'default', false);
    }

    // === General section ===
    new Setting(containerEl).setName(t('settings.general')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.systemPrompt'))
      .setDesc(t('settings.systemPrompt.desc'))
      .addTextArea(text => text
        .setPlaceholder(t('settings.systemPrompt.placeholder'))
        .setValue(this.plugin.settings.systemPrompt)
        .onChange(async (value) => {
          this.plugin.settings.systemPrompt = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('settings.noteFolder'))
      .setDesc(t('settings.noteFolder.desc'))
      .addText(text => text
        .setPlaceholder('学习笔记')
        .setValue(this.plugin.settings.learning.noteFolder)
        .onChange(async (value) => {
          this.plugin.settings.learning.noteFolder = value.trim() || '学习笔记';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('settings.contextCompression'))
      .setDesc(t('settings.contextCompression.desc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.contextCompressionEnabled)
        .onChange(async (value) => {
          this.plugin.settings.contextCompressionEnabled = value;
          await this.plugin.saveSettings();
        }));

  }


  private addModelManager(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t('settings.models')).setHeading();
    containerEl.createEl('p', {
      text: t('settings.models.desc'),
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
      placeholder: t('settings.models.placeholder'),
    });

    const addBtn = addRow.createEl('button', { cls: 'claudian-btn claudian-btn-send', text: t('settings.models.add') });

    const handleAdd = async () => {
      const modelName = inputEl.value.trim();
      if (!modelName) return;

      // Read current state directly from settings
      const compat = this.plugin.settings.providers.openaiCompat;
      if (!compat.customModels) compat.customModels = [];

      const allModels = [compat.model, ...compat.customModels].filter(Boolean);
      console.log('[AI Study Buddy] Add model:', modelName, 'existing:', allModels);

      if (allModels.includes(modelName)) {
        new Notice(t('settings.models.exists', { name: modelName }), 3000);
        inputEl.value = '';
        return;
      }

      compat.customModels.push(modelName);
      if (!compat.model) {
        compat.model = modelName;
      }
      await this.plugin.saveSettings();
      inputEl.value = '';
      new Notice(t('settings.models.added', { name: modelName }), 3000);
      console.log('[AI Study Buddy] Model added. default:', compat.model, 'custom:', compat.customModels);
      this.renderModelList(listEl);
    };

    addBtn.addEventListener('click', () => { void handleAdd(); });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleAdd();
      }
    });
  }

  private renderModelList(listEl: HTMLElement): void {
    listEl.empty();

    // Always read fresh state from settings (no stale closures)
    const compat = this.plugin.settings.providers.openaiCompat;
    if (!compat.customModels) compat.customModels = [];
    const defaultModel = compat.model;
    console.log('[AI Study Buddy] renderModelList: default=', defaultModel, 'custom=', compat.customModels);

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
      listEl.createDiv({ cls: 'claudian-model-empty', text: t('settings.models.empty') });
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
        nameDiv.createSpan({ cls: 'claudian-model-badge', text: t('settings.models.default') });
      }

      const actions = item.createDiv({ cls: 'claudian-model-actions' });

      if (!model.isDefault) {
        const setDefaultBtn = actions.createEl('button', {
          cls: 'claudian-btn claudian-btn-sm',
          text: t('settings.models.setDefault'),
        });
        setDefaultBtn.addEventListener('click', () => {
          void (async () => {
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
          })();
        });

        const removeBtn = actions.createEl('button', {
          cls: 'claudian-btn claudian-btn-sm claudian-btn-danger',
          text: '\u2715',
        });
        removeBtn.addEventListener('click', () => {
          void (async () => {
            const c = this.plugin.settings.providers.openaiCompat;
            if (!c.customModels) c.customModels = [];
            c.customModels = c.customModels.filter(m => m !== model.id);
            await this.plugin.saveSettings();
            this.renderModelList(listEl);
          })();
        });
      }
    }
  }

  private addCliProviderSettings(
    containerEl: HTMLElement,
    settingsKey: 'claudeCli' | 'piCli' | 'codexCli' | 'acpCli' | 'opencodeCli',
    displayName: string,
    fallbackNames: string[],
    modelPlaceholder: string,
    showThinkingBudget: boolean,
  ): void {
    const account = this.plugin.settings.providers[settingsKey];

    new Setting(containerEl).setName(displayName).setHeading();

    // CLI Path
    const statusEl = containerEl.createEl('div', { cls: 'claudian-test-status' });

    new Setting(containerEl)
      .setName(t('settings.cliPath'))
      .setDesc(t('settings.cliPath.desc'))
      .addText(text => text
        .setPlaceholder(`/usr/local/bin/${fallbackNames[0]}`)
        .setValue(account.cliPath)
        .onChange(async (value) => {
          account.cliPath = value;
          await this.plugin.saveSettings();
          this.plugin.refreshProviders();
          this.updateCliStatus(statusEl, value, fallbackNames);
        }));

    // Model — free text input so user can type any model name the CLI supports
    new Setting(containerEl)
      .setName(t('settings.model'))
      .setDesc(t('settings.model.cliDesc'))
      .addText(text => text
        .setPlaceholder(modelPlaceholder)
        .setValue(account.model)
        .onChange(async (value) => {
          account.model = value.trim() || modelPlaceholder;
          await this.plugin.saveSettings();
          this.plugin.refreshProviders();
        }));

    // Max tokens
    new Setting(containerEl)
      .setName(t('settings.maxTokens'))
      .addText(text => text
        .setValue(String(account.maxTokens))
        .onChange(async (value) => {
          account.maxTokens = parseInt(value) || 8192;
          await this.plugin.saveSettings();
        }));

    // Thinking budget (Claude-specific)
    if (showThinkingBudget) {
      new Setting(containerEl)
        .setName(t('settings.thinkingBudget'))
        .setDesc(t('settings.thinkingBudget.desc'))
        .addText(text => text
          .setValue(String(account.thinkingBudget))
          .onChange(async (value) => {
            account.thinkingBudget = parseInt(value) || 0;
            await this.plugin.saveSettings();
          }));
    }

    this.updateCliStatus(statusEl, account.cliPath, fallbackNames);

    // Test button
    this.addTestButton(
      containerEl,
      t('settings.test.cli'),
      () => testCli(account.cliPath, fallbackNames),
    );
  }

  private updateCliStatus(statusEl: HTMLElement, cliPath: string, fallbackNames: string[]): void {
    const resolved = CliResolver.resolve(cliPath, fallbackNames);
    if (resolved) {
      statusEl.textContent = `\u2705 ${resolved}`;
      statusEl.className = 'claudian-test-status is-success';
    } else {
      statusEl.textContent = '\u26a0\ufe0f CLI not found';
      statusEl.className = 'claudian-test-status is-error';
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
      .setDesc(t('settings.test.desc'))
      .addButton(button => button
        .setButtonText(t('settings.test'))
        .setCta()
        .onClick(async () => {
          button.setDisabled(true);
          button.setButtonText(t('settings.testing'));
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
          } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            statusEl.textContent = t('settings.test.error', { error: errMsg });
            statusEl.className = 'claudian-test-status is-error';
          } finally {
            button.setDisabled(false);
            button.setButtonText(t('settings.test'));
          }
        }));
  }
}

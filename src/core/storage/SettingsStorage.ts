import type { PluginSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import type { VaultStorage } from './VaultStorage';

export class SettingsStorage {
  constructor(private storage: VaultStorage) {}

  async load(): Promise<PluginSettings> {
    const saved = await this.storage.readJson<Partial<PluginSettings>>('settings.json');
    if (!saved) return { ...DEFAULT_SETTINGS };
    const merged = { ...DEFAULT_SETTINGS, ...saved, providers: { ...DEFAULT_SETTINGS.providers, ...(saved.providers ?? {}) } };
    // Deep-merge each provider to ensure new fields (like customModels) have defaults
    const providers = merged.providers as unknown as Record<string, Record<string, unknown>>;
    for (const key of Object.keys(DEFAULT_SETTINGS.providers) as Array<keyof typeof DEFAULT_SETTINGS.providers>) {
      const defaultProvider = DEFAULT_SETTINGS.providers[key] as unknown as Record<string, unknown>;
      providers[key] = { ...defaultProvider, ...(providers[key] ?? {}) };
    }
    // Migration: ensure learning material fields exist and are valid
    if (!Array.isArray(merged.learningMaterials)) {
      merged.learningMaterials = [];
    }
    if (typeof merged.activeMaterialPath !== 'string') {
      merged.activeMaterialPath = '';
    }
    return merged;
  }

  async save(settings: PluginSettings): Promise<void> {
    await this.storage.writeJson('settings.json', settings);
  }
}

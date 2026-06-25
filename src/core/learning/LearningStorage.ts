/**
 * Unified storage service for all learning data.
 * - Plugin metadata: .claudian-api/learning/ (hidden, via vault.adapter)
 * - User-visible content: learning/ folders (via vault.create/modify)
 */
import { type App, type Vault, type DataAdapter, TFile } from 'obsidian';

export class LearningStorage {
  private adapter: DataAdapter;
  private vault: Vault;
  private hiddenRoot: string;

  constructor(app: App) {
    this.vault = app.vault;
    this.adapter = app.vault.adapter;
    this.hiddenRoot = '.claudian-api/learning';
  }

  // --- Hidden metadata operations ---

  async readJson<T>(relativePath: string, fallback: T): Promise<T> {
    const fullPath = `${this.hiddenRoot}/${relativePath}`;
    try {
      if (await this.adapter.exists(fullPath)) {
        const raw = await this.adapter.read(fullPath);
        return JSON.parse(raw) as T;
      }
    } catch (e) {
      console.warn('[LearningStorage] Failed to read', fullPath, e);
    }
    return fallback;
  }

  async writeJson(relativePath: string, data: unknown): Promise<void> {
    const fullPath = `${this.hiddenRoot}/${relativePath}`;
    await this.ensureDir(fullPath.substring(0, fullPath.lastIndexOf('/')));
    await this.adapter.write(fullPath, JSON.stringify(data, null, 2));
  }

  // --- User-visible vault file operations ---

  async readVaultFile(path: string): Promise<string | null> {
    try {
      if (await this.adapter.exists(path)) {
        return await this.adapter.read(path);
      }
    } catch { /* ignore */ }
    return null;
  }

  async writeVaultFile(path: string, content: string): Promise<void> {
    const dir = path.substring(0, path.lastIndexOf('/'));
    await this.ensureDir(dir);

    const existing = this.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.vault.modify(existing, content);
    } else {
      await this.vault.create(path, content);
    }
  }

  async appendVaultFile(path: string, content: string): Promise<void> {
    const existing = await this.readVaultFile(path);
    if (existing) {
      await this.writeVaultFile(path, existing + '\n\n' + content);
    } else {
      await this.writeVaultFile(path, content);
    }
  }

  // --- Utility ---

  private async ensureDir(dirPath: string): Promise<void> {
    const parts = dirPath.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.adapter.exists(current))) {
        await this.adapter.mkdir(current);
      }
    }
  }

  /** Generate a date string like 2025-06-25 */
  static today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Generate a unique ID */
  static uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}

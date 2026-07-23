/**
 * Unified storage service for all learning data.
 * - Plugin metadata: .claudian-api/learning/ (hidden, via vault.adapter)
 * - User-visible content: learning/ folders (via vault.create/modify)
 */
import { type App, type Vault, type DataAdapter, TFile, Platform } from 'obsidian';

export class LearningStorage {
  private adapter: DataAdapter;
  private vault: Vault;
  private hiddenRoot: string;
  /** Obsidian config directory (not necessarily '.obsidian') */
  readonly configDir: string;

  constructor(app: App) {
    this.vault = app.vault;
    this.adapter = app.vault.adapter;
    this.hiddenRoot = '.claudian-api/learning';
    this.configDir = app.vault.configDir;
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
    // Support absolute paths (outside vault) on Desktop via Node.js fs
    if (this.isAbsolutePath(path)) {
      return this.readTextFromFs(path);
    }
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

  // --- Binary vault file operations (for .apkg) ---

  async readVaultFileBinary(path: string): Promise<ArrayBuffer | null> {
    // Support absolute paths (outside vault) on Desktop via Node.js fs
    if (this.isAbsolutePath(path)) {
      return this.readBinaryFromFs(path);
    }
    try {
      if (await this.adapter.exists(path)) {
        return await this.adapter.readBinary(path);
      }
    } catch { /* ignore */ }
    return null;
  }

  async writeVaultFileBinary(path: string, data: ArrayBuffer): Promise<void> {
    const dir = path.substring(0, path.lastIndexOf('/'));
    await this.ensureDir(dir);
    await this.adapter.writeBinary(path, data);
  }

  // --- Utility ---

  /** Check if a path is absolute (works on all platforms) */
  private isAbsolutePath(path: string): boolean {
    return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
  }

  /** Read text file from filesystem via Node.js fs (Desktop only) */
  private async readTextFromFs(path: string): Promise<string | null> {
    if (!Platform.isDesktopApp) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js fs, Desktop only, external in esbuild
      const fs = require('fs') as typeof import('fs');
      return fs.readFileSync(path, 'utf-8');
    } catch {
      return null;
    }
  }

  /** Read binary file from filesystem via Node.js fs (Desktop only) */
  private async readBinaryFromFs(path: string): Promise<ArrayBuffer | null> {
    if (!Platform.isDesktopApp) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js fs, Desktop only, external in esbuild
      const fs = require('fs') as typeof import('fs');
      const buf = fs.readFileSync(path);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch {
      return null;
    }
  }

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

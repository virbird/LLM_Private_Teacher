import type { App } from 'obsidian';

export class VaultStorage {
  private basePath: string;

  constructor(private app: App, basePath = '.claudian-api') {
    this.basePath = basePath;
  }

  async readJson<T>(path: string): Promise<T | null> {
    const fullPath = `${this.basePath}/${path}`;
    try {
      const raw = await this.app.vault.adapter.read(fullPath);
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async writeJson<T>(path: string, data: T): Promise<void> {
    const fullPath = `${this.basePath}/${path}`;
    const content = JSON.stringify(data, null, 2);
    await this.ensureDir(fullPath);
    await this.app.vault.adapter.write(fullPath, content);
  }

  async delete(path: string): Promise<void> {
    const fullPath = `${this.basePath}/${path}`;
    try {
      await this.app.vault.adapter.remove(fullPath);
    } catch {
      // file may not exist
    }
  }

  async listFiles(dir: string): Promise<string[]> {
    const fullPath = `${this.basePath}/${dir}`;
    try {
      const entries = await this.app.vault.adapter.list(fullPath);
      return entries.files.map((f: string) => f.split('/').pop() ?? f);
    } catch {
      return [];
    }
  }

  private async ensureDir(filePath: string): Promise<void> {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!dir) return;
    try {
      const exists = await this.app.vault.adapter.exists(dir);
      if (!exists) {
        await this.app.vault.adapter.mkdir(dir);
      }
    } catch {
      // mkdir may fail if dir already exists
    }
  }
}

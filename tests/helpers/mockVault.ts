/**
 * In-memory Mock Vault that simulates Obsidian's app.vault API.
 * Used by all Tool tests for end-to-end verification without a real vault.
 */

interface VaultFile {
  path: string;
  content: string;
  type: 'file';
}

interface VaultFolder {
  path: string;
  type: 'folder';
}

type VaultEntry = VaultFile | VaultFolder;

export class MockVault {
  private entries = new Map<string, VaultEntry>();

  constructor() {
    // Root folder always exists
    this.entries.set('', { path: '', type: 'folder' });
  }

  // --- Seed helpers ---

  seedFile(path: string, content: string): void {
    this.ensureParentFolders(path);
    this.entries.set(path, { path, content, type: 'file' });
  }

  seedFolder(path: string): void {
    this.ensureParentFolders(path);
    if (!this.entries.has(path)) {
      this.entries.set(path, { path, type: 'folder' });
    }
  }

  private ensureParentFolders(path: string): void {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!this.entries.has(dir)) {
        this.entries.set(dir, { path: dir, type: 'folder' });
      }
    }
  }

  // --- Obsidian vault API simulation ---

  getAbstractFileByPath(path: string): any | null {
    const entry = this.entries.get(path);
    if (!entry) return null;

    if (entry.type === 'folder') {
      const children = this.getChildren(path);
      return {
        path: entry.path,
        name: entry.path.split('/').pop() || '',
        children,
      };
    }

    // file
    return {
      path: entry.path,
      name: entry.path.split('/').pop() || '',
      basename: (entry as VaultFile).path.split('/').pop()?.replace(/\.[^.]+$/, '') || '',
      extension: entry.path.includes('.') ? entry.path.split('.').pop() : '',
    };
  }

  getRoot(): any {
    const children = this.getChildren('');
    return { path: '', name: '', children };
  }

  private getChildren(folderPath: string): any[] {
    const prefix = folderPath ? folderPath + '/' : '';
    const children: any[] = [];

    for (const [p, entry] of this.entries) {
      if (p === folderPath) continue;
      if (!p.startsWith(prefix)) continue;

      // Direct children only (no deeper nesting)
      const remainder = p.slice(prefix.length);
      if (remainder.includes('/')) continue;

      if (entry.type === 'folder') {
        children.push({
          path: entry.path,
          name: entry.path.split('/').pop() || '',
          children: this.getChildren(entry.path),
        });
      } else {
        children.push({
          path: entry.path,
          name: entry.path.split('/').pop() || '',
          basename: (entry as VaultFile).path.split('/').pop()?.replace(/\.[^.]+$/, '') || '',
          extension: entry.path.includes('.') ? entry.path.split('.').pop() : '',
        });
      }
    }
    return children;
  }

  async read(file: any): Promise<string> {
    const entry = this.entries.get(file.path);
    if (!entry || entry.type !== 'file') {
      throw new Error(`File not found: ${file.path}`);
    }
    return (entry as VaultFile).content;
  }

  async create(path: string, content: string): Promise<any> {
    if (this.entries.has(path)) throw new Error(`File already exists: ${path}`);
    this.ensureParentFolders(path);
    this.entries.set(path, { path, content, type: 'file' });
    return { path };
  }

  async modify(file: any, content: string): Promise<void> {
    const entry = this.entries.get(file.path);
    if (!entry || entry.type !== 'file') throw new Error(`File not found: ${file.path}`);
    (entry as VaultFile).content = content;
  }

  async createFolder(path: string): Promise<void> {
    this.ensureParentFolders(path);
    if (!this.entries.has(path)) {
      this.entries.set(path, { path, type: 'folder' });
    }
  }

  getMarkdownFiles(): any[] {
    const files: any[] = [];
    for (const [, entry] of this.entries) {
      if (entry.type === 'file' && entry.path.endsWith('.md')) {
        files.push({
          path: entry.path,
          name: entry.path.split('/').pop() || '',
          basename: entry.path.split('/').pop()?.replace(/\.[^.]+$/, '') || '',
          extension: 'md',
        });
      }
    }
    return files;
  }

  /** Build a mock App object with this vault attached */
  buildApp(): any {
    return {
      vault: {
        getAbstractFileByPath: (p: string) => this.getAbstractFileByPath(p),
        getRoot: () => this.getRoot(),
        read: (f: any) => this.read(f),
        create: (p: string, c: string) => this.create(p, c),
        modify: (f: any, c: string) => this.modify(f, c),
        createFolder: (p: string) => this.createFolder(p),
        getMarkdownFiles: () => this.getMarkdownFiles(),
      },
    };
  }

  /** Read raw content from internal store (for test assertions) */
  readRaw(path: string): string | undefined {
    const entry = this.entries.get(path);
    return entry?.type === 'file' ? (entry as VaultFile).content : undefined;
  }

  has(path: string): boolean {
    return this.entries.has(path);
  }
}

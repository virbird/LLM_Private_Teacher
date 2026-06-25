import {
  resolveMentions,
  extractMentions,
  isSlashCommand,
  parseSlashCommand,
  type FileReadAdapter,
} from '../../src/utils/mentionResolver';

function mockVault(files: Record<string, string>): FileReadAdapter {
  return {
    getAbstractFileByPath(path: string): unknown | null {
      if (path in files) {
        return { path, basename: path.split('/').pop()?.replace('.md', '') ?? '' };
      }
      return null;
    },
    async read(file: unknown): Promise<string> {
      const f = file as { path: string };
      if (f.path in files) return files[f.path];
      throw new Error(`File not found: ${f.path}`);
    },
  };
}

describe('extractMentions', () => {
  it('should extract single mention', () => {
    expect(extractMentions('Hello @notes/test.md world')).toEqual(['notes/test.md']);
  });

  it('should extract multiple mentions', () => {
    expect(extractMentions('@a.md and @b.md')).toEqual(['a.md', 'b.md']);
  });

  it('should return empty for no mentions', () => {
    expect(extractMentions('no mentions here')).toEqual([]);
  });

  it('should stop at whitespace', () => {
    expect(extractMentions('@file.md more text')).toEqual(['file.md']);
  });
});

describe('resolveMentions', () => {
  it('should resolve a single file mention', async () => {
    const vault = mockVault({ 'notes/hello.md': '# Hello World\nThis is a note.' });
    const result = await resolveMentions('Summarize @notes/hello.md', vault);
    expect(result).toContain('<referenced_files>');
    expect(result).toContain('# Hello World');
    expect(result).toContain('--- End of notes/hello.md ---');
  });

  it('should resolve multiple file mentions', async () => {
    const vault = mockVault({
      'a.md': 'Content A',
      'b.md': 'Content B',
    });
    const result = await resolveMentions('Compare @a.md and @b.md', vault);
    expect(result).toContain('Content A');
    expect(result).toContain('Content B');
    expect(result).toContain('<referenced_files>');
  });

  it('should skip non-existent files gracefully', async () => {
    const vault = mockVault({});
    const result = await resolveMentions('Read @missing.md', vault);
    expect(result).toBe('Read @missing.md');
  });

  it('should skip folders (objects with children)', async () => {
    const vault: FileReadAdapter = {
      getAbstractFileByPath: () => ({ path: 'folder', children: [] }),
      read: async () => { throw new Error('should not be called'); },
    };
    const result = await resolveMentions('@folder', vault);
    expect(result).toBe('@folder');
  });

  it('should truncate files over 4000 chars', async () => {
    const longContent = 'A'.repeat(5000);
    const vault = mockVault({ 'big.md': longContent });
    const result = await resolveMentions('@big.md', vault);
    expect(result).toContain('...(truncated)');
    expect(result.length).toBeLessThan(5000 + 200);
  });

  it('should return original text when no mentions present', async () => {
    const vault = mockVault({});
    const result = await resolveMentions('No mentions here', vault);
    expect(result).toBe('No mentions here');
  });
});

describe('isSlashCommand', () => {
  it('should detect slash commands', () => {
    expect(isSlashCommand('/new')).toBe(true);
    expect(isSlashCommand('/help')).toBe(true);
    expect(isSlashCommand('  /clear  ')).toBe(true);
  });

  it('should reject non-slash text', () => {
    expect(isSlashCommand('hello')).toBe(false);
    expect(isSlashCommand('')).toBe(false);
    expect(isSlashCommand('http://example.com')).toBe(false);
  });
});

describe('parseSlashCommand', () => {
  it('should parse command without args', () => {
    expect(parseSlashCommand('/new')).toEqual({ cmd: '/new', args: '' });
    expect(parseSlashCommand('/help')).toEqual({ cmd: '/help', args: '' });
  });

  it('should parse command with args', () => {
    expect(parseSlashCommand('/search hello world')).toEqual({ cmd: '/search', args: 'hello world' });
  });

  it('should normalize to lowercase', () => {
    expect(parseSlashCommand('/NEW')).toEqual({ cmd: '/new', args: '' });
  });

  it('should trim whitespace', () => {
    expect(parseSlashCommand('  /clear  ')).toEqual({ cmd: '/clear', args: '' });
  });
});

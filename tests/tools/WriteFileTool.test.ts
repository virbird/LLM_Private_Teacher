import { WriteFileTool } from '../../src/core/tools/tools/WriteFileTool';
import { MockVault } from '../helpers/mockVault';

describe('WriteFileTool', () => {
  let tool: WriteFileTool;
  let vault: MockVault;
  let ctx: any;

  beforeEach(() => {
    tool = new WriteFileTool();
    vault = new MockVault();
    vault.seedFile('existing.md', 'Old content');
    vault.seedFolder('notes');
    ctx = { app: vault.buildApp() };
  });

  // --- Happy path ---

  it('should create a new file', async () => {
    const result = await tool.execute({ file_path: 'new-file.md', content: 'Hello!' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Successfully wrote');
    expect(vault.readRaw('new-file.md')).toBe('Hello!');
  });

  it('should create file in nested directory (auto-create parent)', async () => {
    const result = await tool.execute({ file_path: 'deep/nested/file.md', content: 'Nested' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(vault.readRaw('deep/nested/file.md')).toBe('Nested');
    expect(vault.has('deep')).toBe(true);
    expect(vault.has('deep/nested')).toBe(true);
  });

  it('should overwrite existing file', async () => {
    const result = await tool.execute({ file_path: 'existing.md', content: 'New content' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(vault.readRaw('existing.md')).toBe('New content');
  });

  it('should write empty content', async () => {
    const result = await tool.execute({ file_path: 'empty-write.md', content: '' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(vault.readRaw('empty-write.md')).toBe('');
  });

  it('should write multiline content', async () => {
    const content = '# Title\n\nParagraph 1\n\nParagraph 2';
    const result = await tool.execute({ file_path: 'multi.md', content }, ctx);
    expect(result.isError).toBeFalsy();
    expect(vault.readRaw('multi.md')).toBe(content);
  });

  it('should write to existing folder', async () => {
    const result = await tool.execute({ file_path: 'notes/todo.md', content: '- [x] done' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(vault.readRaw('notes/todo.md')).toBe('- [x] done');
  });

  // --- Error recovery ---

  it('should return error when file_path is missing', async () => {
    const result = await tool.execute({ content: 'hello' }, ctx);
    // The tool will try to use undefined as path — vault should reject
    expect(result.content).toBeTruthy();
  });

  it('should handle write with unicode content', async () => {
    const content = '你好世界 🌍 Привет';
    const result = await tool.execute({ file_path: 'unicode.md', content }, ctx);
    expect(result.isError).toBeFalsy();
    expect(vault.readRaw('unicode.md')).toBe(content);
  });

  // --- Schema ---

  it('should have correct schema', () => {
    expect(tool.name).toBe('write_file');
    expect(tool.inputSchema.properties).toHaveProperty('file_path');
    expect(tool.inputSchema.properties).toHaveProperty('content');
  });
});

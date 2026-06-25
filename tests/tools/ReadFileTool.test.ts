import { ReadFileTool } from '../../src/core/tools/tools/ReadFileTool';
import { MockVault } from '../helpers/mockVault';

describe('ReadFileTool', () => {
  let tool: ReadFileTool;
  let vault: MockVault;
  let ctx: any;

  beforeEach(() => {
    tool = new ReadFileTool();
    vault = new MockVault();
    vault.seedFile('notes/hello.md', 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    vault.seedFile('empty.md', '');
    vault.seedFile('single-line.md', 'Hello World');
    vault.seedFolder('docs');
    ctx = { app: vault.buildApp() };
  });

  // --- Happy path ---

  it('should read entire file with line numbers', async () => {
    const result = await tool.execute({ file_path: 'notes/hello.md' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('1\tLine 1\n2\tLine 2\n3\tLine 3\n4\tLine 4\n5\tLine 5');
  });

  it('should read with offset', async () => {
    const result = await tool.execute({ file_path: 'notes/hello.md', offset: 3 }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('3\tLine 3\n4\tLine 4\n5\tLine 5');
  });

  it('should read with offset and limit', async () => {
    const result = await tool.execute({ file_path: 'notes/hello.md', offset: 2, limit: 2 }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('2\tLine 2\n3\tLine 3');
  });

  it('should read single-line file', async () => {
    const result = await tool.execute({ file_path: 'single-line.md' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('1\tHello World');
  });

  it('should read empty file', async () => {
    const result = await tool.execute({ file_path: 'empty.md' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('1\t');
  });

  // --- Error recovery: missing file ---

  it('should return error for non-existent file', async () => {
    const result = await tool.execute({ file_path: 'nonexistent.md' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('File not found');
  });

  it('should return error for folder path', async () => {
    const result = await tool.execute({ file_path: 'docs' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('directory');
  });

  // --- Error recovery: invalid parameters ---

  it('should return error when file_path is missing', async () => {
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('required');
  });

  it('should return error when offset < 1', async () => {
    const result = await tool.execute({ file_path: 'notes/hello.md', offset: 0 }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('offset must be >= 1');
  });

  it('should return error when limit < 1', async () => {
    const result = await tool.execute({ file_path: 'notes/hello.md', limit: 0 }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('limit must be >= 1');
  });

  it('should return error when offset exceeds file length', async () => {
    const result = await tool.execute({ file_path: 'notes/hello.md', offset: 999 }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('exceeds file length');
  });

  // --- Edge cases ---

  it('should handle limit larger than remaining lines', async () => {
    const result = await tool.execute({ file_path: 'notes/hello.md', offset: 4, limit: 100 }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('4\tLine 4\n5\tLine 5');
  });

  it('should handle offset at exact last line', async () => {
    const result = await tool.execute({ file_path: 'notes/hello.md', offset: 5 }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('5\tLine 5');
  });

  // --- Schema ---

  it('should have correct input schema', () => {
    expect(tool.name).toBe('read_file');
    expect(tool.inputSchema).toHaveProperty('properties.file_path');
    expect(tool.inputSchema).toHaveProperty('properties.offset');
    expect(tool.inputSchema).toHaveProperty('properties.limit');
  });
});

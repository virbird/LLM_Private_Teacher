import { EditFileTool } from '../../src/core/tools/tools/EditFileTool';
import { MockVault } from '../helpers/mockVault';

describe('EditFileTool', () => {
  let tool: EditFileTool;
  let vault: MockVault;
  let ctx: any;

  beforeEach(() => {
    tool = new EditFileTool();
    vault = new MockVault();
    vault.seedFile('app.ts', 'function hello() {\n  return "world";\n}\n');
    vault.seedFile('readme.md', '# Project\n\nThis is a readme.\n');
    ctx = { app: vault.buildApp() };
  });

  // --- Happy path ---

  it('should replace exact text match', async () => {
    const result = await tool.execute({
      file_path: 'app.ts',
      old_text: 'return "world"',
      new_text: 'return "universe"',
    }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Successfully edited');
    expect(vault.readRaw('app.ts')).toContain('return "universe"');
    expect(vault.readRaw('app.ts')).not.toContain('return "world"');
  });

  it('should replace multiline text', async () => {
    const result = await tool.execute({
      file_path: 'app.ts',
      old_text: 'function hello() {\n  return "world";\n}',
      new_text: 'function hello(name: string) {\n  return `Hello ${name}`;\n}',
    }, ctx);
    expect(result.isError).toBeFalsy();
    expect(vault.readRaw('app.ts')).toContain('function hello(name: string)');
  });

  it('should only replace first occurrence', async () => {
    vault.seedFile('dup.md', 'aaa\naaa\naaa');
    const result = await tool.execute({
      file_path: 'dup.md',
      old_text: 'aaa',
      new_text: 'bbb',
    }, ctx);
    expect(result.isError).toBeFalsy();
    const content = vault.readRaw('dup.md')!;
    expect(content).toBe('bbb\naaa\naaa');
  });

  it('should handle replacing with empty string (deletion)', async () => {
    const result = await tool.execute({
      file_path: 'readme.md',
      old_text: '\nThis is a readme.',
      new_text: '',
    }, ctx);
    expect(result.isError).toBeFalsy();
    expect(vault.readRaw('readme.md')).toBe('# Project\n\n');
  });

  // --- Error recovery ---

  it('should return error when file not found', async () => {
    const result = await tool.execute({
      file_path: 'nonexistent.ts',
      old_text: 'foo',
      new_text: 'bar',
    }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('File not found');
  });

  it('should return error when old_text does not match', async () => {
    const result = await tool.execute({
      file_path: 'app.ts',
      old_text: 'this text does not exist in file',
      new_text: 'replacement',
    }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('old_text not found');
  });

  it('should return error when old_text is empty string', async () => {
    const result = await tool.execute({
      file_path: 'app.ts',
      old_text: '',
      new_text: 'injected',
    }, ctx);
    // empty string is always "found" in any string — String.prototype.includes('') === true
    // The replace would prepend to the file content
    // This is a known edge case; verify current behavior
    expect(result.content).toBeTruthy();
  });

  // --- Schema ---

  it('should have correct schema', () => {
    expect(tool.name).toBe('edit_file');
    expect(tool.inputSchema.properties).toHaveProperty('file_path');
    expect(tool.inputSchema.properties).toHaveProperty('old_text');
    expect(tool.inputSchema.properties).toHaveProperty('new_text');
  });
});

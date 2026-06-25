import { ListFilesTool } from '../../src/core/tools/tools/ListFilesTool';
import { MockVault } from '../helpers/mockVault';

describe('ListFilesTool', () => {
  let tool: ListFilesTool;
  let vault: MockVault;
  let ctx: any;

  beforeEach(() => {
    tool = new ListFilesTool();
    vault = new MockVault();
    vault.seedFile('notes/daily.md', 'Daily note');
    vault.seedFile('notes/todo.md', 'Todo list');
    vault.seedFile('readme.md', 'Readme');
    vault.seedFolder('empty-folder');
    vault.seedFolder('src/lib');
    vault.seedFile('src/lib/utils.ts', 'utils');
    vault.seedFile('src/main.ts', 'main');
    ctx = { app: vault.buildApp() };
  });

  // --- Happy path ---

  it('should list root directory with "."', async () => {
    const result = await tool.execute({ path: '.' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('folder');
    expect(result.content).toContain('file');
    expect(result.content).toContain('notes');
    expect(result.content).toContain('readme.md');
  });

  it('should list subdirectory', async () => {
    const result = await tool.execute({ path: 'notes' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('daily.md');
    expect(result.content).toContain('todo.md');
  });

  it('should list nested subdirectory', async () => {
    const result = await tool.execute({ path: 'src' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('lib');
    expect(result.content).toContain('main.ts');
  });

  it('should show empty directory message', async () => {
    const result = await tool.execute({ path: 'empty-folder' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('empty directory');
  });

  it('should distinguish files from folders', async () => {
    const result = await tool.execute({ path: 'src' }, ctx);
    const lines = result.content.split('\n');
    const folderLine = lines.find(l => l.includes('lib'));
    const fileLine = lines.find(l => l.includes('main.ts'));
    expect(folderLine).toMatch(/^folder/);
    expect(fileLine).toMatch(/^file/);
  });

  // --- Error recovery ---

  it('should return error for non-existent directory', async () => {
    const result = await tool.execute({ path: 'nonexistent' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Directory not found');
  });

  // --- Schema ---

  it('should have correct schema', () => {
    expect(tool.name).toBe('list_files');
    expect(tool.inputSchema.properties).toHaveProperty('path');
  });
});

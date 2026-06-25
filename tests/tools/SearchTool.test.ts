import { SearchTool } from '../../src/core/tools/tools/SearchTool';
import { MockVault } from '../helpers/mockVault';

describe('SearchTool', () => {
  let tool: SearchTool;
  let vault: MockVault;
  let ctx: any;

  beforeEach(() => {
    tool = new SearchTool();
    vault = new MockVault();
    vault.seedFile('notes/daily.md', 'Today I worked on the API integration.\nThe API uses REST endpoints.');
    vault.seedFile('notes/todo.md', '- [ ] Fix the API bug\n- [ ] Write tests\n- [x] Setup project');
    vault.seedFile('readme.md', '# My Project\n\nA sample project for testing.\n\nContact: api@example.com');
    vault.seedFile('src/config.ts', 'export const API_KEY = "abc123";\nexport const BASE_URL = "https://api.test.com";');
    ctx = { app: vault.buildApp() };
  });

  // --- Happy path ---

  it('should find text matches across all markdown files', async () => {
    const result = await tool.execute({ query: 'API' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('daily.md');
    expect(result.content).toContain('todo.md');
    expect(result.content).toContain('readme.md');
  });

  it('should include file path and line number in results', async () => {
    const result = await tool.execute({ query: 'REST' }, ctx);
    expect(result.isError).toBeFalsy();
    // REST is on line 2 of daily.md
    expect(result.content).toMatch(/daily\.md:2:/);
    expect(result.content).toContain('REST endpoints');
  });

  it('should support regex patterns', async () => {
    const result = await tool.execute({ query: '\\[x\\]' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('todo.md');
  });

  it('should search within specific directory', async () => {
    const result = await tool.execute({ query: 'API', path: 'notes' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('notes/daily.md');
    expect(result.content).toContain('notes/todo.md');
    expect(result.content).not.toContain('readme.md');
  });

  it('should return no matches message', async () => {
    const result = await tool.execute({ query: 'NONEXISTENT_STRING_XYZ' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('No matches');
  });

  it('should be case-insensitive by default', async () => {
    const result = await tool.execute({ query: 'api' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('API');
  });

  it('should return exact line content', async () => {
    const result = await tool.execute({ query: 'sample project' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('readme.md:3:');
  });

  // --- Error recovery ---

  it('should handle invalid regex gracefully', async () => {
    const result = await tool.execute({ query: '[invalid' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Search error');
  });

  // --- Truncation ---

  it('should truncate at 100 matches', async () => {
    const manyLines = Array.from({ length: 150 }, (_, i) => `match line ${i}`).join('\n');
    vault.seedFile('big.md', manyLines);
    const result = await tool.execute({ query: 'match' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('truncated');
    // Count actual match lines (excluding truncation message)
    const lines = result.content.split('\n');
    const matchLines = lines.filter((l: string) => l.startsWith('big.md:'));
    expect(matchLines.length).toBe(100);
  });

  it('should not truncate below 100 matches', async () => {
    const fewLines = Array.from({ length: 50 }, (_, i) => `match line ${i}`).join('\n');
    vault.seedFile('small.md', fewLines);
    const result = await tool.execute({ query: 'match' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content).not.toContain('truncated');
  });

  // --- Schema ---

  it('should have correct schema', () => {
    expect(tool.name).toBe('search');
    expect(tool.inputSchema.properties).toHaveProperty('query');
    expect(tool.inputSchema.properties).toHaveProperty('path');
  });
});

import { ToolRegistry, type Tool, type ToolContext } from '../../src/core/tools/ToolRegistry';
import { ToolExecutor } from '../../src/core/tools/ToolExecutor';
import { ReadFileTool } from '../../src/core/tools/tools/ReadFileTool';
import { WriteFileTool } from '../../src/core/tools/tools/WriteFileTool';
import { EditFileTool } from '../../src/core/tools/tools/EditFileTool';
import { ListFilesTool } from '../../src/core/tools/tools/ListFilesTool';
import { SearchTool } from '../../src/core/tools/tools/SearchTool';
import { MockVault } from '../helpers/mockVault';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register and retrieve tools', () => {
    const tool = new ReadFileTool();
    registry.register(tool);
    expect(registry.getTool('read_file')).toBe(tool);
  });

  it('should return undefined for unknown tool', () => {
    expect(registry.getTool('nonexistent')).toBeUndefined();
  });

  it('should list all registered tools', () => {
    registry.register(new ReadFileTool());
    registry.register(new WriteFileTool());
    registry.register(new EditFileTool());
    registry.register(new ListFilesTool());
    registry.register(new SearchTool());
    expect(registry.getAll()).toHaveLength(5);
  });

  it('should overwrite tool with same name', () => {
    const tool1 = new ReadFileTool();
    const tool2 = new ReadFileTool();
    registry.register(tool1);
    registry.register(tool2);
    expect(registry.getTool('read_file')).toBe(tool2);
  });
});

describe('ToolExecutor', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;
  let vault: MockVault;
  let ctx: ToolContext;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(new ReadFileTool());
    registry.register(new WriteFileTool());
    registry.register(new EditFileTool());
    registry.register(new ListFilesTool());
    registry.register(new SearchTool());

    vault = new MockVault();
    vault.seedFile('test.md', 'Hello World');
    ctx = { app: vault.buildApp() };
    executor = new ToolExecutor(registry, ctx);
  });

  it('should generate provider tool definitions', () => {
    const defs = executor.getDefinitions('anthropic');
    expect(defs).toHaveLength(5);
    expect(defs.map(d => d.name)).toEqual(
      expect.arrayContaining(['read_file', 'write_file', 'edit_file', 'list_files', 'search'])
    );
    defs.forEach(def => {
      expect(def).toHaveProperty('name');
      expect(def).toHaveProperty('description');
      expect(def).toHaveProperty('input_schema');
    });
  });

  it('should execute read_file successfully', async () => {
    const result = await executor.execute('read_file', { file_path: 'test.md' });
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Hello World');
  });

  it('should execute write_file successfully', async () => {
    const result = await executor.execute('write_file', { file_path: 'new.md', content: 'New!' });
    expect(result.isError).toBeFalsy();
    expect(vault.readRaw('new.md')).toBe('New!');
  });

  it('should execute edit_file successfully', async () => {
    const result = await executor.execute('edit_file', {
      file_path: 'test.md',
      old_text: 'Hello',
      new_text: 'Hi',
    });
    expect(result.isError).toBeFalsy();
    expect(vault.readRaw('test.md')).toContain('Hi World');
  });

  it('should execute list_files successfully', async () => {
    const result = await executor.execute('list_files', { path: '.' });
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('test.md');
  });

  it('should execute search successfully', async () => {
    const result = await executor.execute('search', { query: 'Hello' });
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('test.md');
  });

  // --- Error recovery ---

  it('should return error for unknown tool', async () => {
    const result = await executor.execute('unknown_tool', { foo: 'bar' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Unknown tool');
  });

  it('should catch tool execution errors and return error result', async () => {
    // Register a tool that always throws
    const failingTool: Tool = {
      name: 'fail_tool',
      description: 'Always fails',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => { throw new Error('Intentional failure'); },
    };
    registry.register(failingTool);

    const result = await executor.execute('fail_tool', {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Intentional failure');
  });

  it('should pass abort signal through context', async () => {
    const controller = new AbortController();
    const signalReceived: AbortSignal[] = [];

    const signalTool: Tool = {
      name: 'signal_tool',
      description: 'Captures signal',
      inputSchema: { type: 'object', properties: {} },
      execute: async (_input, ctx) => {
        if (ctx.signal) signalReceived.push(ctx.signal);
        return { content: 'ok' };
      },
    };
    registry.register(signalTool);

    controller.abort();
    await executor.execute('signal_tool', {}, controller.signal);
    expect(signalReceived).toHaveLength(1);
    expect(signalReceived[0].aborted).toBe(true);
  });
});

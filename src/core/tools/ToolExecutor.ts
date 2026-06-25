import type { ProviderId } from '../types/provider';
import type { ProviderToolDefinition, ToolResult } from '../types/tools';
import type { ToolRegistry, Tool, ToolContext } from './ToolRegistry';

export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private context: ToolContext,
  ) {}

  getDefinitions(_providerId: ProviderId): ProviderToolDefinition[] {
    return this.registry.getAll().map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  async execute(name: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> {
    const tool = this.registry.getTool(name);
    if (!tool) return { content: `Error: Unknown tool "${name}"`, isError: true };
    try {
      return await tool.execute(input, { ...this.context, signal });
    } catch (error) {
      return {
        content: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }
}

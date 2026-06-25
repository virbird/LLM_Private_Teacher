import type { TFolder } from 'obsidian';
import type { Tool, ToolContext } from '../ToolRegistry';
import type { ToolResult } from '../../types/tools';

export class ListFilesTool implements Tool {
  name = 'list_files';
  description = 'List files and folders in a vault directory.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative directory path (use "." for root)' },
    },
    required: ['path'],
  };

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const dirPath = input.path as string;
    try {
      const folder = dirPath === '.' ? ctx.app.vault.getRoot() : ctx.app.vault.getAbstractFileByPath(dirPath);
      if (!folder || !('children' in folder)) {
        return { content: `Directory not found: ${dirPath}`, isError: true };
      }
      const entries = (folder as TFolder).children.map((child) => {
        const type = 'children' in child ? 'folder' : 'file';
        return `${type}\t${child.path}`;
      });
      return { content: entries.join('\n') || '(empty directory)' };
    } catch (e: unknown) {
      return { content: `Error listing ${dirPath}: ${e instanceof Error ? e.message : String(e)}`, isError: true };
    }
  }
}

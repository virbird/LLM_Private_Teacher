import type { TFile } from 'obsidian';
import type { Tool, ToolContext } from '../ToolRegistry';
import type { ToolResult } from '../../types/tools';

export class WriteFileTool implements Tool {
  name = 'write_file';
  description = 'Write content to a file in the vault. Creates the file if it does not exist, overwrites if it does.';
  inputSchema = {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Relative path to the file from vault root' },
      content: { type: 'string', description: 'The content to write' },
    },
    required: ['file_path', 'content'],
  };

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = input.file_path as string;
    const content = input.content as string;
    try {
      const existing = ctx.app.vault.getAbstractFileByPath(filePath);
      if (existing) {
        await ctx.app.vault.modify(existing as TFile, content);
      } else {
        // Ensure parent directory exists
        const dir = filePath.substring(0, filePath.lastIndexOf('/'));
        if (dir) {
          const dirFile = ctx.app.vault.getAbstractFileByPath(dir);
          if (!dirFile) await ctx.app.vault.createFolder(dir);
        }
        await ctx.app.vault.create(filePath, content);
      }
      return { content: `Successfully wrote to ${filePath}` };
    } catch (e: unknown) {
      return { content: `Error writing ${filePath}: ${e instanceof Error ? e.message : String(e)}`, isError: true };
    }
  }
}

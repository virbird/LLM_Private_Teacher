import { TFile } from 'obsidian';
import type { Tool, ToolContext } from '../ToolRegistry';
import type { ToolResult } from '../../types/tools';

export class ReadFileTool implements Tool {
  name = 'read_file';
  description = 'Read the contents of a file in the vault. Use relative paths from vault root.';
  inputSchema = {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Relative path to the file from vault root' },
      offset: { type: 'number', description: 'Line number to start reading (1-based)' },
      limit: { type: 'number', description: 'Maximum number of lines to read' },
    },
    required: ['file_path'],
  };

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = input.file_path as string;
    if (!filePath) {
      return { content: 'Error: file_path is required', isError: true };
    }

    try {
      const file = ctx.app.vault.getAbstractFileByPath(filePath);
      if (!file) {
        return { content: `File not found: ${filePath}`, isError: true };
      }
      if ('children' in file) {
        return { content: `Path is a directory, not a file: ${filePath}`, isError: true };
      }

      if (!(file instanceof TFile)) {
        return { content: `Path is not a file: ${filePath}`, isError: true };
      }

      const content = await ctx.app.vault.read(file);
      const lines = content.split('\n');
      const offset = typeof input.offset === 'number' ? input.offset : 1;
      const limit = typeof input.limit === 'number' ? input.limit : lines.length;

      if (offset < 1) {
        return { content: `Error: offset must be >= 1, got ${offset}`, isError: true };
      }
      if (limit < 1) {
        return { content: `Error: limit must be >= 1, got ${limit}`, isError: true };
      }
      if (offset > lines.length) {
        return { content: `Error: offset ${offset} exceeds file length (${lines.length} lines)`, isError: true };
      }

      const sliced = lines.slice(offset - 1, offset - 1 + limit);
      const numbered = sliced.map((line, i) => `${offset + i}\t${line}`).join('\n');
      return { content: numbered };
    } catch (e: unknown) {
      return { content: `Error reading ${filePath}: ${e instanceof Error ? e.message : String(e)}`, isError: true };
    }
  }
}

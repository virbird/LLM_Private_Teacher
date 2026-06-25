import type { Tool, ToolContext } from '../ToolRegistry';
import type { ToolResult } from '../../types/tools';

export class EditFileTool implements Tool {
  name = 'edit_file';
  description = 'Edit a file by replacing exact text matches. old_text must match exactly.';
  inputSchema = {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Relative path to the file' },
      old_text: { type: 'string', description: 'Exact text to find' },
      new_text: { type: 'string', description: 'Replacement text' },
    },
    required: ['file_path', 'old_text', 'new_text'],
  };

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = input.file_path as string;
    const oldText = input.old_text as string;
    const newText = input.new_text as string;
    try {
      const file = ctx.app.vault.getAbstractFileByPath(filePath);
      if (!file) return { content: `File not found: ${filePath}`, isError: true };
      const content = await ctx.app.vault.read(file as any);
      if (!content.includes(oldText)) {
        return { content: `old_text not found in ${filePath}. Make sure it matches exactly.`, isError: true };
      }
      const updated = content.replace(oldText, newText);
      await ctx.app.vault.modify(file as any, updated);
      return { content: `Successfully edited ${filePath}` };
    } catch (e) {
      return { content: `Error editing ${filePath}: ${e}`, isError: true };
    }
  }
}

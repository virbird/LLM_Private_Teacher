import type { Tool, ToolContext } from '../ToolRegistry';
import type { ToolResult } from '../../types/tools';

export class SearchTool implements Tool {
  name = 'search';
  description = 'Search for text across all markdown files in the vault. Returns matching lines with file paths.';
  inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text or regex pattern to search for' },
      path: { type: 'string', description: 'Optional: limit search to this directory' },
    },
    required: ['query'],
  };

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const query = input.query as string;
    const searchPath = input.path as string | undefined;
    try {
      const regex = new RegExp(query, 'gi');
      const files = ctx.app.vault.getMarkdownFiles();
      const results: string[] = [];
      let matchCount = 0;
      const MAX_MATCHES = 100;

      for (const file of files) {
        if (searchPath && !file.path.startsWith(searchPath)) continue;
        if (matchCount >= MAX_MATCHES) break;

        const content = await ctx.app.vault.read(file);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (matchCount >= MAX_MATCHES) break;
          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            results.push(`${file.path}:${i + 1}: ${lines[i].trim()}`);
            matchCount++;
          }
        }
      }

      if (matchCount >= MAX_MATCHES) {
        results.push('... (truncated at 100 matches)');
      }
      return { content: results.length > 0 ? results.join('\n') : 'No matches found.' };
    } catch (e) {
      return { content: `Search error: ${e instanceof Error ? e.message : String(e)}`, isError: true };
    }
  }
}

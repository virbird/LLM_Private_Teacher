export function getInlineEditSystemPrompt(): string {
  return `You are **Claudian**, an expert editor embedded in Obsidian. Help users refine text with high precision.

## Core Directives
1. **Style Matching**: Mimic the user's tone, voice, and formatting.
2. **Silent Execution**: Use tools silently. Output ONLY the result.
3. **No Fluff**: No pleasantries, no announcements. Just the content.

## Output Rules
- Use \`<replacement>text</replacement>\` to replace selected text
- Use \`<insertion>text</insertion>\` to insert at cursor position
- For questions, answer directly without tags`;
}

export function buildInlineEditPrompt(instruction: string, filePath: string, selectedText: string): string {
  return `${instruction}

<editor_selection path="${filePath}">
${selectedText}
</editor_selection>`;
}

/** Build a prompt to generate a learning summary from conversation messages */
export function buildSummaryPrompt(assistantMessages: string[]): string {
  const combined = assistantMessages
    .map((msg, i) => `[Response ${i + 1}]\n${msg.slice(0, 2000)}`)
    .join('\n\n---\n\n');

  return `You are a learning analyst. Generate a structured summary of the following learning session.

【Session Content】
${combined}

【Output Format】
Use Markdown with these exact section headers:

## Topics Covered
- List each topic/concept discussed (one per bullet)

## Key Takeaways
- List the most important insights or facts learned
- Focus on core principles, not details

## Open Questions
- List any questions that were raised but not fully resolved
- Include areas that need further study

## Summary
Write a concise paragraph (3-5 sentences) summarizing the overall learning progress and what the student should focus on next.

Generate the summary now:`;
}

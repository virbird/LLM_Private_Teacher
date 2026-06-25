/** Build a prompt to generate a Mermaid knowledge map */
export function buildKnowledgeMapPrompt(topic: string, materialContent?: string): string {
  const topicLine = topic ? `Topic: ${topic}` : 'Topic: Based on recent learning conversation';
  const materialSection = materialContent
    ? `\n\n【Learning Material】\n${materialContent.slice(0, 3000)}`
    : '';

  return `You are a knowledge visualization expert. Generate a concept relationship diagram using Mermaid syntax.

${topicLine}${materialSection}

【Requirements】
1. Identify 8-15 key concepts
2. Show relationships between concepts with labeled edges
3. Use a top-down layout (graph TD)
4. Group related concepts using subgraphs when appropriate
5. Mark prerequisite relationships (concept A must be understood before concept B)

【Output Format】
Output a valid Mermaid diagram inside a code block, followed by a concept list:

\`\`\`mermaid
graph TD
    A[Concept A] -->|relationship| B[Concept B]
    ...
\`\`\`

## Concepts
1. **Concept Name** — Brief description
2. ...

## Key Relationships
- A → B: explanation of why A leads to B
- ...

Generate the knowledge map now:`;
}

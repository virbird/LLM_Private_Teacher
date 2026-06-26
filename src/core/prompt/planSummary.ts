import type { ChatMessage } from '../types/chat';

/** Max characters per message to keep the prompt concise */
const MAX_MSG_CHARS = 500;
/** Max recent conversation turns (user+assistant pairs) */
const MAX_TURNS = 10;

/**
 * Build a prompt that asks the AI to analyze the user's chat history and
 * learning material, then produce a structured summary for plan generation.
 */
export function buildPlanSummaryPrompt(
  messages: ChatMessage[],
  materialContent?: string,
): string {
  // Extract recent user/assistant text messages (skip empty assistant placeholders)
  const conversationMessages = messages
    .filter(m => m.content && m.content.trim().length > 0)
    .slice(-MAX_TURNS * 2);

  let conversationSection = '';
  if (conversationMessages.length > 0) {
    const lines = conversationMessages.map(m => {
      const role = m.role === 'user' ? 'User' : 'AI';
      const content = m.content.slice(0, MAX_MSG_CHARS);
      return `${role}: ${content}`;
    });
    conversationSection = `\n\n【Recent Conversation】\n${lines.join('\n\n')}`;
  }

  const materialSection = materialContent
    ? `\n\n【Learning Material】\n${materialContent.slice(0, 3000)}`
    : '';

  return `You are a learning analyst. Analyze the following learning context and produce a structured summary.

【Context】${conversationSection}${materialSection}

【Output Format】
Output your analysis in exactly these sections:

【User Knowledge Gaps】
- List specific concepts/topics the user seems to struggle with or asked about
- (Leave empty if no clear gaps are identifiable)

【User Strengths】
- List concepts/topics the user appears to already understand
- (Leave empty if no clear strengths are identifiable)

【Material Key Points】
- List 3-5 core concepts from the learning material
- (Leave empty if no material provided)

【Planning Suggestions】
- List 2-4 specific recommendations for what the learning plan should focus on
- Consider the user's gaps, strengths, and material content

Analyze the context now:`;
}

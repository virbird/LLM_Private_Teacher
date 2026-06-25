export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  createdAt: number;
}

/** Build a prompt that asks the AI to generate flashcards */
export function buildFlashcardPrompt(topic: string, materialContent?: string): string {
  const topicLine = topic ? `Topic: ${topic}` : 'Topic: Based on recent learning conversation';
  const materialSection = materialContent
    ? `\n\n【Learning Material】\n${materialContent}`
    : '';

  return `You are a flashcard generation expert. Generate 8-12 high-quality Q&A flashcards.

${topicLine}${materialSection}

【Requirements】
1. Each card should test ONE specific concept or fact
2. Questions should be clear and unambiguous
3. Answers should be concise (1-3 sentences)
4. Mix difficulty levels: ~30% easy, ~50% medium, ~20% hard
5. Cover different aspects: definitions, relationships, applications, common mistakes

【Output Format】
Output each card in this exact format:
<card>
<q>Question text here</q>
<a>Answer text here</a>
<difficulty>easy|medium|hard</difficulty>
<tags>tag1, tag2</tags>
</card>

Generate the cards now:`;
}

/** Parse AI response to extract Flashcard[] from <card> tags */
export function parseFlashcards(response: string): Flashcard[] {
  const cards: Flashcard[] = [];
  const cardRegex = /<card>\s*<q>([\s\S]*?)<\/q>\s*<a>([\s\S]*?)<\/a>\s*(?:<difficulty>([\s\S]*?)<\/difficulty>\s*)?(?:<tags>([\s\S]*?)<\/tags>\s*)?<\/card>/gi;

  let match;
  while ((match = cardRegex.exec(response)) !== null) {
    const question = match[1].trim();
    const answer = match[2].trim();
    const difficulty = (match[3]?.trim() || 'medium') as Flashcard['difficulty'];
    const tagsStr = match[4]?.trim() || '';
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

    if (question && answer) {
      cards.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + cards.length,
        question,
        answer,
        topic: '',
        difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
        tags,
        createdAt: Date.now(),
      });
    }
  }

  return cards;
}

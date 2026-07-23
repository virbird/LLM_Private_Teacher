export interface Flashcard {
  id: string;
  subject: string;
  question: string;   // cloze card: full text containing {{c1::...}}
  answer: string;     // cloze card: comma-separated cloze answers
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  createdAt: number;
  type?: 'qa' | 'cloze';  // defaults to 'qa' for backward compatibility
}

/** Build a prompt that asks the AI to generate flashcards */
export function buildFlashcardPrompt(subject: string, topic: string, materialContent?: string): string {
  const subjectLine = subject ? `Subject: ${subject}` : '';
  const topicLine = topic ? `Topic: ${topic}` : 'Topic: Based on recent learning conversation';
  const materialSection = materialContent
    ? `\n\n【Learning Material】\n${materialContent}`
    : '';

  return `You are a flashcard generation expert. Generate 8-12 high-quality Q&A flashcards.

${subjectLine ? subjectLine + '\n' : ''}${topicLine}${materialSection}

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

/** Build a prompt that asks the AI to generate cloze deletion flashcards */
export function buildClozePrompt(subject: string, topic: string, materialContent?: string): string {
  const subjectLine = subject ? `Subject: ${subject}` : '';
  const topicLine = topic ? `Topic: ${topic}` : 'Topic: Based on recent learning conversation';
  const materialSection = materialContent
    ? `\n\n【Learning Material】\n${materialContent}`
    : '';

  return `You are a flashcard generation expert. Generate 8-12 high-quality CLOZE DELETION flashcards.

${subjectLine ? subjectLine + '\n' : ''}${topicLine}${materialSection}

【Requirements】
1. Each card is a sentence or phrase with ONE key part hidden using {{c1::hidden text}} syntax
2. The hidden part should be a critical fact: term, number, date, or key concept
3. The surrounding context must provide enough clues to recall the hidden part
4. Mix difficulty levels: ~30% easy, ~50% medium, ~20% hard
5. Keep each card text concise (one sentence or short phrase)

【Cloze Syntax】
- Hide text with double curly braces: The capital of France is {{c1::Paris}}.
- Multiple deletions in one card use incrementing numbers: {{c1::first}} and {{c2::second}}

【Output Format】
Output each card in this exact format:
<card>
<type>cloze</type>
<q>Full sentence with {{c1::hidden part}} marked</q>
<a>hidden part (comma-separated if multiple)</a>
<difficulty>easy|medium|hard</difficulty>
<tags>tag1, tag2</tags>
</card>

Generate the cards now:`;
}

/** Render cloze text as a question: {{c1::xxx}} → [......] */
export function renderClozeQuestion(text: string): string {
  return text.replace(/\{\{c\d+::[\s\S]*?\}\}/g, '[......]');
}

/** Render cloze text as an answer: {{c1::xxx}} → **xxx** */
export function renderClozeAnswer(text: string): string {
  return text.replace(/\{\{c\d+::([\s\S]*?)\}\}/g, '**$1**');
}

/** Parse AI response to extract Flashcard[] from <card> tags (supports both qa and cloze types) */
export function parseFlashcards(response: string): Flashcard[] {
  const cards: Flashcard[] = [];
  const cardRegex = /<card>\s*(?:<type>([\s\S]*?)<\/type>\s*)?<q>([\s\S]*?)<\/q>\s*<a>([\s\S]*?)<\/a>\s*(?:<difficulty>([\s\S]*?)<\/difficulty>\s*)?(?:<tags>([\s\S]*?)<\/tags>\s*)?<\/card>/gi;

  let match;
  while ((match = cardRegex.exec(response)) !== null) {
    const typeStr = match[1]?.trim().toLowerCase() || 'qa';
    const type: Flashcard['type'] = typeStr === 'cloze' ? 'cloze' : 'qa';
    const question = match[2].trim();
    const answer = match[3].trim();
    const difficulty = (match[4]?.trim() || 'medium') as Flashcard['difficulty'];
    const tagsStr = match[5]?.trim() || '';
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

    if (question && answer) {
      cards.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + cards.length,
        question,
        answer,
        subject: '',
        topic: '',
        difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
        tags,
        createdAt: Date.now(),
        type,
      });
    }
  }

  return cards;
}

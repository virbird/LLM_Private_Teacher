export interface QuizQuestion {
  id: number;
  type: 'multiple-choice' | 'fill-blank' | 'short-answer';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  points: number;
  topic: string;
}

export interface QuizResult {
  totalQuestions: number;
  correct: number;
  incorrect: number;
  score: number;
  weakAreas: string[];
  answers: { questionId: number; userAnswer: string; isCorrect: boolean }[];
}

/** Build a prompt to generate a quiz with multiple question types */
export function buildQuizPrompt(topic: string, materialContent?: string): string {
  const materialSection = materialContent
    ? `\n\n【Learning Material】\n${materialContent.slice(0, 3000)}`
    : '';

  return `You are an exam designer. Create a comprehensive quiz on the given topic.

【Topic】
${topic}${materialSection}

【Requirements】
1. Generate 8-10 questions total
2. Mix question types: ~40% multiple-choice, ~30% fill-in-the-blank, ~30% short-answer
3. Cover different difficulty levels and subtopics
4. Each question should test understanding, not just memorization

【Output Format】
Use this exact format for each question:

<quiz>

### Q1 (multiple-choice)
**Question:** What is ...?
- A) option A
- B) option B
- C) option C
- D) option D
<answer>A</answer>
<explanation>Brief explanation of why A is correct</explanation>
<topic>subtopic name</topic>

### Q2 (fill-blank)
**Question:** The process of ___ converts ...
<answer>photosynthesis</answer>
<explanation>Brief explanation</explanation>
<topic>subtopic name</topic>

### Q3 (short-answer)
**Question:** Explain the relationship between ...
<answer>Key points that should be covered in the answer</answer>
<explanation>Detailed explanation</explanation>
<topic>subtopic name</topic>

</quiz>

Generate the quiz now:`;
}

/** Parse quiz response to extract questions */
export function parseQuizAnswers(response: string): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  const qRegex = /###\s*Q(\d+)\s*\(([^)]+)\)\s*\n\*\*Question:\*\*\s*([\s\S]*?)(?=<answer>([\s\S]*?)<\/answer>\s*<explanation>([\s\S]*?)<\/explanation>\s*<topic>([\s\S]*?)<\/topic>)/gi;

  let match;
  let id = 0;
  while ((match = qRegex.exec(response)) !== null) {
    id++;
    const type = match[2].trim() as QuizQuestion['type'];
    const question = match[3].trim();
    const correctAnswer = match[4].trim();
    const explanation = match[5].trim();
    const topic = match[6].trim();

    // Extract options for multiple-choice
    let options: string[] | undefined;
    if (type === 'multiple-choice') {
      const optRegex = /-\s*([A-D])\)\s*(.+)/g;
      options = [];
      let optMatch;
      while ((optMatch = optRegex.exec(question)) !== null) {
        options.push(`${optMatch[1]}) ${optMatch[2].trim()}`);
      }
    }

    questions.push({
      id,
      type,
      question: question.replace(/\n-\s*[A-D]\)\s*.+/g, '').trim(),
      options,
      correctAnswer,
      explanation,
      points: type === 'short-answer' ? 2 : 1,
      topic,
    });
  }

  return questions;
}

/** Build a prompt for AI-assisted error review */
export function buildErrorReviewPrompt(mistakes: { question: string; correctAnswer: string; explanation: string; topic: string }[]): string {
  const mistakeList = mistakes
    .map((m, i) => `${i + 1}. [${m.topic}] Q: ${m.question}\n   Correct: ${m.correctAnswer}\n   Explanation: ${m.explanation}`)
    .join('\n\n');

  return `You are a learning coach reviewing a student's mistakes. Help them understand and master these concepts.

【Mistakes to Review】
${mistakeList}

【Instructions】
1. For each mistake, create a new similar question to test understanding
2. Provide a simplified explanation using analogies or examples
3. Identify common patterns in the mistakes (e.g., confusing similar concepts)
4. Suggest a focused study plan for the weak areas

【Output Format】
## Review Questions

### R1: [Related to mistake 1]
**Question:** A new question testing the same concept
<answer>Correct answer</answer>

### R2: [Related to mistake 2]
...

## Pattern Analysis
- What types of mistakes are most common
- What concepts need reinforcement

## Study Recommendations
1. Specific action item
2. Specific action item

Generate the review now:`;
}

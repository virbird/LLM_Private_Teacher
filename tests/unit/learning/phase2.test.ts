import { sm2Schedule, SpacedRepetitionManager, type ReviewEntry } from '../../../src/core/learning/spacedRepetition';
import { buildQuizPrompt, parseQuizAnswers } from '../../../src/core/prompt/quiz';
import { LearningStorage } from '../../../src/core/learning/LearningStorage';

function createEntry(overrides: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    cardId: 'test-1',
    question: 'What is X?',
    answer: 'X is Y',
    topic: 'test',
    difficulty: 'medium',
    tags: [],
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReviewDate: '2025-01-01',
    lastReviewDate: '',
    history: [],
    ...overrides,
  };
}

describe('SM-2 Algorithm', () => {
  it('quality 5: first review sets interval to 1', () => {
    const entry = createEntry({ repetitions: 0 });
    const result = sm2Schedule(entry, 5);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(result.easeFactor).toBeGreaterThanOrEqual(2.5);
  });

  it('quality 4: second review sets interval to 6', () => {
    const entry = createEntry({ repetitions: 1, interval: 1 });
    const result = sm2Schedule(entry, 4);
    expect(result.interval).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it('quality 3: third review uses interval * easeFactor', () => {
    const entry = createEntry({ repetitions: 2, interval: 6, easeFactor: 2.5 });
    const result = sm2Schedule(entry, 3);
    expect(result.interval).toBe(15); // 6 * 2.5
    expect(result.repetitions).toBe(3);
  });

  it('quality < 3: resets repetitions and interval', () => {
    const entry = createEntry({ repetitions: 5, interval: 30, easeFactor: 2.5 });
    const result = sm2Schedule(entry, 2);
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
  });

  it('quality 0: resets completely', () => {
    const entry = createEntry({ repetitions: 10, interval: 100 });
    const result = sm2Schedule(entry, 0);
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
  });

  it('easeFactor never goes below 1.3', () => {
    const entry = createEntry({ easeFactor: 1.3 });
    const result = sm2Schedule(entry, 0);
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('easeFactor increases with high quality', () => {
    const entry = createEntry({ easeFactor: 2.5 });
    const result = sm2Schedule(entry, 5);
    expect(result.easeFactor).toBeGreaterThan(2.5);
  });

  it('easeFactor decreases with low quality (but >= 3)', () => {
    const entry = createEntry({ easeFactor: 2.5 });
    const result = sm2Schedule(entry, 3);
    expect(result.easeFactor).toBeLessThan(2.5);
  });

  it('records history entry', () => {
    const entry = createEntry();
    const result = sm2Schedule(entry, 4);
    expect(result.history).toHaveLength(1);
    expect(result.history[0].quality).toBe(4);
  });

  it('limits history to 50 entries', () => {
    const entry = createEntry({
      history: Array(50).fill({ date: '2025-01-01', quality: 4, intervalBefore: 1, intervalAfter: 2 }),
    });
    const result = sm2Schedule(entry, 4);
    expect(result.history.length).toBeLessThanOrEqual(50);
  });

  it('sets nextReviewDate correctly', () => {
    const entry = createEntry({ interval: 0, repetitions: 0 });
    const result = sm2Schedule(entry, 5);
    expect(result.nextReviewDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('SpacedRepetitionManager', () => {
  function createManager(overrides: any = {}): SpacedRepetitionManager {
    const mockApp = {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(false),
          read: jest.fn().mockResolvedValue('[]'),
          write: jest.fn().mockResolvedValue(undefined),
          mkdir: jest.fn().mockResolvedValue(undefined),
          ...overrides.adapter,
        },
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
        create: jest.fn().mockResolvedValue({}),
        modify: jest.fn().mockResolvedValue(undefined),
      },
    };
    const storage = new LearningStorage(mockApp);
    return new SpacedRepetitionManager(storage);
  }

  it('addCards adds new flashcards to schedule', async () => {
    const manager = createManager();
    const cards = [
      { id: 'c1', question: 'Q1', answer: 'A1', topic: 'test', difficulty: 'easy' as const, tags: [], createdAt: Date.now() },
      { id: 'c2', question: 'Q2', answer: 'A2', topic: 'test', difficulty: 'medium' as const, tags: [], createdAt: Date.now() },
    ];
    const added = await manager.addCards(cards);
    expect(added).toBe(2);
  });

  it('getStats returns correct counts', async () => {
    const manager = createManager();
    const stats = await manager.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('due');
    expect(stats).toHaveProperty('reviewed');
  });
});

describe('Quiz prompt builder', () => {
  it('includes topic in prompt', () => {
    const prompt = buildQuizPrompt('Biology');
    expect(prompt).toContain('Biology');
    expect(prompt).toContain('quiz');
  });

  it('includes material when provided', () => {
    const prompt = buildQuizPrompt('test', 'Cell structure material');
    expect(prompt).toContain('Cell structure material');
  });

  it('truncates long material', () => {
    const prompt = buildQuizPrompt('test', 'x'.repeat(5000));
    expect(prompt.length).toBeLessThan(5000);
  });

  it('specifies all question types', () => {
    const prompt = buildQuizPrompt('test');
    expect(prompt).toContain('multiple-choice');
    expect(prompt).toContain('fill-blank');
    expect(prompt).toContain('short-answer');
  });
});

describe('Quiz parser', () => {
  it('parses multiple-choice question', () => {
    const response = `### Q1 (multiple-choice)
**Question:** What is the powerhouse of the cell?
- A) Nucleus
- B) Mitochondria
- C) Ribosome
- D) Golgi body
<answer>B</answer>
<explanation>Mitochondria produce ATP</explanation>
<topic>cell biology</topic>`;
    const questions = parseQuizAnswers(response);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe('multiple-choice');
    expect(questions[0].correctAnswer).toBe('B');
    expect(questions[0].topic).toBe('cell biology');
  });

  it('parses fill-blank question', () => {
    const response = `### Q2 (fill-blank)
**Question:** The process of ___ converts light energy to chemical energy.
<answer>photosynthesis</answer>
<explanation>Plants use sunlight to make food</explanation>
<topic>plant biology</topic>`;
    const questions = parseQuizAnswers(response);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe('fill-blank');
    expect(questions[0].correctAnswer).toBe('photosynthesis');
  });

  it('parses short-answer question', () => {
    const response = `### Q3 (short-answer)
**Question:** Explain the difference between mitosis and meiosis.
<answer>Mitosis produces 2 identical cells, meiosis produces 4 unique cells</answer>
<explanation>Mitosis is for growth, meiosis is for reproduction</explanation>
<topic>cell division</topic>`;
    const questions = parseQuizAnswers(response);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe('short-answer');
    expect(questions[0].points).toBe(2);
  });

  it('returns empty for invalid response', () => {
    expect(parseQuizAnswers('no quiz here')).toEqual([]);
    expect(parseQuizAnswers('')).toEqual([]);
  });
});

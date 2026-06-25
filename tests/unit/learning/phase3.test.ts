import { LearningStatsService, type LearningStats } from '../../../src/core/learning/stats';
import { ErrorNotebook, type MistakeEntry } from '../../../src/core/learning/errorNotebook';
import { LearningStorage } from '../../../src/core/learning/LearningStorage';
import { buildStudyBuddyPrompt } from '../../../src/core/prompt/studyBuddy';
import { buildErrorReviewPrompt } from '../../../src/core/prompt/errorReview';
import { setLocale, t } from '../../../src/core/i18n';

function createMockStorage(overrides: any = {}): LearningStorage {
  // In-memory file store for persistence across calls
  const fileStore: Record<string, string> = {};
  const mockApp = {
    vault: {
      adapter: {
        exists: jest.fn().mockImplementation((path: string) => Promise.resolve(path in fileStore)),
        read: jest.fn().mockImplementation((path: string) => Promise.resolve(fileStore[path] || '{}')),
        write: jest.fn().mockImplementation((path: string, data: string) => { fileStore[path] = data; return Promise.resolve(undefined); }),
        mkdir: jest.fn().mockResolvedValue(undefined),
        ...overrides.adapter,
      },
      getAbstractFileByPath: jest.fn().mockReturnValue(null),
      create: jest.fn().mockResolvedValue({}),
      modify: jest.fn().mockResolvedValue(undefined),
    },
  };
  return new LearningStorage(mockApp);
}

describe('LearningStatsService', () => {
  it('computeStats returns valid structure with no data', async () => {
    const storage = createMockStorage();
    const service = new LearningStatsService(storage);
    const stats = await service.computeStats();
    expect(stats).toHaveProperty('flashcards');
    expect(stats).toHaveProperty('reviews');
    expect(stats).toHaveProperty('quizzes');
    expect(stats).toHaveProperty('logs');
    expect(stats).toHaveProperty('activity');
    expect(stats.flashcards.total).toBe(0);
    expect(stats.reviews.total).toBe(0);
  });

  it('computeStats counts flashcards by difficulty', async () => {
    const flashcards = [
      { id: '1', question: 'Q1', answer: 'A1', topic: 'math', difficulty: 'easy', tags: [], createdAt: 0 },
      { id: '2', question: 'Q2', answer: 'A2', topic: 'math', difficulty: 'hard', tags: [], createdAt: 0 },
      { id: '3', question: 'Q3', answer: 'A3', topic: 'physics', difficulty: 'easy', tags: [], createdAt: 0 },
    ];
    const readFn = jest.fn().mockImplementation((path: string) => {
      if (path.includes('flashcards')) return Promise.resolve(JSON.stringify(flashcards));
      return Promise.resolve('[]');
    });
    const existsFn = jest.fn().mockResolvedValue(true);
    const storage = createMockStorage({ adapter: { read: readFn, exists: existsFn } });
    const service = new LearningStatsService(storage);
    const stats = await service.computeStats();
    expect(stats.flashcards.total).toBe(3);
    expect(stats.flashcards.byDifficulty['easy']).toBe(2);
    expect(stats.flashcards.byDifficulty['hard']).toBe(1);
  });

  it('formatStatsMarkdown includes all sections', async () => {
    const storage = createMockStorage();
    const service = new LearningStatsService(storage);
    const stats = await service.computeStats();
    const md = service.formatStatsMarkdown(stats);
    expect(md).toContain('Learning Statistics');
    expect(md).toContain('Overview');
    expect(md).toContain('Last 7 Days');
  });

  it('calculateStreak returns 0 with no history', async () => {
    const storage = createMockStorage();
    const service = new LearningStatsService(storage);
    const stats = await service.computeStats();
    expect(stats.reviews.streak).toBe(0);
  });
});

describe('ErrorNotebook', () => {
  it('addMistakes adds new entries', async () => {
    const storage = createMockStorage();
    const notebook = new ErrorNotebook(storage);
    const added = await notebook.addMistakes([
      { question: 'Q1', userAnswer: 'wrong', correctAnswer: 'right', explanation: 'exp', topic: 'math', quizDate: '2025-01-01' },
      { question: 'Q2', userAnswer: 'bad', correctAnswer: 'good', explanation: 'exp2', topic: 'math', quizDate: '2025-01-01' },
    ]);
    expect(added).toBe(2);
  });

  it('addMistakes skips duplicates', async () => {
    const storage = createMockStorage();
    const notebook = new ErrorNotebook(storage);
    await notebook.addMistakes([
      { question: 'Same Q', userAnswer: 'wrong', correctAnswer: 'right', explanation: 'exp', topic: 'math', quizDate: '2025-01-01' },
    ]);
    const added = await notebook.addMistakes([
      { question: 'Same Q', userAnswer: 'wrong again', correctAnswer: 'right', explanation: 'exp', topic: 'math', quizDate: '2025-01-02' },
    ]);
    expect(added).toBe(0);
  });

  it('getActive returns only unmastered', async () => {
    const storage = createMockStorage();
    const notebook = new ErrorNotebook(storage);
    await notebook.addMistakes([
      { question: 'Q1', userAnswer: 'a', correctAnswer: 'b', explanation: 'e', topic: 't', quizDate: '2025-01-01' },
    ]);
    const all = await notebook.getAll();
    await notebook.markMastered(all[0].id);
    const active = await notebook.getActive();
    expect(active).toHaveLength(0);
  });

  it('markMastered returns false for unknown id', async () => {
    const storage = createMockStorage();
    const notebook = new ErrorNotebook(storage);
    const result = await notebook.markMastered('nonexistent');
    expect(result).toBe(false);
  });

  it('getStats returns correct counts', async () => {
    const storage = createMockStorage();
    const notebook = new ErrorNotebook(storage);
    await notebook.addMistakes([
      { question: 'Q1', userAnswer: 'a', correctAnswer: 'b', explanation: 'e', topic: 'math', quizDate: '2025-01-01' },
      { question: 'Q2', userAnswer: 'a', correctAnswer: 'b', explanation: 'e', topic: 'physics', quizDate: '2025-01-01' },
    ]);
    const stats = await notebook.getStats();
    expect(stats.total).toBe(2);
    expect(stats.active).toBe(2);
    expect(stats.mastered).toBe(0);
    expect(stats.byTopic['math']).toBe(1);
  });

  it('formatMarkdown returns empty string when no mistakes', async () => {
    const storage = createMockStorage();
    const notebook = new ErrorNotebook(storage);
    const md = await notebook.formatMarkdown();
    expect(md).toBe('');
  });

  it('formatMarkdown includes entries', async () => {
    const storage = createMockStorage();
    const notebook = new ErrorNotebook(storage);
    await notebook.addMistakes([
      { question: 'What is X?', userAnswer: 'Y', correctAnswer: 'Z', explanation: 'Because', topic: 'science', quizDate: '2025-01-01' },
    ]);
    const md = await notebook.formatMarkdown();
    expect(md).toContain('Error Notebook');
    expect(md).toContain('What is X?');
    expect(md).toContain('science');
  });
});

describe('Study Buddy prompt', () => {
  it('includes topic in prompt', () => {
    const prompt = buildStudyBuddyPrompt('Quantum Physics');
    expect(prompt).toContain('Quantum Physics');
    expect(prompt).toContain('confused classmate');
  });

  it('includes behavioral instructions', () => {
    const prompt = buildStudyBuddyPrompt('test');
    expect(prompt).toContain('naive');
    expect(prompt).toContain('questions');
  });
});

describe('Error Review prompt', () => {
  it('includes all mistakes in prompt', () => {
    const mistakes = [
      { question: 'Q1', correctAnswer: 'A1', explanation: 'E1', topic: 'math' },
      { question: 'Q2', correctAnswer: 'A2', explanation: 'E2', topic: 'physics' },
    ];
    const prompt = buildErrorReviewPrompt(mistakes);
    expect(prompt).toContain('Q1');
    expect(prompt).toContain('Q2');
    expect(prompt).toContain('math');
    expect(prompt).toContain('physics');
  });

  it('requests review questions and analysis', () => {
    const prompt = buildErrorReviewPrompt([{ question: 'Q', correctAnswer: 'A', explanation: 'E', topic: 'T' }]);
    expect(prompt).toContain('Review Questions');
    expect(prompt).toContain('Pattern Analysis');
    expect(prompt).toContain('Study Recommendations');
  });
});

describe('Phase 3 i18n keys', () => {
  it('English keys for new commands', () => {
    setLocale('en');
    expect(t('cmd.stats')).toBe('Show learning statistics dashboard');
    expect(t('cmd.mistakes')).toBe('View and manage error notebook');
    expect(t('cmd.buddy')).toBe('Enter study buddy mode for a topic');
    expect(t('learning.buddy.enter', { topic: 'Math' })).toContain('Math');
    expect(t('learning.buddy.exit')).toContain('deactivated');
  });

  it('Chinese keys for new commands', () => {
    setLocale('zh');
    expect(t('cmd.stats')).toBe('显示学习统计面板');
    expect(t('cmd.mistakes')).toBe('查看错题本');
    expect(t('cmd.buddy')).toBe('进入学习伙伴模式');
    expect(t('learning.buddy.enter', { topic: '数学' })).toContain('数学');
    setLocale('en');
  });
});

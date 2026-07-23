import { CardManager } from '../../../src/core/learning/cardManager';
import { LearningStorage } from '../../../src/core/learning/LearningStorage';
import type { ReviewEntry } from '../../../src/core/learning/spacedRepetition';

// In-memory mock storage
function createMockStorage(data: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...data };
  return {
    readJson: jest.fn(async <T>(path: string, fallback: T): Promise<T> => {
      return (store[path] as T) ?? fallback;
    }),
    writeJson: jest.fn(async (path: string, value: unknown): Promise<void> => {
      store[path] = value;
    }),
    _store: store,
  } as unknown as LearningStorage & { _store: Record<string, unknown> };
}

function entry(overrides: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    cardId: 'abc123def456',
    question: 'What is X?',
    answer: 'X is Y',
    subject: '物理',
    topic: '力学',
    difficulty: 'medium',
    tags: ['tag1'],
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReviewDate: '2025-01-01',
    lastReviewDate: '',
    history: [],
    ...overrides,
  };
}

describe('CardManager', () => {
  describe('listCards', () => {
    it('returns empty message when no cards', async () => {
      const storage = createMockStorage({ 'review/schedule.json': [] });
      const manager = new CardManager(storage);
      const result = await manager.listCards();
      expect(result).toContain('/flashcard');
    });

    it('lists cards as markdown table', async () => {
      const storage = createMockStorage({
        'review/schedule.json': [entry(), entry({ cardId: 'xyz789ghi012', question: 'Second Q' })],
      });
      const manager = new CardManager(storage);
      const result = await manager.listCards();
      expect(result).toContain('| ID |');
      expect(result).toContain('def456');
      expect(result).toContain('What is X?');
      expect(result).toContain('Second Q');
    });

    it('filters by subject', async () => {
      const storage = createMockStorage({
        'review/schedule.json': [entry(), entry({ cardId: 'other111', subject: '化学' })],
      });
      const manager = new CardManager(storage);
      const result = await manager.listCards('物理');
      expect(result).toContain('def456');
      expect(result).not.toContain('other111');
    });

    it('shows suspended state', async () => {
      const storage = createMockStorage({
        'review/schedule.json': [entry({ suspended: true })],
      });
      const manager = new CardManager(storage);
      const result = await manager.listCards();
      expect(result).toContain('⏸️');
    });
  });

  describe('editCard', () => {
    it('edits question in both schedule and index', async () => {
      const storage = createMockStorage({
        'review/schedule.json': [entry()],
        'flashcards/index.json': [{ id: 'abc123def456', question: 'What is X?', answer: 'X is Y', subject: '物理', topic: '力学', difficulty: 'medium', tags: [], createdAt: 1 }],
      });
      const manager = new CardManager(storage);
      const result = await manager.editCard('def456', 'q', 'New question');
      expect(result).toContain('✅');

      const schedule = storage._store['review/schedule.json'] as ReviewEntry[];
      expect(schedule[0].question).toBe('New question');
      const index = storage._store['flashcards/index.json'] as Array<{ question: string }>;
      expect(index[0].question).toBe('New question');
    });

    it('edits answer', async () => {
      const storage = createMockStorage({
        'review/schedule.json': [entry()],
        'flashcards/index.json': [],
      });
      const manager = new CardManager(storage);
      await manager.editCard('abc123def456', 'a', 'New answer');
      const schedule = storage._store['review/schedule.json'] as ReviewEntry[];
      expect(schedule[0].answer).toBe('New answer');
    });

    it('returns not found for unknown id', async () => {
      const storage = createMockStorage({ 'review/schedule.json': [entry()] });
      const manager = new CardManager(storage);
      const result = await manager.editCard('nope99', 'q', 'text');
      expect(result).toContain('not found');
    });

    it('suffix match requires unique match', async () => {
      const storage = createMockStorage({
        'review/schedule.json': [
          entry({ cardId: 'aaa111shared' }),
          entry({ cardId: 'bbb222shared' }),
        ],
      });
      const manager = new CardManager(storage);
      const result = await manager.editCard('shared', 'q', 'text');
      expect(result).toContain('not found');
    });
  });

  describe('deleteCard', () => {
    it('deletes from both schedule and index', async () => {
      const storage = createMockStorage({
        'review/schedule.json': [entry(), entry({ cardId: 'keep111' })],
        'flashcards/index.json': [{ id: 'abc123def456', question: 'Q', answer: 'A', subject: '', topic: '', difficulty: 'medium', tags: [], createdAt: 1 }],
      });
      const manager = new CardManager(storage);
      const result = await manager.deleteCard('def456');
      expect(result).toContain('🗑️');

      const schedule = storage._store['review/schedule.json'] as ReviewEntry[];
      expect(schedule).toHaveLength(1);
      expect(schedule[0].cardId).toBe('keep111');
      const index = storage._store['flashcards/index.json'] as unknown[];
      expect(index).toHaveLength(0);
    });
  });

  describe('toggleSuspend', () => {
    it('suspends a card', async () => {
      const storage = createMockStorage({ 'review/schedule.json': [entry()] });
      const manager = new CardManager(storage);
      const result = await manager.toggleSuspend('def456', true);
      expect(result).toContain('⏸️');
      const schedule = storage._store['review/schedule.json'] as ReviewEntry[];
      expect(schedule[0].suspended).toBe(true);
    });

    it('resumes a card', async () => {
      const storage = createMockStorage({ 'review/schedule.json': [entry({ suspended: true })] });
      const manager = new CardManager(storage);
      const result = await manager.toggleSuspend('def456', false);
      expect(result).toContain('▶️');
      const schedule = storage._store['review/schedule.json'] as ReviewEntry[];
      expect(schedule[0].suspended).toBe(false);
    });
  });
});

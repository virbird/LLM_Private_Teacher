import { scheduleCard, isDue, DEFAULT_LEARNING_STEPS, type ReviewEntry } from '../../../src/core/learning/spacedRepetition';

function createEntry(overrides: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    cardId: 'test-1',
    question: 'What is X?',
    answer: 'X is Y',
    subject: 'test',
    topic: 'test',
    difficulty: 'medium',
    tags: [],
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReviewDate: '2025-01-01',
    lastReviewDate: '',
    history: [],
    state: 'new',
    stepIndex: 0,
    ...overrides,
  };
}

describe('Learning Steps Scheduling', () => {
  const steps = [10, 1440]; // 10 min, 1 day

  describe('new card flow', () => {
    it('new card pass → enters learning at step 1', () => {
      const entry = createEntry({ state: 'new', stepIndex: 0 });
      const result = scheduleCard(entry, 4, steps);
      expect(result.state).toBe('learning');
      expect(result.stepIndex).toBe(1);
      // Next review should be ~1440 minutes from now (step 1)
      const nextTime = new Date(result.nextReviewDate).getTime();
      const expectedMs = 1440 * 60 * 1000;
      expect(nextTime - Date.now()).toBeGreaterThan(expectedMs - 60000);
      expect(nextTime - Date.now()).toBeLessThan(expectedMs + 60000);
    });

    it('new card fail → enters learning at step 0', () => {
      const entry = createEntry({ state: 'new', stepIndex: 0 });
      const result = scheduleCard(entry, 1, steps);
      expect(result.state).toBe('learning');
      expect(result.stepIndex).toBe(0);
      // Next review ~10 minutes from now
      const nextTime = new Date(result.nextReviewDate).getTime();
      const expectedMs = 10 * 60 * 1000;
      expect(nextTime - Date.now()).toBeGreaterThan(expectedMs - 60000);
      expect(nextTime - Date.now()).toBeLessThan(expectedMs + 60000);
    });

    it('learning card completes all steps → graduates with interval 1', () => {
      const entry = createEntry({ state: 'learning', stepIndex: 1, repetitions: 0 });
      const result = scheduleCard(entry, 5, steps);
      expect(result.state).toBe('graduated');
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(1);
      // Next review ~1 day from now
      const nextTime = new Date(result.nextReviewDate).getTime();
      const expectedMs = 24 * 60 * 60 * 1000;
      expect(nextTime - Date.now()).toBeGreaterThan(expectedMs - 60000);
      expect(nextTime - Date.now()).toBeLessThan(expectedMs + 60000);
    });
  });

  describe('graduated card flow', () => {
    it('graduated pass → SM-2 progression (rep 1 → interval 6)', () => {
      const entry = createEntry({ state: 'graduated', repetitions: 1, interval: 1 });
      const result = scheduleCard(entry, 4, steps);
      expect(result.state).toBe('graduated');
      expect(result.interval).toBe(6);
      expect(result.repetitions).toBe(2);
    });

    it('graduated fail → relearning at step 0', () => {
      const entry = createEntry({ state: 'graduated', repetitions: 5, interval: 30 });
      const easeBefore = entry.easeFactor;
      const result = scheduleCard(entry, 1, steps);
      expect(result.state).toBe('relearning');
      expect(result.stepIndex).toBe(0);
      expect(result.repetitions).toBe(0);
      expect(result.easeFactor).toBeLessThan(easeBefore);
      // Next review ~10 minutes from now
      const nextTime = new Date(result.nextReviewDate).getTime();
      expect(nextTime - Date.now()).toBeLessThan(11 * 60 * 1000);
    });
  });

  describe('relearning card flow', () => {
    it('relearning pass through all steps → graduates keeping interval', () => {
      const entry = createEntry({ state: 'relearning', stepIndex: 1, interval: 15, repetitions: 0 });
      const result = scheduleCard(entry, 4, steps);
      expect(result.state).toBe('graduated');
      expect(result.interval).toBe(15); // keeps original interval
      // Next review ~15 days from now
      const nextTime = new Date(result.nextReviewDate).getTime();
      const expectedMs = 15 * 24 * 60 * 60 * 1000;
      expect(nextTime - Date.now()).toBeGreaterThan(expectedMs - 60000);
    });

    it('relearning fail → resets to step 0', () => {
      const entry = createEntry({ state: 'relearning', stepIndex: 1, interval: 15 });
      const result = scheduleCard(entry, 2, steps);
      expect(result.state).toBe('relearning');
      expect(result.stepIndex).toBe(0);
    });
  });

  describe('legacy card compatibility', () => {
    it('card without state but with repetitions → treated as graduated', () => {
      const entry = createEntry({ repetitions: 3, interval: 10 });
      delete (entry as Record<string, unknown>).state;
      const result = scheduleCard(entry, 4, steps);
      expect(result.state).toBe('graduated');
      expect(result.interval).toBe(Math.round(10 * 2.5));
    });

    it('card without state and no repetitions → treated as new', () => {
      const entry = createEntry({ repetitions: 0 });
      delete (entry as Record<string, unknown>).state;
      const result = scheduleCard(entry, 4, steps);
      expect(result.state).toBe('learning');
    });
  });

  describe('history recording', () => {
    it('records review in history', () => {
      const entry = createEntry({ state: 'new' });
      const result = scheduleCard(entry, 5, steps);
      expect(result.history.length).toBe(1);
      expect(result.history[0].quality).toBe(5);
      expect(result.lastReviewDate).toBeTruthy();
    });

    it('caps history at 50 entries', () => {
      const entry = createEntry({
        state: 'graduated',
        history: Array.from({ length: 50 }, (_, i) => ({
          date: '2025-01-01',
          quality: 4,
          intervalBefore: i,
          intervalAfter: i + 1,
        })),
      });
      const result = scheduleCard(entry, 4, steps);
      expect(result.history.length).toBe(50);
    });
  });
});

describe('isDue', () => {
  it('legacy date-only format: past date is due', () => {
    const entry = createEntry({ nextReviewDate: '2020-01-01' });
    expect(isDue(entry, new Date('2025-06-25T12:00:00Z'))).toBe(true);
  });

  it('legacy date-only format: today is due', () => {
    const entry = createEntry({ nextReviewDate: '2025-06-25' });
    expect(isDue(entry, new Date('2025-06-25T12:00:00Z'))).toBe(true);
  });

  it('legacy date-only format: future date is not due', () => {
    const entry = createEntry({ nextReviewDate: '2025-06-26' });
    expect(isDue(entry, new Date('2025-06-25T12:00:00Z'))).toBe(false);
  });

  it('ISO datetime: past time is due', () => {
    const entry = createEntry({ nextReviewDate: '2025-06-25T10:00:00.000Z' });
    expect(isDue(entry, new Date('2025-06-25T12:00:00Z'))).toBe(true);
  });

  it('ISO datetime: future time is not due', () => {
    const entry = createEntry({ nextReviewDate: '2025-06-25T14:00:00.000Z' });
    expect(isDue(entry, new Date('2025-06-25T12:00:00Z'))).toBe(false);
  });

  it('empty nextReviewDate is always due', () => {
    const entry = createEntry({ nextReviewDate: '' });
    expect(isDue(entry)).toBe(true);
  });
});

describe('DEFAULT_LEARNING_STEPS', () => {
  it('defaults to 10 min and 1 day', () => {
    expect(DEFAULT_LEARNING_STEPS).toEqual([10, 1440]);
  });
});

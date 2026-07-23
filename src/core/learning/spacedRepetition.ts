import { LearningStorage } from './LearningStorage';
import type { Flashcard } from '../prompt/flashcard';

export type CardState = 'new' | 'learning' | 'graduated' | 'relearning';

export interface ReviewEntry {
  cardId: string;
  subject: string;
  question: string;
  answer: string;
  topic: string;
  difficulty: string;
  tags: string[];
  // SM-2 state
  easeFactor: number;    // starts at 2.5, min 1.3
  interval: number;      // days until next review (graduated cards)
  repetitions: number;   // consecutive successful reviews
  nextReviewDate: string; // ISO date or datetime string
  lastReviewDate: string; // ISO date string
  history: ReviewRecord[];
  // Extended fields (backward-compatible, all optional)
  type?: 'qa' | 'cloze';   // card type, defaults to 'qa'
  suspended?: boolean;      // suspended cards are excluded from review queue
  state?: CardState;        // scheduling state, defaults to 'new'
  stepIndex?: number;       // current learning step index
}

export interface ReviewRecord {
  date: string;
  quality: number; // 0-5
  intervalBefore: number;
  intervalAfter: number;
}

export interface ReviewSession {
  dueCards: ReviewEntry[];
  currentIndex: number;
  completed: ReviewRecord[];
}

/** Default learning steps in minutes: 10 min, then 1 day */
export const DEFAULT_LEARNING_STEPS = [10, 1440];

/**
 * Check whether a card is due for review.
 * Handles both legacy date-only ('2025-01-01') and full ISO datetime formats.
 */
export function isDue(entry: ReviewEntry, now?: Date): boolean {
  const nowDate = now ?? new Date();
  const next = entry.nextReviewDate;
  if (!next) return true;
  if (next.length <= 10) {
    // Legacy date-only format: due if date <= today
    return next <= nowDate.toISOString().slice(0, 10);
  }
  // Full ISO datetime: due if timestamp <= now
  return new Date(next).getTime() <= nowDate.getTime();
}

/**
 * Schedule a card using learning steps + SM-2 hybrid:
 * - new → learning (step intervals in minutes)
 * - learning/relearning: pass → advance step; complete all steps → graduate (SM-2)
 * - graduated: SM-2 progression; fail → relearning
 */
export function scheduleCard(entry: ReviewEntry, quality: number, steps: number[] = DEFAULT_LEARNING_STEPS): ReviewEntry {
  const state: CardState = entry.state ?? (entry.repetitions > 0 ? 'graduated' : 'new');
  const now = new Date();
  const nowDateStr = now.toISOString().slice(0, 10);

  const record: ReviewRecord = {
    date: nowDateStr,
    quality,
    intervalBefore: entry.interval,
    intervalAfter: entry.interval,
  };

  const setNextFromMinutes = (minutes: number) => {
    const next = new Date(now.getTime() + minutes * 60 * 1000);
    entry.nextReviewDate = next.toISOString();
  };

  if (state === 'new' || state === 'learning' || state === 'relearning') {
    const stepIdx = entry.stepIndex ?? 0;
    if (quality >= 3) {
      // Passed: advance to next step
      const nextStep = stepIdx + 1;
      if (nextStep >= steps.length) {
        // All steps complete → graduate to SM-2
        entry.state = 'graduated';
        entry.stepIndex = 0;
        if (entry.interval === 0) {
          // Never graduated before: first SM-2 interval
          entry.interval = 1;
          entry.repetitions = 1;
        } else {
          // Relearning graduation: keep interval, continue SM-2 progression
          entry.repetitions = Math.max(entry.repetitions, 2);
        }
        const next = new Date(now.getTime() + entry.interval * 24 * 60 * 60 * 1000);
        entry.nextReviewDate = next.toISOString();
        entry.easeFactor = Math.max(
          1.3,
          entry.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
        );
      } else {
        // Move to next learning step
        entry.state = state === 'new' ? 'learning' : state;
        entry.stepIndex = nextStep;
        setNextFromMinutes(steps[nextStep]);
      }
    } else {
      // Failed: reset to first step
      entry.state = state === 'new' ? 'learning' : 'relearning';
      entry.stepIndex = 0;
      setNextFromMinutes(steps[0]);
      if (state !== 'new') {
        entry.easeFactor = Math.max(1.3, entry.easeFactor - 0.2);
      }
    }
  } else {
    // Graduated: use SM-2
    entry.state = 'graduated';
    if (quality >= 3) {
      if (entry.repetitions === 0) {
        entry.interval = 1;
      } else if (entry.repetitions === 1) {
        entry.interval = 6;
      } else {
        entry.interval = Math.round(entry.interval * entry.easeFactor);
      }
      entry.repetitions += 1;
      entry.easeFactor = Math.max(
        1.3,
        entry.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
      );
      const next = new Date(now.getTime() + entry.interval * 24 * 60 * 60 * 1000);
      entry.nextReviewDate = next.toISOString();
    } else {
      // Failed graduated card → relearning
      entry.state = 'relearning';
      entry.stepIndex = 0;
      entry.repetitions = 0;
      entry.easeFactor = Math.max(1.3, entry.easeFactor - 0.2);
      setNextFromMinutes(steps[0]);
    }
  }

  record.intervalAfter = entry.interval;
  entry.lastReviewDate = nowDateStr;
  entry.history.push(record);
  if (entry.history.length > 50) {
    entry.history = entry.history.slice(-50);
  }

  return entry;
}

/**
 * SM-2 Spaced Repetition Algorithm (legacy, kept for backward compatibility)
 * quality >= 3: interval increases (1 -> 6 -> interval * easeFactor)
 * quality < 3: reset (repetitions=0, interval=1)
 * easeFactor adjusts dynamically, minimum 1.3
 */
export function sm2Schedule(entry: ReviewEntry, quality: number): ReviewEntry {
  const now = new Date().toISOString().slice(0, 10);
  const record: ReviewRecord = {
    date: now,
    quality,
    intervalBefore: entry.interval,
    intervalAfter: entry.interval,
  };

  if (quality < 3) {
    // Failed: reset
    entry.repetitions = 0;
    entry.interval = 1;
  } else {
    // Success: increase interval
    if (entry.repetitions === 0) {
      entry.interval = 1;
    } else if (entry.repetitions === 1) {
      entry.interval = 6;
    } else {
      entry.interval = Math.round(entry.interval * entry.easeFactor);
    }
    entry.repetitions += 1;
  }

  // Update ease factor
  entry.easeFactor = Math.max(
    1.3,
    entry.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  record.intervalAfter = entry.interval;
  entry.lastReviewDate = now;

  // Calculate next review date
  const next = new Date();
  next.setDate(next.getDate() + entry.interval);
  entry.nextReviewDate = next.toISOString().slice(0, 10);

  entry.history.push(record);
  if (entry.history.length > 50) {
    entry.history = entry.history.slice(-50);
  }

  return entry;
}

export class SpacedRepetitionManager {
  private storage: LearningStorage;
  private schedulePath = 'review/schedule.json';

  constructor(storage: LearningStorage) {
    this.storage = storage;
  }

  /** Load the full review schedule */
  async loadSchedule(): Promise<ReviewEntry[]> {
    return this.storage.readJson<ReviewEntry[]>(this.schedulePath, []);
  }

  /** Save the full review schedule */
  async saveSchedule(entries: ReviewEntry[]): Promise<void> {
    await this.storage.writeJson(this.schedulePath, entries);
  }

  /** Add new flashcards to the review schedule */
  async addCards(cards: Flashcard[]): Promise<number> {
    const schedule = await this.loadSchedule();
    const existingIds = new Set(schedule.map(e => e.cardId));
    const today = new Date().toISOString().slice(0, 10);
    let added = 0;

    for (const card of cards) {
      if (existingIds.has(card.id)) continue;
      schedule.push({
        cardId: card.id,
        subject: card.subject || '未分类',
        question: card.question,
        answer: card.answer,
        topic: card.topic,
        difficulty: card.difficulty,
        tags: card.tags,
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        nextReviewDate: today, // due immediately
        lastReviewDate: '',
        history: [],
        type: card.type ?? 'qa',
        state: 'new',
        stepIndex: 0,
      });
      added++;
    }

    if (added > 0) {
      await this.saveSchedule(schedule);
    }
    return added;
  }

  /** Get cards that are due for review, excluding suspended, optionally filtered by subject/topic */
  async getDueCards(subject?: string, topic?: string): Promise<ReviewEntry[]> {
    const schedule = await this.loadSchedule();
    const now = new Date();
    return schedule
      .filter(e => !e.suspended)
      .filter(e => isDue(e, now))
      .filter(e => !subject || (e.subject || '未分类') === subject)
      .filter(e => !topic || e.topic === topic)
      .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
  }

  /** Get a tree of due cards grouped by subject → topic with counts */
  async getDueTree(): Promise<Record<string, Record<string, number>>> {
    const due = await this.getDueCards();
    const tree: Record<string, Record<string, number>> = {};
    for (const card of due) {
      const subj = card.subject || '未分类';
      if (!tree[subj]) tree[subj] = {};
      tree[subj][card.topic] = (tree[subj][card.topic] || 0) + 1;
    }
    return tree;
  }

  /** Record a review result using learning steps + SM-2 and update the schedule */
  async recordReview(cardId: string, quality: number, steps: number[] = DEFAULT_LEARNING_STEPS): Promise<ReviewEntry | null> {
    const schedule = await this.loadSchedule();
    const idx = schedule.findIndex(e => e.cardId === cardId);
    if (idx === -1) return null;

    schedule[idx] = scheduleCard(schedule[idx], quality, steps);
    await this.saveSchedule(schedule);
    return schedule[idx];
  }

  /** Get review statistics */
  async getStats(): Promise<{ total: number; due: number; reviewed: number; suspended: number }> {
    const schedule = await this.loadSchedule();
    const now = new Date();
    const due = schedule.filter(e => !e.suspended && isDue(e, now)).length;
    const reviewed = schedule.filter(e => e.history.length > 0).length;
    const suspended = schedule.filter(e => e.suspended).length;
    return { total: schedule.length, due, reviewed, suspended };
  }
}

import { LearningStorage } from './LearningStorage';
import type { Flashcard } from '../prompt/flashcard';

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
  interval: number;      // days until next review
  repetitions: number;   // consecutive successful reviews
  nextReviewDate: string; // ISO date string
  lastReviewDate: string; // ISO date string
  history: ReviewRecord[];
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

/**
 * SM-2 Spaced Repetition Algorithm
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
      });
      added++;
    }

    if (added > 0) {
      await this.saveSchedule(schedule);
    }
    return added;
  }

  /** Get cards that are due for review today or overdue, optionally filtered by subject/topic */
  async getDueCards(subject?: string, topic?: string): Promise<ReviewEntry[]> {
    const schedule = await this.loadSchedule();
    const today = new Date().toISOString().slice(0, 10);
    return schedule
      .filter(e => e.nextReviewDate <= today)
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

  /** Record a review result and update the schedule */
  async recordReview(cardId: string, quality: number): Promise<ReviewEntry | null> {
    const schedule = await this.loadSchedule();
    const idx = schedule.findIndex(e => e.cardId === cardId);
    if (idx === -1) return null;

    schedule[idx] = sm2Schedule(schedule[idx], quality);
    await this.saveSchedule(schedule);
    return schedule[idx];
  }

  /** Get review statistics */
  async getStats(): Promise<{ total: number; due: number; reviewed: number }> {
    const schedule = await this.loadSchedule();
    const today = new Date().toISOString().slice(0, 10);
    const due = schedule.filter(e => e.nextReviewDate <= today).length;
    const reviewed = schedule.filter(e => e.history.length > 0).length;
    return { total: schedule.length, due, reviewed };
  }
}

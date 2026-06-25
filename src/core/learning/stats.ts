import { LearningStorage } from './LearningStorage';
import type { Flashcard } from '../prompt/flashcard';
import type { ReviewEntry } from './spacedRepetition';

export interface LearningStats {
  flashcards: {
    total: number;
    byTopic: Record<string, number>;
    byDifficulty: Record<string, number>;
  };
  reviews: {
    total: number;
    due: number;
    reviewed: number;
    avgEaseFactor: number;
    streak: number; // consecutive days with at least one review
  };
  quizzes: {
    total: number;
  };
  logs: {
    totalDays: number;
  };
  activity: {
    last7Days: { date: string; actions: number }[];
    totalActions: number;
  };
}

export class LearningStatsService {
  private storage: LearningStorage;

  constructor(storage: LearningStorage) {
    this.storage = storage;
  }

  async computeStats(): Promise<LearningStats> {
    const [flashcards, reviewSchedule, activityLog] = await Promise.all([
      this.storage.readJson<Flashcard[]>('flashcards/index.json', []),
      this.storage.readJson<ReviewEntry[]>('review/schedule.json', []),
      this.storage.readJson<Record<string, number>>('stats/activity.json', {}),
    ]);

    // Flashcard stats
    const byTopic: Record<string, number> = {};
    const byDifficulty: Record<string, number> = {};
    for (const card of flashcards) {
      const topic = card.topic || 'untagged';
      byTopic[topic] = (byTopic[topic] || 0) + 1;
      byDifficulty[card.difficulty] = (byDifficulty[card.difficulty] || 0) + 1;
    }

    // Review stats
    const today = new Date().toISOString().slice(0, 10);
    const due = reviewSchedule.filter(e => e.nextReviewDate <= today).length;
    const reviewed = reviewSchedule.filter(e => e.history.length > 0).length;
    const avgEaseFactor = reviewSchedule.length > 0
      ? reviewSchedule.reduce((sum, e) => sum + e.easeFactor, 0) / reviewSchedule.length
      : 2.5;

    // Calculate streak
    const streak = this.calculateStreak(reviewSchedule);

    // Activity: last 7 days
    const last7Days: { date: string; actions: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      last7Days.push({ date: dateStr, actions: activityLog[dateStr] || 0 });
    }
    const totalActions = Object.values(activityLog).reduce((a, b) => a + b, 0);

    // Count quiz files (approximate from activity log keys)
    const quizCount = Object.keys(activityLog).filter(k => k.startsWith('quiz:')).length;

    // Count log days
    const logDays = new Set(Object.keys(activityLog).filter(k => k.match(/^\d{4}-\d{2}-\d{2}$/))).size;

    return {
      flashcards: { total: flashcards.length, byTopic, byDifficulty },
      reviews: { total: reviewSchedule.length, due, reviewed, avgEaseFactor: Math.round(avgEaseFactor * 100) / 100, streak },
      quizzes: { total: quizCount },
      logs: { totalDays: logDays },
      activity: { last7Days, totalActions },
    };
  }

  /** Record an action for today's activity */
  async recordAction(type: string): Promise<void> {
    const activity = await this.storage.readJson<Record<string, number>>('stats/activity.json', {});
    const today = new Date().toISOString().slice(0, 10);
    activity[today] = (activity[today] || 0) + 1;
    // Keep last 90 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    for (const key of Object.keys(activity)) {
      if (key < cutoffStr) delete activity[key];
    }
    await this.storage.writeJson('stats/activity.json', activity);
  }

  formatStatsMarkdown(stats: LearningStats): string {
    const lines: string[] = [];
    lines.push('# Learning Statistics\n');

    lines.push('## Overview');
    lines.push(`- **Flashcards**: ${stats.flashcards.total}`);
    lines.push(`- **Review Cards**: ${stats.reviews.total} (${stats.reviews.due} due)`);
    lines.push(`- **Quizzes Taken**: ${stats.quizzes.total}`);
    lines.push(`- **Study Days**: ${stats.logs.totalDays}`);
    lines.push(`- **Study Streak**: ${stats.reviews.streak} days`);
    lines.push('');

    // Flashcard breakdown
    if (stats.flashcards.total > 0) {
      lines.push('## Flashcards');
      lines.push('By Difficulty:');
      for (const [diff, count] of Object.entries(stats.flashcards.byDifficulty)) {
        lines.push(`- ${diff}: ${count}`);
      }
      if (Object.keys(stats.flashcards.byTopic).length > 0) {
        lines.push('\nBy Topic:');
        for (const [topic, count] of Object.entries(stats.flashcards.byTopic)) {
          lines.push(`- ${topic}: ${count}`);
        }
      }
      lines.push('');
    }

    // Review stats
    if (stats.reviews.total > 0) {
      lines.push('## Spaced Repetition');
      lines.push(`- Reviewed: ${stats.reviews.reviewed}/${stats.reviews.total}`);
      lines.push(`- Avg Ease Factor: ${stats.reviews.avgEaseFactor.toFixed(2)}`);
      lines.push('');
    }

    // Activity chart (text-based)
    lines.push('## Last 7 Days');
    const maxActions = Math.max(...stats.activity.last7Days.map(d => d.actions), 1);
    for (const day of stats.activity.last7Days) {
      const bar = '\u2588'.repeat(Math.round((day.actions / maxActions) * 20));
      lines.push(`${day.date} ${bar} ${day.actions}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  private calculateStreak(entries: ReviewEntry[]): number {
    if (entries.length === 0) return 0;

    const allDates = new Set<string>();
    for (const entry of entries) {
      for (const record of entry.history) {
        allDates.add(record.date);
      }
    }

    if (allDates.size === 0) return 0;

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      if (allDates.has(dateStr)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  }
}

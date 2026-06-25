import { LearningStorage } from './LearningStorage';

export interface MistakeEntry {
  id: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
  topic: string;
  quizDate: string;
  mastered: boolean;
  masteredDate: string;
  reviewCount: number;
}

export class ErrorNotebook {
  private storage: LearningStorage;
  private indexPath = 'mistakes/index.json';

  constructor(storage: LearningStorage) {
    this.storage = storage;
  }

  /** Add mistakes from a quiz */
  async addMistakes(mistakes: Omit<MistakeEntry, 'id' | 'mastered' | 'masteredDate' | 'reviewCount'>[]): Promise<number> {
    const index = await this.loadIndex();
    let added = 0;

    for (const m of mistakes) {
      // Avoid duplicates based on question text
      const exists = index.some(e => e.question === m.question && !e.mastered);
      if (exists) continue;

      index.push({
        ...m,
        id: LearningStorage.uid(),
        mastered: false,
        masteredDate: '',
        reviewCount: 0,
      });
      added++;
    }

    if (added > 0) {
      await this.saveIndex(index);
    }
    return added;
  }

  /** Get all unmastered mistakes */
  async getActive(): Promise<MistakeEntry[]> {
    const index = await this.loadIndex();
    return index.filter(e => !e.mastered);
  }

  /** Get all mistakes */
  async getAll(): Promise<MistakeEntry[]> {
    return this.loadIndex();
  }

  /** Mark a mistake as mastered */
  async markMastered(id: string): Promise<boolean> {
    const index = await this.loadIndex();
    const entry = index.find(e => e.id === id);
    if (!entry || entry.mastered) return false;

    entry.mastered = true;
    entry.masteredDate = new Date().toISOString().slice(0, 10);
    await this.saveIndex(index);
    return true;
  }

  /** Get mistakes grouped by topic */
  async getByTopic(): Promise<Record<string, MistakeEntry[]>> {
    const active = await this.getActive();
    const grouped: Record<string, MistakeEntry[]> = {};
    for (const entry of active) {
      const topic = entry.topic || 'uncategorized';
      if (!grouped[topic]) grouped[topic] = [];
      grouped[topic].push(entry);
    }
    return grouped;
  }

  /** Get summary stats */
  async getStats(): Promise<{ total: number; active: number; mastered: number; byTopic: Record<string, number> }> {
    const index = await this.loadIndex();
    const active = index.filter(e => !e.mastered);
    const mastered = index.filter(e => e.mastered);
    const byTopic: Record<string, number> = {};
    for (const e of active) {
      const t = e.topic || 'uncategorized';
      byTopic[t] = (byTopic[t] || 0) + 1;
    }
    return { total: index.length, active: active.length, mastered: mastered.length, byTopic };
  }

  /** Format mistakes as markdown */
  async formatMarkdown(): Promise<string> {
    const active = await this.getActive();
    if (active.length === 0) {
      return '';
    }

    const lines: string[] = ['# Error Notebook\n'];
    const grouped = await this.getByTopic();

    for (const [topic, entries] of Object.entries(grouped)) {
      lines.push(`## ${topic}\n`);
      for (const entry of entries) {
        lines.push(`### ${entry.question}`);
        lines.push(`- Your answer: ${entry.userAnswer}`);
        lines.push(`- Correct: **${entry.correctAnswer}**`);
        lines.push(`- Explanation: ${entry.explanation}`);
        lines.push(`- Date: ${entry.quizDate} | Reviews: ${entry.reviewCount}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private async loadIndex(): Promise<MistakeEntry[]> {
    return this.storage.readJson<MistakeEntry[]>(this.indexPath, []);
  }

  private async saveIndex(entries: MistakeEntry[]): Promise<void> {
    await this.storage.writeJson(this.indexPath, entries);
  }
}

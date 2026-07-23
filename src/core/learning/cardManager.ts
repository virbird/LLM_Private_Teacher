/**
 * Card management operations: list, edit, delete, suspend/resume.
 * Operates on both flashcards/index.json and review/schedule.json to keep them in sync.
 */
import { LearningStorage } from './LearningStorage';
import type { Flashcard } from '../prompt/flashcard';
import type { ReviewEntry } from './spacedRepetition';
import { t } from '../i18n';

const INDEX_PATH = 'flashcards/index.json';
const SCHEDULE_PATH = 'review/schedule.json';

export class CardManager {
  private storage: LearningStorage;

  constructor(storage: LearningStorage) {
    this.storage = storage;
  }

  /** Find a card in the schedule by full ID or suffix (last N chars) match */
  private findBySuffix(entries: ReviewEntry[], id: string): ReviewEntry | undefined {
    // Exact match first
    const exact = entries.find(e => e.cardId === id);
    if (exact) return exact;
    // Suffix match (at least 4 chars to avoid ambiguity)
    if (id.length >= 4) {
      const matches = entries.filter(e => e.cardId.endsWith(id));
      if (matches.length === 1) return matches[0];
    }
    return undefined;
  }

  /** List cards as a markdown table, optionally filtered by subject */
  async listCards(subject?: string): Promise<string> {
    const schedule = await this.storage.readJson<ReviewEntry[]>(SCHEDULE_PATH, []);
    const filtered = subject
      ? schedule.filter(e => (e.subject || '未分类') === subject)
      : schedule;

    if (filtered.length === 0) {
      return t('learning.card.listEmpty');
    }

    const stateLabel = (e: ReviewEntry): string => {
      if (e.suspended) return '⏸️ ' + t('learning.card.stateSuspended');
      switch (e.state ?? 'new') {
        case 'learning': return `📖 ${t('learning.card.stateLearning')} ${((e.stepIndex ?? 0) + 1)}`;
        case 'relearning': return '🔁 ' + t('learning.card.stateRelearning');
        case 'graduated': return '🎓 ' + t('learning.card.stateGraduated');
        default: return '🆕 ' + t('learning.card.stateNew');
      }
    };

    let md = `| ID | ${t('learning.card.colType')} | ${t('learning.card.colState')} | ${t('learning.card.colQuestion')} |\n`;
    md += `|---|---|---|---|\n`;

    const display = filtered.slice(0, 50); // cap display at 50 rows
    for (const e of display) {
      const shortId = e.cardId.slice(-6);
      const type = e.type === 'cloze' ? 'Cloze' : 'Q&A';
      const q = e.question.replace(/\{\{c\d+::/g, '').replace(/\}\}/g, '').slice(0, 30);
      md += `| \`${shortId}\` | ${type} | ${stateLabel(e)} | ${q}${e.question.length > 30 ? '…' : ''} |\n`;
    }

    if (filtered.length > 50) {
      md += `\n*${t('learning.card.listTruncated', { count: String(filtered.length) })}*\n`;
    }

    return md;
  }

  /** Edit a card's question or answer in both index and schedule */
  async editCard(id: string, field: 'q' | 'a', value: string): Promise<string> {
    const schedule = await this.storage.readJson<ReviewEntry[]>(SCHEDULE_PATH, []);
    const entry = this.findBySuffix(schedule, id);
    if (!entry) {
      return t('learning.card.notFound', { id });
    }

    if (field === 'q') {
      entry.question = value;
    } else {
      entry.answer = value;
    }
    await this.storage.writeJson(SCHEDULE_PATH, schedule);

    // Sync to flashcard index
    const index = await this.storage.readJson<Flashcard[]>(INDEX_PATH, []);
    const idxCard = index.find(c => c.id === entry.cardId);
    if (idxCard) {
      if (field === 'q') {
        idxCard.question = value;
      } else {
        idxCard.answer = value;
      }
      await this.storage.writeJson(INDEX_PATH, index);
    }

    return t('learning.card.edited', { id: entry.cardId.slice(-6), field: field === 'q' ? 'Q' : 'A' });
  }

  /** Delete a card from both index and schedule */
  async deleteCard(id: string): Promise<string> {
    const schedule = await this.storage.readJson<ReviewEntry[]>(SCHEDULE_PATH, []);
    const entry = this.findBySuffix(schedule, id);
    if (!entry) {
      return t('learning.card.notFound', { id });
    }

    const newSchedule = schedule.filter(e => e.cardId !== entry.cardId);
    await this.storage.writeJson(SCHEDULE_PATH, newSchedule);

    const index = await this.storage.readJson<Flashcard[]>(INDEX_PATH, []);
    const newIndex = index.filter(c => c.id !== entry.cardId);
    if (newIndex.length !== index.length) {
      await this.storage.writeJson(INDEX_PATH, newIndex);
    }

    return t('learning.card.deleted', { id: entry.cardId.slice(-6) });
  }

  /** Suspend or resume a card */
  async toggleSuspend(id: string, suspend: boolean): Promise<string> {
    const schedule = await this.storage.readJson<ReviewEntry[]>(SCHEDULE_PATH, []);
    const entry = this.findBySuffix(schedule, id);
    if (!entry) {
      return t('learning.card.notFound', { id });
    }

    entry.suspended = suspend;
    await this.storage.writeJson(SCHEDULE_PATH, schedule);

    return suspend
      ? t('learning.card.suspended', { id: entry.cardId.slice(-6) })
      : t('learning.card.resumed', { id: entry.cardId.slice(-6) });
  }
}

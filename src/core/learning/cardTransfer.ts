/**
 * Card import/export: Anki-compatible CSV and full-fidelity JSON formats.
 */
import type { Flashcard } from '../prompt/flashcard';
import type { ReviewEntry } from './spacedRepetition';
import { LearningStorage } from './LearningStorage';

export interface JsonExport {
  version: 1;
  exportedAt: string;
  cards: ReviewEntry[];
}

export interface ImportResult {
  cards: Flashcard[];
  /** Scheduling state to restore (from JSON import) */
  scheduleEntries: ReviewEntry[];
  skipped: number;
}

// --- CSV Export ---

function escapeCsvField(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

/** Export review entries as Anki-compatible CSV (Front,Back,Tags,Type) */
export function exportCsv(entries: ReviewEntry[]): string {
  const lines = ['Front,Back,Tags,Type'];
  for (const e of entries) {
    const front = escapeCsvField(e.question);
    const back = escapeCsvField(e.answer);
    const tags = escapeCsvField((e.tags ?? []).join(' '));
    const type = escapeCsvField(e.type ?? 'qa');
    lines.push(`${front},${back},${tags},${type}`);
  }
  return lines.join('\n');
}

// --- JSON Export ---

/** Export review entries as full-fidelity JSON (includes scheduling state) */
export function exportJson(entries: ReviewEntry[]): string {
  const data: JsonExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: entries,
  };
  return JSON.stringify(data, null, 2);
}

// --- CSV Import ---

/**
 * Parse a standard CSV line handling quoted fields with escaped quotes.
 * Supports multi-line values inside quotes.
 */
function parseCsvContent(content: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < content.length && content[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        current.push(field);
        field = '';
        i++;
      } else if (ch === '\n') {
        current.push(field);
        field = '';
        rows.push(current);
        current = [];
        i++;
      } else if (ch === '\r') {
        i++; // skip CR
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Flush last field/row
  if (field || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows.filter(row => row.some(cell => cell.trim() !== ''));
}

/** Parse Anki-compatible CSV into Flashcard[] */
export function parseCsv(content: string): Flashcard[] {
  const rows = parseCsvContent(content);
  if (rows.length === 0) return [];

  // Detect header row
  let startIdx = 0;
  const header = rows[0].map(h => h.trim().toLowerCase());
  if (header.includes('front') || header.includes('back')) {
    startIdx = 1;
  }

  const cards: Flashcard[] = [];
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    const front = (row[0] ?? '').trim();
    const back = (row[1] ?? '').trim();
    if (!front || !back) continue;

    const tagsStr = (row[2] ?? '').trim();
    const tags = tagsStr ? tagsStr.split(/\s+/).filter(Boolean) : [];
    const typeStr = (row[3] ?? '').trim().toLowerCase();
    const type: Flashcard['type'] = typeStr === 'cloze' ? 'cloze' : 'qa';

    cards.push({
      id: LearningStorage.uid() + cards.length,
      question: front,
      answer: back,
      subject: '',
      topic: '',
      difficulty: 'medium',
      tags,
      createdAt: Date.now(),
      type,
    });
  }

  return cards;
}

// --- JSON Import ---

/** Parse JSON export format into ImportResult (restores scheduling state) */
export function parseJsonImport(content: string): ImportResult | null {
  try {
    const data = JSON.parse(content) as JsonExport;
    if (!data.cards || !Array.isArray(data.cards)) return null;

    const cards: Flashcard[] = [];
    const scheduleEntries: ReviewEntry[] = [];

    for (const entry of data.cards) {
      if (!entry.cardId || !entry.question || !entry.answer) continue;
      cards.push({
        id: entry.cardId,
        question: entry.question,
        answer: entry.answer,
        subject: entry.subject ?? '',
        topic: entry.topic ?? '',
        difficulty: (entry.difficulty as Flashcard['difficulty']) ?? 'medium',
        tags: entry.tags ?? [],
        createdAt: Date.now(),
        type: entry.type ?? 'qa',
      });
      scheduleEntries.push(entry);
    }

    return { cards, scheduleEntries, skipped: 0 };
  } catch {
    return null;
  }
}

// --- Format Detection ---

/** Detect whether content is JSON or CSV */
export function detectFormat(content: string): 'json' | 'csv' {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }
  return 'csv';
}

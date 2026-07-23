import { exportCsv, exportJson, parseCsv, parseJsonImport, detectFormat } from '../../../src/core/learning/cardTransfer';
import type { ReviewEntry } from '../../../src/core/learning/spacedRepetition';

function entry(overrides: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    cardId: 'card-001',
    question: 'What is X?',
    answer: 'X is Y',
    subject: '物理',
    topic: '力学',
    difficulty: 'medium',
    tags: ['mechanics', 'basic'],
    easeFactor: 2.5,
    interval: 6,
    repetitions: 2,
    nextReviewDate: '2025-07-01',
    lastReviewDate: '2025-06-25',
    history: [],
    type: 'qa',
    state: 'graduated',
    ...overrides,
  };
}

describe('CSV Export', () => {
  it('exports header + rows', () => {
    const csv = exportCsv([entry()]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Front,Back,Tags,Type');
    expect(lines[1]).toContain('What is X?');
    expect(lines[1]).toContain('X is Y');
    expect(lines[1]).toContain('mechanics basic');
    expect(lines[1]).toContain('qa');
  });

  it('escapes quotes in fields', () => {
    const csv = exportCsv([entry({ question: 'He said "hello" to me' })]);
    expect(csv).toContain('"He said ""hello"" to me"');
  });

  it('escapes commas in fields', () => {
    const csv = exportCsv([entry({ answer: 'A, B, and C' })]);
    expect(csv).toContain('"A, B, and C"');
  });

  it('exports cloze type', () => {
    const csv = exportCsv([entry({ type: 'cloze', question: 'The capital is {{c1::Paris}}' })]);
    expect(csv).toContain('cloze');
    expect(csv).toContain('{{c1::Paris}}');
  });
});

describe('CSV Import', () => {
  it('parses CSV with header', () => {
    const csv = 'Front,Back,Tags,Type\n"What is X?","X is Y","tag1 tag2","qa"';
    const cards = parseCsv(csv);
    expect(cards).toHaveLength(1);
    expect(cards[0].question).toBe('What is X?');
    expect(cards[0].answer).toBe('X is Y');
    expect(cards[0].tags).toEqual(['tag1', 'tag2']);
    expect(cards[0].type).toBe('qa');
  });

  it('parses CSV without header', () => {
    const csv = '"Q1","A1"\n"Q2","A2"';
    const cards = parseCsv(csv);
    expect(cards).toHaveLength(2);
  });

  it('handles escaped quotes', () => {
    const csv = 'Front,Back\n"He said ""hi""","She said ""bye"""';
    const cards = parseCsv(csv);
    expect(cards[0].question).toBe('He said "hi"');
    expect(cards[0].answer).toBe('She said "bye"');
  });

  it('handles multi-line fields inside quotes', () => {
    const csv = 'Front,Back\n"Line 1\nLine 2","Answer"';
    const cards = parseCsv(csv);
    expect(cards).toHaveLength(1);
    expect(cards[0].question).toBe('Line 1\nLine 2');
  });

  it('parses cloze type', () => {
    const csv = 'Front,Back,Tags,Type\n"The capital is {{c1::Paris}}","Paris","geo","cloze"';
    const cards = parseCsv(csv);
    expect(cards[0].type).toBe('cloze');
  });

  it('skips rows with missing fields', () => {
    const csv = 'Front,Back\n"Q1","A1"\n"Q2",""\n"","A3"';
    const cards = parseCsv(csv);
    expect(cards).toHaveLength(1);
  });

  it('returns empty for empty content', () => {
    expect(parseCsv('')).toHaveLength(0);
  });
});

describe('CSV round-trip', () => {
  it('export then import preserves data', () => {
    const original = [
      entry({ question: 'Q with "quotes" and, commas', tags: ['a', 'b'] }),
      entry({ cardId: 'card-002', type: 'cloze', question: '{{c1::Hidden}} text', answer: 'Hidden' }),
    ];
    const csv = exportCsv(original);
    const imported = parseCsv(csv);

    expect(imported).toHaveLength(2);
    expect(imported[0].question).toBe('Q with "quotes" and, commas');
    expect(imported[0].tags).toEqual(['a', 'b']);
    expect(imported[1].type).toBe('cloze');
    expect(imported[1].question).toBe('{{c1::Hidden}} text');
  });
});

describe('JSON Export/Import', () => {
  it('exports valid JSON with version and cards', () => {
    const json = exportJson([entry()]);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBeTruthy();
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0].cardId).toBe('card-001');
    expect(parsed.cards[0].easeFactor).toBe(2.5);
  });

  it('imports JSON and restores scheduling state', () => {
    const original = entry({ interval: 30, repetitions: 5, state: 'graduated' });
    const json = exportJson([original]);
    const result = parseJsonImport(json);

    expect(result).not.toBeNull();
    expect(result!.cards).toHaveLength(1);
    expect(result!.cards[0].question).toBe('What is X?');
    expect(result!.scheduleEntries).toHaveLength(1);
    expect(result!.scheduleEntries[0].interval).toBe(30);
    expect(result!.scheduleEntries[0].repetitions).toBe(5);
    expect(result!.scheduleEntries[0].state).toBe('graduated');
  });

  it('returns null for invalid JSON', () => {
    expect(parseJsonImport('not json')).toBeNull();
  });

  it('returns null for JSON without cards array', () => {
    expect(parseJsonImport('{"foo": 1}')).toBeNull();
  });

  it('skips entries without required fields', () => {
    const json = JSON.stringify({
      version: 1,
      cards: [
        { cardId: 'ok-1', question: 'Q', answer: 'A' },
        { cardId: 'bad-1', question: '', answer: 'A' },
      ],
    });
    const result = parseJsonImport(json);
    expect(result!.cards).toHaveLength(1);
    expect(result!.cards[0].id).toBe('ok-1');
  });

  it('JSON round-trip preserves full state', () => {
    const original = [entry({ suspended: true, stepIndex: 1, type: 'cloze' })];
    const json = exportJson(original);
    const result = parseJsonImport(json);
    const restored = result!.scheduleEntries[0];
    expect(restored.suspended).toBe(true);
    expect(restored.stepIndex).toBe(1);
    expect(restored.type).toBe('cloze');
    expect(restored.cardId).toBe('card-001');
  });
});

describe('detectFormat', () => {
  it('detects JSON object', () => {
    expect(detectFormat('{"version": 1}')).toBe('json');
  });

  it('detects JSON array', () => {
    expect(detectFormat('  [1, 2]')).toBe('json');
  });

  it('detects CSV', () => {
    expect(detectFormat('Front,Back\n"Q","A"')).toBe('csv');
  });
});

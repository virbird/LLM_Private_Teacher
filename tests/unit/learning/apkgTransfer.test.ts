import { sha1Hex, stripHtml, fieldChecksum, genGuid, exportApkg, importApkg } from '../../../src/core/learning/apkgTransfer';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import type { ReviewEntry } from '../../../src/core/learning/spacedRepetition';

let SQL: SqlJsStatic;

beforeAll(async () => {
  SQL = await initSqlJs();
});

function entry(overrides: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    cardId: 'card-001',
    question: 'What is X?',
    answer: 'X is Y',
    subject: '物理',
    topic: '力学',
    difficulty: 'medium',
    tags: ['tag1', 'tag2'],
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

describe('sha1Hex', () => {
  it('matches known vector for "abc"', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  it('matches known vector for empty string', () => {
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('handles longer strings', () => {
    expect(sha1Hex('The quick brown fox jumps over the lazy dog'))
      .toBe('2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');
  });

  it('handles UTF-8 (CJK characters)', () => {
    const hex = sha1Hex('物理');
    expect(hex).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('stripHtml', () => {
  it('strips basic tags', () => {
    expect(stripHtml('<b>bold</b> and <i>italic</i>')).toBe('bold and italic');
  });

  it('converts br/div/p to newlines', () => {
    const result = stripHtml('line1<br>line2<div>line3</div><p>line4</p>');
    expect(result).toContain('line1\nline2');
    expect(result).toContain('line3');
    expect(result).toContain('line4');
  });

  it('removes img tags', () => {
    expect(stripHtml('before <img src="x.png"> after')).toBe('before  after');
  });

  it('removes [sound:] tags', () => {
    expect(stripHtml('word [sound:audio.mp3] def')).toBe('word  def');
  });

  it('decodes common entities', () => {
    expect(stripHtml('a &amp; b &lt; c &gt; d')).toBe('a & b < c > d');
    expect(stripHtml('&quot;quoted&quot;')).toBe('"quoted"');
    expect(stripHtml('a&nbsp;b')).toBe('a b');
  });

  it('preserves cloze markers', () => {
    expect(stripHtml('The capital is {{c1::Paris}}.')).toBe('The capital is {{c1::Paris}}.');
  });

  it('collapses excessive blank lines', () => {
    const result = stripHtml('a\n\n\n\n\nb');
    expect(result).toBe('a\n\nb');
  });
});

describe('fieldChecksum', () => {
  it('returns an integer from first 8 hex of SHA-1', () => {
    const csum = fieldChecksum('What is X?');
    expect(Number.isInteger(csum)).toBe(true);
    expect(csum).toBeGreaterThan(0);
  });

  it('strips HTML before computing', () => {
    const c1 = fieldChecksum('Hello');
    const c2 = fieldChecksum('<b>Hello</b>');
    expect(c1).toBe(c2);
  });

  it('collapses whitespace', () => {
    const c1 = fieldChecksum('hello   world');
    const c2 = fieldChecksum('hello world');
    expect(c1).toBe(c2);
  });
});

describe('genGuid', () => {
  it('returns a 10-char string', () => {
    const guid = genGuid();
    expect(guid).toHaveLength(10);
  });

  it('generates unique values', () => {
    const a = genGuid();
    const b = genGuid();
    expect(a).not.toBe(b);
  });
});

describe('apkg export/import round-trip', () => {
  it('exports and imports QA cards with scheduling state', async () => {
    const entries = [
      entry({ cardId: 'c1', question: 'What is photosynthesis?', answer: 'Process plants use to make food', state: 'graduated', interval: 15, easeFactor: 2.8, repetitions: 3 }),
      entry({ cardId: 'c2', question: 'H2O is what?', answer: 'Water', state: 'new', interval: 0, repetitions: 0 }),
      entry({ cardId: 'c3', question: 'The capital of France is {{c1::Paris}}.', answer: 'Paris', type: 'cloze', state: 'learning', stepIndex: 1, interval: 0 }),
      entry({ cardId: 'c4', question: 'Suspended card', answer: 'answer', state: 'graduated', suspended: true }),
    ];

    const buffer = await exportApkg(entries, SQL);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);

    const result = await importApkg(buffer, SQL);
    expect(result.cards.length).toBe(4);
    expect(result.scheduleEntries.length).toBe(4);

    // Check QA card
    const c1 = result.scheduleEntries.find(e => e.cardId.startsWith('apkg-') && e.question === 'What is photosynthesis?');
    expect(c1).toBeDefined();
    expect(c1!.answer).toBe('Process plants use to make food');
    expect(c1!.type).toBe('qa');
    expect(c1!.state).toBe('graduated');
    expect(c1!.easeFactor).toBeCloseTo(2.8, 1);
    expect(c1!.repetitions).toBe(3);
    expect(c1!.interval).toBe(15);

    // Check new card
    const c2 = result.scheduleEntries.find(e => e.question === 'H2O is what?');
    expect(c2).toBeDefined();
    expect(c2!.state).toBe('new');

    // Check cloze card
    const c3 = result.scheduleEntries.find(e => e.type === 'cloze');
    expect(c3).toBeDefined();
    expect(c3!.question).toContain('{{c1::Paris}}');
    expect(c3!.answer).toBe('Paris');
    expect(c3!.state).toBe('learning');

    // Check suspended card
    const c4 = result.scheduleEntries.find(e => e.question === 'Suspended card');
    expect(c4).toBeDefined();
    expect(c4!.suspended).toBe(true);
  });

  it('preserves tags', async () => {
    const entries = [entry({ tags: ['physics', 'mechanics', 'basic'] })];
    const buffer = await exportApkg(entries, SQL);
    const result = await importApkg(buffer, SQL);
    expect(result.cards[0].tags).toContain('physics');
    expect(result.cards[0].tags).toContain('mechanics');
    expect(result.cards[0].tags).toContain('basic');
  });

  it('strips HTML on import', async () => {
    const entries = [entry({ question: '<b>Bold</b> question<br>with break', answer: 'A <i>fancy</i> answer' })];
    const buffer = await exportApkg(entries, SQL);
    const result = await importApkg(buffer, SQL);
    // Export writes plain text; import strips (no-op since already plain)
    expect(result.cards[0].question).toContain('Bold question');
    expect(result.cards[0].answer).toContain('A fancy answer');
  });

  it('handles empty entries', async () => {
    const buffer = await exportApkg([], SQL);
    const result = await importApkg(buffer, SQL);
    expect(result.cards).toHaveLength(0);
    expect(result.scheduleEntries).toHaveLength(0);
  });
});

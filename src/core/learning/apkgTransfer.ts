/**
 * Anki .apkg import/export (text-only, no media).
 *
 * A .apkg file is a ZIP archive containing a SQLite database (collection.anki2)
 * with the standard Anki 2 schema (col / notes / cards tables).
 *
 * The functions here are pure (they accept an initialized SqlJsStatic) so they
 * can be unit-tested in Node; the runtime WASM loading lives in sqlJsLoader.ts.
 */
import JSZip from 'jszip';
import type { SqlJsStatic } from 'sql.js';
import type { Flashcard } from '../prompt/flashcard';
import type { ReviewEntry, CardState } from './spacedRepetition';
import type { ImportResult } from './cardTransfer';

// --- Pure-JS SHA-1 (for Anki field checksums; avoids crypto.subtle env differences) ---

/** Compute SHA-1 of a UTF-8 string, returned as lowercase hex. */
export function sha1Hex(message: string): string {
  const msgBytes = new TextEncoder().encode(message);
  const len = msgBytes.length;
  const bitLen = len * 8;

  // Pad to a multiple of 64 bytes: message + 0x80 + zeros + 8-byte big-endian bit length
  const totalLen = (((len + 8) >> 6) + 1) << 6;
  const buffer = new Uint8Array(totalLen);
  buffer.set(msgBytes);
  buffer[len] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalLen - 4, bitLen >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Int32Array(80);

  for (let i = 0; i < totalLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getInt32(i + j * 4, false);
    }
    for (let j = 16; j < 80; j++) {
      const n = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = (n << 1) | (n >>> 31);
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f: number, k: number;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  return [h0, h1, h2, h3, h4].map(h => (h >>> 0).toString(16).padStart(8, '0')).join('');
}

// --- HTML stripping ---

/** Strip HTML to plain text (text-only mode: removes images/sounds). */
export function stripHtml(html: string): string {
  let text = html;
  // Remove media entirely
  text = text.replace(/<img[^>]*>/gi, '');
  text = text.replace(/\[sound:[^\]]*\]/gi, '');
  // Block-level tags become newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(div|p|li|tr|h[1-6])>/gi, '\n');
  text = text.replace(/<(div|p|li|tr|h[1-6])[^>]*>/gi, '\n');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common entities (amp last to avoid double-decoding)
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&');
  // Collapse excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/** Convert HTML to Obsidian-compatible Markdown (callouts, bold, lists, tables). */
export function htmlToMarkdown(html: string): string {
  let text = html;
  // Remove dangerous elements with their content
  text = text.replace(/<(script|style|iframe|object|embed|form|input|textarea|button|select)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Remove media tags
  text = text.replace(/<(img|source|audio|video)\b[^>]*\/?>/gi, '');
  text = text.replace(/\[sound:[^\]]*\]/gi, '');
  // Remove <style> blocks entirely (Obsidian ignores them)
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert formatting tags to markdown
  text = text.replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  text = text.replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
  text = text.replace(/<(u|ins)\b[^>]*>([\s\S]*?)<\/\1>/gi, '$2');  // no markdown equivalent, keep text
  text = text.replace(/<(s|strike|del)\b[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~');
  text = text.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Convert headings
  text = text.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, content: string) => {
    return '\n' + '#'.repeat(Number(level)) + ' ' + content.trim() + '\n';
  });

  // Convert <hr> to markdown
  text = text.replace(/<hr\b[^>]*\/?>/gi, '\n---\n');

  // Convert <br> to newline
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Convert list items
  text = text.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  text = text.replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n');

  // Convert blockquotes
  text = text.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content: string) => {
    return content.split('\n').map((l: string) => '> ' + l).join('\n') + '\n';
  });

  // Convert divs/p to paragraph breaks (with content preservation)
  text = text.replace(/<(div|p)\b[^>]*>/gi, '\n');
  text = text.replace(/<\/(div|p)>/gi, '\n');

  // Convert <font> tags — keep content, drop color (markdown can't do colors)
  text = text.replace(/<font\b[^>]*>([\s\S]*?)<\/font>/gi, '$1');

  // Convert links
  text = text.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Convert tables to markdown tables (simple case)
  text = text.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_, row: string) => {
    const cells = [...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(m => m[1].trim());
    return '| ' + cells.join(' | ') + ' |\n';
  });
  text = text.replace(/<\/?(table|thead|tbody|tfoot|caption|colgroup|col)\b[^>]*>/gi, '\n');

  // Strip all remaining tags (keep inner text)
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&');

  // Clean up: collapse excessive blank lines, trim trailing spaces
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/^[ \t]+/gm, (match: string) => match.replace(/\t/g, '  '));
  return text.trim();
}

/** Remove inline style="..." attributes (Obsidian ignores them) but keep class attributes for CSS snippets. */
export function stripInlineStyles(html: string): string {
  return html.replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
}

/** Anki field checksum: first 8 hex chars of SHA-1 of the normalized field, as an integer. */
export function fieldChecksum(field: string): number {
  const normalized = stripHtml(field).replace(/\s+/g, ' ').trim().normalize('NFC');
  return parseInt(sha1Hex(normalized).slice(0, 8), 16);
}

// --- HTML sanitization (preserve safe formatting, strip dangerous/media tags) ---

/** Tags whose content should be removed entirely (including inner text). */
const REMOVE_WITH_CONTENT = /<(script|style|iframe|object|embed|form|input|textarea|button|select)[^>]*>[\s\S]*?<\/\1>/gi;

/** Self-closing media tags to remove entirely. */
const REMOVE_MEDIA_SELF = /<(img|source|audio|video)\b[^>]*\/?>/gi;

/** Tags allowed in sanitized output (safe formatting tags, including Anki-common HTML4 tags). */
const ALLOWED_TAGS = new Set([
  // Text formatting
  'b', 'i', 'u', 's', 'em', 'strong', 'sub', 'sup', 'small', 'mark',
  'font', 'center', 'strike', 'tt', 'kbd', 'abbr', 'cite', 'q',
  'del', 'ins', 'dfn', 'var', 'samp',
  // Line/structure
  'br', 'hr', 'wbr',
  'p', 'div', 'span', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Lists
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // Tables
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  // Links and annotations
  'a', 'ruby', 'rt', 'rp',
  // Figure/caption
  'figure', 'figcaption',
]);

/** Sanitize HTML: keep safe formatting tags, strip dangerous/media tags, preserve styling. */
export function sanitizeHtml(html: string): string {
  let text = html;
  // Remove dangerous elements with their content
  text = text.replace(REMOVE_WITH_CONTENT, '');
  // Remove media tags (img/audio/video)
  text = text.replace(REMOVE_MEDIA_SELF, '');
  // Remove Anki [sound:] tags
  text = text.replace(/\[sound:[^\]]*\]/gi, '');
  // Strip disallowed tags (keep content, remove tags)
  text = text.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g, (match, tag: string) => {
    return ALLOWED_TAGS.has(tag.toLowerCase()) ? match : '';
  });
  // Remove dangerous attributes: onclick, onerror, onload, on*, javascript: URLs
  text = text.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  text = text.replace(/javascript\s*:/gi, '');
  // Decode common entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&amp;');  // keep &amp; as-is to avoid double-decode in HTML context
  // Collapse excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// --- GUID generation (Anki uses base91) ---

const BASE91 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~';

/** Generate a random base91 GUID (Anki-compatible uniqueness format). */
export function genGuid(): string {
  let s = '';
  for (let i = 0; i < 10; i++) {
    s += BASE91[Math.floor(Math.random() * BASE91.length)];
  }
  return s;
}

// --- Anki 2 schema & collection config ---

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS col (
  id INTEGER PRIMARY KEY, crt INTEGER NOT NULL, mod INTEGER NOT NULL, scm INTEGER NOT NULL,
  ver INTEGER NOT NULL, dty INTEGER NOT NULL, usn INTEGER NOT NULL, ls INTEGER NOT NULL,
  conf TEXT NOT NULL, models TEXT NOT NULL, decks TEXT NOT NULL, dconf TEXT NOT NULL, tags TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY, guid TEXT NOT NULL, mid INTEGER NOT NULL, mod INTEGER NOT NULL,
  usn INTEGER NOT NULL, tags TEXT NOT NULL, flds TEXT NOT NULL, sfld INTEGER NOT NULL,
  csum INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY, nid INTEGER NOT NULL, did INTEGER NOT NULL, ord INTEGER NOT NULL,
  mod INTEGER NOT NULL, usn INTEGER NOT NULL, type INTEGER NOT NULL, queue INTEGER NOT NULL,
  due INTEGER NOT NULL, ivl INTEGER NOT NULL, factor INTEGER NOT NULL, reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL, left INTEGER NOT NULL, odue INTEGER NOT NULL, odid INTEGER NOT NULL,
  flags INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revlog (
  id INTEGER PRIMARY KEY, cid INTEGER NOT NULL, ease INTEGER NOT NULL, ivl INTEGER NOT NULL,
  lastIvl INTEGER NOT NULL, factor INTEGER NOT NULL, time INTEGER NOT NULL, type INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS graves (usn INTEGER NOT NULL, oid INTEGER NOT NULL, type INTEGER NOT NULL);
`;

const BASIC_MID = 1607392319001;
const CLOZE_MID = 1607392319002;
const FIELD_SEP = '\x1f';

function buildModels(nowSec: number): Record<string, unknown> {
  const css = '.card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}';
  const latexPre = '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n';
  const latexPost = '\\end{document}';
  const fld = (name: string, ord: number) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] });

  return {
    [String(BASIC_MID)]: {
      id: BASIC_MID, name: 'Basic', type: 0, mod: nowSec, usn: -1, sortf: 0, did: 1,
      tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}', bqfmt: '', bafmt: '', did: null, bfont: '', bsize: 0 }],
      flds: [fld('Front', 0), fld('Back', 1)],
      css, latexPre, latexPost, latexsvg: false, req: [[0, 'all', [0]]],
    },
    [String(CLOZE_MID)]: {
      id: CLOZE_MID, name: 'Cloze', type: 1, mod: nowSec, usn: -1, sortf: 0, did: 1,
      tmpls: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>\n{{Extra}}', bqfmt: '', bafmt: '', did: null, bfont: '', bsize: 0 }],
      flds: [fld('Text', 0), fld('Extra', 1)],
      css: css + '\n.cloze {\n  font-weight: bold;\n}', latexPre, latexPost, latexsvg: false, req: [[0, 'all', [0]]],
    },
  };
}

function buildConf(): Record<string, unknown> {
  return {
    nextPos: 1, estTimes: true, activeDecks: [1], sortType: 'noteFld', timeLim: 0,
    sortBackwards: false, addToCur: true, curDeck: 1, newSpread: 0, dueCounts: true,
    curModel: BASIC_MID, collapseTime: 1200,
  };
}

function buildDecks(nowSec: number): Record<string, unknown> {
  return {
    '1': {
      id: 1, name: 'Default', desc: '', dyn: 0, conf: 1, mod: nowSec, usn: -1,
      collapsed: false, extendNew: 10, extendRev: 50, browserCollapsed: true,
      newToday: [0, 0], revToday: [0, 0], lrnToday: [0, 0], timeToday: [0, 0],
    },
  };
}

function buildDconf(nowSec: number): Record<string, unknown> {
  return {
    '1': {
      id: 1, name: 'Default', maxTaken: 60, autoplay: true, timer: 0, replayq: true,
      new: { delays: [1, 10], ints: [1, 4, 7], initialFactor: 2500, bury: true, perDay: 20 },
      rev: { bury: true, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
      lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
      dyn: false, mod: nowSec, usn: -1,
    },
  };
}

// --- Scheduling mapping helpers ---

function mapAnkiTypeToState(type: number): CardState {
  switch (type) {
    case 0: return 'new';
    case 1: return 'learning';
    case 2: return 'graduated';
    case 3: return 'relearning';
    default: return 'new';
  }
}

function mapStateToAnkiType(state: CardState | undefined): number {
  switch (state) {
    case 'learning': return 1;
    case 'graduated': return 2;
    case 'relearning': return 3;
    default: return 0;
  }
}

function nextReviewMs(entry: ReviewEntry): number {
  const next = entry.nextReviewDate;
  if (!next) return Date.now();
  if (next.length <= 10) {
    return new Date(next + 'T00:00:00Z').getTime();
  }
  return new Date(next).getTime();
}

function extractClozeAnswers(text: string): string {
  const matches = [...text.matchAll(/\{\{c\d+::([\s\S]*?)\}\}/g)];
  return matches.map(m => m[1].split('::')[0]).join(', ');
}

// --- Export ---

/** Export review entries as an Anki .apkg (ZIP with collection.anki2 SQLite). */
export async function exportApkg(entries: ReviewEntry[], SQL: SqlJsStatic): Promise<ArrayBuffer> {
  const db = new SQL.Database();
  db.run(SCHEMA_SQL);

  const nowSec = Math.floor(Date.now() / 1000);
  const nowMs = Date.now();
  const crt = nowSec;

  db.run(
    'INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)',
    [crt, nowMs, nowMs,
      JSON.stringify(buildConf()), JSON.stringify(buildModels(nowSec)),
      JSON.stringify(buildDecks(nowSec)), JSON.stringify(buildDconf(nowSec)), '{}'],
  );

  let idCounter = nowMs;
  const nextId = () => ++idCounter;
  let newCardPos = 0;

  for (const entry of entries) {
    const isCloze = entry.type === 'cloze';
    const mid = isCloze ? CLOZE_MID : BASIC_MID;
    const nid = nextId();
    const cid = nextId();

    const firstField = entry.question;
    const secondField = isCloze ? (entry.answer || '') : entry.answer;
    const flds = firstField + FIELD_SEP + secondField;
    const tags = entry.tags?.length ? ' ' + entry.tags.join(' ') + ' ' : '';

    db.run(
      'INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, "")',
      [nid, genGuid(), mid, nowSec, tags, flds, stripHtml(firstField), fieldChecksum(firstField)],
    );

    // Map our scheduling state to Anki card fields
    const state: CardState = entry.state ?? 'new';
    const suspended = entry.suspended === true;
    const ankiType = mapStateToAnkiType(state);
    let queue = suspended ? -1 : ankiType;
    let due = 0;
    let ivl = entry.interval ?? 0;

    if (state === 'new') {
      due = newCardPos++;
      ivl = 0;
    } else if (state === 'graduated') {
      // Review cards: due is days since collection creation
      due = Math.max(0, Math.round((nextReviewMs(entry) - crt * 1000) / 86400000));
    } else {
      // Learning / relearning: due is epoch seconds of next review
      due = Math.floor(nextReviewMs(entry) / 1000);
    }
    if (suspended) {
      queue = -1;
    }

    const factor = Math.round((entry.easeFactor ?? 2.5) * 1000);
    const reps = entry.repetitions ?? 0;

    db.run(
      'INSERT INTO cards VALUES (?, ?, 1, 0, ?, -1, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, "")',
      [cid, nid, nowSec, ankiType, queue, due, ivl, factor, reps],
    );
  }

  const dbBytes = db.export();
  db.close();

  const zip = new JSZip();
  zip.file('collection.anki2', dbBytes);
  zip.file('media', '{}');
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

// --- Import ---

// --- Anki template rendering (apply model afmt + css to field content) ---

interface AnkiModel {
  css: string;
  fieldNames: string[];
  afmt: string;
}

/** Render an Anki card template by replacing {{FieldName}} placeholders with field values. */
function renderAnkiTemplate(template: string, fields: string[], fieldNames: string[], tags: string): string {
  let html = template;

  // Handle conditionals {{#FieldName}}...{{/FieldName}} — keep content only if field is non-empty
  html = html.replace(/{{#(\w+)}}([\s\S]*?){{\/\1}}/g, (_, name: string, content: string) => {
    const idx = fieldNames.indexOf(name);
    return idx >= 0 && fields[idx]?.trim() ? content : '';
  });

  // Replace {{FieldName}} and {{cloze:FieldName}}, {{type:FieldName}}, {{hint:FieldName}}
  for (let i = 0; i < fieldNames.length; i++) {
    const value = fields[i] ?? '';
    const name = fieldNames[i];
    html = html.replace(new RegExp(`{{cloze:${name}}}`, 'g'), value);
    html = html.replace(new RegExp(`{{type:${name}}}`, 'g'), value);
    html = html.replace(new RegExp(`{{hint:${name}}}`, 'g'), value);
    html = html.replace(new RegExp(`{{${name}}}`, 'g'), value);
  }

  // Replace {{FrontSide}} with first field content
  html = html.replace(/{{FrontSide}}/g, fields[0] ?? '');

  // Replace {{Tags}}
  html = html.replace(/{{Tags}}/g, tags);

  // Strip any remaining unreplaced {{...}} placeholders
  html = html.replace(/{{[^}]+}}/g, '');

  return html;
}

/** Import an Anki .apkg (text-only) into flashcards + scheduling entries. */
export async function importApkg(buffer: ArrayBuffer, SQL: SqlJsStatic): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(buffer);
  const dbFile = zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!dbFile) {
    throw new Error('No collection.anki2 database found in .apkg');
  }

  const dbBytes = await dbFile.async('uint8array');
  const db = new SQL.Database(dbBytes);

  // Read collection creation time and models for template rendering
  let crt = 0;
  let modelMap: Record<string, AnkiModel> = {};
  let modelCss = '';
  try {
    const colRes = db.exec('SELECT crt, models FROM col LIMIT 1');
    if (colRes.length > 0 && colRes[0].values.length > 0) {
      crt = Number(colRes[0].values[0][0]);
      const modelsJson = String(colRes[0].values[0][1] ?? '{}');
      try {
        const models = JSON.parse(modelsJson) as Record<string, {
          css?: string;
          flds?: Array<{ name: string; ord: number }>;
          tmpls?: Array<{ afmt?: string }>;
        }>;
        const cssParts: string[] = [];
        for (const [mid, model] of Object.entries(models)) {
          const fieldNames = (model.flds ?? [])
            .sort((a, b) => a.ord - b.ord)
            .map(f => f.name);
          const afmt = model.tmpls?.[0]?.afmt ?? '{{Back}}';
          modelMap[mid] = { css: model.css ?? '', fieldNames, afmt };
          if (model.css) cssParts.push(model.css);
        }
        modelCss = cssParts.join('\n');
      } catch { /* models JSON parse failed; proceed without templates */ }
    }
  } catch { /* col table missing; crt stays 0 */ }

  const res = db.exec(
    'SELECT n.id, n.flds, n.tags, n.mid, c.type, c.queue, c.due, c.ivl, c.factor, c.reps ' +
    'FROM notes n JOIN cards c ON c.nid = n.id ORDER BY n.id, c.ord',
  );

  const cards: Flashcard[] = [];
  const scheduleEntries: ReviewEntry[] = [];
  const renderedAnswers: Record<string, string> = {};

  if (res.length > 0) {
    for (const row of res[0].values) {
      const nid = String(row[0]);
      const rawFlds = String(row[1] ?? '');
      const rawTags = String(row[2] ?? '');
      const mid = String(row[3] ?? '');
      const ankiType = Number(row[4]);
      const queue = Number(row[5]);
      const due = Number(row[6]);
      const ivl = Number(row[7]);
      const factor = Number(row[8]);
      const reps = Number(row[9]);

      const fields = rawFlds.split(FIELD_SEP);
      const firstField = fields[0] ?? '';
      if (!firstField.trim()) continue;

      const isCloze = /\{\{c\d+::/.test(firstField);
      // Use sanitizeHtml to preserve rich formatting (bold, colors, tables) while stripping dangerous content
      const question = isCloze ? firstField : sanitizeHtml(firstField);
      const answer = isCloze
        ? extractClozeAnswers(firstField)
        : fields.slice(1).map(f => sanitizeHtml(f)).filter(Boolean).join('<br>\n');
      const tagList = rawTags.trim().split(/\s+/).filter(Boolean);

      // Compute next review date from Anki scheduling
      let nextReviewDate: string;
      if (ankiType === 2) {
        // Review: due is days since collection creation
        nextReviewDate = new Date((crt + due * 86400) * 1000).toISOString().slice(0, 10);
      } else if (ankiType === 1 || ankiType === 3) {
        // Learning / relearning: due is epoch seconds
        nextReviewDate = new Date(due * 1000).toISOString();
      } else {
        // New: due immediately
        nextReviewDate = new Date().toISOString().slice(0, 10);
      }

      const cardId = 'apkg-' + nid;
      const cardType = isCloze ? 'cloze' : 'qa';
      const state = mapAnkiTypeToState(ankiType);

      cards.push({
        id: cardId,
        question,
        answer,
        subject: '',
        topic: '',
        difficulty: 'medium',
        tags: tagList,
        createdAt: Date.now(),
        type: cardType,
      });

      // Render the Anki answer template (afmt) for .md output with original styling
      const model = modelMap[mid];
      if (model) {
        const renderedHtml = renderAnkiTemplate(model.afmt, fields, model.fieldNames, rawTags);
        renderedAnswers[cardId] = sanitizeHtml(renderedHtml);
      }

      scheduleEntries.push({
        cardId,
        question,
        answer,
        subject: '',
        topic: '',
        difficulty: 'medium',
        tags: tagList,
        easeFactor: factor > 0 ? factor / 1000 : 2.5,
        interval: ivl,
        repetitions: reps,
        nextReviewDate,
        lastReviewDate: '',
        history: [],
        type: cardType,
        suspended: queue === -1,
        state,
        stepIndex: 0,
      });
    }
  }

  db.close();
  return { cards, scheduleEntries, skipped: 0, modelCss, renderedAnswers };
}

import { parseFlashcards, buildFlashcardPrompt } from '../../../src/core/prompt/flashcard';
import { buildSummaryPrompt } from '../../../src/core/prompt/summary';
import { buildKnowledgeMapPrompt } from '../../../src/core/prompt/knowledgeMap';
import { buildPlanPrompt } from '../../../src/core/prompt/plan';
import { buildPlanSummaryPrompt } from '../../../src/core/prompt/planSummary';
import { LearningStorage } from '../../../src/core/learning/LearningStorage';
import { setLocale } from '../../../src/core/i18n';
import { t } from '../../../src/core/i18n';
import { TFile } from 'obsidian';
import type { ChatMessage } from '../../../src/core/types/chat';

describe('Flashcard prompt builder', () => {
  it('includes topic in prompt', () => {
    const prompt = buildFlashcardPrompt('Physics');
    expect(prompt).toContain('Physics');
    expect(prompt).toContain('flashcard');
  });

  it('includes material content when provided', () => {
    const prompt = buildFlashcardPrompt('Math', 'E=mc2 is a formula');
    expect(prompt).toContain('E=mc2');
    expect(prompt).toContain('Learning Material');
  });

  it('uses default topic line when no topic given', () => {
    const prompt = buildFlashcardPrompt('');
    expect(prompt).toContain('recent learning conversation');
  });

  it('specifies output format with card tags', () => {
    const prompt = buildFlashcardPrompt('test');
    expect(prompt).toContain('<card>');
    expect(prompt).toContain('<q>');
    expect(prompt).toContain('<a>');
    expect(prompt).toContain('<difficulty>');
  });
});

describe('Flashcard parser', () => {
  it('parses single card', () => {
    const response = `<card>
<q>What is E=mc2?</q>
<a>Energy equals mass times the speed of light squared.</a>
<difficulty>easy</difficulty>
<tags>physics, energy</tags>
</card>`;
    const cards = parseFlashcards(response);
    expect(cards).toHaveLength(1);
    expect(cards[0].question).toBe('What is E=mc2?');
    expect(cards[0].answer).toContain('speed of light');
    expect(cards[0].difficulty).toBe('easy');
    expect(cards[0].tags).toEqual(['physics', 'energy']);
  });

  it('parses multiple cards', () => {
    const response = `<card><q>Q1?</q><a>A1</a><difficulty>easy</difficulty><tags>t1</tags></card>
<card><q>Q2?</q><a>A2</a><difficulty>hard</difficulty><tags>t2, t3</tags></card>
<card><q>Q3?</q><a>A3</a><difficulty>medium</difficulty></card>`;
    const cards = parseFlashcards(response);
    expect(cards).toHaveLength(3);
    expect(cards[0].difficulty).toBe('easy');
    expect(cards[1].difficulty).toBe('hard');
    expect(cards[1].tags).toEqual(['t2', 't3']);
    expect(cards[2].tags).toEqual([]);
  });

  it('defaults difficulty to medium when missing', () => {
    const response = `<card><q>Question?</q><a>Answer</a></card>`;
    const cards = parseFlashcards(response);
    expect(cards).toHaveLength(1);
    expect(cards[0].difficulty).toBe('medium');
  });

  it('handles invalid difficulty gracefully', () => {
    const response = `<card><q>Q?</q><a>A</a><difficulty>super-hard</difficulty></card>`;
    const cards = parseFlashcards(response);
    expect(cards[0].difficulty).toBe('medium');
  });

  it('returns empty array for invalid response', () => {
    expect(parseFlashcards('no cards here')).toEqual([]);
    expect(parseFlashcards('')).toEqual([]);
    expect(parseFlashcards('<card><q>incomplete</q></card>')).toEqual([]);
  });

  it('assigns unique IDs to each card', () => {
    const response = `<card><q>Q1</q><a>A1</a></card><card><q>Q2</q><a>A2</a></card>`;
    const cards = parseFlashcards(response);
    expect(cards[0].id).not.toBe(cards[1].id);
  });
});

describe('Summary prompt builder', () => {
  it('includes all assistant messages', () => {
    const prompt = buildSummaryPrompt(['msg1 about physics', 'msg2 about math']);
    expect(prompt).toContain('msg1 about physics');
    expect(prompt).toContain('msg2 about math');
    expect(prompt).toContain('Response 1');
    expect(prompt).toContain('Response 2');
  });

  it('truncates long messages', () => {
    const longMsg = 'x'.repeat(3000);
    const prompt = buildSummaryPrompt([longMsg]);
    expect(prompt.length).toBeLessThan(3000);
  });

  it('includes required output sections', () => {
    const prompt = buildSummaryPrompt(['test']);
    expect(prompt).toContain('Topics Covered');
    expect(prompt).toContain('Key Takeaways');
    expect(prompt).toContain('Open Questions');
    expect(prompt).toContain('Summary');
  });
});

describe('Knowledge map prompt builder', () => {
  it('includes topic and mermaid instructions', () => {
    const prompt = buildKnowledgeMapPrompt('Quantum Physics');
    expect(prompt).toContain('Quantum Physics');
    expect(prompt).toContain('graph TD');
    expect(prompt).toContain('mermaid');
  });

  it('includes material when provided', () => {
    const prompt = buildKnowledgeMapPrompt('test', 'Some material content');
    expect(prompt).toContain('Some material content');
  });

  it('truncates long material content', () => {
    const longMaterial = 'y'.repeat(5000);
    const prompt = buildKnowledgeMapPrompt('test', longMaterial);
    expect(prompt.length).toBeLessThan(5000);
  });

  it('requests concept list and relationships', () => {
    const prompt = buildKnowledgeMapPrompt('test');
    expect(prompt).toContain('Concepts');
    expect(prompt).toContain('Key Relationships');
  });
});

describe('LearningStorage', () => {
  function createMockApp(overrides: any = {}): any {
    return {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(false),
          read: jest.fn().mockResolvedValue('{}'),
          write: jest.fn().mockResolvedValue(undefined),
          mkdir: jest.fn().mockResolvedValue(undefined),
          ...overrides.adapter,
        },
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
        create: jest.fn().mockResolvedValue({}),
        modify: jest.fn().mockResolvedValue(undefined),
        ...overrides.vault,
      },
    };
  }

  it('readJson returns fallback when file does not exist', async () => {
    const app = createMockApp();
    const storage = new LearningStorage(app);
    const result = await storage.readJson('test.json', { default: true });
    expect(result).toEqual({ default: true });
  });

  it('readJson parses existing JSON file', async () => {
    const app = createMockApp({
      adapter: {
        exists: jest.fn().mockResolvedValue(true),
        read: jest.fn().mockResolvedValue('{"key":"value"}'),
      },
    });
    const storage = new LearningStorage(app);
    const result = await storage.readJson('test.json', {});
    expect(result).toEqual({ key: 'value' });
  });

  it('writeJson writes to correct hidden path', async () => {
    const writeFn = jest.fn().mockResolvedValue(undefined);
    const existsFn = jest.fn().mockResolvedValue(true);
    const app = createMockApp({ adapter: { write: writeFn, exists: existsFn } });
    const storage = new LearningStorage(app);
    await storage.writeJson('flashcards/index.json', [1, 2, 3]);
    expect(writeFn).toHaveBeenCalledWith(
      '.claudian-api/learning/flashcards/index.json',
      expect.any(String),
    );
  });

  it('writeVaultFile creates new file when not exists', async () => {
    const createFn = jest.fn().mockResolvedValue({});
    const app = createMockApp({
      vault: {
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
        create: createFn,
      },
      adapter: {
        exists: jest.fn().mockResolvedValue(true),
      },
    });
    const storage = new LearningStorage(app);
    await storage.writeVaultFile('learning/test.md', 'content');
    expect(createFn).toHaveBeenCalledWith('learning/test.md', 'content');
  });

  it('writeVaultFile modifies existing file', async () => {
    const modifyFn = jest.fn().mockResolvedValue(undefined);
    const existingFile = new TFile('learning/test.md');
    const app = createMockApp({
      vault: {
        getAbstractFileByPath: jest.fn().mockReturnValue(existingFile),
        modify: modifyFn,
      },
      adapter: {
        exists: jest.fn().mockResolvedValue(true),
      },
    });
    const storage = new LearningStorage(app);
    await storage.writeVaultFile('learning/test.md', 'updated content');
    expect(modifyFn).toHaveBeenCalledWith(existingFile, 'updated content');
  });

  it('appendVaultFile appends to existing content', async () => {
    const writeFn = jest.fn().mockResolvedValue(undefined);
    const createFn = jest.fn().mockResolvedValue({});
    const app = createMockApp({
      adapter: {
        exists: jest.fn().mockResolvedValue(true),
        read: jest.fn().mockResolvedValue('existing content'),
        write: writeFn,
      },
      vault: {
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
        create: createFn,
      },
    });
    const storage = new LearningStorage(app);
    await storage.appendVaultFile('learning/log.md', 'new section');
    expect(createFn).toHaveBeenCalledWith(
      'learning/log.md',
      'existing content\n\nnew section',
    );
  });

  it('today returns YYYY-MM-DD format', () => {
    const date = LearningStorage.today();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uid returns unique strings', () => {
    const a = LearningStorage.uid();
    const b = LearningStorage.uid();
    expect(a).not.toBe(b);
  });
});

describe('Plan prompt builder', () => {
  it('includes subject in prompt', () => {
    const prompt = buildPlanPrompt('Quantum Physics');
    expect(prompt).toContain('Quantum Physics');
    expect(prompt).toContain('Learning Plan');
  });

  it('includes context summary when provided', () => {
    const summary = '【User Knowledge Gaps】\n- Uncertainty principle\n【Planning Suggestions】\n- Focus on wave-particle duality';
    const prompt = buildPlanPrompt('Physics', summary);
    expect(prompt).toContain('Context Analysis');
    expect(prompt).toContain('Uncertainty principle');
    expect(prompt).toContain('personalize');
  });

  it('works without context summary', () => {
    const prompt = buildPlanPrompt('Math');
    expect(prompt).toContain('Math');
    expect(prompt).not.toContain('【Context Analysis】');
  });
});

describe('Plan summary prompt builder', () => {
  const makeMsg = (role: 'user' | 'assistant', content: string): ChatMessage => ({
    id: Math.random().toString(36),
    role,
    content,
    timestamp: Date.now(),
  });

  it('includes conversation messages in prompt', () => {
    const msgs = [
      makeMsg('user', 'What is quantum superposition?'),
      makeMsg('assistant', 'Superposition is a fundamental principle...'),
    ];
    const prompt = buildPlanSummaryPrompt(msgs);
    expect(prompt).toContain('quantum superposition');
    expect(prompt).toContain('Superposition is a fundamental');
    expect(prompt).toContain('Recent Conversation');
  });

  it('includes material content when provided', () => {
    const prompt = buildPlanSummaryPrompt([], 'Newton\'s laws of motion...');
    expect(prompt).toContain('Newton');
    expect(prompt).toContain('Learning Material');
  });

  it('includes required output sections', () => {
    const prompt = buildPlanSummaryPrompt([]);
    expect(prompt).toContain('User Knowledge Gaps');
    expect(prompt).toContain('User Strengths');
    expect(prompt).toContain('Material Key Points');
    expect(prompt).toContain('Planning Suggestions');
  });

  it('truncates long messages to 500 chars', () => {
    const longContent = 'x'.repeat(1000);
    const msgs = [makeMsg('user', longContent)];
    const prompt = buildPlanSummaryPrompt(msgs);
    // The 500-char content should be in the prompt, but not the full 1000 chars
    expect(prompt).toContain('x'.repeat(500));
    expect(prompt).not.toContain('x'.repeat(501));
  });

  it('skips empty messages', () => {
    const msgs = [
      makeMsg('user', ''),
      makeMsg('assistant', '   '),
      makeMsg('user', 'real question'),
    ];
    const prompt = buildPlanSummaryPrompt(msgs);
    expect(prompt).toContain('real question');
    expect(prompt).not.toContain('User: \n');
  });

  it('limits to recent 10 turns (20 messages)', () => {
    const msgs: ChatMessage[] = [];
    for (let i = 0; i < 25; i++) {
      msgs.push(makeMsg('user', `question-${i}`));
      msgs.push(makeMsg('assistant', `answer-${i}`));
    }
    const prompt = buildPlanSummaryPrompt(msgs);
    // Should include the last 20 messages (question-15 onwards)
    expect(prompt).toContain('question-24');
    expect(prompt).not.toContain('question-4');
  });
});

describe('Learning i18n keys', () => {
  it('English keys resolve correctly', () => {
    setLocale('en');
    expect(t('cmd.flashcard')).toBe('Generate flashcard Q&A cards');
    expect(t('cmd.summary')).toBe('Generate learning session summary');
    expect(t('cmd.map')).toBe('Generate knowledge concept map');
    expect(t('cmd.plan')).toBe('Generate phased learning plan');
    expect(t('learning.flashcard.saved', { count: '5', path: 'test.md' })).toContain('5');
    expect(t('learning.flashcard.saved', { count: '5', path: 'test.md' })).toContain('test.md');
  });

  it('Chinese keys resolve correctly', () => {
    setLocale('zh');
    expect(t('cmd.flashcard')).toBe('生成闪卡问答');
    expect(t('cmd.summary')).toBe('生成学习总结');
    expect(t('cmd.map')).toBe('生成知识图谱');
    expect(t('cmd.plan')).toBe('生成学习计划');
    expect(t('learning.flashcard.saved', { count: '3', path: 'x.md' })).toContain('3');
    // Reset
    setLocale('en');
  });
});

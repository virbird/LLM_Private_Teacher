import { LearningStorage } from './LearningStorage';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { buildSystemPrompt } from '../prompt/systemPrompt';
import { buildFlashcardPrompt, parseFlashcards, type Flashcard } from '../prompt/flashcard';
import { buildSummaryPrompt } from '../prompt/summary';
import { buildKnowledgeMapPrompt } from '../prompt/knowledgeMap';
import { buildPlanPrompt } from '../prompt/plan';
import { buildQuizPrompt } from '../prompt/quiz';
import { SpacedRepetitionManager, type ReviewEntry } from './spacedRepetition';
import { LearningStatsService } from './stats';
import { ErrorNotebook } from './errorNotebook';
import { buildStudyBuddyPrompt } from '../prompt/studyBuddy';
import { buildErrorReviewPrompt } from '../prompt/errorReview';
import { type App } from 'obsidian';
import type { PluginSettings } from '../types/settings';
import type { ChatMessage } from '../types/chat';
import type { ChatRequest } from '../providers/LlmProvider';
import type { RolePreset } from '../prompt/roles';
import { t } from '../i18n';

export interface CommandContext {
  app: App;
  settings: PluginSettings;
  messages: ChatMessage[];
  materialContent?: string;
  activeModel: string;
  maxTokens: number;
  activeRole: RolePreset | null;
  onStatus?: (text: string) => void;
}

/**
 * Dispatches learning action commands (/flashcard, /summary, /map, /plan).
 * These commands call the AI, parse the response, and save results to vault files.
 */
export class LearningCommandDispatcher {
  private storage: LearningStorage;

  private spacedRepetition: SpacedRepetitionManager;
  private statsService: LearningStatsService;
  private errorNotebook: ErrorNotebook;

  constructor(app: App) {
    this.storage = new LearningStorage(app);
    this.spacedRepetition = new SpacedRepetitionManager(this.storage);
    this.statsService = new LearningStatsService(this.storage);
    this.errorNotebook = new ErrorNotebook(this.storage);
  }

  /** Returns true if the command is a learning action command */
  isLearningCommand(cmd: string): boolean {
    return ['/flashcard', '/summary', '/map', '/plan', '/review', '/checkup', '/stats', '/mistakes', '/buddy'].includes(cmd);
  }

  async execute(cmd: string, args: string, ctx: CommandContext): Promise<string | null> {
    try {
      switch (cmd) {
        case '/flashcard': return await this.executeFlashcard(args, ctx);
        case '/summary': return await this.executeSummary(args, ctx);
        case '/map': return await this.executeMap(args, ctx);
        case '/plan': return await this.executePlan(args, ctx);
        case '/review': return await this.executeReview(args, ctx);
        case '/checkup': return await this.executeCheckup(args, ctx);
        case '/stats': return await this.executeStats(ctx);
        case '/mistakes': return await this.executeMistakes(args, ctx);
        case '/buddy': return await this.executeBuddy(args, ctx);
        default: return null;
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[LearningCommand]', cmd, errMsg);
      return `Error: ${errMsg}`;
    }
  }

  // --- /flashcard ---

  private async executeFlashcard(topic: string, ctx: CommandContext): Promise<string> {
    ctx.onStatus?.(t('learning.flashcard.generating', { topic: topic || 'session' }));

    const prompt = buildFlashcardPrompt(topic, ctx.materialContent);
    const response = await this.callAI(prompt, ctx);

    const cards = parseFlashcards(response);
    if (cards.length === 0) {
      return t('learning.flashcard.parseError');
    }

    // Save to vault
    const folder = ctx.settings.learning.flashcardFolder;
    const date = LearningStorage.today();
    const safeTopic = (topic || 'session').replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '_').slice(0, 30);
    const filePath = `${folder}/${safeTopic}-${date}.md`;

    const content = this.formatFlashcardMarkdown(cards, topic || 'Learning Session', date);
    await this.storage.writeVaultFile(filePath, content);

    // Update index
    const index = await this.storage.readJson<Flashcard[]>('flashcards/index.json', []);
    index.push(...cards);
    await this.storage.writeJson('flashcards/index.json', index);

    return t('learning.flashcard.saved', { count: String(cards.length), path: filePath });
  }

  // --- /summary ---

  private async executeSummary(_args: string, ctx: CommandContext): Promise<string> {
    const assistantMessages = ctx.messages
      .filter(m => m.role === 'assistant' && m.content)
      .map(m => m.content);

    if (assistantMessages.length === 0) {
      return t('learning.summary.noContent');
    }

    ctx.onStatus?.(t('learning.summary.generating'));

    const prompt = buildSummaryPrompt(assistantMessages);
    const response = await this.callAI(prompt, ctx);

    const folder = ctx.settings.learning.logFolder;
    const date = LearningStorage.today();
    const filePath = `${folder}/${date}.md`;

    const section = `## Session at ${new Date().toLocaleTimeString()}\n\n${response}`;
    await this.storage.appendVaultFile(filePath, section);

    return t('learning.summary.saved', { path: filePath });
  }

  // --- /map ---

  private async executeMap(topic: string, ctx: CommandContext): Promise<string> {
    if (!topic && ctx.messages.filter(m => m.role === 'assistant').length === 0) {
      return t('learning.map.noContent');
    }

    ctx.onStatus?.(t('learning.map.generating', { topic: topic || 'overview' }));

    const prompt = buildKnowledgeMapPrompt(topic, ctx.materialContent);
    const response = await this.callAI(prompt, ctx);

    const folder = ctx.settings.learning.mapFolder;
    const safeTopic = (topic || 'knowledge').replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '_').slice(0, 30);
    const filePath = `${folder}/${safeTopic}.md`;

    const content = `# Knowledge Map: ${topic || 'Overview'}\n\n${response}\n\n---\n*Generated: ${new Date().toLocaleString()}*`;
    await this.storage.writeVaultFile(filePath, content);

    return t('learning.map.saved', { path: filePath });
  }

  // --- /plan ---

  private async executePlan(args: string, ctx: CommandContext): Promise<string> {
    if (!args.trim()) {
      return t('learning.plan.noArgs');
    }

    ctx.onStatus?.(t('learning.plan.generating', { subject: args }));

    const prompt = buildPlanPrompt(args, ctx.materialContent);
    const response = await this.callAI(prompt, ctx);

    const folder = ctx.settings.learning.planFolder;
    const subject = args.split(/\d+\s*(week|day|month)/i)[0].trim() || args.slice(0, 30);
    const safeSubject = subject.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '_').slice(0, 30);
    const filePath = `${folder}/${safeSubject}.md`;

    const content = `# Learning Plan: ${args}\n\n${response}\n\n---\n*Generated: ${new Date().toLocaleString()}*`;
    await this.storage.writeVaultFile(filePath, content);

    return t('learning.plan.saved', { path: filePath });
  }

  // --- /review (Spaced Repetition) ---

  private async executeReview(args: string, ctx: CommandContext): Promise<string> {
    // First, auto-add any flashcards from the index that aren't in the schedule
    const allCards = await this.storage.readJson<Flashcard[]>('flashcards/index.json', []);
    if (allCards.length > 0) {
      await this.spacedRepetition.addCards(allCards);
    }

    const dueCards = await this.spacedRepetition.getDueCards();
    const stats = await this.spacedRepetition.getStats();

    if (dueCards.length === 0) {
      return t('learning.review.noDue') + '\n\n' +
        t('learning.review.stats', {
          total: String(stats.total),
          due: String(stats.due),
          reviewed: String(stats.reviewed),
        });
    }

    // Check if args is a quality rating (0-5) for the first due card
    const qualityMatch = args.trim().match(/^(\d+)$/);
    if (qualityMatch) {
      const quality = parseInt(qualityMatch[1], 10);
      if (quality >= 0 && quality <= 5 && dueCards.length > 0) {
        const card = dueCards[0];
        const updated = await this.spacedRepetition.recordReview(card.cardId, quality);
        const remaining = dueCards.length - 1;
        let result = t('learning.review.recorded', {
          quality: String(quality),
          nextDate: updated?.nextReviewDate || '',
          interval: String(updated?.interval || 0),
        });
        if (remaining > 0) {
          result += '\n\n' + this.formatReviewCard(dueCards[1], 1, remaining);
        } else {
          result += '\n\n' + t('learning.review.allDone');
        }
        return result;
      }
    }

    // Show the first due card
    return this.formatReviewCard(dueCards[0], 0, dueCards.length) +
      '\n\n' + t('learning.review.instructions');
  }

  private formatReviewCard(card: ReviewEntry, index: number, total: number): string {
    const header = `**📇 Review Card ${index + 1}/${total}**`;
    const question = `### Q: ${card.question}`;
    const answer = `<details><summary>Show Answer</summary>\n\n${card.answer}\n\n</details>`;
    const meta = `*Difficulty: ${card.difficulty} | Tags: ${card.tags?.join(', ') || 'none'}*`;
    const rating = `Rate your recall: \`/review 0\` (forgot) → \`/review 5\` (perfect)`;
    return `${header}\n\n${question}\n\n${answer}\n\n${meta}\n\n${rating}`;
  }

  // --- /checkup (Quiz) ---

  private async executeCheckup(topic: string, ctx: CommandContext): Promise<string> {
    if (!topic.trim()) {
      return t('learning.checkup.noArgs');
    }

    ctx.onStatus?.(t('learning.checkup.generating', { topic }));

    const prompt = buildQuizPrompt(topic, ctx.materialContent);
    const response = await this.callAI(prompt, ctx);

    // Save quiz to vault
    const folder = ctx.settings.learning.quizFolder;
    const date = LearningStorage.today();
    const safeTopic = topic.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '_').slice(0, 30);
    const filePath = `${folder}/${safeTopic}-${date}.md`;

    const content = `# Quiz: ${topic}\n\n*Generated: ${date}*\n\n---\n\n${response}\n\n---\n*Submit answers with: /checkup-answer <your answers>*`;
    await this.storage.writeVaultFile(filePath, content);

    return response + '\n\n' + t('learning.checkup.saved', { path: filePath });
  }

  // --- /stats ---

  private async executeStats(ctx: CommandContext): Promise<string> {
    const stats = await this.statsService.computeStats();
    return this.statsService.formatStatsMarkdown(stats);
  }

  // --- /mistakes ---

  private async executeMistakes(args: string, ctx: CommandContext): Promise<string> {
    const subCmd = args.trim().split(/\s+/)[0];

    if (subCmd === 'review') {
      // AI-assisted review of mistakes
      const active = await this.errorNotebook.getActive();
      if (active.length === 0) {
        return t('learning.mistakes.empty');
      }

      ctx.onStatus?.('Reviewing mistakes...');
      const mistakes = active.map(e => ({
        question: e.question,
        correctAnswer: e.correctAnswer,
        explanation: e.explanation,
        topic: e.topic,
      }));
      const prompt = buildErrorReviewPrompt(mistakes.slice(0, 10));
      const response = await this.callAI(prompt, ctx);
      return response;
    }

    if (subCmd === 'master' && args.trim().split(/\s+/).length > 1) {
      const id = args.trim().split(/\s+/)[1];
      const ok = await this.errorNotebook.markMastered(id);
      return ok ? 'Marked as mastered!' : 'Entry not found.';
    }

    // Default: show mistakes
    const md = await this.errorNotebook.formatMarkdown();
    if (!md) {
      return t('learning.mistakes.empty');
    }

    const stats = await this.errorNotebook.getStats();
    const header = `**Error Notebook**: ${stats.active} active | ${stats.mastered} mastered | ${stats.total} total\n\n`;
    return header + md;
  }

  // --- /buddy ---

  private async executeBuddy(args: string, ctx: CommandContext): Promise<string> {
    const topic = args.trim();
    if (!topic) {
      return t('learning.buddy.noArgs');
    }

    if (topic === 'off') {
      return t('learning.buddy.exit');
    }

    // Build the buddy prompt and call AI
    const buddyPrompt = buildStudyBuddyPrompt(topic);
    const response = await this.callAI(buddyPrompt, ctx);
    return t('learning.buddy.enter', { topic }) + '\n\n' + response;
  }

  // --- AI Call Helper ---

  private async callAI(userPrompt: string, ctx: CommandContext): Promise<string> {
    const provider = ProviderRegistry.get(ctx.settings.activeProvider);
    if (!provider) {
      throw new Error(t('providerNotConfigured', { provider: ctx.settings.activeProvider }));
    }

    const systemPrompt = buildSystemPrompt({
      customPrompt: 'You are a learning assistant. Follow the user instructions precisely. Output in the format requested.',
      activeRole: ctx.activeRole,
    });

    const messages = [
      { role: 'user' as const, content: userPrompt },
    ];

    let response = '';
    const signal = new AbortController().signal;

    const request: ChatRequest = {
      messages,
      model: ctx.activeModel,
      system: systemPrompt,
      maxTokens: ctx.maxTokens,
      stream: true,
      signal,
    };
    for await (const event of provider.chat(request)) {
      if (event.type === 'text_delta') {
        response += event.text;
      }
    }

    return response;
  }

  // --- Flashcard Formatting ---

  private formatFlashcardMarkdown(cards: Flashcard[], topic: string, date: string): string {
    let md = `# Flashcards: ${topic}\n\n*Generated: ${date}*\n*Cards: ${cards.length}*\n\n---\n\n`;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      md += `## Q${i + 1}: ${card.question}\n\n`;
      md += `**A:** ${card.answer}\n\n`;
      if (card.difficulty) md += `*Difficulty: ${card.difficulty}*\n\n`;
      if (card.tags?.length) md += `*Tags: ${card.tags.join(', ')}*\n\n`;
      md += '---\n\n';
    }
    return md;
  }
}

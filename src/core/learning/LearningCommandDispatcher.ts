import { LearningStorage } from './LearningStorage';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { buildSystemPrompt } from '../prompt/systemPrompt';
import { buildFlashcardPrompt, parseFlashcards, type Flashcard } from '../prompt/flashcard';
import { buildSummaryPrompt } from '../prompt/summary';
import { buildKnowledgeMapPrompt } from '../prompt/knowledgeMap';
import { buildPlanPrompt } from '../prompt/plan';
import { buildPlanSummaryPrompt } from '../prompt/planSummary';
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
  private reviewSession: {
    cardId: string | null;
    subject?: string;
    topic?: string;
  } = { cardId: null };

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
      let result: string | null;
      switch (cmd) {
        case '/flashcard': result = await this.executeFlashcard(args, ctx); break;
        case '/summary': result = await this.executeSummary(args, ctx); break;
        case '/map': result = await this.executeMap(args, ctx); break;
        case '/plan': result = await this.executePlan(args, ctx); break;
        case '/review': result = await this.executeReview(args, ctx); break;
        case '/checkup': result = await this.executeCheckup(args, ctx); break;
        case '/stats': result = await this.executeStats(ctx); break;
        case '/mistakes': result = await this.executeMistakes(args, ctx); break;
        case '/buddy': result = await this.executeBuddy(args, ctx); break;
        default: return null;
      }
      // Record activity (skip /stats since it's just viewing)
      if (cmd !== '/stats') {
        await this.statsService.recordAction(cmd);
      }
      return result;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[LearningCommand]', cmd, errMsg);
      return `Error: ${errMsg}`;
    }
  }

  // --- /flashcard ---

  private async executeFlashcard(args: string, ctx: CommandContext): Promise<string> {
    // Parse: /flashcard <subject> <topic> or /flashcard <topic>
    const parts = args.trim().split(/\s+/);
    let subject = '', topic = '';
    if (parts.length >= 2) {
      subject = parts[0];
      topic = parts.slice(1).join(' ');
    } else if (parts.length === 1 && parts[0]) {
      subject = '未分类';
      topic = parts[0];
    } else {
      subject = '未分类';
      topic = 'session';
    }

    ctx.onStatus?.(t('learning.flashcard.generating', { topic: `${subject} / ${topic}` }));

    const prompt = buildFlashcardPrompt(subject, topic, ctx.materialContent);
    const response = await this.callAI(prompt, ctx);

    const cards = parseFlashcards(response);
    if (cards.length === 0) {
      return t('learning.flashcard.parseError');
    }

    // Set subject + topic on all cards
    for (const card of cards) {
      card.subject = subject;
      card.topic = topic;
    }

    // Save to vault (organized by subject subfolder)
    const folder = ctx.settings.learning.flashcardFolder;
    const date = LearningStorage.today();
    const safeSubject = subject.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '_').slice(0, 30);
    const safeTopic = topic.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '_').slice(0, 30);
    const filePath = `${folder}/${safeSubject}/${safeTopic}-${date}.md`;

    const content = this.formatFlashcardMarkdown(cards, subject, topic, date);
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

    // Step 1: Analyze chat history + material to produce a context summary
    let contextSummary = '';
    const hasChatHistory = ctx.messages.filter(m => m.content && m.content.trim().length > 0).length > 0;
    if (hasChatHistory || ctx.materialContent) {
      ctx.onStatus?.(t('learning.plan.analyzing'));
      const summaryPrompt = buildPlanSummaryPrompt(ctx.messages, ctx.materialContent);
      contextSummary = await this.callAI(summaryPrompt, ctx);
    }

    // Step 2: Generate personalized plan using the summary
    ctx.onStatus?.(t('learning.plan.generating', { subject: args }));
    const prompt = buildPlanPrompt(args, contextSummary || undefined);
    const response = await this.callAI(prompt, ctx);

    const folder = ctx.settings.learning.planFolder;
    const subject = args.split(/\d+\s*(week|day|month)/i)[0].trim() || args.slice(0, 30);
    const safeSubject = subject.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '_').slice(0, 30);
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '-' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');
    const filePath = `${folder}/${safeSubject}-${timestamp}.md`;

    const content = `# Learning Plan: ${args}\n\n${response}\n\n---\n*Generated: ${new Date().toLocaleString()}*`;
    await this.storage.writeVaultFile(filePath, content);

    return t('learning.plan.saved', { path: filePath });
  }

  // --- /review (Spaced Repetition) ---

  private async executeReview(args: string, ctx: CommandContext): Promise<string> {
    // Sync flashcards from index to review schedule
    const allCards = await this.storage.readJson<Flashcard[]>('flashcards/index.json', []);
    if (allCards.length > 0) {
      await this.spacedRepetition.addCards(allCards);
    }

    // Parse args: last token if 0-5 digit → quality rating
    const tokens = args.trim().split(/\s+/).filter(Boolean);
    let quality: number | null = null;
    let subject: string | undefined;
    let topic: string | undefined;

    const lastToken = tokens[tokens.length - 1];
    if (lastToken && /^\d$/.test(lastToken)) {
      quality = parseInt(lastToken);
      tokens.pop();
    }
    if (tokens.length >= 1) subject = tokens[0];
    if (tokens.length >= 2) topic = tokens.slice(1).join(' ');

    // --- Quality rating mode ---
    if (quality !== null) {
      // Update session filter if new filter provided
      if (subject) {
        this.reviewSession.subject = subject;
        this.reviewSession.topic = topic;
      }
      const filterSubject = this.reviewSession.subject;
      const filterTopic = this.reviewSession.topic;

      // Rate the current session card
      if (!this.reviewSession.cardId) {
        return t('learning.review.noActiveCard');
      }
      const updated = await this.spacedRepetition.recordReview(this.reviewSession.cardId, quality);
      if (!updated) {
        this.reviewSession.cardId = null;
        return t('learning.review.cardNotFound');
      }

      const recordedMsg = t('learning.review.recorded', {
        quality: String(quality),
        nextDate: updated.nextReviewDate,
        interval: String(updated.interval),
      });

      // Get next due card with same filter
      const dueCards = await this.spacedRepetition.getDueCards(filterSubject, filterTopic);
      if (dueCards.length === 0) {
        this.reviewSession.cardId = null;
        return recordedMsg + '\n\n' + t('learning.review.allDone');
      }

      this.reviewSession.cardId = dueCards[0].cardId;
      return recordedMsg + '\n\n' +
        this.formatReviewCard(dueCards[0], 0, dueCards.length, filterSubject, filterTopic) +
        '\n\n' + this.formatReviewInstructions();
    }

    // --- Subject tree overview (no args) ---
    if (!subject) {
      const tree = await this.spacedRepetition.getDueTree();
      const totalDue = Object.values(tree).reduce(
        (sum, topics) => sum + Object.values(topics).reduce((a, b) => a + b, 0), 0
      );
      if (totalDue === 0) {
        const stats = await this.spacedRepetition.getStats();
        return t('learning.review.noDue') + '\n\n' +
          t('learning.review.stats', {
            total: String(stats.total),
            due: String(stats.due),
            reviewed: String(stats.reviewed),
          });
      }
      let result = t('learning.review.treeHeader', { count: String(totalDue) }) + '\n\n';
      for (const [subj, topics] of Object.entries(tree)) {
        const subjTotal = Object.values(topics).reduce((a, b) => a + b, 0);
        result += `**${subj}** (${subjTotal} 张)\n`;
        for (const [tp, count] of Object.entries(topics)) {
          result += `  - ${tp}: ${count} 张\n`;
        }
        result += '\n';
      }
      result += t('learning.review.treeEnterHint');
      return result;
    }

    // --- Enter subject/topic review ---
    const dueCards = await this.spacedRepetition.getDueCards(subject, topic);
    if (dueCards.length === 0) {
      return t('learning.review.noDueForFilter', { subject, topic: topic || '' });
    }

    // Set session state
    this.reviewSession.cardId = dueCards[0].cardId;
    this.reviewSession.subject = subject;
    this.reviewSession.topic = topic;

    return this.formatReviewCard(dueCards[0], 0, dueCards.length, subject, topic) +
      '\n\n' + this.formatReviewInstructions();
  }

  private formatReviewCard(card: ReviewEntry, index: number, total: number, subject?: string, topic?: string): string {
    const location = subject ? ` [${subject}${topic ? ' > ' + topic : ''}]` : '';
    const header = `**📇 Review Card ${index + 1}/${total}**${location}`;
    const question = `### Q: ${card.question}`;
    const answer = `<details><summary>Show Answer</summary>\n\n${card.answer}\n\n</details>`;
    const meta = `*Difficulty: ${card.difficulty} | Tags: ${card.tags?.join(', ') || 'none'}*`;
    const rating = `Rate your recall: \`/review 0\` (forgot) → \`/review 5\` (perfect)`;
    return `${header}\n\n${question}\n\n${answer}\n\n${meta}\n\n${rating}`;
  }

  private formatReviewInstructions(): string {
    return t('learning.review.instructions');
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

  private formatFlashcardMarkdown(cards: Flashcard[], subject: string, topic: string, date: string): string {
    let md = `# Flashcards: ${subject} / ${topic}\n\n*Generated: ${date}*\n*Cards: ${cards.length}*\n\n---\n\n`;
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

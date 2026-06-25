export interface LearningMethod {
  id: string;
  name: string;
  description: string;
  command: string;
  /** i18n key for UI display, e.g. 'method.guide' */
  i18nKey: string;
  buildPrompt(query: string, materialContent?: string): string;
}

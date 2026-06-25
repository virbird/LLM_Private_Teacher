export interface LearningMethod {
  id: string;
  name: string;
  description: string;
  command: string;
  buildPrompt(query: string, materialContent?: string): string;
}

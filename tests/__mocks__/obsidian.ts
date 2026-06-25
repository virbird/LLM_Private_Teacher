// Minimal Obsidian API mock for testing
export class App {
  vault: any = { getMarkdownFiles: () => [], getAbstractFileByPath: () => null, read: () => Promise.resolve('') };
}
export class Plugin {}
export class ItemView {
  app: any = new App();
  containerEl: any = { children: [{}, {}], empty: () => {}, createDiv: () => ({}) };
}
export class PluginSettingTab {}
export class SuggestModal<T> {
  app: any;
  constructor(app: any) { this.app = app; }
  setPlaceholder(_text: string): void {}
  setInstructions(_instructions: any[]): void {}
  open(): void {}
}
export class Notice {
  constructor(_message: string, _timeout?: number) {}
}
export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.basename = this.name.replace(/\.[^.]+$/, '');
    this.extension = this.name.includes('.') ? this.name.split('.').pop() || '' : '';
  }
}
export class TFolder {
  path: string;
  name: string;
  children: (TFile | TFolder)[];
  constructor(path: string, children: (TFile | TFolder)[] = []) {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.children = children;
  }
}

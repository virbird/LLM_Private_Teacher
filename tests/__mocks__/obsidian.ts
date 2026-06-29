// Minimal Obsidian API mock for testing
export class DataAdapter {
  exists(_path: string): Promise<boolean> { return Promise.resolve(false); }
  read(_path: string): Promise<string> { return Promise.resolve(''); }
  write(_path: string, _data: string): Promise<void> { return Promise.resolve(); }
  mkdir(_path: string): Promise<void> { return Promise.resolve(); }
}
export class Vault {
  adapter: DataAdapter = new DataAdapter();
  getMarkdownFiles(): TFile[] { return []; }
  getAbstractFileByPath(_path: string): TFile | TFolder | null { return null; }
  read(_file: TFile): Promise<string> { return Promise.resolve(''); }
  modify(_file: TFile, _content: string): Promise<void> { return Promise.resolve(); }
  create(_path: string, _content: string): Promise<TFile> { return Promise.resolve(new TFile('')); }
}
export class App {
  vault: Vault = new Vault();
}
export class Plugin {}
export class ItemView {
  app: any = new App();
  containerEl: any = { children: [{}, {}], empty: () => {}, createDiv: () => ({}) };
}
export class PluginSettingTab {
  app: App = new App();
  containerEl: any = { empty: () => {}, createEl: () => ({}), createDiv: () => ({}) };
  display(): void {}
}
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

export const Platform = {
  isDesktopApp: true,
  isMobileApp: false,
  isMobile: false,
  isMacOS: true,
  isWin: false,
  isLinux: false,
};

import { DEFAULT_SETTINGS, type LearningMaterial } from '../../../src/core/types/settings';
import { SettingsStorage } from '../../../src/core/storage/SettingsStorage';
import { ChatView } from '../../../src/features/chat/ChatView';
import { MethodRegistry } from '../../../src/core/learning/MethodRegistry';
import { StudyGuideMethod } from '../../../src/core/learning/methods/StudyGuideMethod';
import { ConfusionTerminatorMethod } from '../../../src/core/learning/methods/ConfusionTerminatorMethod';
import { GapFinderMethod } from '../../../src/core/learning/methods/GapFinderMethod';
import { SocraticQuizMethod } from '../../../src/core/learning/methods/SocraticQuizMethod';
import { ExamPredictorMethod } from '../../../src/core/learning/methods/ExamPredictorMethod';
import { AudioPartnerMethod } from '../../../src/core/learning/methods/AudioPartnerMethod';
import { FeynmanTestMethod } from '../../../src/core/learning/methods/FeynmanTestMethod';
import { MockExamMethod } from '../../../src/core/learning/methods/MockExamMethod';

function createMaterial(overrides: Partial<LearningMaterial> = {}): LearningMaterial {
  return {
    path: 'notes/sample.md',
    title: 'Sample Note',
    tags: [],
    confirmed: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('LearningMaterial model', () => {
  it('uses path as unique identifier', () => {
    const a = createMaterial({ path: 'a.md' });
    const b = createMaterial({ path: 'a.md', title: 'Different title' });
    expect(a.path).toBe(b.path);
    expect(a.title).not.toBe(b.title);
  });

  it('supports tags with add/remove semantics', () => {
    const material = createMaterial({ tags: ['physics'] });
    const addTag = (m: LearningMaterial, tag: string) => {
      const trimmed = tag.trim();
      if (trimmed && !m.tags.includes(trimmed) && m.tags.length < 5) {
        m.tags.push(trimmed);
      }
    };
    const removeTag = (m: LearningMaterial, tag: string) => {
      m.tags = m.tags.filter(t => t !== tag);
    };

    addTag(material, 'quantum');
    expect(material.tags).toEqual(['physics', 'quantum']);

    addTag(material, 'physics'); // duplicate
    expect(material.tags).toEqual(['physics', 'quantum']);

    addTag(material, ''); // empty
    expect(material.tags).toEqual(['physics', 'quantum']);

    removeTag(material, 'physics');
    expect(material.tags).toEqual(['quantum']);
  });

  it('enforces tag limits', () => {
    const material = createMaterial({ tags: ['a', 'b', 'c', 'd', 'e'] });
    const addTag = (m: LearningMaterial, tag: string) => {
      const trimmed = tag.trim();
      if (trimmed && !m.tags.includes(trimmed) && m.tags.length < 5) {
        m.tags.push(trimmed);
      }
    };
    addTag(material, 'f');
    expect(material.tags).toHaveLength(5);
    expect(material.tags).not.toContain('f');
  });

  it('toggles confirmed state', () => {
    const material = createMaterial({ confirmed: false });
    material.confirmed = !material.confirmed;
    expect(material.confirmed).toBe(true);
  });
});

describe('SettingsStorage migration', () => {
  function createMockVaultStorage(savedData: any): any {
    return {
      readJson: jest.fn().mockResolvedValue(savedData),
      writeJson: jest.fn(),
    };
  }

  it('defaults learningMaterials to empty array when missing', async () => {
    const storage = new SettingsStorage(createMockVaultStorage({ activeProvider: 'openai' }));
    const settings = await storage.load();
    expect(settings.learningMaterials).toEqual([]);
  });

  it('defaults activeMaterialPath to empty string when missing', async () => {
    const storage = new SettingsStorage(createMockVaultStorage({ learningMaterials: [] }));
    const settings = await storage.load();
    expect(settings.activeMaterialPath).toBe('');
  });

  it('preserves existing material settings', async () => {
    const materials = [createMaterial({ path: 'kept.md', confirmed: true })];
    const storage = new SettingsStorage(createMockVaultStorage({
      learningMaterials: materials,
      activeMaterialPath: 'kept.md',
    }));
    const settings = await storage.load();
    expect(settings.learningMaterials).toEqual(materials);
    expect(settings.activeMaterialPath).toBe('kept.md');
  });
});

describe('ChatView material loading', () => {
  function createMockPlugin(settingsOverrides: any = {}) {
    return {
      settings: { ...DEFAULT_SETTINGS, ...settingsOverrides },
      saveSettings: jest.fn(),
      sessionStorage: { listAll: jest.fn().mockResolvedValue([]) },
    };
  }

  function createMockLeaf(): any {
    return {};
  }

  function createChatView(plugin: any, files: any[] = []): ChatView {
    const view = new ChatView(createMockLeaf(), plugin);
    (view as any).app = {
      vault: {
        getMarkdownFiles: () => files,
        getAbstractFileByPath: (path: string) => files.find((f: any) => f.path === path),
        read: (file: any) => Promise.resolve(file.content || ''),
      },
    };
    return view;
  }

  it('returns undefined when no active material', async () => {
    const plugin = createMockPlugin({ activeMaterialPath: '' });
    const view = createChatView(plugin);
    const content = await (view as any).loadActiveMaterialContent();
    expect(content).toBeUndefined();
  });

  it('returns file content for active material', async () => {
    const plugin = createMockPlugin({ activeMaterialPath: 'notes/physics.md' });
    const file = { path: 'notes/physics.md', content: 'Newton laws' };
    const view = createChatView(plugin, [file]);
    const content = await (view as any).loadActiveMaterialContent();
    expect(content).toBe('Newton laws');
  });

  it('truncates content over 8000 characters', async () => {
    const longContent = 'a'.repeat(9000);
    const plugin = createMockPlugin({ activeMaterialPath: 'notes/long.md' });
    const file = { path: 'notes/long.md', content: longContent };
    const view = createChatView(plugin, [file]);
    const content = await (view as any).loadActiveMaterialContent();
    expect(content).toContain('a'.repeat(100));
    expect(content).toContain('...(truncated)');
    expect(content!.length).toBeLessThanOrEqual(8015); // 8000 + newline + marker
  });

  it('returns undefined for non-existent material path', async () => {
    const plugin = createMockPlugin({ activeMaterialPath: 'missing.md' });
    const view = createChatView(plugin, []);
    const content = await (view as any).loadActiveMaterialContent();
    expect(content).toBeUndefined();
  });
});

describe('Learning methods material injection', () => {
  const query = 'explain this';
  const material = 'Material: E=mc²';

  it('all 8 methods inject material content when provided', () => {
    const methods = [
      StudyGuideMethod,
      ConfusionTerminatorMethod,
      GapFinderMethod,
      SocraticQuizMethod,
      ExamPredictorMethod,
      AudioPartnerMethod,
      FeynmanTestMethod,
      MockExamMethod,
    ];
    for (const method of methods) {
      const prompt = method.buildPrompt(query, material);
      expect(prompt).toContain(material);
      expect(prompt).not.toContain('【学习材料】');
    }
  });

  it('all 8 methods keep placeholder or context when no material', () => {
    const methods = [
      StudyGuideMethod,
      ConfusionTerminatorMethod,
      GapFinderMethod,
      SocraticQuizMethod,
      ExamPredictorMethod,
      AudioPartnerMethod,
      FeynmanTestMethod,
      MockExamMethod,
    ];
    for (const method of methods) {
      const prompt = method.buildPrompt(query);
      expect(prompt.length).toBeGreaterThan(0);
    }
  });
});

describe('MethodRegistry material-aware dispatch', () => {
  it('looks up method by command for injection', () => {
    const method = MethodRegistry.getByCommand('/guide');
    expect(method).toBeDefined();
    const prompt = method!.buildPrompt('test', 'material content');
    expect(prompt).toContain('material content');
  });
});

import { SettingsStorage } from '../../src/core/storage/SettingsStorage';
import { DEFAULT_SETTINGS } from '../../src/core/types/settings';
import type { VaultStorage } from '../../src/core/storage/VaultStorage';

function storageWith(saved: unknown): VaultStorage {
  return {
    readJson: jest.fn().mockResolvedValue(saved),
    writeJson: jest.fn().mockResolvedValue(undefined),
  } as unknown as VaultStorage;
}

describe('SettingsStorage.load', () => {
  it('returns defaults when nothing is saved', async () => {
    const settings = await new SettingsStorage(storageWith(null)).load();
    expect(settings.learning.noteFolder).toBe(DEFAULT_SETTINGS.learning.noteFolder);
    expect(settings.learning.learningSteps).toEqual(DEFAULT_SETTINGS.learning.learningSteps);
  });

  it('backfills learning fields added in later versions', async () => {
    // Real-world settings.json written before noteFolder / learningSteps existed
    const settings = await new SettingsStorage(storageWith({
      learning: {
        flashcardFolder: 'learning/flashcards',
        logFolder: 'learning/logs',
        mapFolder: 'learning/maps',
        planFolder: 'learning/plans',
        quizFolder: 'learning/quizzes',
      },
    })).load();

    expect(settings.learning.noteFolder).toBe(DEFAULT_SETTINGS.learning.noteFolder);
    expect(settings.learning.learningSteps).toEqual(DEFAULT_SETTINGS.learning.learningSteps);
    // Existing values must survive the merge
    expect(settings.learning.flashcardFolder).toBe('learning/flashcards');
  });

  it('keeps user overrides of learning folders', async () => {
    const settings = await new SettingsStorage(storageWith({
      learning: { noteFolder: 'my-notes', flashcardFolder: 'cards' },
    })).load();

    expect(settings.learning.noteFolder).toBe('my-notes');
    expect(settings.learning.flashcardFolder).toBe('cards');
    expect(settings.learning.logFolder).toBe(DEFAULT_SETTINGS.learning.logFolder);
  });

  it('repairs an empty or invalid learningSteps array', async () => {
    const empty = await new SettingsStorage(storageWith({ learning: { learningSteps: [] } })).load();
    expect(empty.learning.learningSteps).toEqual(DEFAULT_SETTINGS.learning.learningSteps);

    const invalid = await new SettingsStorage(storageWith({
      learning: { learningSteps: 'nope' as unknown as number[] },
    })).load();
    expect(invalid.learning.learningSteps).toEqual(DEFAULT_SETTINGS.learning.learningSteps);
  });

  it('still deep-merges provider accounts', async () => {
    const settings = await new SettingsStorage(storageWith({
      providers: { openaiCompat: { apiKey: 'k' } },
    })).load();

    expect(settings.providers.openaiCompat.apiKey).toBe('k');
    expect(settings.providers.openaiCompat.customModels).toEqual([]);
    expect(settings.providers.anthropic.model).toBe(DEFAULT_SETTINGS.providers.anthropic.model);
  });
});

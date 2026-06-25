import { buildSystemPrompt } from '../../../src/core/prompt/systemPrompt';
import { ROLE_PRESETS, getRoleById } from '../../../src/core/prompt/roles';

describe('buildSystemPrompt', () => {
  const basePrompt = 'You are **Claudian**';

  it('includes base prompt when no settings', () => {
    const result = buildSystemPrompt();
    expect(result).toContain(basePrompt);
    expect(result).not.toContain('Socratic');
    expect(result).not.toContain('Language Learning');
    expect(result).not.toContain('Custom Instructions');
  });

  it('injects Socratic role prompt when selected', () => {
    const socratic = getRoleById('socratic')!;
    const result = buildSystemPrompt({ activeRole: socratic });
    expect(result).toContain(basePrompt);
    expect(result).toContain('Socratic Tutor');
    expect(result).toContain('Never give direct answers');
    expect(result).not.toContain('Language Learning Partner');
  });

  it('injects Language Partner role prompt when selected', () => {
    const langPartner = getRoleById('language-partner')!;
    const result = buildSystemPrompt({ activeRole: langPartner });
    expect(result).toContain(basePrompt);
    expect(result).toContain('Language Learning Partner');
    expect(result).toContain('Vocabulary Analysis');
    expect(result).not.toContain('Socratic Tutor');
  });

  it('does not inject role when activeRole is null', () => {
    const result = buildSystemPrompt({ activeRole: null });
    expect(result).toContain(basePrompt);
    expect(result).not.toContain('Socratic');
    expect(result).not.toContain('Language Learning');
  });

  it('includes both role and custom prompt', () => {
    const socratic = getRoleById('socratic')!;
    const result = buildSystemPrompt({
      activeRole: socratic,
      customPrompt: 'Always respond in Chinese',
    });
    expect(result).toContain('Socratic Tutor');
    expect(result).toContain('Custom Instructions');
    expect(result).toContain('Always respond in Chinese');
  });

  it('custom prompt alone works without role', () => {
    const result = buildSystemPrompt({ customPrompt: 'Be concise' });
    expect(result).toContain('Custom Instructions');
    expect(result).toContain('Be concise');
    expect(result).not.toContain('Socratic');
  });

  it('injects private tutor role prompt when selected', () => {
    const tutor = getRoleById('private-tutor')!;
    const result = buildSystemPrompt({ activeRole: tutor });
    expect(result).toContain('私人导师');
    expect(result).toContain('五步循环');
    expect(result).toContain('概念拆解');
    expect(result).toContain('材料中未提及');
  });
});

describe('role presets', () => {
  it('has private-tutor role', () => {
    expect(getRoleById('private-tutor')).toBeDefined();
  });

  it('private tutor has correct Chinese name', () => {
    const tutor = getRoleById('private-tutor')!;
    expect(tutor.name).toBe('私人导师');
    expect(tutor.icon).toBe('🎓');
  });
});

describe('roles', () => {
  it('has at least 2 preset roles', () => {
    expect(ROLE_PRESETS.length).toBeGreaterThanOrEqual(2);
  });

  it('each role has unique id', () => {
    const ids = ROLE_PRESETS.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each role has non-empty prompt', () => {
    for (const role of ROLE_PRESETS) {
      expect(role.prompt.trim().length).toBeGreaterThan(50);
    }
  });

  it('getRoleById returns correct role', () => {
    expect(getRoleById('socratic')?.name).toBe('苏格拉底教学(理工)');
    expect(getRoleById('language-partner')?.name).toBe('语言学习伙伴(文科)');
    expect(getRoleById('nonexistent')).toBeUndefined();
  });
});

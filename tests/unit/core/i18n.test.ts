import { t, setLocale, getLocale } from '../../../src/core/i18n';

describe('i18n', () => {
  beforeEach(() => setLocale('en'));

  it('should default to English', () => {
    expect(getLocale()).toBe('en');
  });

  it('should translate basic UI strings in English', () => {
    expect(t('new')).toBe('+ New');
    expect(t('send')).toBe('Send');
    expect(t('stop')).toBe('Stop');
    expect(t('help')).toBe('❓ Help');
  });

  it('should switch to Chinese', () => {
    setLocale('zh');
    expect(getLocale()).toBe('zh');
    expect(t('new')).toBe('+ 新建');
    expect(t('send')).toBe('发送');
    expect(t('stop')).toBe('停止');
    expect(t('help')).toBe('❓ 帮助');
  });

  it('should switch back to English', () => {
    setLocale('zh');
    expect(t('send')).toBe('发送');
    setLocale('en');
    expect(t('send')).toBe('Send');
  });

  it('should interpolate parameters', () => {
    const result = t('tokens', { in: '100', out: '50', pct: '10' });
    expect(result).toBe('Tokens: 100 in / 50 out (10% context)');
  });

  it('should interpolate parameters in Chinese', () => {
    setLocale('zh');
    const result = t('tokens', { in: '100', out: '50', pct: '10' });
    expect(result).toBe('令牌: 100 输入 / 50 输出 (10% 上下文)');
  });

  it('should fall back to English for unknown locale', () => {
    setLocale('fr');
    expect(getLocale()).toBe('en');
    expect(t('send')).toBe('Send');
  });

  it('should return key if translation not found', () => {
    const result = t('nonexistent.key' as any);
    expect(result).toBe('nonexistent.key');
  });

  it('should translate role names', () => {
    expect(t('role.tutor.name')).toBe('Private Tutor');
    setLocale('zh');
    expect(t('role.tutor.name')).toBe('私人导师');
  });

  it('should translate method names', () => {
    expect(t('method.guide.name')).toBe('Study Guide');
    setLocale('zh');
    expect(t('method.guide.name')).toBe('即时学习指南');
  });

  it('should translate settings labels', () => {
    expect(t('settings.language')).toBe('Language');
    setLocale('zh');
    expect(t('settings.language')).toBe('语言');
  });

  it('should translate help panel content', () => {
    expect(t('help.title')).toBe('AI Study Buddy Quick Start');
    setLocale('zh');
    expect(t('help.title')).toBe('AI Study Buddy 快速上手');
  });

  it('should translate material notices with interpolation', () => {
    const result = t('material.confirmed', { name: 'test.md' });
    expect(result).toContain('test.md');
    expect(result).toContain('Confirmed');

    setLocale('zh');
    const zhResult = t('material.confirmed', { name: 'test.md' });
    expect(zhResult).toContain('test.md');
    expect(zhResult).toContain('确认');
  });

  it('should translate all 8 learning method names in both languages', () => {
    const methodKeys = ['guide', 'confuse', 'gap', 'quiz', 'predict', 'audio', 'feynman', 'mock'];
    for (const key of methodKeys) {
      expect(t(('method.' + key + '.name') as any)).not.toBe('method.' + key + '.name');
      setLocale('zh');
      expect(t(('method.' + key + '.name') as any)).not.toBe('method.' + key + '.name');
      setLocale('en');
    }
  });
});

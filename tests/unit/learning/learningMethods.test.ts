import { MethodRegistry } from '../../../src/core/learning/MethodRegistry';
import { StudyGuideMethod } from '../../../src/core/learning/methods/StudyGuideMethod';
import { ConfusionTerminatorMethod } from '../../../src/core/learning/methods/ConfusionTerminatorMethod';
import { GapFinderMethod } from '../../../src/core/learning/methods/GapFinderMethod';
import { SocraticQuizMethod } from '../../../src/core/learning/methods/SocraticQuizMethod';
import { ExamPredictorMethod } from '../../../src/core/learning/methods/ExamPredictorMethod';
import { AudioPartnerMethod } from '../../../src/core/learning/methods/AudioPartnerMethod';
import { FeynmanTestMethod } from '../../../src/core/learning/methods/FeynmanTestMethod';
import { MockExamMethod } from '../../../src/core/learning/methods/MockExamMethod';

describe('MethodRegistry', () => {
  it('returns all 8 methods', () => {
    const methods = MethodRegistry.getAll();
    expect(methods).toHaveLength(8);
  });

  it('returns methods by id', () => {
    expect(MethodRegistry.getById('study_guide')?.name).toBe('即时学习指南');
    expect(MethodRegistry.getById('socratic_quiz')?.name).toBe('苏格拉底式测验');
    expect(MethodRegistry.getById('nonexistent')).toBeUndefined();
  });

  it('returns methods by command', () => {
    expect(MethodRegistry.getByCommand('/guide')?.name).toBe('即时学习指南');
    expect(MethodRegistry.getByCommand('/quiz')?.name).toBe('苏格拉底式测验');
    expect(MethodRegistry.getByCommand('/unknown')).toBeUndefined();
  });

  it('recognizes method commands', () => {
    expect(MethodRegistry.isMethodCommand('/guide')).toBe(true);
    expect(MethodRegistry.isMethodCommand('/quiz')).toBe(true);
    expect(MethodRegistry.isMethodCommand('/new')).toBe(false);
    expect(MethodRegistry.isMethodCommand('/help')).toBe(false);
  });

  it('command list has 8 entries', () => {
    const list = MethodRegistry.getCommandList();
    expect(list).toHaveLength(8);
    expect(list.some(c => c.command === '/mock' && c.name === '模拟考试')).toBe(true);
  });

  it('all method ids and commands are unique', () => {
    const all = MethodRegistry.getAll();
    const ids = all.map(m => m.id);
    const commands = all.map(m => m.command);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(commands).size).toBe(commands.length);
  });
});

describe('Learning methods buildPrompt', () => {
  const sampleQuery = '量子力学基础';

  it('StudyGuideMethod wraps query', () => {
    const prompt = StudyGuideMethod.buildPrompt(sampleQuery);
    expect(prompt).toContain('资深学科导师');
    expect(prompt).toContain('核心概念');
    expect(prompt).toContain(sampleQuery);
  });

  it('ConfusionTerminatorMethod wraps query', () => {
    const prompt = ConfusionTerminatorMethod.buildPrompt(sampleQuery);
    expect(prompt).toContain('三种解释');
    expect(prompt).toContain('学术定义式');
    expect(prompt).toContain(sampleQuery);
  });

  it('GapFinderMethod wraps query', () => {
    const prompt = GapFinderMethod.buildPrompt(sampleQuery);
    expect(prompt).toContain('知识盲区');
    expect(prompt).toContain('逻辑断层');
    expect(prompt).toContain(sampleQuery);
  });

  it('SocraticQuizMethod wraps query', () => {
    const prompt = SocraticQuizMethod.buildPrompt(sampleQuery);
    expect(prompt).toContain('每次只出一道题');
    expect(prompt).toContain('难度递进');
    expect(prompt).toContain(sampleQuery);
  });

  it('ExamPredictorMethod wraps query', () => {
    const prompt = ExamPredictorMethod.buildPrompt(sampleQuery);
    expect(prompt).toContain('5大核心考点');
    expect(prompt).toContain('概念关联网络');
    expect(prompt).toContain(sampleQuery);
  });

  it('AudioPartnerMethod wraps query', () => {
    const prompt = AudioPartnerMethod.buildPrompt(sampleQuery);
    expect(prompt).toContain('播客双人组');
    expect(prompt).toContain('A：');
    expect(prompt).toContain(sampleQuery);
  });

  it('FeynmanTestMethod wraps query', () => {
    const prompt = FeynmanTestMethod.buildPrompt(sampleQuery);
    expect(prompt).toContain('费曼');
    expect(prompt).toContain('逻辑完整性');
    expect(prompt).toContain(sampleQuery);
  });

  it('MockExamMethod wraps query', () => {
    const prompt = MockExamMethod.buildPrompt(sampleQuery);
    expect(prompt).toContain('选择题（5题）');
    expect(prompt).toContain('简答题（3题）');
    expect(prompt).toContain('论述题（2题）');
    expect(prompt).toContain(sampleQuery);
  });

  it('StudyGuideMethod injects material content when provided', () => {
    const material = '牛顿第一定律：物体保持静止或匀速直线运动。';
    const prompt = StudyGuideMethod.buildPrompt(sampleQuery, material);
    expect(prompt).toContain(material);
    expect(prompt).not.toContain('【学习材料】');
  });

  it('ConfusionTerminatorMethod keeps placeholder when no material', () => {
    const prompt = ConfusionTerminatorMethod.buildPrompt(sampleQuery);
    expect(prompt).toContain('【学习材料】');
  });
});

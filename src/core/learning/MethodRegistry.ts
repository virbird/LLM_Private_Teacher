import type { LearningMethod } from './types';
import { StudyGuideMethod } from './methods/StudyGuideMethod';
import { ConfusionTerminatorMethod } from './methods/ConfusionTerminatorMethod';
import { GapFinderMethod } from './methods/GapFinderMethod';
import { SocraticQuizMethod } from './methods/SocraticQuizMethod';
import { ExamPredictorMethod } from './methods/ExamPredictorMethod';
import { AudioPartnerMethod } from './methods/AudioPartnerMethod';
import { FeynmanTestMethod } from './methods/FeynmanTestMethod';
import { MockExamMethod } from './methods/MockExamMethod';

const METHODS: LearningMethod[] = [
  StudyGuideMethod,
  ConfusionTerminatorMethod,
  GapFinderMethod,
  SocraticQuizMethod,
  ExamPredictorMethod,
  AudioPartnerMethod,
  FeynmanTestMethod,
  MockExamMethod,
];

const METHOD_BY_ID = new Map<string, LearningMethod>(METHODS.map(m => [m.id, m]));
const METHOD_BY_COMMAND = new Map<string, LearningMethod>(METHODS.map(m => [m.command, m]));

export const MethodRegistry = {
  getAll(): LearningMethod[] {
    return [...METHODS];
  },

  getById(id: string): LearningMethod | undefined {
    return METHOD_BY_ID.get(id);
  },

  getByCommand(command: string): LearningMethod | undefined {
    return METHOD_BY_COMMAND.get(command);
  },

  isMethodCommand(command: string): boolean {
    return METHOD_BY_COMMAND.has(command);
  },

  getCommandList(): Array<{ command: string; name: string; description: string }> {
    return METHODS.map(m => ({ command: m.command, name: m.name, description: m.description }));
  },
};

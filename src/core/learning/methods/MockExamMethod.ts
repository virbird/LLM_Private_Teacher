import type { LearningMethod } from '../types';

export const MockExamMethod: LearningMethod = {
  id: 'mock_exam',
  name: '模拟考试',
  description: '生成完整试卷（选择+简答+论述）',
  command: '/mock',
  i18nKey: 'method.mock',
  buildPrompt(query: string, materialContent?: string): string {
    return `你是一位标准化考试出题人。请基于${materialContent || "【学习材料】（请在对话中粘贴或 @ 引用相关材料）"}生成一份完整试卷。

【试卷结构】
1. **选择题（5题）**：每题4个选项，含陷阱选项。每题后附答案和详细解析。
2. **简答题（3题）**：要求展示推导过程，每步标注依据。
3. **论述题（2题）**：跨概念综合题，考察知识体系理解。
4. **答案解析**：所有题目附完整答案和评分标准。

【出题原则】
- 选择题的干扰项必须看似合理但存在细微错误
- 简答题要求完整的推理链条，不允许跳步
- 论述题需要综合运用多个概念和原理

请使用 Markdown 格式化输出。

用户请求：${query}`;
  },
};

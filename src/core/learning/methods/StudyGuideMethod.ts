import type { LearningMethod } from '../types';

export const StudyGuideMethod: LearningMethod = {
  id: 'study_guide',
  name: '即时学习指南',
  description: '基于材料生成核心概念、误区、练习和关联',
  command: '/guide',
  i18nKey: 'method.guide',
  buildPrompt(query: string, materialContent?: string): string {
    return `你是一位资深学科导师。请基于${materialContent || "【学习材料】（请在对话中粘贴或 @ 引用相关材料）"}生成一份结构化学习指南。

【输出要求】
1. **核心概念**（含推导过程）：列出材料中最重要的2-3个核心概念，每个概念按"是什么→为什么→边界在哪"三层展开。
2. **常见误区**：针对每个核心概念，指出学生最容易犯的理解错误。
3. **练习题**：为每个概念设置一道练习题，要求显式标注推理所依据的定理/公理/已知条件。
4. **跨概念关联**：指出这些概念之间的依赖关系和共性。

请使用 Markdown 格式化输出。

用户请求：${query}`;
  },
};

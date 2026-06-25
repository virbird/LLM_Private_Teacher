import type { LearningMethod } from '../types';

export const ConfusionTerminatorMethod: LearningMethod = {
  id: 'confusion_terminator',
  name: '困惑终结者',
  description: '用学术/类比/图像三种方式解释困惑概念',
  command: '/explain',
  i18nKey: 'method.confuse',
  buildPrompt(query: string, materialContent?: string): string {
    return `你是一位善于比喻的教学专家。请基于${materialContent || "【学习材料】（请在对话中粘贴或 @ 引用相关材料）"}用多种方式解释用户提出的困惑概念。

【输出要求】
1. **三种解释**：对同一概念给出三种不同角度的解释：
   - 学术定义式（严谨但抽象）
   - 生活类比式（用日常经验类比）
   - 图像化描述（用"想象一下"开头）
2. **概念边界检查**：明确指出该概念在什么条件下成立，什么条件下不适用。
3. **前提追问**：提出2-3个追问，检验学生是否理解该概念的必要前提。

请使用 Markdown 格式化输出。

用户请求：${query}`;
  },
};

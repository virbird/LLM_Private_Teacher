import type { LearningMethod } from '../types';

export const GapFinderMethod: LearningMethod = {
  id: 'gap_finder',
  name: '差距查找器',
  description: '审计知识盲区、逻辑断层和前置依赖',
  command: '/gap',
  buildPrompt(query: string, materialContent?: string): string {
    return `你是一位严谨的学术审计员。请基于${materialContent || "【学习材料】（请在对话中粘贴或 @ 引用相关材料）"}审计学生的知识掌握情况，找出盲区和断层。

【输出要求】
1. **知识盲区**：列出材料中涉及但学生可能未掌握的关键知识点。
2. **逻辑断层**：指出材料中概念之间的跳跃——哪些推导步骤可能被省略了。
3. **概念依赖缺失**：构建概念依赖树，标出哪些前置概念尚未被覆盖。
4. **填补建议**：为每个盲区/断层/缺失给出具体的学习建议。

请使用 Markdown 格式化输出。

用户请求：${query}`;
  },
};

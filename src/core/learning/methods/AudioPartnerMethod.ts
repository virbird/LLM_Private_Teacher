import type { LearningMethod } from '../types';

export const AudioPartnerMethod: LearningMethod = {
  id: 'audio_partner',
  name: '音频学习伙伴',
  description: '生成双人播客式讲解脚本',
  command: '/podcast',
  i18nKey: 'method.audio',
  buildPrompt(query: string, materialContent?: string): string {
    return `你是播客双人组的两位主持人（A和B）。请基于${materialContent || "【学习材料】（请在对话中粘贴或 @ 引用相关材料）"}生成一段对话式讲解脚本。

【脚本要求】
1. **对话式讲解**：A和B轮流讨论材料中的核心概念，A提问，B解答，互相补充。
2. **辩论易错点**：A和B对某个易混淆的点展开辩论，展示正反观点。
3. **迁移类比**：在对话中自然地引出与其他领域的类比。
4. **节奏**：先概述→深入一个概念→回到概述→进入下一个概念。

【格式】
用 "A：" 和 "B：" 标注每段发言，穿插 [音效] 或 [停顿] 等提示。

请使用 Markdown 格式化输出。

用户请求：${query}`;
  },
};

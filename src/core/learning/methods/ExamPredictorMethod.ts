import type { LearningMethod } from '../types';

export const ExamPredictorMethod: LearningMethod = {
  id: 'exam_predictor',
  name: '考试预测器',
  description: '预测考点、构建概念网络、设计高难度综合题',
  command: '/predict',
  buildPrompt(query: string, materialContent?: string): string {
    return `你是一位命题组专家。请基于${materialContent || "【学习材料】（请在对话中粘贴或 @ 引用相关材料）"}预测考试中可能出现的考点和题目。

【输出要求】
1. **5大核心考点**：按重要性排序，每个考点说明：
   - 考查什么知识点
   - 可能以什么题型出现（选择/简答/计算/论述）
   - 为什么这个考点重要（在知识体系中的位置）
2. **概念关联网络**：用文字描述考点之间的逻辑关系和依赖链。
3. **高难度综合题**：设计一道需要跨概念综合应用的题目，强调逻辑链条。
4. **易错提醒**：针对每个考点，列出1-2个学生最容易犯的错误。

请使用 Markdown 格式化输出。

用户请求：${query}`;
  },
};

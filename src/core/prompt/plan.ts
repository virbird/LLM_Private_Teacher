/** Build a prompt to generate a phased learning plan */
export function buildPlanPrompt(args: string, materialContent?: string): string {
  const materialSection = materialContent
    ? `\n\n【Learning Material】\n${materialContent.slice(0, 3000)}`
    : '';

  return `You are a learning curriculum designer. Create a structured learning plan.

【Request】
${args}${materialSection}

【Requirements】
1. Break the subject into 3-5 phases (weekly or by topic)
2. Each phase has 3-6 concrete milestones
3. Milestones should be actionable and measurable
4. Include review/practice milestones
5. Order from foundational to advanced
6. Estimate time for each phase

【Output Format】
Use Markdown with checkboxes:

# Learning Plan: [Subject]

**Duration**: [estimated total time]
**Prerequisites**: [what the learner should already know]

## Phase 1: [Phase Title]
*Estimated: X hours*

- [ ] Milestone 1: specific task
- [ ] Milestone 2: specific task
- [ ] Review: quiz/practice task

## Phase 2: [Phase Title]
...

## Resources
- Recommended resource 1
- Recommended resource 2

## Tips
- Study tip 1
- Study tip 2

Generate the learning plan now:`;
}

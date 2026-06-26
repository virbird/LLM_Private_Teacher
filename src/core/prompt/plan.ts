/** Build a prompt to generate a phased learning plan.
 *  @param args       The user's subject/topic request.
 *  @param contextSummary  Optional structured summary from the first AI call
 *                         (user gaps, strengths, material key points, suggestions).
 */
export function buildPlanPrompt(args: string, contextSummary?: string): string {
  const contextSection = contextSummary
    ? `\n\n【Context Analysis】\n${contextSummary}`
    : '';

  return `You are a learning curriculum designer. Create a structured, personalized learning plan.

【Request】
${args}${contextSection}

【Requirements】
1. Break the subject into 3-5 phases (weekly or by topic)
2. Each phase has 3-6 concrete milestones
3. Milestones should be actionable and measurable
4. Include review/practice milestones
5. Order from foundational to advanced
6. Estimate time for each phase
7. If a Context Analysis is provided, personalize the plan:
   - Add extra focus on areas identified as user knowledge gaps
   - Skip or briefly review areas the user already shows strength in
   - Incorporate material key points into phase content
   - Follow the planning suggestions where appropriate

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

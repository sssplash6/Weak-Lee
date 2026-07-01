// Pure progress helpers — no server-only imports, safe for client components.

/** A goal's completion percent, derived from its subtasks (0 when none). */
export function goalPercent(subtasks: { isDone: boolean }[]): number {
  if (subtasks.length === 0) return 0;
  const done = subtasks.filter((s) => s.isDone).length;
  return Math.round((done / subtasks.length) * 100);
}

/**
 * Whether a goal counts as done. Completion is an explicit user action
 * (`completedAt` being set) — finishing every subtask does not auto-complete it.
 */
export function isGoalComplete(goal: { completedAt: Date | string | null }): boolean {
  return goal.completedAt != null;
}

/**
 * Overall week percent = share of goals marked complete (0 when no goals).
 * With 2 goals, completing one gives 50%.
 */
export function weekPercent(
  goals: { completedAt: Date | string | null }[],
): number {
  if (goals.length === 0) return 0;
  const done = goals.filter(isGoalComplete).length;
  return Math.round((done / goals.length) * 100);
}

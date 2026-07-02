// Pure progress helpers — no server-only imports, safe for client components.

/** The percent implied by a goal's subtasks alone (0 when none). */
export function subtaskPercent(subtasks: { isDone: boolean }[]): number {
  if (subtasks.length === 0) return 0;
  const done = subtasks.filter((s) => s.isDone).length;
  return Math.round((done / subtasks.length) * 100);
}

/**
 * A goal's displayed completion percent:
 *  - a completed goal is always 100 (even with no subtasks);
 *  - otherwise a manual override (typed by the user) wins when set;
 *  - otherwise it's derived from the subtasks (0 when none).
 */
export function goalPercent(goal: {
  completedAt?: Date | string | null;
  manualPercent?: number | null;
  subtasks: { isDone: boolean }[];
}): number {
  if (goal.completedAt != null) return 100;
  if (goal.manualPercent != null) return clampPercent(goal.manualPercent);
  return subtaskPercent(goal.subtasks);
}

/** Clamp to a whole 0–100. Used on both read and write of manual percents. */
export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
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

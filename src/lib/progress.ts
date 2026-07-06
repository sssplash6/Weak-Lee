// Pure progress helpers — no server-only imports, safe for client components.

/** The percent implied by a goal's subtasks alone (0 when none). */
export function subtaskPercent(subtasks: { isDone: boolean }[]): number {
  if (subtasks.length === 0) return 0;
  const done = subtasks.filter((s) => s.isDone).length;
  return Math.round((done / subtasks.length) * 100);
}

/**
 * A goal's displayed completion percent:
 *  - a manual/completion rate (typed by the user) always wins when set — this
 *    is the rate captured when a goal is marked complete (default 100) and is
 *    editable afterward, so "done at 70%" is a real state;
 *  - otherwise a completed goal with no explicit rate reads 100 (legacy);
 *  - otherwise it's derived from the subtasks (0 when none).
 */
export function goalPercent(goal: {
  completedAt?: Date | string | null;
  manualPercent?: number | null;
  subtasks: { isDone: boolean }[];
}): number {
  if (goal.manualPercent != null) return clampPercent(goal.manualPercent);
  if (goal.completedAt != null) return 100;
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
export function isGoalComplete(goal: {
  completedAt?: Date | string | null;
}): boolean {
  return goal.completedAt != null;
}

/**
 * Whether a goal must carry a reflection reason when its period closes. Any goal
 * that isn't fully done needs one — that includes goals left incomplete AND
 * goals marked complete at a partial rate (e.g. "done at 70%"). Only a goal that
 * is both marked complete and at 100% is exempt.
 */
export function needsCompletionReason(goal: {
  completedAt?: Date | string | null;
  manualPercent?: number | null;
  subtasks: { isDone: boolean }[];
}): boolean {
  return !isGoalComplete(goal) || goalPercent(goal) < 100;
}

/**
 * Overall week percent = the average of each goal's own completion percent (0
 * when no goals). This honors partial completion rates: a goal marked done at
 * 70% contributes 70, not a full 100. With 2 goals at 100% and 70%, the week
 * reads 85%. (Previously this was the binary share of goals marked complete.)
 */
export function weekPercent(
  goals: {
    completedAt?: Date | string | null;
    manualPercent?: number | null;
    subtasks: { isDone: boolean }[];
  }[],
): number {
  if (goals.length === 0) return 0;
  const sum = goals.reduce((acc, g) => acc + goalPercent(g), 0);
  return Math.round(sum / goals.length);
}

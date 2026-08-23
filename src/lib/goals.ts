// Length limits for the free-text a user types into goals. Nothing here is a
// product rule — these are the ceilings that stop a scripted client from
// posting megabyte titles. They sit well above anything a person would type,
// so hitting one means something is wrong rather than someone being verbose.
//
// The daily-report and day-task equivalents live beside their own domains
// (lib/dailyReportTypes.ts, lib/dayTasks.ts).

/** A goal or subtask title. Matches MAX_DAY_TASK_TITLE — same kind of field. */
export const MAX_GOAL_TITLE = 300;

/** Why a goal closed the period below 100%. A sentence or two, not an essay. */
export const MAX_COMPLETION_REASON = 1000;

/**
 * Trim and length-check one piece of user text. Throws rather than truncating:
 * silently storing a shortened version of what someone wrote is worse than
 * telling them it didn't fit.
 */
export function requireText(value: string, max: number, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new Error(`${label} is too long — keep it under ${max} characters.`);
  }
  return trimmed;
}

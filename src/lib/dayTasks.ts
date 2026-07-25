// Shared shape and limits for day tasks — the calendar's per-day focus list.
// Lives here rather than in the dashboard actions because a "use server" file
// may only export async functions, so a plain constant can't sit beside them.
//
// A day task is NOT a goal: it belongs to no week or month, has no priority
// flag or subtasks, and never counts toward a completion percent. Its order is
// its priority — #1 is the day's main focus.

/** How many focus tasks one day can hold. A focus list stops being one past this. */
export const MAX_DAY_TASKS = 10;

/** The longest a day task's title may be; longer input is truncated server-side. */
export const MAX_DAY_TASK_TITLE = 300;

/** One day-task as the calendar modal renders it. */
export type DayTaskView = {
  id: string;
  title: string;
  isDone: boolean;
};

/** Per-day markers the calendar draws: how many tasks a day holds, and how many are open. */
export type DayTaskCount = {
  total: number;
  open: number;
};

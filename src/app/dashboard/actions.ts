"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentWeek, nextWeekBounds } from "@/lib/weeks";
import { getOrCreateCurrentMonth, nextMonthBounds } from "@/lib/months";
import { submissionTiming } from "@/lib/lateness";
import { clampPercent, needsCompletionReason } from "@/lib/progress";
import { isPriority, type Priority } from "@/lib/priority";
import {
  LATE_SUBMISSION_PENALTY,
  MISSED_SUBMISSION_PENALTY,
} from "@/lib/penalties";
import { AVATAR_EMOJIS } from "@/lib/avatar";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }
  return session.user.id;
}

// A goal belongs to either a week or a month; both count as the user's.
function goalOwnedWhere(userId: string) {
  return { OR: [{ week: { userId } }, { month: { userId } }] };
}

/** Confirm a goal belongs to the signed-in user; returns it or throws. */
async function assertGoalOwned(goalId: string, userId: string) {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, ...goalOwnedWhere(userId) },
  });
  if (!goal) throw new Error("Goal not found");
  return goal;
}

/**
 * Like `assertGoalOwned`, but also rejects edits while the goal's week or month
 * is submitted. Used for actions that change a goal's *definition* (title,
 * priority, deadline, subtasks) — progress actions (toggling, completing) stay
 * allowed when locked.
 */
async function assertGoalEditable(goalId: string, userId: string) {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, ...goalOwnedWhere(userId) },
    include: {
      week: { select: { goalsLocked: true } },
      month: { select: { goalsLocked: true } },
    },
  });
  if (!goal) throw new Error("Goal not found");
  if (goal.week?.goalsLocked || goal.month?.goalsLocked) {
    throw new Error("Goals are locked. Click Edit to make changes.");
  }
  return goal;
}

/** Confirm a subtask belongs to the signed-in user; returns it or throws. */
async function assertSubtaskOwned(subtaskId: string, userId: string) {
  const subtask = await prisma.subtask.findFirst({
    where: { id: subtaskId, goal: goalOwnedWhere(userId) },
  });
  if (!subtask) throw new Error("Subtask not found");
  return subtask;
}

/** Like `assertSubtaskOwned`, but rejects edits while the period is submitted. */
async function assertSubtaskEditable(subtaskId: string, userId: string) {
  const subtask = await prisma.subtask.findFirst({
    where: { id: subtaskId, goal: goalOwnedWhere(userId) },
    include: {
      goal: {
        select: {
          week: { select: { goalsLocked: true } },
          month: { select: { goalsLocked: true } },
        },
      },
    },
  });
  if (!subtask) throw new Error("Subtask not found");
  if (subtask.goal.week?.goalsLocked || subtask.goal.month?.goalsLocked) {
    throw new Error("Goals are locked. Click Edit to make changes.");
  }
  return subtask;
}

/**
 * Parse a required "YYYY-MM-DDTHH:MM" wall-clock deadline stamp into a Date,
 * stored verbatim as UTC so it reads back exactly as typed. Throws if missing
 * or malformed — deadlines are required when setting a goal.
 */
function parseRequiredDeadline(stamp: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stamp)) {
    throw new Error("A deadline is required.");
  }
  const deadline = new Date(`${stamp}:00.000Z`);
  if (Number.isNaN(deadline.getTime())) throw new Error("Invalid deadline");
  return deadline;
}

/** Which period a goal-list action targets: the current week or current month. */
export type GoalScope = "week" | "month";

/**
 * Add a goal to the current week or month. Priority and deadline are required
 * parts of setting a goal (enforced here as well as in the UI).
 */
export async function addGoal(input: {
  title: string;
  priority: Priority;
  deadline: string;
  scope?: GoalScope;
}) {
  const userId = await requireUserId();
  const title = input.title.trim();
  if (!title) throw new Error("A goal needs a title.");
  if (!isPriority(input.priority)) throw new Error("A priority is required.");
  const deadline = parseRequiredDeadline(input.deadline);

  const period =
    input.scope === "month"
      ? await getOrCreateCurrentMonth(userId)
      : await getOrCreateCurrentWeek(userId);
  if (period.goalsLocked) {
    throw new Error("Goals are locked. Click Edit to make changes.");
  }
  const position = period.goals.length + 1;
  await prisma.goal.create({
    data: {
      ...(input.scope === "month" ? { monthId: period.id } : { weekId: period.id }),
      title,
      position,
      priority: input.priority,
      deadline,
    },
  });
  revalidatePath("/dashboard");
}

/**
 * Confirm ("submit") the current week's goals — locks them for editing. The
 * submission time is fixed to the *first* submit on this week: it's recorded
 * only when not already set, so re-submitting after an edit keeps the original.
 */
export async function submitWeek() {
  const userId = await requireUserId();
  const week = await getOrCreateCurrentWeek(userId);
  if (week.goals.length === 0) {
    throw new Error("Add at least one goal before submitting.");
  }
  await prisma.week.update({
    where: { id: week.id },
    data: {
      goalsLocked: true,
      // Only stamp the first time — never overwrite an existing submission time.
      ...(week.submittedAt ? {} : { submittedAt: new Date() }),
    },
  });
  revalidatePath("/dashboard");
}

/** Re-open the current week's goals for editing. Keeps the first-submit time. */
export async function reopenWeek() {
  const userId = await requireUserId();
  const week = await getOrCreateCurrentWeek(userId);
  await prisma.week.update({
    where: { id: week.id },
    data: { goalsLocked: false },
  });
  revalidatePath("/dashboard");
}

/**
 * Confirm ("submit") the current month's goals — locks them for editing. There
 * is no deadline for this (unlike weeks, no lateness or penalty); the recorded
 * time is fixed to the first submit, same as weeks.
 */
export async function submitMonth() {
  const userId = await requireUserId();
  const month = await getOrCreateCurrentMonth(userId);
  if (month.goals.length === 0) {
    throw new Error("Add at least one goal before submitting.");
  }
  await prisma.month.update({
    where: { id: month.id },
    data: {
      goalsLocked: true,
      ...(month.submittedAt ? {} : { submittedAt: new Date() }),
    },
  });
  revalidatePath("/dashboard");
}

/** Re-open the current month's goals for editing. Keeps the first-submit time. */
export async function reopenMonth() {
  const userId = await requireUserId();
  const month = await getOrCreateCurrentMonth(userId);
  await prisma.month.update({
    where: { id: month.id },
    data: { goalsLocked: false },
  });
  revalidatePath("/dashboard");
}

export async function renameGoal(goalId: string, title: string) {
  const userId = await requireUserId();
  const trimmed = title.trim();
  if (!trimmed) return;
  await assertGoalEditable(goalId, userId);
  await prisma.goal.update({ where: { id: goalId }, data: { title: trimmed } });
  revalidatePath("/dashboard");
}

/**
 * Mark a goal complete (or reopen it). Completion is always a deliberate act —
 * finishing every subtask does not complete the goal on its own.
 */
export async function setGoalCompleted(
  goalId: string,
  completed: boolean,
  // The completion rate captured when marking done (0–100, defaults to 100).
  // Stored as the goal's manualPercent so a goal can be "done at 70%" and stay
  // editable. Ignored when un-completing (the existing percent is kept).
  rate?: number,
) {
  const userId = await requireUserId();
  await assertGoalOwned(goalId, userId);
  await prisma.goal.update({
    where: { id: goalId },
    data: completed
      ? {
          completedAt: new Date(),
          manualPercent: clampPercent(rate ?? 100),
        }
      : { completedAt: null },
  });
  revalidatePath("/dashboard");
}

/**
 * Mark one of the signed-in user's admin-assigned tasks done / not done. Only
 * the assignee can toggle their own task.
 */
export async function setAssignedTaskDone(taskId: string, done: boolean) {
  const userId = await requireUserId();
  const task = await prisma.assignedTask.findUnique({
    where: { id: taskId },
    select: { userId: true },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found");
  }
  await prisma.assignedTask.update({
    where: { id: taskId },
    data: { completedAt: done ? new Date() : null },
  });
  revalidatePath("/dashboard");
  revalidatePath("/admin");
}

/**
 * Set a goal's progress percent by hand (or clear the override with null so the
 * subtask-derived value takes back over). Progress, not definition — allowed
 * while the week is locked, like toggling subtasks.
 */
export async function setGoalPercent(goalId: string, percent: number | null) {
  const userId = await requireUserId();
  await assertGoalOwned(goalId, userId);
  const manualPercent =
    percent == null || Number.isNaN(percent) ? null : clampPercent(percent);
  await prisma.goal.update({ where: { id: goalId }, data: { manualPercent } });
  revalidatePath("/dashboard");
}

/**
 * Set or clear a goal's deadline. Accepts a "YYYY-MM-DDTHH:MM" wall-clock stamp
 * (stored verbatim as UTC so the time shows back exactly as typed) or null.
 */
export async function setGoalDeadline(goalId: string, stamp: string | null) {
  const userId = await requireUserId();
  await assertGoalEditable(goalId, userId);

  let deadline: Date | null = null;
  if (stamp) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stamp)) {
      throw new Error("Invalid deadline");
    }
    deadline = new Date(`${stamp}:00.000Z`);
    if (Number.isNaN(deadline.getTime())) throw new Error("Invalid deadline");
  }

  await prisma.goal.update({ where: { id: goalId }, data: { deadline } });
  revalidatePath("/dashboard");
}

/** Set or clear a goal's priority flag. */
export async function setGoalPriority(goalId: string, priority: Priority | null) {
  const userId = await requireUserId();
  if (priority !== null && !isPriority(priority)) {
    throw new Error("Invalid priority");
  }
  await assertGoalEditable(goalId, userId);
  await prisma.goal.update({ where: { id: goalId }, data: { priority } });
  revalidatePath("/dashboard");
}

/**
 * Record a piece of product feedback (destined for tech@freshman.academy).
 * Stored in the database — there's no mail provider — with the submitter's
 * email captured so it can be followed up. Returns false on an empty message.
 */
export async function submitFeedback(message: string): Promise<boolean> {
  const session = await auth();
  const trimmed = message.trim();
  if (!trimmed) return false;

  await prisma.feedback.create({
    data: {
      message: trimmed.slice(0, 5000),
      userId: session?.user?.id ?? null,
      userEmail: session?.user?.email ?? null,
    },
  });
  return true;
}

export type SetAvatarResult =
  | { ok: true; emoji: string }
  | { ok: false; error: "taken" | "invalid" };

/**
 * Set the signed-in user's avatar to `emoji`. Each animal is unique across
 * users (DB constraint), so if someone else just took it we report "taken".
 */
export async function setAvatar(emoji: string): Promise<SetAvatarResult> {
  const userId = await requireUserId();
  if (!AVATAR_EMOJIS.includes(emoji)) return { ok: false, error: "invalid" };

  try {
    await prisma.user.update({ where: { id: userId }, data: { avatar: emoji } });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { ok: false, error: "taken" };
    }
    throw e;
  }
  revalidatePath("/dashboard");
  return { ok: true, emoji };
}

export async function deleteGoal(goalId: string) {
  const userId = await requireUserId();
  const goal = await assertGoalEditable(goalId, userId);
  await prisma.goal.delete({ where: { id: goalId } });

  // A period with no goals can never be in a submitted state. If this was the
  // last goal, reset its week/month to a clean draft so it isn't a stale
  // "submitted" empty period (it can only become locked again by submitting
  // with at least one goal).
  if (goal.weekId) {
    const remaining = await prisma.goal.count({ where: { weekId: goal.weekId } });
    if (remaining === 0) {
      await prisma.week.update({
        where: { id: goal.weekId },
        data: { submittedAt: null, goalsLocked: false },
      });
    }
  } else if (goal.monthId) {
    const remaining = await prisma.goal.count({ where: { monthId: goal.monthId } });
    if (remaining === 0) {
      await prisma.month.update({
        where: { id: goal.monthId },
        data: { submittedAt: null, goalsLocked: false },
      });
    }
  }
  revalidatePath("/dashboard");
}

export async function addSubtask(goalId: string, title: string) {
  const userId = await requireUserId();
  const trimmed = title.trim();
  if (!trimmed) return;
  await assertGoalEditable(goalId, userId);

  const count = await prisma.subtask.count({ where: { goalId } });
  await prisma.subtask.create({
    data: { goalId, title: trimmed, position: count + 1 },
  });
  revalidatePath("/dashboard");
}

/** Rename a subtask in place (so users can edit instead of delete-and-retype). */
export async function renameSubtask(subtaskId: string, title: string) {
  const userId = await requireUserId();
  const trimmed = title.trim();
  if (!trimmed) return;
  await assertSubtaskEditable(subtaskId, userId);
  await prisma.subtask.update({
    where: { id: subtaskId },
    data: { title: trimmed },
  });
  revalidatePath("/dashboard");
}

export async function toggleSubtask(subtaskId: string, isDone: boolean) {
  const userId = await requireUserId();
  const subtask = await assertSubtaskOwned(subtaskId, userId);
  await prisma.subtask.update({ where: { id: subtaskId }, data: { isDone } });
  // Toggling a subtask hands progress back to the derived value — a stale
  // manual percent that ignores the change would read as broken.
  await prisma.goal.update({
    where: { id: subtask.goalId },
    data: { manualPercent: null },
  });
  revalidatePath("/dashboard");
}

export async function deleteSubtask(subtaskId: string) {
  const userId = await requireUserId();
  await assertSubtaskEditable(subtaskId, userId);
  await prisma.subtask.delete({ where: { id: subtaskId } });
  revalidatePath("/dashboard");
}

/**
 * Delegate a subtask to another user. The original stays on the sender's list
 * (marked "shared to X"); the recipient gets a linked copy added under the same
 * goal, in the matching period — a weekly subtask lands in the recipient's
 * current week, a monthly one in their current month (creating the goal there
 * if they don't have it yet).
 */
export async function shareSubtask(subtaskId: string, toUserId: string) {
  const fromUserId = await requireUserId();
  if (toUserId === fromUserId) return;

  // Load the original subtask (owned by sender) along with its goal title.
  const original = await prisma.subtask.findFirst({
    where: { id: subtaskId, goal: goalOwnedWhere(fromUserId) },
    include: { goal: true },
  });
  if (!original) throw new Error("Subtask not found");

  const recipient = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!recipient) throw new Error("Recipient not found");

  // Don't share the same subtask to the same person twice.
  const already = await prisma.subtaskShare.findUnique({
    where: {
      originalSubtaskId_toUserId: { originalSubtaskId: subtaskId, toUserId },
    },
  });
  if (already) return;

  const isMonthly = original.goal.monthId != null;
  const recipientPeriod = isMonthly
    ? await getOrCreateCurrentMonth(toUserId)
    : await getOrCreateCurrentWeek(toUserId);

  // Find a goal with the same title in the recipient's period, or create one.
  const existingGoal = recipientPeriod.goals.find(
    (g) => g.title === original.goal.title,
  );
  const targetGoalId =
    existingGoal?.id ??
    (
      await prisma.goal.create({
        data: {
          ...(isMonthly
            ? { monthId: recipientPeriod.id }
            : { weekId: recipientPeriod.id }),
          title: original.goal.title,
          position: recipientPeriod.goals.length + 1,
        },
      })
    ).id;

  const subtaskCount = await prisma.subtask.count({
    where: { goalId: targetGoalId },
  });

  // Create the recipient's copy and record the share.
  await prisma.subtask.create({
    data: {
      goalId: targetGoalId,
      title: original.title,
      position: subtaskCount + 1,
      shareIn: {
        create: {
          originalSubtaskId: subtaskId,
          fromUserId,
          toUserId,
        },
      },
    },
  });

  revalidatePath("/dashboard");
}

/**
 * Archive the current week and start a fresh, empty one. Every goal that wasn't
 * marked complete must have a reflection reason — enforced here, not just in the UI.
 */
export async function startNewWeek(
  reasons: { goalId: string; reason: string }[] = [],
  range?: { start: string; end: string },
  firstGoal?: { title: string; priority: Priority; deadline: string },
) {
  const userId = await requireUserId();
  const week = await getOrCreateCurrentWeek(userId);

  // A first goal is optional — a week can be opened empty. If one *was* given,
  // it needs a priority and deadline like any other goal.
  const firstGoalTitle = (firstGoal?.title ?? "").trim();
  const hasFirstGoal = firstGoalTitle.length > 0;
  let firstGoalDeadline: Date | null = null;
  if (hasFirstGoal) {
    if (!firstGoal || !isPriority(firstGoal.priority)) {
      throw new Error("A priority is required for the first goal.");
    }
    firstGoalDeadline = parseRequiredDeadline(firstGoal.deadline);
  }

  const reasonByGoal = new Map(
    reasons.map((r) => [r.goalId, r.reason.trim()]),
  );

  // Goals below 100% require a reason before the week can close — including ones
  // marked complete at a partial rate, not just unfinished ones.
  const incomplete = week.goals.filter((g) => needsCompletionReason(g));
  for (const goal of incomplete) {
    if (!reasonByGoal.get(goal.id)) {
      throw new Error("A reason is required for every goal below 100%.");
    }
  }

  // The new week's date range: either an explicit one chosen in the UI, or, by
  // default, the week immediately following the one being closed (so ranges stay
  // sequential and never collide, even when several weeks close in one calendar week).
  let start: Date;
  let end: Date;
  if (range) {
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (!ymd.test(range.start) || !ymd.test(range.end)) {
      throw new Error("Invalid week dates");
    }
    const [sy, sm, sd] = range.start.split("-").map(Number);
    const [ey, em, ed] = range.end.split("-").map(Number);
    start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    end = new Date(ey, em - 1, ed, 23, 59, 59, 999);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new Error("Invalid week dates");
    }
  } else {
    ({ start, end } = nextWeekBounds(week.endDate));
  }

  // How late this submission is against the new week's deadlines. "late" =
  // after Sunday 12:00; "missed" = after the Monday 11:00 meeting (flagged not
  // submitted there). Both count as a late submission for the flag/fine.
  const timing = submissionTiming(new Date(), start);
  const submittedLate = timing !== "on-time";

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      incomplete.map((goal) =>
        tx.goal.update({
          where: { id: goal.id },
          data: { incompleteReason: reasonByGoal.get(goal.id) },
        }),
      ),
    );
    await tx.week.updateMany({
      where: { userId, isCurrent: true },
      data: { isCurrent: false },
    });
    const newWeek = await tx.week.create({
      // Reporting *is* submitting when a first goal was set: the week opens
      // already submitted (locked + timestamped), reopenable via "Edit goals".
      // An empty week opens as a draft to fill in and submit later.
      data: {
        userId,
        startDate: start,
        endDate: end,
        isCurrent: true,
        submittedLate,
        ...(hasFirstGoal ? { goalsLocked: true, submittedAt: new Date() } : {}),
      },
    });
    // Seed the new week with its first goal, if one was given.
    if (hasFirstGoal) {
      await tx.goal.create({
        data: {
          weekId: newWeek.id,
          title: firstGoalTitle,
          position: 1,
          priority: firstGoal!.priority,
          deadline: firstGoalDeadline,
        },
      });
    }
    // A late submission is fined automatically and recorded in the penalty
    // ledger alongside meeting fines. Submitting after the Monday 11:00 meeting
    // (when they were flagged not submitted) costs more than merely missing the
    // Sunday deadline.
    if (submittedLate) {
      const missed = timing === "missed";
      await tx.penalty.create({
        data: {
          userId,
          type: "LATE_SUBMISSION",
          amount: missed ? MISSED_SUBMISSION_PENALTY : LATE_SUBMISSION_PENALTY,
          note: missed
            ? "Goals submitted after the Monday 11:00 meeting — flagged not submitted"
            : "Goals submitted after the Sunday 12:00 deadline",
          weekId: newWeek.id,
        },
      });
    }
  });
  revalidatePath("/dashboard");
}

/**
 * Close the current month and start the next calendar month. Same reflection
 * rule as weeks — every goal not marked complete needs a reason — but months
 * have no submission deadline, so nothing here is ever late or fined. The new
 * month is always the calendar month after the one being closed.
 */
export async function startNewMonth(
  reasons: { goalId: string; reason: string }[] = [],
  firstGoal?: { title: string; priority: Priority; deadline: string },
) {
  const userId = await requireUserId();
  const month = await getOrCreateCurrentMonth(userId);

  // The new month must be opened with at least one goal — with the same
  // required priority and deadline as any other goal.
  const firstGoalTitle = (firstGoal?.title ?? "").trim();
  if (!firstGoalTitle) {
    throw new Error("Add at least one goal for the new month.");
  }
  if (!firstGoal || !isPriority(firstGoal.priority)) {
    throw new Error("A priority is required for the first goal.");
  }
  const firstGoalDeadline = parseRequiredDeadline(firstGoal.deadline);

  const reasonByGoal = new Map(reasons.map((r) => [r.goalId, r.reason.trim()]));

  // Goals below 100% require a reason before the month closes — including ones
  // marked complete at a partial rate, not just unfinished ones.
  const incomplete = month.goals.filter((g) => needsCompletionReason(g));
  for (const goal of incomplete) {
    if (!reasonByGoal.get(goal.id)) {
      throw new Error("A reason is required for every goal below 100%.");
    }
  }

  const { start, end } = nextMonthBounds(month.endDate);

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      incomplete.map((goal) =>
        tx.goal.update({
          where: { id: goal.id },
          data: { incompleteReason: reasonByGoal.get(goal.id) },
        }),
      ),
    );
    await tx.month.updateMany({
      where: { userId, isCurrent: true },
      data: { isCurrent: false },
    });
    const newMonth = await tx.month.create({
      // Reporting is submitting here too — the new month opens already submitted
      // (locked + timestamped), reopenable via "Edit goals". Mirrors weeks.
      data: {
        userId,
        startDate: start,
        endDate: end,
        isCurrent: true,
        goalsLocked: true,
        submittedAt: new Date(),
      },
    });
    // Seed the new month with its required first goal (priority + deadline set).
    await tx.goal.create({
      data: {
        monthId: newMonth.id,
        title: firstGoalTitle,
        position: 1,
        priority: firstGoal.priority,
        deadline: firstGoalDeadline,
      },
    });
  });
  revalidatePath("/dashboard");
}

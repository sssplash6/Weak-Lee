"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentWeek, nextWeekBounds } from "@/lib/weeks";
import { isGoalComplete } from "@/lib/progress";
import { isPriority, type Priority } from "@/lib/priority";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }
  return session.user.id;
}

/** Confirm a goal belongs to the signed-in user; returns it or throws. */
async function assertGoalOwned(goalId: string, userId: string) {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, week: { userId } },
  });
  if (!goal) throw new Error("Goal not found");
  return goal;
}

/** Confirm a subtask belongs to the signed-in user; returns it or throws. */
async function assertSubtaskOwned(subtaskId: string, userId: string) {
  const subtask = await prisma.subtask.findFirst({
    where: { id: subtaskId, goal: { week: { userId } } },
  });
  if (!subtask) throw new Error("Subtask not found");
  return subtask;
}

export async function addGoal(formData: FormData) {
  const userId = await requireUserId();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const week = await getOrCreateCurrentWeek(userId);
  const position = week.goals.length + 1;
  await prisma.goal.create({
    data: { weekId: week.id, title, position },
  });
  revalidatePath("/dashboard");
}

export async function renameGoal(goalId: string, title: string) {
  const userId = await requireUserId();
  const trimmed = title.trim();
  if (!trimmed) return;
  await assertGoalOwned(goalId, userId);
  await prisma.goal.update({ where: { id: goalId }, data: { title: trimmed } });
  revalidatePath("/dashboard");
}

/**
 * Mark a goal complete (or reopen it). Completion is always a deliberate act —
 * finishing every subtask does not complete the goal on its own.
 */
export async function setGoalCompleted(goalId: string, completed: boolean) {
  const userId = await requireUserId();
  await assertGoalOwned(goalId, userId);
  await prisma.goal.update({
    where: { id: goalId },
    data: { completedAt: completed ? new Date() : null },
  });
  revalidatePath("/dashboard");
}

/**
 * Set or clear a goal's deadline. Accepts a "YYYY-MM-DDTHH:MM" wall-clock stamp
 * (stored verbatim as UTC so the time shows back exactly as typed) or null.
 */
export async function setGoalDeadline(goalId: string, stamp: string | null) {
  const userId = await requireUserId();
  await assertGoalOwned(goalId, userId);

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
  await assertGoalOwned(goalId, userId);
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

export async function deleteGoal(goalId: string) {
  const userId = await requireUserId();
  await assertGoalOwned(goalId, userId);
  await prisma.goal.delete({ where: { id: goalId } });
  revalidatePath("/dashboard");
}

export async function addSubtask(goalId: string, title: string) {
  const userId = await requireUserId();
  const trimmed = title.trim();
  if (!trimmed) return;
  await assertGoalOwned(goalId, userId);

  const count = await prisma.subtask.count({ where: { goalId } });
  await prisma.subtask.create({
    data: { goalId, title: trimmed, position: count + 1 },
  });
  revalidatePath("/dashboard");
}

export async function toggleSubtask(subtaskId: string, isDone: boolean) {
  const userId = await requireUserId();
  await assertSubtaskOwned(subtaskId, userId);
  await prisma.subtask.update({ where: { id: subtaskId }, data: { isDone } });
  revalidatePath("/dashboard");
}

export async function deleteSubtask(subtaskId: string) {
  const userId = await requireUserId();
  await assertSubtaskOwned(subtaskId, userId);
  await prisma.subtask.delete({ where: { id: subtaskId } });
  revalidatePath("/dashboard");
}

/**
 * Delegate a subtask to another user. The original stays on the sender's list
 * (marked "shared to X"); the recipient gets a linked copy added under the same
 * goal (creating that goal in their current week if they don't have it yet).
 */
export async function shareSubtask(subtaskId: string, toUserId: string) {
  const fromUserId = await requireUserId();
  if (toUserId === fromUserId) return;

  // Load the original subtask (owned by sender) along with its goal title.
  const original = await prisma.subtask.findFirst({
    where: { id: subtaskId, goal: { week: { userId: fromUserId } } },
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

  const recipientWeek = await getOrCreateCurrentWeek(toUserId);

  // Find a goal with the same title in the recipient's week, or create one.
  const existingGoal = recipientWeek.goals.find(
    (g) => g.title === original.goal.title,
  );
  const targetGoalId =
    existingGoal?.id ??
    (
      await prisma.goal.create({
        data: {
          weekId: recipientWeek.id,
          title: original.goal.title,
          position: recipientWeek.goals.length + 1,
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
) {
  const userId = await requireUserId();
  const week = await getOrCreateCurrentWeek(userId);

  const reasonByGoal = new Map(
    reasons.map((r) => [r.goalId, r.reason.trim()]),
  );

  // Goals that weren't marked complete require a reason before the week can close.
  const incomplete = week.goals.filter((g) => !isGoalComplete(g));
  for (const goal of incomplete) {
    if (!reasonByGoal.get(goal.id)) {
      throw new Error("A reason is required for every unfinished goal.");
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

  await prisma.$transaction([
    ...incomplete.map((goal) =>
      prisma.goal.update({
        where: { id: goal.id },
        data: { incompleteReason: reasonByGoal.get(goal.id) },
      }),
    ),
    prisma.week.updateMany({
      where: { userId, isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.week.create({
      data: { userId, startDate: start, endDate: end, isCurrent: true },
    }),
  ]);
  revalidatePath("/dashboard");
}

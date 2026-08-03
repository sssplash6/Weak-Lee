"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { getWeekBounds } from "@/lib/weeks";
import { goalPercent } from "@/lib/progress";
import { currentMeetingSlot } from "@/lib/meetings";
import {
  formatMoney,
  MAX_PENALTY,
  MEETING_LATE_PENALTY,
  meetingPenaltyAmount,
  type AttendanceStatus,
} from "@/lib/penalties";
import { formatYmd, toYmd } from "@/lib/dates";
import { notify } from "@/lib/notifications";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Permanently delete a user and everything cascaded from them (weeks, goals,
 * subtasks, shares, sessions). Admin-only; you can't delete your own account.
 */
export async function deleteUser(userId: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  if (session!.user.id === userId) {
    throw new Error("You can't delete your own account.");
  }
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin");
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Whether a week was submitted days before it supposedly began — proof it was
 * never that week at all. It's the launch offset: first weeks were seeded one
 * week ahead (LAUNCH_START_NEXT_WEEK), and every close since chained off those
 * wrong dates, so the person's whole run of weeks is labelled a week late.
 * The two days of slack keep the legitimate Sunday-before submission — always
 * within a day of the Monday start — from reading as misdated.
 */
function wasMislabelled(week: {
  startDate: Date;
  submittedAt: Date | null;
}): boolean {
  return (
    week.submittedAt != null &&
    week.submittedAt.getTime() < week.startDate.getTime() - 2 * 24 * 3_600_000
  );
}

/**
 * Put a user who's running ahead of the team's cycle back on the current
 * calendar week. Three shapes, none of which lose work:
 *
 *  - Nothing occupies the current week: re-date their week onto it. Goals and
 *    subtasks ride along, since they belong to the same week row.
 *  - The current week is taken by a week that was submitted before it began —
 *    the launch offset. Their whole chain of weeks is a week late, so slide the
 *    run back: the live week takes the current slot and each week it displaces
 *    moves back one, until a slot is free. Only date labels change.
 *  - The current week is taken by a correctly-dated week they closed early:
 *    re-dating would leave two weeks with identical dates and the review picking
 *    the wrong one, so undo the close instead — reopen that week and fold the
 *    ahead week into it.
 *
 * Goal deadlines are never rewritten: they're the user's own calendar dates, and
 * guessing at them is the one thing here that couldn't be undone.
 *
 * Admin-only.
 */
export async function moveUserWeekToCurrent(userId: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  const weeks = await prisma.week.findMany({
    where: { userId },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      startDate: true,
      isCurrent: true,
      submittedAt: true,
      goals: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          completedAt: true,
          manualPercent: true,
          subtasks: { select: { isDone: true } },
        },
      },
    },
  });
  const live = weeks.find((w) => w.isCurrent);
  if (!live) throw new Error("That user has no current week.");

  const { start, end } = getWeekBounds(new Date());
  if (toYmd(live.startDate) === toYmd(start)) return; // already on this week

  const closed = weeks.find(
    (w) => !w.isCurrent && toYmd(w.startDate) === toYmd(start),
  );
  if (!closed) {
    await prisma.week.update({
      where: { id: live.id },
      data: { startDate: start, endDate: end },
    });
  } else if (wasMislabelled(closed)) {
    // Slide the whole chain back a week. Each pass parks a week on the slot it
    // should hold, then picks up whoever was sitting there to place one week
    // earlier; it ends at the oldest week, whose own slot is free. Every week is
    // touched at most once, so this always terminates.
    const moves: { id: string; start: Date; end: Date }[] = [];
    const moved = new Set<string>();
    let mover: (typeof weeks)[number] | undefined = live;
    let slot = { start, end };
    while (mover) {
      moved.add(mover.id);
      moves.push({ id: mover.id, start: slot.start, end: slot.end });
      const displaced: (typeof weeks)[number] | undefined = weeks.find(
        (w) => !moved.has(w.id) && toYmd(w.startDate) === toYmd(slot.start),
      );
      if (!displaced) break;
      mover = displaced;
      slot = {
        start: new Date(slot.start.getTime() - WEEK_MS),
        end: new Date(slot.end.getTime() - WEEK_MS),
      };
    }
    await prisma.$transaction(
      moves.map((m) =>
        prisma.week.update({
          where: { id: m.id },
          data: { startDate: m.start, endDate: m.end },
        }),
      ),
    );
  } else {
    // Goals carried into the ahead week are copies of ones still sitting on the
    // week being reopened. Move over only what's new or further along, so real
    // work survives and the carried copies don't come back doubled; the rest go
    // with the ahead week (goals and subtasks cascade).
    const percentByTitle = new Map(
      closed.goals.map((g) => [g.title, goalPercent(g)]),
    );
    const moving = live.goals.filter((g) => {
      const existing = percentByTitle.get(g.title);
      return existing === undefined || goalPercent(g) > existing;
    });
    await prisma.$transaction(async (tx) => {
      let position = closed.goals.length;
      for (const g of moving) {
        await tx.goal.update({
          where: { id: g.id },
          data: { weekId: closed.id, position: ++position },
        });
      }
      // Fines raised against the ahead week would otherwise be orphaned
      // (Penalty.week is SetNull) — hang them on the week that remains.
      await tx.penalty.updateMany({
        where: { weekId: live.id },
        data: { weekId: closed.id },
      });
      await tx.week.delete({ where: { id: live.id } });
      await tx.week.update({
        where: { id: closed.id },
        data: { isCurrent: true },
      });
    });
  }
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/**
 * Issue a manual fine to a user (type OTHER) — for anything other than a missed
 * meeting (those flow from attendance). Links to the user's current week so it
 * surfaces there. Admin-only.
 */
export async function addManualPenalty(
  userId: string,
  amount: number,
  note: string,
) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value <= 0 || value > MAX_PENALTY) {
    throw new Error("Enter a valid fine amount.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const week = await prisma.week.findFirst({
    where: { userId, isCurrent: true },
    select: { id: true },
  });

  const cleanNote = note.trim().slice(0, 500) || null;
  await prisma.penalty.create({
    data: {
      userId,
      type: "OTHER",
      amount: value,
      note: cleanNote,
      weekId: week?.id ?? null,
      issuedById: session!.user.id,
    },
  });
  await notify(
    prisma,
    userId,
    "FINE",
    `You were fined ${formatMoney(value)}${cleanNote ? ` — ${cleanNote}` : ""}.`,
  );
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/** Remove a penalty (e.g. issued by mistake). Admin-only. */
export async function deletePenalty(penaltyId: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  await prisma.penalty.delete({ where: { id: penaltyId } });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/** Sum of a user's still-outstanding (unpaid) fines. */
async function outstandingFinesTotal(
  db: Prisma.TransactionClient | typeof prisma,
  userId: string,
): Promise<number> {
  const agg = await db.penalty.aggregate({
    where: { userId, paidAt: null },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/**
 * Settle one fine — record that it was cut from the person's salary and mark it
 * paid. Moves the fine out of the active ledger into the archive and notifies
 * the person, noting whatever they still owe. No-op if already settled.
 * Admin-only.
 */
export async function settleFine(penaltyId: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  const penalty = await prisma.penalty.findUnique({
    where: { id: penaltyId },
    select: { id: true, userId: true, amount: true, paidAt: true },
  });
  if (!penalty) throw new Error("Fine not found");
  if (penalty.paidAt) return; // already settled

  await prisma.$transaction(async (tx) => {
    await tx.penalty.update({
      where: { id: penalty.id },
      data: { paidAt: new Date(), settledById: session!.user.id },
    });
    const outstanding = await outstandingFinesTotal(tx, penalty.userId);
    await notify(
      tx,
      penalty.userId,
      "FINE",
      `Your ${formatMoney(penalty.amount)} fine was deducted from your salary and marked paid. ` +
        (outstanding > 0
          ? `${formatMoney(outstanding)} still outstanding.`
          : `You're all settled — nothing outstanding.`),
    );
  });

  revalidatePath("/penalties");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/**
 * Settle every outstanding fine for a person at once — the payroll case: their
 * fines were deducted from their salary this cycle. Marks them all paid, sends
 * one summary notification with the total deducted, and archives them.
 * Admin-only.
 */
export async function settleAllFines(userId: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }

  await prisma.$transaction(async (tx) => {
    const active = await tx.penalty.findMany({
      where: { userId, paidAt: null },
      select: { amount: true },
    });
    if (active.length === 0) return;
    const total = active.reduce((s, p) => s + p.amount, 0);

    await tx.penalty.updateMany({
      where: { userId, paidAt: null },
      data: { paidAt: new Date(), settledById: session!.user.id },
    });
    await notify(
      tx,
      userId,
      "FINE",
      `${formatMoney(total)} in fines was deducted from your salary and marked paid. You're all settled — nothing outstanding.`,
    );
  });

  revalidatePath("/penalties");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/**
 * Reopen a settled fine — undo a settlement recorded by mistake. Moves the fine
 * back into the active ledger (paidAt/settledBy cleared). Silent (no
 * notification). Admin-only.
 */
export async function reopenFine(penaltyId: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  await prisma.penalty.update({
    where: { id: penaltyId },
    data: { paidAt: null, settledById: null },
  });
  revalidatePath("/penalties");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/**
 * Award a bonus to a user — the positive counterpart of a manual fine, tracked
 * separately (no netting). Amount is a whole number in the app currency.
 * Admin-only.
 */
export async function addBonus(userId: string, amount: number, note: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value <= 0 || value > MAX_PENALTY) {
    throw new Error("Enter a valid bonus amount.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const cleanNote = note.trim().slice(0, 500) || null;
  await prisma.bonus.create({
    data: {
      userId,
      amount: value,
      note: cleanNote,
      issuedById: session!.user.id,
    },
  });
  await notify(
    prisma,
    userId,
    "BONUS",
    `You received a ${formatMoney(value)} bonus${cleanNote ? ` — ${cleanNote}` : ""}.`,
  );
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/** Remove a bonus (e.g. awarded by mistake). Admin-only. */
export async function deleteBonus(bonusId: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  await prisma.bonus.delete({ where: { id: bonusId } });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/**
 * Mark a person's attendance for this week's Monday 11:00 meeting (creating the
 * meeting row on first mark). Recomputes that person's escalating skip fines so
 * amounts and the consecutive-skip streak always stay correct. Admin-only.
 */
export async function setAttendance(userId: string, status: AttendanceStatus) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  if (
    status !== "ATTENDED" &&
    status !== "LATE" &&
    status !== "SKIPPED" &&
    status !== "EXCUSED"
  ) {
    throw new Error("Invalid status");
  }
  const issuedById = session!.user.id;
  const slot = currentMeetingSlot();

  await prisma.$transaction(async (tx) => {
    const meeting = await tx.meeting.upsert({
      where: { scheduledAt: slot },
      update: {},
      create: { scheduledAt: slot },
    });
    await tx.attendance.upsert({
      where: { meetingId_userId: { meetingId: meeting.id, userId } },
      update: { status },
      create: { meetingId: meeting.id, userId, status },
    });
    await recomputeMeetingPenalties(tx, userId, issuedById);
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/**
 * Reconcile a user's meeting-attendance fines from their attendance history.
 * Walks meetings oldest-first tracking the consecutive-skip streak — SKIPPED
 * escalates the streak fine; LATE is a flat fine that counts as present (resets
 * the streak); ATTENDED/EXCUSED reset it with no fine. Ensures exactly one
 * correctly-typed, correctly-priced fine per fined meeting (updating in place to
 * preserve timestamps) and removes fines for meetings that no longer warrant one.
 */
async function recomputeMeetingPenalties(
  tx: Prisma.TransactionClient,
  userId: string,
  issuedById: string,
) {
  const attendances = await tx.attendance.findMany({
    where: { userId },
    include: { meeting: { select: { id: true, scheduledAt: true } } },
    orderBy: { meeting: { scheduledAt: "asc" } },
  });

  const existing = await tx.penalty.findMany({
    where: { userId, type: { in: ["MEETING_SKIPPED", "MEETING_LATE"] } },
  });
  const byMeeting = new Map(existing.map((p) => [p.meetingId, p]));

  let streak = 0;
  for (const a of attendances) {
    let desired: { type: "MEETING_SKIPPED" | "MEETING_LATE"; amount: number } | null =
      null;
    if (a.status === "SKIPPED") {
      streak += 1;
      desired = { type: "MEETING_SKIPPED", amount: meetingPenaltyAmount(streak) };
    } else if (a.status === "LATE") {
      streak = 0;
      desired = { type: "MEETING_LATE", amount: MEETING_LATE_PENALTY };
    } else {
      streak = 0;
    }

    if (!desired) continue;

    const current = byMeeting.get(a.meetingId);
    if (current) {
      // Settled fines are frozen history — never re-price or re-type them, or
      // we'd silently change what the person already paid.
      if (
        current.paidAt == null &&
        (current.amount !== desired.amount || current.type !== desired.type)
      ) {
        await tx.penalty.update({
          where: { id: current.id },
          data: { amount: desired.amount, type: desired.type },
        });
      }
      byMeeting.delete(a.meetingId);
    } else {
      await tx.penalty.create({
        data: {
          userId,
          type: desired.type,
          amount: desired.amount,
          meetingId: a.meetingId,
          issuedById,
        },
      });
      // Only a newly created fine notifies — silent amount corrections from
      // re-marking older meetings would just be noise.
      await notify(
        tx,
        userId,
        "FINE",
        desired.type === "MEETING_SKIPPED"
          ? `You were fined ${formatMoney(desired.amount)} for skipping the ${formatYmd(toYmd(a.meeting.scheduledAt))} meeting.`
          : `You were fined ${formatMoney(desired.amount)} for being late to the ${formatYmd(toYmd(a.meeting.scheduledAt))} meeting.`,
      );
    }
  }

  // Any leftover *unpaid* fines point at meetings that no longer warrant one —
  // remove them. Settled fines are left alone (deleting one would erase a
  // payment that actually happened).
  const stale = [...byMeeting.values()]
    .filter((p) => p.paidAt == null)
    .map((p) => p.id);
  if (stale.length > 0) {
    await tx.penalty.deleteMany({ where: { id: { in: stale } } });
  }
}

/**
 * Create a goal and assign it to one or more people. Lives outside the weekly
 * goal flow (see the AssignedTask model) — a standalone task each assignee
 * tracks. Admin-only. `scope` picks which dashboard view (week/month) surfaces
 * it. Deadline is an optional YYYY-MM-DD (stored at UTC midnight, treated as
 * date-only like goal deadlines).
 *
 * Each assignee gets their own row, so completing, editing, or deleting one
 * person's copy leaves everybody else's alone. The batch is written in a single
 * transaction: it lands for everyone or for nobody, so a failure partway can't
 * assign half the team a goal the rest never hear about.
 */
export async function assignTask(
  userIds: string[],
  title: string,
  deadline?: string | null,
  note?: string,
  scope: "WEEKLY" | "MONTHLY" = "WEEKLY",
) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  const cleanTitle = title.trim().slice(0, 300);
  if (!cleanTitle) throw new Error("A title is required.");

  // Selecting "Everyone" and a name individually must not assign twice.
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) throw new Error("Pick at least one person.");

  const found = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) throw new Error("User not found");

  let due: Date | null = null;
  if (deadline) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
      throw new Error("Invalid deadline");
    }
    const [y, m, d] = deadline.split("-").map(Number);
    due = new Date(Date.UTC(y, m - 1, d));
    if (Number.isNaN(due.getTime())) throw new Error("Invalid deadline");
  }

  if (scope !== "WEEKLY" && scope !== "MONTHLY") {
    throw new Error("Invalid scope");
  }

  const cleanNote = note?.trim().slice(0, 500) || null;

  await prisma.$transaction(async (tx) => {
    await tx.assignedTask.createMany({
      data: ids.map((userId) => ({
        userId,
        assignedById: session!.user.id,
        title: cleanTitle,
        note: cleanNote,
        scope,
        deadline: due,
      })),
    });
    await notify(
      tx,
      ids,
      "TASK_ASSIGNED",
      `You were assigned a ${scope === "MONTHLY" ? "monthly" : "weekly"} goal: “${cleanTitle}”${due ? ` — due ${formatYmd(toYmd(due))}` : ""}.`,
    );
  });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/**
 * Edit an assigned task's definition — title, note, deadline, weekly/monthly
 * scope. Changing the scope moves it to the matching view on the assignee's
 * dashboard. The assignee is notified that their assignment changed. The
 * original assigner or an admin may edit; the assignee is never reassigned.
 */
export async function editAssignedTask(
  taskId: string,
  title: string,
  deadline?: string | null,
  note?: string,
  scope: "WEEKLY" | "MONTHLY" = "WEEKLY",
) {
  const session = await auth();
  const editorId = session?.user?.id;
  if (!editorId) throw new Error("Not authenticated");

  const task = await prisma.assignedTask.findUnique({
    where: { id: taskId },
    select: { id: true, userId: true, assignedById: true },
  });
  if (!task) throw new Error("Task not found");
  // The assigner or an admin may edit — nobody else.
  if (!isAdmin(session?.user?.email) && task.assignedById !== editorId) {
    throw new Error("Not authorized");
  }

  const cleanTitle = title.trim().slice(0, 300);
  if (!cleanTitle) throw new Error("A title is required.");

  let due: Date | null = null;
  if (deadline) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
      throw new Error("Invalid deadline");
    }
    const [y, m, d] = deadline.split("-").map(Number);
    due = new Date(Date.UTC(y, m - 1, d));
    if (Number.isNaN(due.getTime())) throw new Error("Invalid deadline");
  }

  if (scope !== "WEEKLY" && scope !== "MONTHLY") {
    throw new Error("Invalid scope");
  }

  await prisma.assignedTask.update({
    where: { id: taskId },
    data: {
      title: cleanTitle,
      note: note?.trim().slice(0, 500) || null,
      scope,
      deadline: due,
    },
  });
  await notify(
    prisma,
    task.userId,
    "TASK_ASSIGNED",
    `Your assigned ${scope === "MONTHLY" ? "monthly" : "weekly"} goal was updated: “${cleanTitle}”${due ? ` — due ${formatYmd(toYmd(due))}` : ""}.`,
  );
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/** Remove an assigned task (e.g. created by mistake or no longer needed). Admin-only. */
export async function deleteAssignedTask(taskId: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  await prisma.assignedTask.delete({ where: { id: taskId } });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { getWeekBounds } from "@/lib/weeks";
import { currentMeetingSlot } from "@/lib/meetings";
import {
  MAX_PENALTY,
  meetingPenaltyAmount,
  type AttendanceStatus,
} from "@/lib/penalties";
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

/**
 * Re-date a user's current week to the current calendar week, preserving all of
 * their goals and subtasks (they belong to the same week row — nothing is moved
 * or deleted). Used to recover users whose first week was created a week ahead
 * during launch (LAUNCH_START_NEXT_WEEK). Admin-only.
 */
export async function moveUserWeekToCurrent(userId: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  const week = await prisma.week.findFirst({
    where: { userId, isCurrent: true },
    select: { id: true },
  });
  if (!week) throw new Error("That user has no current week.");

  const { start, end } = getWeekBounds(new Date());
  await prisma.week.update({
    where: { id: week.id },
    data: { startDate: start, endDate: end },
  });
  revalidatePath("/admin");
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

  await prisma.penalty.create({
    data: {
      userId,
      type: "OTHER",
      amount: value,
      note: note.trim().slice(0, 500) || null,
      weekId: week?.id ?? null,
      issuedById: session!.user.id,
    },
  });
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
  if (status !== "ATTENDED" && status !== "SKIPPED" && status !== "EXCUSED") {
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
 * Reconcile a user's MEETING_SKIPPED fines from their attendance history.
 * Walks meetings oldest-first tracking the consecutive-skip streak (ATTENDED or
 * EXCUSED resets it), then ensures exactly one correctly-priced fine per skipped
 * meeting — updating amounts in place (preserving timestamps) and removing fines
 * for meetings that are no longer skipped.
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
    where: { userId, type: "MEETING_SKIPPED" },
  });
  const byMeeting = new Map(existing.map((p) => [p.meetingId, p]));

  let streak = 0;
  for (const a of attendances) {
    if (a.status === "SKIPPED") {
      streak += 1;
      const amount = meetingPenaltyAmount(streak);
      const current = byMeeting.get(a.meetingId);
      if (current) {
        if (current.amount !== amount) {
          await tx.penalty.update({
            where: { id: current.id },
            data: { amount },
          });
        }
        byMeeting.delete(a.meetingId);
      } else {
        await tx.penalty.create({
          data: {
            userId,
            type: "MEETING_SKIPPED",
            amount,
            meetingId: a.meetingId,
            issuedById,
          },
        });
      }
    } else {
      streak = 0;
    }
  }

  // Any leftover fines point at meetings that are no longer skipped — remove them.
  const stale = [...byMeeting.values()].map((p) => p.id);
  if (stale.length > 0) {
    await tx.penalty.deleteMany({ where: { id: { in: stale } } });
  }
}

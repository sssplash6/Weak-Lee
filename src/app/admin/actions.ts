"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { getWeekBounds } from "@/lib/weeks";

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

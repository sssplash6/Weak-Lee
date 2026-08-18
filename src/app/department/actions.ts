"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { notify } from "@/lib/notifications";

/**
 * Only department leads and admins review sign-ups. Returns the reviewer's
 * session; throws for anyone else.
 */
async function requireReviewer() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  if (isAdmin(session.user.email)) return session;
  const leadSeat = await prisma.departmentMembership.findFirst({
    where: { userId: session.user.id, role: "LEAD" },
    select: { id: true },
  });
  if (!leadSeat) throw new Error("Not authorized");
  return session;
}

function revalidateSignupViews() {
  revalidatePath("/department");
  revalidatePath("/admin");
  revalidatePath("/departments");
  revalidatePath("/pending");
}

/**
 * Let a pending sign-up onto the platform. They're notified and land on
 * onboarding (pick a department, fill the profile) on their next load.
 * Lead-or-admin only.
 */
export async function approveSignup(userId: string) {
  const session = await requireReviewer();

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, approvedAt: true },
  });
  if (!target) throw new Error("That account is gone.");
  if (target.approvedAt != null) return; // someone beat this reviewer to it

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { approvedAt: new Date(), approvedById: session.user.id },
    });
    await notify(
      tx,
      userId,
      "OTHER",
      "Your account was approved — welcome aboard! Head to the dashboard and finish your profile.",
    );
  });
  revalidateSignupViews();
}

/**
 * Turn a pending sign-up away — deletes the account. Deliberately refuses to
 * touch anyone already approved (removing a real teammate stays an admin-only
 * act on /admin). If the same person signs in again a fresh request appears.
 * Lead-or-admin only.
 */
export async function rejectSignup(userId: string) {
  await requireReviewer();

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, approvedAt: true },
  });
  if (!target) return; // already gone
  if (target.approvedAt != null) {
    throw new Error("This account is already approved — only an admin can remove it.");
  }

  await prisma.user.delete({ where: { id: userId } });
  revalidateSignupViews();
}

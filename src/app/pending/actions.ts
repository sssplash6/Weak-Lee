"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isApprovedUser } from "@/lib/approval";
import { announceSignup } from "@/lib/signupAlerts";

export type PendingActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): PendingActionResult => ({ ok: false, error });

/**
 * A waiting sign-up says which department they're joining — the one thing
 * asked before approval, and the thing that makes the request reviewable.
 *
 * This is also what pages a reviewer: no alert is written at sign-in any more,
 * because at that moment nobody knows whose joiner this is and the only
 * honest alert would go to every lead in the company. Answering here sends it
 * to that department's lead and tech@.
 *
 * Re-answerable while they wait. A new joiner guessing wrong shouldn't be
 * stuck in the wrong queue, and re-announcing is safe: `announceSignup` skips
 * anyone already told about this person, so the lead who was paged for the
 * first answer isn't paged twice, and the second department's lead is.
 */
export async function chooseSignupDepartment(
  departmentId: string,
): Promise<PendingActionResult> {
  const session = await auth();
  if (!session?.user?.id) return fail("You're not signed in.");
  // Nothing to request once they're in — onboarding owns departments from
  // there, where the answer becomes a real membership.
  if (await isApprovedUser(session.user)) {
    return fail("Your account is already approved — reload.");
  }

  // The picker only offers real departments, but the value is caller-supplied.
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true },
  });
  if (!department) return fail("Pick a department from the list.");

  const me = await prisma.user.update({
    where: { id: session.user.id },
    data: { requestedDepartmentId: department.id },
    select: { id: true, name: true, email: true },
  });

  // Best-effort, exactly as it was at sign-in: a notification hiccup must not
  // cost them the answer they just gave. scripts/announce-pending-signups.ts
  // replays anything lost here.
  try {
    await announceSignup(prisma, {
      ...me,
      requestedDepartmentId: department.id,
      requestedDepartmentName: department.name,
    });
  } catch (e) {
    console.error("sign-up alert failed", e);
  }

  revalidatePath("/pending");
  revalidatePath("/admin");
  revalidatePath("/department");
  return { ok: true };
}

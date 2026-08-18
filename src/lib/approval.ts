// Server-only: the sign-up approval gate. Company accounts are always in;
// anyone else needs `approvedAt` set by a department lead or an admin. Every
// signed-in page calls `assertApproved` right after its session check, so an
// unapproved account can sign in but sees only /pending until someone lets
// them in.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isCompanyEmail } from "@/lib/company";

/** Whether this signed-in user may use the platform. */
export async function isApprovedUser(user: {
  id: string;
  email?: string | null;
}): Promise<boolean> {
  if (isCompanyEmail(user.email)) return true;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { approvedAt: true },
  });
  // A deleted (rejected) account also lands here — nothing to use either way.
  return row?.approvedAt != null;
}

/** Redirect an unapproved account to the waiting room. Call after auth(). */
export async function assertApproved(user: {
  id: string;
  email?: string | null;
}): Promise<void> {
  if (!(await isApprovedUser(user))) redirect("/pending");
}

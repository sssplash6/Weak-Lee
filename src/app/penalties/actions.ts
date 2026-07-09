"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notifications";

/**
 * Report one or more colleagues (e.g. no response within 2 business days — see
 * the penalty policy). The report is delivered as REPORT notifications to the
 * admin accounts (shakhzod@ / tech@freshman.academy), which surface in their
 * dashboard updates zone. Any signed-in user can report.
 */
export async function reportColleagues(reason: string, userIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const cleanReason = reason.trim().slice(0, 500);
  if (!cleanReason) throw new Error("A reason is required.");

  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) throw new Error("Select at least one colleague.");

  const reported = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { name: true, email: true },
  });
  if (reported.length !== ids.length) throw new Error("Colleague not found.");

  const reporter = session.user.name ?? session.user.email ?? "Someone";
  const names = reported
    .map((u) => u.name ?? u.email ?? "—")
    .join(", ");

  await notifyAdmins(
    prisma,
    "REPORT",
    `${reporter} reported ${names} — “${cleanReason}”`,
  );
  revalidatePath("/dashboard");
  return { ok: true as const };
}

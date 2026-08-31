"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { notifyAdmins } from "@/lib/notifications";
import type { ColleagueReportStatus } from "@/generated/prisma/enums";

/**
 * Report one or more colleagues (e.g. no response within 2 business days — see
 * the penalty policy). Any signed-in user can report.
 *
 * The report is STORED and then announced: the row is the record admins work
 * from on /penalties/reports, and the REPORT notification is only the ping.
 * It used to be the notification alone, which meant a report was gone from the
 * dashboard's updates zone after 48 hours with no trace of what came of it.
 */
export async function reportColleagues(reason: string, userIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const cleanReason = reason.trim().slice(0, 500);
  if (!cleanReason) throw new Error("A reason is required.");

  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) throw new Error("Select at least one colleague.");
  // Reporting yourself is a misclick, not a report.
  if (ids.includes(session.user.id)) {
    throw new Error("You can't report yourself.");
  }

  const reported = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { name: true, email: true },
  });
  if (reported.length !== ids.length) throw new Error("Colleague not found.");

  const reporter = session.user.name ?? session.user.email ?? "Someone";
  const names = reported.map((u) => u.name ?? u.email ?? "—").join(", ");

  await prisma.$transaction(async (tx) => {
    await tx.colleagueReport.create({
      data: {
        reporterId: session.user!.id,
        reason: cleanReason,
        subjects: { create: ids.map((userId) => ({ userId })) },
      },
    });
    await notifyAdmins(
      tx,
      "REPORT",
      `${reporter} reported ${names} — “${cleanReason}”`,
    );
  });

  revalidatePath("/dashboard");
  revalidatePath("/penalties/reports");
  return { ok: true as const };
}

/**
 * Close a report, or reopen one. Admin-only — the form says it goes to the
 * admin team, and this is the desk it lands on.
 *
 * ACTIONED means an admin did something about it (usually issued the fine on
 * /admin); DISMISSED means they looked and there was nothing to do. Both carry
 * an optional note, because a closed report that doesn't say why is the same
 * dead end the notification was. Reopening clears the closure entirely rather
 * than leaving a stale closer on an open row.
 */
export async function setReportStatus(
  reportId: string,
  status: ColleagueReportStatus,
  resolution?: string,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  if (!isAdmin(session.user.email)) throw new Error("Not authorized");

  const closing = status !== "OPEN";
  await prisma.colleagueReport.update({
    where: { id: reportId },
    data: {
      status,
      closedById: closing ? session.user.id : null,
      closedAt: closing ? new Date() : null,
      resolution: closing ? (resolution?.trim().slice(0, 500) || null) : null,
    },
  });

  revalidatePath("/penalties/reports");
  return { ok: true as const };
}

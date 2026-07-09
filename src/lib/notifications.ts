// Server-only helpers for the in-app notification system. Notifications are
// written alongside the event they describe (fine issued, bonus awarded, task
// assigned, colleague reported) and surface in the dashboard's "Last 48 hours"
// updates zone. There is no email delivery — reports "sent to" the admins are
// notifications addressed to the admin accounts.

import { prisma } from "@/lib/prisma";
import { adminEmails } from "@/lib/admin";
import type { NotificationType, Prisma } from "@/generated/prisma/client";

// Accepts the shared client or a transaction client, so a notification can be
// written atomically with the row it announces.
type Db = Prisma.TransactionClient | typeof prisma;

/** Write one notification with the same message to each of `userIds`. */
export async function notify(
  db: Db,
  userIds: string | string[],
  type: NotificationType,
  message: string,
) {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type,
      message: message.trim().slice(0, 1000),
    })),
  });
}

/**
 * Notify every admin account (matched by email against the admin allowlist).
 * Admins who have never signed in have no user row and are skipped.
 */
export async function notifyAdmins(
  db: Db,
  type: NotificationType,
  message: string,
) {
  const admins = await db.user.findMany({
    where: { email: { in: adminEmails(), mode: "insensitive" } },
    select: { id: true },
  });
  await notify(
    db,
    admins.map((a) => a.id),
    type,
    message,
  );
}

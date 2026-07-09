"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Mark every unread notification of the signed-in user as read. Clears the
 * header bell's badge; invoked from the bell dropdown and the notifications
 * page. Already-read rows keep their original readAt.
 */
export async function markAllNotificationsRead() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
}

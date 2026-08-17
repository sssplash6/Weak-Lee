"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { dailyReportRecipient, isDailyReporter } from "@/lib/dailyReports";
import {
  DAILY_REPORTS_EPOCH,
  MAX_DAILY_REPORT,
  dayLabel,
  tashkentTodayYmd,
} from "@/lib/dailyReportTypes";
import { fromYmd } from "@/lib/dates";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Send (or edit-and-resend) the signed-in reporter's report for one day.
 * The first send freezes `submittedAt` — that's what on-time is judged by —
 * so editing later never launders a late report into an on-time one. Every
 * send notifies the recipient; an update says so rather than pretending to
 * be news.
 */
export async function sendDailyReport(
  dayYmd: string,
  content: string,
): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!userId) throw new Error("Not authenticated");
  if (!isDailyReporter(email)) {
    throw new Error("This account doesn't write daily reports");
  }

  if (!YMD_RE.test(dayYmd)) throw new Error("Invalid day");
  const day = fromYmd(dayYmd);
  if (Number.isNaN(day.getTime())) throw new Error("Invalid day");
  // Today or a past day only — reports describe a day that's happening, and
  // nothing before the feature existed is owed.
  if (dayYmd > tashkentTodayYmd()) {
    throw new Error("That day hasn't happened yet");
  }
  if (day.getTime() < DAILY_REPORTS_EPOCH.getTime()) {
    throw new Error("Daily reports start from 17 Aug 2026");
  }

  const text = content.trim();
  if (!text) throw new Error("Write something first");
  if (text.length > MAX_DAILY_REPORT) {
    throw new Error(`Keep it under ${MAX_DAILY_REPORT} characters`);
  }

  const reporterName = session.user.name ?? email ?? "A reporter";
  const recipient = await prisma.user.findFirst({
    where: { email: { equals: dailyReportRecipient(), mode: "insensitive" } },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyReport.findUnique({
      where: { userId_day: { userId, day } },
      select: { id: true },
    });
    if (existing) {
      await tx.dailyReport.update({
        where: { id: existing.id },
        data: { content: text, lastSentAt: new Date() },
      });
    } else {
      await tx.dailyReport.create({
        data: { userId, day, content: text },
      });
    }
    // The recipient may never have signed in (no user row) — skip quietly.
    if (recipient && recipient.id !== userId) {
      await notify(
        tx,
        recipient.id,
        "REPORT",
        existing
          ? `${reporterName} updated their daily report for ${dayLabel(dayYmd)}.`
          : `${reporterName} sent their daily report for ${dayLabel(dayYmd)}.`,
      );
    }
  });

  revalidatePath("/daily-reports");
  revalidatePath("/dashboard");
}

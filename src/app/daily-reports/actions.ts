"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import {
  dailyReporterFirstName,
  dailyReportRecipient,
  isDailyReporter,
} from "@/lib/dailyReports";
import {
  DAILY_REPORTS_EPOCH,
  MAX_DAILY_REPORT,
  dayLabel,
  tashkentTodayYmd,
} from "@/lib/dailyReportTypes";
import { parseYmd } from "@/lib/dates";
import {
  ActionError,
  actionResult,
  type ActionResult,
} from "@/lib/actionResult";
import { sendEmail } from "@/lib/email";

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
): Promise<ActionResult> {
  return actionResult(async () => {
    await sendDailyReportBody(dayYmd, content);
  });
}

/**
 * The body of sendDailyReport. Every refusal here is one the writer can act on
 * — wrong day, empty text, too long — so they're ActionErrors, which survive
 * the trip to the client; production strips the message off anything thrown.
 */
async function sendDailyReportBody(
  dayYmd: string,
  content: string,
): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!userId) throw new ActionError("Sign in to send a report.");
  if (!isDailyReporter(email)) {
    throw new ActionError("This account doesn't write daily reports.");
  }

  // parseYmd rejects impossible days (Feb 31) as well as malformed ones.
  const day = parseYmd(dayYmd);
  if (!day) throw new ActionError("That isn't a real day.");
  // Today or a past day only — reports describe a day that's happening, and
  // nothing before the feature existed is owed.
  if (dayYmd > tashkentTodayYmd()) {
    throw new ActionError("That day hasn't happened yet.");
  }
  if (day.getTime() < DAILY_REPORTS_EPOCH.getTime()) {
    throw new ActionError("Daily reports start from 17 Aug 2026.");
  }

  const text = content.trim();
  if (!text) throw new ActionError("Write something first.");
  if (text.length > MAX_DAILY_REPORT) {
    throw new ActionError(`Keep it under ${MAX_DAILY_REPORT} characters.`);
  }

  const reporterName = dailyReporterFirstName(email, session.user.name);
  const recipient = await prisma.user.findFirst({
    where: { email: { equals: dailyReportRecipient(), mode: "insensitive" } },
    select: { id: true },
  });

  let wasUpdate = false;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyReport.findUnique({
      where: { userId_day: { userId, day } },
      select: { id: true },
    });
    wasUpdate = existing != null;
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

  // Email the recipient as well — the in-app bell only helps once he's in the
  // app. Dormant until the Resend keys are configured (lib/email.ts), and a
  // mail failure never fails the submit. Kept minimal: the report itself, who
  // and which day, and a link to the day's review.
  if (email?.toLowerCase() !== dailyReportRecipient()) {
    const label = dayLabel(dayYmd);
    const appUrl = process.env.AUTH_URL ?? "https://www.freshweek.org";
    await sendEmail({
      to: dailyReportRecipient(),
      subject: `Daily report: ${reporterName} — ${label}${wasUpdate ? " (updated)" : ""}`,
      text: `${text}\n\n— ${reporterName}, ${label}\n${appUrl}/daily-reports?d=${dayYmd}`,
    });
  }

  revalidatePath("/daily-reports");
  revalidatePath("/dashboard");
}

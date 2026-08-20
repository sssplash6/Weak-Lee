"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/penalties";
import { notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import {
  applyTransition,
  appUrl,
  expireLapsedSubmissions,
  financeEmails,
  formatTashkent,
  payrollAdminEmails,
  requirePayrollAdmin,
  resubmitWindowFor,
  reviewerUsers,
} from "@/lib/payroll";
import { payrollPeriodLabel, PAYROLL_CLOSED } from "@/lib/payrollTypes";

export type ReviewActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): ReviewActionResult => ({ ok: false, error });

/** The views a queue action changes, refreshed together. */
function revalidateQueues() {
  revalidatePath("/payroll");
  revalidatePath("/payroll/review");
  revalidatePath("/payroll/finance");
}

async function loadForReview(submissionId: string) {
  return prisma.payrollSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      netTotal: true,
      graceDayUsed: true,
      user: { select: { id: true, name: true, email: true } },
      period: {
        select: { id: true, year: true, month: true, filingClosesAt: true },
      },
    },
  });
}

/**
 * Decline a submitted pay request back to its owner. The note is the whole
 * point — it's what the employee fixes — so it's required. The resubmit
 * window is min(now + 24h, filingClosesAt + 24h): a decline late in the month
 * still leaves a real day to fix and resend (the once-per-period grace day),
 * but repeat declines past the cutoff never extend it further.
 */
export async function declineSubmission(
  submissionId: string,
  note: string,
): Promise<ReviewActionResult> {
  if (PAYROLL_CLOSED) return fail("Payroll is closed right now.");
  const session = await auth();
  const actorId = await requirePayrollAdmin(session);

  const cleanNote = note.trim().slice(0, 1000);
  if (!cleanNote) return fail("A note is required — say what needs fixing.");

  const sub = await loadForReview(submissionId);
  if (!sub) return fail("Request not found.");
  if (sub.status !== "SUBMITTED") {
    return fail("Only a request awaiting review can be declined — reload.");
  }

  const now = new Date();
  const window = resubmitWindowFor(now, sub.period.filingClosesAt);
  const label = payrollPeriodLabel(sub.period.year, sub.period.month);

  await prisma.$transaction(async (tx) => {
    await applyTransition(tx, {
      submissionId: sub.id,
      from: "SUBMITTED",
      to: "DECLINED",
      actorId,
      note: cleanNote,
      data: {
        resubmitDeadline: window.deadline,
        graceDayUsed: sub.graceDayUsed || window.usesGraceDay,
      },
    });
    await notify(
      tx,
      sub.user.id,
      "PAYROLL",
      `Your ${label} pay request was declined — “${cleanNote}”. Resubmit by ${formatTashkent(window.deadline)}.`,
    );
    // The other admin sees it in their feed so the queue isn't handled twice —
    // in-app only, no email (the employee gets both).
    const admins = await reviewerUsers(tx, payrollAdminEmails());
    await notify(
      tx,
      admins.map((a) => a.id).filter((id) => id !== actorId && id !== sub.user.id),
      "PAYROLL",
      `${sub.user.name ?? sub.user.email}'s ${label} request was declined — “${cleanNote}”.`,
    );
  });

  if (sub.user.email) {
    await sendEmail({
      to: sub.user.email,
      subject: `Payroll: your ${label} request was declined`,
      text:
        `Your ${label} pay request was declined:\n\n“${cleanNote}”\n\n` +
        `Fix it and resubmit by ${formatTashkent(window.deadline)} — after that the filing rolls into next month's cycle.\n\n` +
        `Your form is reopened with everything prefilled: ${appUrl()}/payroll\n\n— FreshWeek`,
    });
  }

  revalidateQueues();
  return { ok: true };
}

/**
 * Approve a submitted request into the finance queue. Valera gets an in-app
 * notification and an email with the invoice PDF attached — the payment stage
 * works from the invoice, not the app state.
 */
export async function confirmSubmission(
  submissionId: string,
): Promise<ReviewActionResult> {
  if (PAYROLL_CLOSED) return fail("Payroll is closed right now.");
  const session = await auth();
  const actorId = await requirePayrollAdmin(session);
  await expireLapsedSubmissions();

  const sub = await loadForReview(submissionId);
  if (!sub) return fail("Request not found.");
  if (sub.status !== "SUBMITTED") {
    return fail("Only a request awaiting review can be approved — reload.");
  }

  const label = payrollPeriodLabel(sub.period.year, sub.period.month);
  const who = sub.user.name ?? sub.user.email ?? "Someone";

  await prisma.$transaction(async (tx) => {
    await applyTransition(tx, {
      submissionId: sub.id,
      from: "SUBMITTED",
      to: "APPROVED_BY_ADMIN",
      actorId,
    });
    const finance = await reviewerUsers(tx, financeEmails());
    await notify(
      tx,
      finance.map((f) => f.id),
      "PAYROLL",
      `${who}: ${label} pay request approved — ${formatMoney(sub.netTotal)} awaiting payment.`,
    );
  });

  const pdf = await prisma.payrollPdf.findUnique({
    where: { submissionId: sub.id },
    select: { bytes: true },
  });
  await Promise.all(
    financeEmails().map((to) =>
      sendEmail({
        to,
        subject: `Payroll: ${who} — ${label}, ${formatMoney(sub.netTotal)} to pay`,
        text:
          `${who}'s ${label} pay request was approved by the admins — ${formatMoney(sub.netTotal)} net.\n\n` +
          `The invoice is attached. Confirm the payment here: ${appUrl()}/payroll/finance\n\n— FreshWeek`,
        attachments: pdf
          ? [{ filename: `${who} — ${label}.pdf`, bytes: pdf.bytes }]
          : undefined,
      }),
    ),
  );

  revalidateQueues();
  return { ok: true };
}

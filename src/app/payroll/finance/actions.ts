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
  payrollAdminEmails,
  processSubmission,
  requireFinance,
  reviewerUsers,
} from "@/lib/payroll";
import { payrollPeriodLabel, PAYROLL_CLOSED } from "@/lib/payrollTypes";

export type FinanceActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): FinanceActionResult => ({ ok: false, error });

function revalidateQueues() {
  revalidatePath("/payroll");
  revalidatePath("/payroll/review");
  revalidatePath("/payroll/finance");
  revalidatePath("/penalties"); // the fine deduction lands there as a receipt
}

async function loadBasics(submissionId: string) {
  return prisma.payrollSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      netTotal: true,
      user: { select: { id: true, name: true, email: true } },
      period: { select: { year: true, month: true } },
    },
  });
}

/**
 * Confirm the payment: the snapshot is re-verified against the live ledger,
 * the fine deduction is written back as one PAYROLL FinePayment batch, the
 * bonuses are stamped consumed, and the request goes PROCESSED (see
 * lib/payroll.ts processSubmission). If the ledger moved after filing, this
 * refuses with the exact reasons instead of paying wrong amounts — send it
 * back so the person refiles with a fresh snapshot.
 */
export async function processApproved(
  submissionId: string,
): Promise<FinanceActionResult> {
  if (PAYROLL_CLOSED) return fail("Payroll is closed right now.");
  const session = await auth();
  const actorId = await requireFinance(session);

  const sub = await loadBasics(submissionId);
  if (!sub) return fail("Request not found.");
  if (sub.status !== "APPROVED_BY_ADMIN") {
    return fail("Only a request awaiting payment can be confirmed — reload.");
  }

  try {
    const result = await processSubmission({ submissionId, actorId });
    if (!result.ok) {
      return fail(
        `The ledger moved after filing — ${result.reasons.join(" ")} Send it back for a fresh snapshot.`,
      );
    }
  } catch (e) {
    if (e instanceof Error) return fail(e.message);
    throw e;
  }

  const label = payrollPeriodLabel(sub.period.year, sub.period.month);
  const who = sub.user.name ?? sub.user.email ?? "Someone";

  await notify(
    prisma,
    sub.user.id,
    "PAYROLL",
    `Your ${label} pay request was processed — ${formatMoney(sub.netTotal)} paid out. Fine deductions were recorded on your ledger.`,
  );
  const admins = await reviewerUsers(prisma, payrollAdminEmails());
  await notify(
    prisma,
    admins.map((a) => a.id).filter((id) => id !== sub.user.id),
    "PAYROLL",
    `${who}'s ${label} pay request was processed — ${formatMoney(sub.netTotal)} paid.`,
  );

  if (sub.user.email) {
    const pdf = await prisma.payrollPdf.findUnique({
      where: { submissionId: sub.id },
      select: { bytes: true },
    });
    await sendEmail({
      to: sub.user.email,
      subject: `Payroll: your ${label} request was paid — ${formatMoney(sub.netTotal)}`,
      text:
        `Your ${label} pay request was processed: ${formatMoney(sub.netTotal)} paid out. ` +
        `Any fine deductions were recorded on your ledger.\n\nThe final invoice is attached.\n\n— FreshWeek`,
      attachments: pdf
        ? [{ filename: `${who} — ${label}.pdf`, bytes: pdf.bytes }]
        : undefined,
    });
  }

  revalidateQueues();
  return { ok: true };
}

/**
 * Return an approved request to the admin queue with a required note —
 * finance's recovery path for admin mistakes and for the snapshot-drift
 * refusal above. The request goes back to SUBMITTED; the note lives in the
 * audit trail and reaches both admins.
 */
export async function sendBackToAdmins(
  submissionId: string,
  note: string,
): Promise<FinanceActionResult> {
  if (PAYROLL_CLOSED) return fail("Payroll is closed right now.");
  const session = await auth();
  const actorId = await requireFinance(session);

  const cleanNote = note.trim().slice(0, 1000);
  if (!cleanNote) return fail("A note is required — say why it's going back.");

  const sub = await loadBasics(submissionId);
  if (!sub) return fail("Request not found.");
  if (sub.status !== "APPROVED_BY_ADMIN") {
    return fail("Only a request awaiting payment can be sent back — reload.");
  }

  const label = payrollPeriodLabel(sub.period.year, sub.period.month);
  const who = sub.user.name ?? sub.user.email ?? "Someone";

  await prisma.$transaction(async (tx) => {
    await applyTransition(tx, {
      submissionId: sub.id,
      from: "APPROVED_BY_ADMIN",
      to: "SUBMITTED",
      actorId,
      note: cleanNote,
    });
    const admins = await reviewerUsers(tx, payrollAdminEmails());
    await notify(
      tx,
      admins.map((a) => a.id),
      "PAYROLL",
      `Finance sent ${who}'s ${label} request back to review — “${cleanNote}”.`,
    );
  });

  await Promise.all(
    payrollAdminEmails().map((to) =>
      sendEmail({
        to,
        subject: `Payroll: ${who}'s ${label} request sent back by finance`,
        text:
          `Finance returned ${who}'s ${label} pay request to the review queue:\n\n“${cleanNote}”\n\n` +
          `Review it: ${appUrl()}/payroll/review\n\n— FreshWeek`,
      }),
    ),
  );

  revalidateQueues();
  return { ok: true };
}

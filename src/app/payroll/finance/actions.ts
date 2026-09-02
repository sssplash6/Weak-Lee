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
  processSubmission,
  requireFinance,
  resubmitWindowFor,
  reviewerUsers,
} from "@/lib/payroll";
import {
  payrollPeriodLabel,
  isPayrollOpenFor,
  type PayrollStatus,
} from "@/lib/payrollTypes";

export type FinanceActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): FinanceActionResult => ({ ok: false, error });

/**
 * The two statuses a request can still be acted on from.
 *
 * SUBMITTED is where every filing now lands — payroll has one reviewer stage,
 * so a request goes straight from the filer to the person who pays it.
 * APPROVED_BY_ADMIN is the legacy half: rows the removed admin stage had
 * already approved when it went away. They are the same job — unpaid money on
 * the reviewer's desk — so both verbs below take either, and the audit trail
 * keeps the distinction rather than the queue.
 */
const ACTIONABLE: PayrollStatus[] = ["SUBMITTED", "APPROVED_BY_ADMIN"];

/** The views a panel action changes, refreshed together. */
function revalidatePanels() {
  revalidatePath("/payroll");
  // The three reviewer URLs collapsed into one panel; the old paths are
  // 307s now and have nothing of their own to refresh.
  revalidatePath("/payroll/panel");
  revalidatePath("/penalties"); // the fine deduction lands there as a receipt
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

/** In-app notice to the other reviewers, so a queue isn't worked twice. */
async function tellOtherReviewers(
  db: Parameters<typeof notify>[0],
  message: string,
  exceptIds: (string | null)[],
) {
  const others = await reviewerUsers(db, financeEmails());
  await notify(
    db,
    others.map((r) => r.id).filter((id) => !exceptIds.includes(id)),
    "PAYROLL",
    message,
  );
}

/**
 * Decline a pay request back to its owner. The note is the whole point — it's
 * what the employee fixes — so it's required.
 *
 * Declining takes nothing off the filer's clock: the resubmit deadline is the
 * period's filing cutoff, exactly the deadline they already had. Only a
 * decline on the window's last day moves it, one day past the cutoff, and that
 * spends the once-per-period grace day — ORed in below because the flag
 * records that the period ever ran past its cutoff, not that this particular
 * decline did. resubmitWindowFor returns the same deadline for every later
 * decline, so a re-decline can't extend the window or cut it short.
 *
 * This is also the recovery path when a payment is refused for snapshot drift
 * (see processSubmission): the numbers are stale, and only the filer can refile
 * them fresh. It replaces finance's old send-back, which returned a request to
 * an admin stage that no longer exists.
 */
export async function declineSubmission(
  submissionId: string,
  note: string,
): Promise<FinanceActionResult> {
  const session = await auth();
  if (!isPayrollOpenFor(session?.user?.email)) {
    return fail("Payroll is closed right now.");
  }
  const actorId = await requireFinance(session);

  const cleanNote = note.trim().slice(0, 1000);
  if (!cleanNote) return fail("A note is required — say what needs fixing.");

  const sub = await loadForReview(submissionId);
  if (!sub) return fail("Request not found.");
  if (!ACTIONABLE.includes(sub.status)) {
    return fail("Only a request awaiting payment can be declined — reload.");
  }

  const now = new Date();
  const window = resubmitWindowFor(now, sub.period);
  const label = payrollPeriodLabel(sub.period.year, sub.period.month);
  // A held-open month hands back no deadline (resubmitWindowFor), so the two
  // messages below say what actually bounds the refile — the month closing —
  // rather than naming a date nobody has set yet.
  const byWhen = window.deadline
    ? `by ${formatTashkent(window.deadline)}`
    : `whenever you like — ${label} is being held open, so there's no deadline until it closes`;

  await prisma.$transaction(async (tx) => {
    await applyTransition(tx, {
      submissionId: sub.id,
      from: sub.status,
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
      `Your ${label} pay request was declined — “${cleanNote}”. Resubmit ${byWhen}.`,
    );
    // In-app only for the other reviewers — no email (the employee gets both).
    await tellOtherReviewers(
      tx,
      `${sub.user.name ?? sub.user.email}'s ${label} request was declined — “${cleanNote}”.`,
      [actorId, sub.user.id],
    );
  });

  if (sub.user.email) {
    await sendEmail({
      to: sub.user.email,
      subject: `Payroll: your ${label} request was declined`,
      text:
        `Your ${label} pay request was declined:\n\n“${cleanNote}”\n\n` +
        `Fix it and resubmit ${byWhen}${window.deadline ? " — after that the filing rolls into next month's cycle" : ""}.\n\n` +
        `Your form is reopened with everything prefilled: ${appUrl()}/payroll\n\n— FreshWeek`,
    });
  }

  revalidatePanels();
  return { ok: true };
}

/**
 * Confirm the payment: the snapshot is re-verified against the live ledger,
 * the fine deduction is written back as one PAYROLL FinePayment batch, the
 * bonuses are stamped consumed, and the request goes PROCESSED (see
 * lib/payroll.ts processSubmission). If the ledger moved after filing, this
 * refuses with the exact reasons instead of paying wrong amounts — decline it
 * so the person refiles with a fresh snapshot.
 */
export async function confirmPayment(
  submissionId: string,
): Promise<FinanceActionResult> {
  const session = await auth();
  if (!isPayrollOpenFor(session?.user?.email)) {
    return fail("Payroll is closed right now.");
  }
  const actorId = await requireFinance(session);
  await expireLapsedSubmissions();

  const sub = await loadForReview(submissionId);
  if (!sub) return fail("Request not found.");
  if (!ACTIONABLE.includes(sub.status)) {
    return fail("Only a request awaiting payment can be confirmed — reload.");
  }

  try {
    const result = await processSubmission({ submissionId, actorId });
    if (!result.ok) {
      return fail(
        `The ledger moved after filing — ${result.reasons.join(" ")} Decline it so they refile with a fresh snapshot.`,
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
  await tellOtherReviewers(
    prisma,
    `${who}'s ${label} pay request was processed — ${formatMoney(sub.netTotal)} paid.`,
    [actorId, sub.user.id],
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

  revalidatePanels();
  return { ok: true };
}

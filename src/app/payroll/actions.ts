"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isApprovedUser } from "@/lib/approval";
import { formatMoney } from "@/lib/penalties";
import { notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import {
  applyTransition,
  appUrl,
  ensureCurrentPeriod,
  expireLapsedSubmissions,
  inFlightSubmission,
  payrollAdminEmails,
  pullLedgerSnapshot,
  reviewerUsers,
} from "@/lib/payroll";
import { renderPayrollInvoice } from "@/lib/payrollPdf";
import { cardEncryptionReady, encryptCard } from "@/lib/cardCrypto";
import {
  computeNet,
  MAX_PAYROLL_AMOUNT,
  MAX_PAYROLL_EXPENSES,
  MAX_RECEIPT_BYTES,
  RECEIPT_MIME_TYPES,
  payrollMonthName,
  payrollPeriodLabel,
  PAYROLL_CLOSED,
  type PaymentDetails,
  type PayrollMethod,
} from "@/lib/payrollTypes";
import type { Prisma } from "@/generated/prisma/client";

export type SubmitPayrollResult = { ok: true } | { ok: false; error: string };

// Expected failures (validation, closed windows) come back as { ok: false }
// with a specific message — production masks thrown action errors, and the
// form needs to say WHY. Throws are reserved for auth and genuine bugs.
const fail = (error: string): SubmitPayrollResult => ({ ok: false, error });

type ParsedExpense = {
  /** Set when this line survives from the declined submission — its stored
   * receipt is kept unless a new file replaces it. */
  existingId: string | null;
  label: string;
  amount: number;
  receipt: {
    filename: string;
    mimeType: string;
    size: number;
    // Prisma's Bytes input is pinned to a plain ArrayBuffer view.
    bytes: Uint8Array<ArrayBuffer>;
  } | null;
};

/**
 * File (or, after a decline, refile) the signed-in user's pay request for the
 * current period. Reads the form multipart body: baseSalary, paymentMethod +
 * its details, an `expenses` JSON array, and one optional `receipt_<i>` file
 * per expense. Snapshots the ledger, computes the net, renders the invoice
 * PDF, moves the request to SUBMITTED, and tells the payroll admins.
 */
export async function submitPayroll(
  formData: FormData,
): Promise<SubmitPayrollResult> {
  // The page renders the coming-soon screen while payroll is closed, but the
  // action stays POST-reachable — refuse here too.
  if (PAYROLL_CLOSED) return fail("Payroll is closed right now.");
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  if (!(await isApprovedUser(session.user))) throw new Error("Not authorized");
  const userId = session.user.id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      memberships: { select: { id: true }, take: 1 },
    },
  });
  if (!me) throw new Error("Not authenticated");
  if (me.memberships.length === 0) {
    return fail("Finish onboarding (join a department) before filing payroll.");
  }

  // ----- Parse & validate the form -----

  const baseSalary = Math.round(Number(formData.get("baseSalary")));
  if (!Number.isFinite(baseSalary) || baseSalary < 0 || baseSalary > MAX_PAYROLL_AMOUNT) {
    return fail("Enter a valid base salary (whole dollars).");
  }

  const method = String(formData.get("paymentMethod") ?? "") as PayrollMethod;
  if (method !== "CASH" && method !== "UZCARD" && method !== "WISE") {
    return fail("Pick a payment method.");
  }
  let details: PaymentDetails = {};
  if (method === "UZCARD") {
    const cardNumber = String(formData.get("cardNumber") ?? "").replace(/[\s-]/g, "");
    const cardHolder = String(formData.get("cardHolder") ?? "").trim().slice(0, 120);
    if (!/^\d{12,19}$/.test(cardNumber)) return fail("Enter a valid card number.");
    if (!cardHolder) return fail("Enter the cardholder name.");
    // Refuse rather than quietly fall back to plaintext: a missing key is a
    // deployment mistake, and storing the number in the clear because of one
    // is exactly the outcome the encryption exists to prevent.
    if (!cardEncryptionReady()) {
      return fail(
        "Card payments aren't configured on the server — tell tech@freshman.academy.",
      );
    }
    details = { cardNumber, cardHolder };
  } else if (method === "WISE") {
    const wiseEmail = String(formData.get("wiseEmail") ?? "").trim().slice(0, 200);
    if (!/^\S+@\S+\.\S+$/.test(wiseEmail)) return fail("Enter a valid Wise account email.");
    details = { wiseEmail };
  }

  let expenseMeta: { id?: unknown; label: unknown; amount: unknown }[];
  try {
    expenseMeta = JSON.parse(String(formData.get("expenses") ?? "[]"));
    if (!Array.isArray(expenseMeta)) throw new Error();
  } catch {
    return fail("Couldn't read the expense lines — reload and try again.");
  }
  if (expenseMeta.length > MAX_PAYROLL_EXPENSES) {
    return fail(`At most ${MAX_PAYROLL_EXPENSES} expense lines.`);
  }
  const expenses: ParsedExpense[] = [];
  for (const [i, raw] of expenseMeta.entries()) {
    const label = String(raw.label ?? "").trim().slice(0, 120);
    const amount = Math.round(Number(raw.amount));
    if (!label) return fail(`Expense ${i + 1} needs a label.`);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PAYROLL_AMOUNT) {
      return fail(`Expense “${label}” needs a valid amount (whole dollars).`);
    }
    const file = formData.get(`receipt_${i}`);
    let receipt: ParsedExpense["receipt"] = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_RECEIPT_BYTES) {
        return fail(`Receipt for “${label}” is over 4MB — attach a smaller file.`);
      }
      if (!RECEIPT_MIME_TYPES.includes(file.type)) {
        return fail(`Receipt for “${label}” must be an image or a PDF.`);
      }
      receipt = {
        filename: (file.name || "receipt").slice(0, 200),
        mimeType: file.type,
        size: file.size,
        bytes: new Uint8Array(await file.arrayBuffer()),
      };
    }
    expenses.push({
      existingId: typeof raw.id === "string" ? raw.id : null,
      label,
      amount,
      receipt,
    });
  }
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  if (expensesTotal > MAX_PAYROLL_AMOUNT) return fail("Expenses total is too large.");

  // What actually goes in the database: the card number encrypted, everything
  // else as typed. `details` stays plaintext for this request only — the PDF
  // below needs the last four digits, and the filer's own prefill needs the
  // whole thing.
  const storedDetails: PaymentDetails = details.cardNumber
    ? { ...details, cardNumber: encryptCard(details.cardNumber) }
    : details;

  // ----- Which filing path is open? -----

  const now = new Date();
  await expireLapsedSubmissions(now);
  const period = await ensureCurrentPeriod(prisma, now);
  const label = payrollPeriodLabel(period.year, period.month);

  const existing = await prisma.payrollSubmission.findUnique({
    where: { userId_periodId: { userId, periodId: period.id } },
    select: { id: true, status: true, resubmitDeadline: true },
  });

  let mode: "create" | "resubmit";
  if (!existing) {
    if (now > period.filingClosesAt) {
      return fail(
        `Filing for ${label} has closed — no penalty, you'll simply file in next month's cycle.`,
      );
    }
    const blocking = await inFlightSubmission(prisma, userId);
    if (blocking) {
      return fail(
        `Your ${payrollMonthName(blocking.period.month)} request is still in review — filing for ${label} unlocks once it's processed.`,
      );
    }
    mode = "create";
  } else if (existing.status === "DECLINED") {
    if (!existing.resubmitDeadline || now > existing.resubmitDeadline) {
      return fail("The resubmit window has closed — this filing rolls into next month's cycle.");
    }
    mode = "resubmit";
  } else {
    return fail(`You've already filed for ${label}.`);
  }

  // ----- Write it all atomically -----

  let netTotal = 0;
  try {
    await prisma.$transaction(async (tx) => {
      // Serialize this person's filings before reading anything. Every check
      // above ran outside the transaction, so two requests for DIFFERENT
      // periods could both pass the in-flight guard and then snapshot the same
      // unpaid fines and unpaid bonuses — paying the bonuses twice and
      // deducting the fines twice. The (userId, periodId) unique key doesn't
      // help: it only stops two filings for the SAME period. A per-user
      // advisory lock does, and needs no schema change — Postgres holds it for
      // the life of the transaction and drops it on commit or rollback.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${PAYROLL_LOCK_NAMESPACE}::int4, hashtext(${userId}))`;

      // Re-assert what decided `mode`, now that nothing else can be filing for
      // this person. Whoever held the lock first may have just used it up.
      if (mode === "create") {
        const blocking = await inFlightSubmission(tx, userId);
        if (blocking) {
          throw new SubmitError(
            `Your ${payrollMonthName(blocking.period.month)} request is still in review — filing for ${label} unlocks once it's processed.`,
          );
        }
      } else {
        const still = await tx.payrollSubmission.findUnique({
          where: { id: existing!.id },
          select: { status: true },
        });
        if (still?.status !== "DECLINED") {
          throw new SubmitError(
            "That request has already moved on — reload to see where it is.",
          );
        }
      }

      const snapshot = await pullLedgerSnapshot(tx, userId);
      netTotal = computeNet({
        baseSalary,
        bonusesTotal: snapshot.bonusesTotal,
        finesTotal: snapshot.finesTotal,
        expensesTotal,
      });
      if (netTotal < 0) {
        throw new SubmitError(
          `Your outstanding fines (${formatMoney(snapshot.finesTotal)}) exceed the rest of this request — the total can't go below zero.`,
        );
      }

      const money = {
        baseSalary,
        bonusesTotal: snapshot.bonusesTotal,
        finesTotal: snapshot.finesTotal,
        expensesTotal,
        netTotal,
        paymentMethod: method,
        paymentDetails: storedDetails as Prisma.InputJsonValue,
      };

      let submissionId: string;
      if (mode === "create") {
        const created = await tx.payrollSubmission.create({
          data: { userId, periodId: period.id, status: "DRAFT", ...money },
          select: { id: true },
        });
        submissionId = created.id;
        await applyTransition(tx, {
          submissionId,
          from: "DRAFT",
          to: "SUBMITTED",
          actorId: userId,
          data: { submittedAt: now, lastSubmittedAt: now },
        });
      } else {
        submissionId = existing!.id;
        // A resubmission replaces the ledger snapshot wholesale and
        // regenerates the PDF below. Expenses are reconciled, not wiped: a
        // kept line updates in place so its stored receipt survives — the
        // person shouldn't re-upload a photo because the base salary was
        // wrong (a new file on a kept line replaces the old receipt).
        await tx.payrollBonusLine.deleteMany({ where: { submissionId } });
        await tx.payrollFineLine.deleteMany({ where: { submissionId } });
        await tx.payrollSubmission.update({
          where: { id: submissionId },
          data: money,
        });
        await applyTransition(tx, {
          submissionId,
          from: "DECLINED",
          to: "SUBMITTED",
          actorId: userId,
          data: { lastSubmittedAt: now },
        });
      }

      if (snapshot.bonusLines.length > 0) {
        await tx.payrollBonusLine.createMany({
          data: snapshot.bonusLines.map((l) => ({ ...l, submissionId })),
        });
      }
      if (snapshot.fineLines.length > 0) {
        await tx.payrollFineLine.createMany({
          data: snapshot.fineLines.map((l) => ({ ...l, submissionId })),
        });
      }

      // Reconcile expense rows. `existingId` claims are honored only for rows
      // that really belong to THIS submission — a forged id can't touch
      // someone else's data.
      const oldRows = await tx.payrollExpense.findMany({
        where: { submissionId },
        select: { id: true },
      });
      const oldIds = new Set(oldRows.map((r) => r.id));
      const keptIds = new Set(
        expenses
          .map((e) => e.existingId)
          .filter((id): id is string => id !== null && oldIds.has(id)),
      );
      const dropIds = oldRows.filter((r) => !keptIds.has(r.id)).map((r) => r.id);
      if (dropIds.length > 0) {
        await tx.payrollExpense.deleteMany({ where: { id: { in: dropIds } } });
      }
      for (const [i, e] of expenses.entries()) {
        const kept = e.existingId !== null && keptIds.has(e.existingId);
        let expenseId: string;
        if (kept) {
          expenseId = e.existingId!;
          await tx.payrollExpense.update({
            where: { id: expenseId },
            data: { label: e.label, amount: e.amount, position: i + 1 },
          });
        } else {
          const row = await tx.payrollExpense.create({
            data: { submissionId, label: e.label, amount: e.amount, position: i + 1 },
            select: { id: true },
          });
          expenseId = row.id;
        }
        if (e.receipt) {
          await tx.payrollReceipt.deleteMany({ where: { expenseId } });
          await tx.payrollReceipt.create({
            data: { expenseId, ...e.receipt },
          });
        }
      }

      // Invoice number: this person's Nth request ever, stable across
      // regenerations (createdAt order, not status).
      const created = await tx.payrollSubmission.findUniqueOrThrow({
        where: { id: submissionId },
        select: { createdAt: true },
      });
      const invoiceNo =
        (await tx.payrollSubmission.count({
          where: { userId, createdAt: { lt: created.createdAt } },
        })) + 1;

      const pdfBytes = await renderPayrollInvoice({
        invoiceNo,
        employeeName: me.name ?? me.email ?? "—",
        dateLabel: now.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "Asia/Tashkent",
        }),
        periodLabel: label,
        baseSalary,
        bonusLines: snapshot.bonusLines,
        fineLines: snapshot.fineLines,
        expenses: expenses.map((e) => ({ label: e.label, amount: e.amount })),
        netTotal,
        paymentMethod: method,
        paymentDetails: details,
      });
      await tx.payrollPdf.upsert({
        where: { submissionId },
        update: { bytes: pdfBytes },
        create: { submissionId, bytes: pdfBytes },
      });

      const admins = await reviewerUsers(tx, payrollAdminEmails());
      await notify(
        tx,
        admins.map((a) => a.id).filter((id) => id !== userId),
        "PAYROLL",
        `${me.name ?? me.email}: ${label} pay request ${mode === "resubmit" ? "resubmitted" : "filed"} — ${formatMoney(netTotal)} net.`,
      );
    });
  } catch (e) {
    if (e instanceof SubmitError) return fail(e.message);
    // Two tabs racing the same filing hit the (userId, periodId) unique key.
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") {
      return fail(`You've already filed for ${label} — reload to see it.`);
    }
    throw e;
  }

  // Mail is a side channel — after the transaction, never inside it.
  const who = me.name ?? me.email ?? "Someone";
  await Promise.all(
    payrollAdminEmails()
      .filter((to) => to !== (me.email ?? "").toLowerCase())
      .map((to) =>
        sendEmail({
          to,
          subject: `Payroll: ${who} ${mode === "resubmit" ? "resubmitted" : "filed"} for ${label}`,
          text:
            `${who} ${mode === "resubmit" ? "resubmitted their" : "filed a"} ${label} pay request — ${formatMoney(netTotal)} net.\n\n` +
            `Review it: ${appUrl()}/payroll/review\n\n— FreshWeek`,
        }),
      ),
  );

  revalidatePath("/payroll");
  revalidatePath("/payroll/review");
  return { ok: true };
}

/** An expected, user-facing refusal thrown from inside the transaction. */
class SubmitError extends Error {}

/**
 * Namespace for the per-user payroll advisory lock, so it can't collide with
 * any other advisory lock the app might take later. Arbitrary but fixed.
 */
const PAYROLL_LOCK_NAMESPACE = 8_140_233;

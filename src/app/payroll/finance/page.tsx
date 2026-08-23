import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { assertApproved } from "@/lib/approval";
import { prisma } from "@/lib/prisma";
import { resolveAvatar } from "@/lib/avatar";
import { departmentLine } from "@/lib/team";
import { formatDateTimeTz } from "@/lib/dates";
import { formatMoney } from "@/lib/penalties";
import { BackLink } from "@/app/_components/BackLink";
import {
  expireLapsedSubmissions,
  isFinance,
  reconcilePayrollReminders,
} from "@/lib/payroll";
import {
  paymentFull,
  payrollPeriodLabel,
  PAYROLL_CLOSED,
} from "@/lib/payrollTypes";
import { readPaymentDetails } from "@/lib/cardCrypto";
import { PayrollComingSoon } from "../_components/PayrollComingSoon";
import {
  bonusLineViews,
  eventViews,
  fineLineViews,
} from "../_components/lineViews";
import { SubmissionDetail } from "../_components/SubmissionDetail";
import { FinanceRow } from "./FinanceRow";

export const metadata: Metadata = { title: "Payroll finance" };

// Everything a queue row needs, shared by both sections.
const ROW_SELECT = {
  id: true,
  status: true,
  baseSalary: true,
  bonusesTotal: true,
  finesTotal: true,
  expensesTotal: true,
  netTotal: true,
  paymentMethod: true,
  paymentDetails: true,
  lastSubmittedAt: true,
  processedAt: true,
  period: { select: { year: true, month: true } },
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      memberships: {
        select: { role: true, department: { select: { name: true } } },
      },
    },
  },
  bonusLines: {
    orderBy: { awardedAt: "asc" },
    select: { id: true, amount: true, note: true, awardedAt: true },
  },
  fineLines: {
    orderBy: { issuedAt: "asc" },
    select: { id: true, amount: true, type: true, note: true, issuedAt: true },
  },
  expenses: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      label: true,
      amount: true,
      receipt: { select: { id: true, filename: true } },
    },
  },
  events: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
      actor: { select: { name: true, email: true } },
    },
  },
} as const;

/**
 * The finance stage (valera@): every admin-approved request awaiting payment,
 * across all periods — approvals may cross the filing cutoff by design.
 * Confirm writes the money back (fine deduction, consumed bonuses) and closes
 * the request; send-back returns it to the admin queue with a note. Finance
 * sees only this queue, not the admin panel.
 */
export default async function PayrollFinancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  await assertApproved(session.user);
  // Closed: reviewers see the same screen employees do, before any sweep runs.
  if (PAYROLL_CLOSED) return <PayrollComingSoon />;
  if (!isFinance(session.user.email)) redirect("/payroll");

  const now = new Date();
  await expireLapsedSubmissions(now);
  await reconcilePayrollReminders(now);

  const awaiting = await prisma.payrollSubmission.findMany({
    where: { status: "APPROVED_BY_ADMIN" },
    orderBy: { lastSubmittedAt: "asc" },
    select: ROW_SELECT,
  });
  const paid = await prisma.payrollSubmission.findMany({
    where: { status: "PROCESSED" },
    orderBy: { processedAt: "desc" },
    take: 15,
    select: ROW_SELECT,
  });

  const awaitingTotal = awaiting.reduce((s, x) => s + x.netTotal, 0);

  const rows = (list: typeof awaiting, canAct: boolean) =>
    list.map((s) => {
      const av = resolveAvatar(s.user.avatar, s.user.email ?? s.user.id);
      const label = payrollPeriodLabel(s.period.year, s.period.month);
      const metaLine = canAct
        ? `${label}${s.lastSubmittedAt ? ` · filed ${formatDateTimeTz(s.lastSubmittedAt)}` : ""}`
        : `${label}${s.processedAt ? ` · paid ${formatDateTimeTz(s.processedAt)}` : ""}`;
      return (
        <FinanceRow
          key={s.id}
          submissionId={s.id}
          canAct={canAct}
          summary={{
            name: s.user.name ?? s.user.email ?? "—",
            deptLine: departmentLine(s.user.memberships),
            emoji: av.emoji,
            bg: av.bg,
            metaLine,
            netLabel: formatMoney(s.netTotal),
          }}
        >
          <SubmissionDetail
            view={{
              id: s.id,
              baseSalary: s.baseSalary,
              bonusesTotal: s.bonusesTotal,
              finesTotal: s.finesTotal,
              expensesTotal: s.expensesTotal,
              netTotal: s.netTotal,
              bonuses: bonusLineViews(s.bonusLines, s.period.year),
              fines: fineLineViews(s.fineLines, s.period.year),
              expenses: s.expenses,
              paymentLine: paymentFull(
                s.paymentMethod,
                readPaymentDetails(s.paymentDetails),
              ),
              events: eventViews(s.events, formatDateTimeTz),
            }}
          />
        </FinanceRow>
      );
    });

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Payroll finance</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {awaiting.length === 0
              ? "Nothing awaiting payment."
              : `${awaiting.length} ${awaiting.length === 1 ? "request" : "requests"} awaiting payment — ${formatMoney(awaitingTotal)} in total.`}{" "}
            Confirming records the fine deduction on the ledger and closes the
            request.
          </p>
        </div>
        <BackLink href="/payroll" label="Payroll" />
      </header>

      <section>
        <h2 className="mb-3 px-1 text-sm font-semibold text-ink">
          Awaiting payment
        </h2>
        {awaiting.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center">
            <p className="text-sm font-semibold text-green-700">All paid 🎉</p>
            <p className="mt-1 text-xs text-muted-fg">
              Approved requests land here the moment the admins confirm them.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">{rows(awaiting, true)}</ul>
        )}
      </section>

      {paid.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 px-1 text-sm font-semibold text-ink">
            Recently paid
          </h2>
          <ul className="flex flex-col gap-2">{rows(paid, false)}</ul>
        </section>
      )}
    </div>
  );
}

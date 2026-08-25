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
  parsePaymentDetails,
  paymentSummary,
  payrollPeriodLabel,
  PAYROLL_CLOSED,
  PAYROLL_METHOD_LABEL,
  PAYROLL_STATUS_LABEL,
} from "@/lib/payrollTypes";
import { PayrollComingSoon } from "../_components/PayrollComingSoon";
import {
  bonusLineViews,
  eventViews,
  fineLineViews,
} from "../_components/lineViews";
import { PanelBoard, type PanelBoardItem } from "../_components/PanelBoard";
import {
  isStale,
  medianNet,
  sizeFlag,
  waitingFlag,
  waitLabel,
  type PanelFlag,
} from "../_components/PanelFlags";
import { PanelSummary, type PanelStat } from "../_components/PanelSummary";
import { SubmissionDetail } from "../_components/SubmissionDetail";
import { FinanceRow } from "./FinanceRow";

export const metadata: Metadata = { title: "Finance panel" };

// Everything a panel row needs, shared by both sections.
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
 * When a request landed on finance's desk: the most recent hand-off from the
 * admins, read off the audit trail. Not the filing date — a request declined
 * twice and approved this morning has been finance's problem for an hour, not
 * a fortnight, and every wait shown on this page keys off that.
 */
function approvedAt(
  events: readonly { toStatus: string; createdAt: Date }[],
): Date | null {
  const handoff = [...events]
    .reverse()
    .find((e) => e.toStatus === "APPROVED_BY_ADMIN");
  return handoff?.createdAt ?? null;
}

/**
 * The finance stage (valera@): every admin-approved request awaiting payment,
 * across all periods — approvals may cross the filing cutoff by design.
 * Confirm writes the money back (fine deduction, consumed bonuses) and closes
 * the request; send-back returns it to the admin panel with a note. Finance
 * sees only this panel, never the admin one.
 *
 * The panel is built around the payout run rather than around one request at a
 * time: the summary says what is about to move, the source grid splits it the
 * way the accounting sheet does (finance pays out per source and reconciles
 * against that column), and search / sort / filters all run in the browser
 * over rows the page already loaded.
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

  // Both queries share ROW_SELECT, so one alias covers every row on the page.
  type FinanceSubmission = (typeof awaiting)[number];

  const awaitingTotal = awaiting.reduce((s, x) => s + x.netTotal, 0);
  const sourceCount = new Set(awaiting.map((s) => s.paymentMethod)).size;
  // "Typical" for this payout run — what an unusually large net is measured
  // against. Null for a small run, where a median describes nothing.
  const median = medianNet(awaiting.map((s) => s.netTotal));

  // Who has been waiting longest, and the single biggest cheque in the run:
  // the two things worth knowing before starting to move money.
  const waits = awaiting
    .map((s) => ({ s, since: approvedAt(s.events) }))
    .sort(
      (a, b) =>
        (a.since?.getTime() ?? Number.POSITIVE_INFINITY) -
        (b.since?.getTime() ?? Number.POSITIVE_INFINITY),
    );
  const oldest = waits[0] ?? null;
  const largest = awaiting.reduce<FinanceSubmission | null>(
    (best, s) => (best === null || s.netTotal > best.netTotal ? s : best),
    null,
  );

  const paidTotal = paid.reduce((s, x) => s + x.netTotal, 0);
  const latestPaidAt = paid[0]?.processedAt ?? null;

  const nameOf = (s: FinanceSubmission) => s.user.name ?? s.user.email ?? "—";

  const stats: PanelStat[] = [
    {
      label: "To pay now",
      value: formatMoney(awaitingTotal),
      hint:
        awaiting.length > 0
          ? `${awaiting.length} ${awaiting.length === 1 ? "request" : "requests"} · ${sourceCount} ${sourceCount === 1 ? "source" : "sources"}`
          : "Nothing awaiting payment",
      tone: awaiting.length > 0 ? "brand" : "muted",
    },
    {
      label: "Longest wait",
      value: waitLabel(oldest?.since ?? null, now),
      hint: oldest ? nameOf(oldest.s) : "Nothing waiting",
      tone: isStale(oldest?.since ?? null, now) ? "accent" : "muted",
    },
    {
      label: "Largest single",
      value: largest ? formatMoney(largest.netTotal) : "—",
      hint: largest ? nameOf(largest) : "Nothing awaiting payment",
      tone: "ink",
    },
    {
      label: "Paid recently",
      value: formatMoney(paidTotal),
      hint: latestPaidAt
        ? `Last ${paid.length} payouts · latest ${formatDateTimeTz(latestPaidAt)}`
        : "No payouts recorded yet",
      tone: paid.length > 0 ? "good" : "muted",
    },
  ];

  /**
   * One row, ready to render. `canAct` is presentation only — the confirm and
   * send-back actions re-check the finance role and the status themselves, so
   * a row rendered read-only is not what makes it read-only.
   */
  const row = (s: FinanceSubmission, canAct: boolean) => {
    const av = resolveAvatar(s.user.avatar, s.user.email ?? s.user.id);
    const label = payrollPeriodLabel(s.period.year, s.period.month);
    const since = canAct ? approvedAt(s.events) : null;
    const metaLine = canAct
      ? `${label}${since ? ` · approved ${formatDateTimeTz(since)}` : s.lastSubmittedAt ? ` · filed ${formatDateTimeTz(s.lastSubmittedAt)}` : ""}`
      : `${label}${s.processedAt ? ` · paid ${formatDateTimeTz(s.processedAt)}` : ""}`;
    // Only the payout run carries flags — a paid row has nobody waiting on it
    // and no batch to be unusual within.
    const flags = canAct
      ? [waitingFlag(since, now), sizeFlag(s.netTotal, median)].filter(
          (f): f is PanelFlag => f !== null,
        )
      : [];

    return (
      <FinanceRow
        key={s.id}
        submissionId={s.id}
        canAct={canAct}
        summary={{
          name: nameOf(s),
          deptLine: departmentLine(s.user.memberships),
          emoji: av.emoji,
          bg: av.bg,
          metaLine,
          netLabel: formatMoney(s.netTotal),
          flags,
          sourceLabel: PAYROLL_METHOD_LABEL[s.paymentMethod],
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
            paymentLine: paymentSummary(
              s.paymentMethod,
              parsePaymentDetails(s.paymentDetails),
            ),
            events: eventViews(s.events, formatDateTimeTz),
          }}
        />
      </FinanceRow>
    );
  };

  // Built from `waits`, not from the query order: the default order of the
  // panel is then "longest at this desk first", which is what a payout run
  // should work down. The query's own order is by filing date, which drifts
  // from the hand-off date whenever a request bounced back and forth.
  const items: PanelBoardItem[] = waits.map(({ s, since }) => {
    return {
      id: s.id,
      name: nameOf(s),
      departments: s.user.memberships.map((m) => m.department.name),
      status: s.status,
      statusLabel: PAYROLL_STATUS_LABEL[s.status],
      method: s.paymentMethod,
      net: s.netTotal,
      waitingSince: since?.getTime() ?? null,
      periodKey: `${s.period.year}-${String(s.period.month).padStart(2, "0")}`,
      periodLabel: payrollPeriodLabel(s.period.year, s.period.month),
      node: row(s, true),
    };
  });

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Finance panel</h1>
          <p className="mt-1 text-sm text-muted-fg">
            Everything the admins have approved, waiting on payment. Confirming
            records the fine deduction on the ledger and closes the request.
          </p>
        </div>
        <BackLink href="/payroll" label="Payroll" />
      </header>

      <PanelSummary stats={stats} />

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
          <PanelBoard
            items={items}
            searchPlaceholder="Search name, department, source or month…"
            sourceNote="Pay out per source, then reconcile against the sheet."
            emptyHint="No approved requests match these filters."
          />
        )}
      </section>

      {paid.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 px-1 text-sm font-semibold text-ink">
            Recently paid
          </h2>
          <p className="mb-3 px-1 text-xs text-muted-fg">
            The last {paid.length} payouts — {formatMoney(paidTotal)} out the
            door. Kept plain on purpose: this side is a record, not a worklist.
          </p>
          <ul className="flex flex-col gap-2">
            {paid.map((s) => row(s, false))}
          </ul>
        </section>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { assertApproved } from "@/lib/approval";
import { prisma } from "@/lib/prisma";
import { BackLink } from "@/app/_components/BackLink";
import { formatDateTimeTz, formatYmd, toYmd } from "@/lib/dates";
import { PENALTY_LABEL } from "@/lib/penalties";
import {
  ensureCurrentPeriod,
  expireLapsedSubmissions,
  formatTashkent,
  inFlightSubmission,
  pullLedgerSnapshot,
  reconcilePayrollReminders,
} from "@/lib/payroll";
import {
  parsePaymentDetails,
  paymentSummary,
  payrollEventLabel,
  payrollMonthName,
  payrollPeriodLabel,
  PAYROLL_STATUS_BADGE,
  PAYROLL_STATUS_LABEL,
} from "@/lib/payrollTypes";
import { formatMoney } from "@/lib/penalties";
import { PayrollForm } from "./_components/PayrollForm";
import type { LedgerLineView } from "./_components/LedgerBreakdown";
import {
  SubmissionView,
  type SubmissionViewModel,
} from "./_components/SubmissionView";

export const metadata: Metadata = { title: "Payroll" };

/**
 * The employee's payroll home: file this month's pay request (or refile after
 * a decline), watch it move through review, and reach every past invoice.
 * One request per calendar month; missing the cutoff carries no penalty — the
 * next month's snapshot sweeps up whatever is still unpaid.
 */
export default async function PayrollPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  await assertApproved(session.user);

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      memberships: { select: { id: true }, take: 1 },
    },
  });
  if (!me) redirect("/signin");
  if (me.memberships.length === 0) redirect("/onboarding");

  // The lazy sweeps every payroll surface runs before reading: lapse dead
  // decline windows, and fire the once-per-period filing reminder when due.
  const now = new Date();
  await expireLapsedSubmissions(now);
  await reconcilePayrollReminders(now);
  const period = await ensureCurrentPeriod(prisma, now);
  const label = payrollPeriodLabel(period.year, period.month);
  const filingOpen = now <= period.filingClosesAt;

  const current = await prisma.payrollSubmission.findUnique({
    where: { userId_periodId: { userId: me.id, periodId: period.id } },
    select: {
      id: true,
      status: true,
      baseSalary: true,
      bonusesTotal: true,
      finesTotal: true,
      expensesTotal: true,
      netTotal: true,
      paymentMethod: true,
      paymentDetails: true,
      resubmitDeadline: true,
      processedAt: true,
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
    },
  });

  const history = await prisma.payrollSubmission.findMany({
    where: { userId: me.id, NOT: { periodId: period.id } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      netTotal: true,
      submittedAt: true,
      period: { select: { year: true, month: true } },
    },
  });

  // Prefill the form with how this person was paid last time.
  const latest = await prisma.payrollSubmission.findFirst({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    select: { baseSalary: true, paymentMethod: true, paymentDetails: true },
  });
  const prefill = {
    baseSalary: latest?.baseSalary ?? null,
    method: latest?.paymentMethod ?? ("CASH" as const),
    details: parsePaymentDetails(latest?.paymentDetails),
  };

  const canFileFresh = !current && filingOpen;
  const canResubmit = current?.status === "DECLINED"; // lapsed ones were swept above
  const blocking = canFileFresh ? await inFlightSubmission(prisma, me.id) : null;

  const dateOf = (d: Date) => formatYmd(toYmd(d), period.year);
  const snapshot =
    (canFileFresh && !blocking) || canResubmit
      ? await pullLedgerSnapshot(prisma, me.id).then((s) => ({
          bonuses: s.bonusLines.map((l) => ({
            id: l.bonusId,
            label: "Bonus",
            dateLabel: dateOf(l.awardedAt),
            note: l.note,
            amount: l.amount,
          })),
          fines: s.fineLines.map((l) => ({
            id: l.penaltyId,
            label: PENALTY_LABEL[l.type],
            dateLabel: dateOf(l.issuedAt),
            note: l.note,
            amount: l.amount,
          })),
          bonusesTotal: s.bonusesTotal,
          finesTotal: s.finesTotal,
        }))
      : null;

  // The last decline's note, for the reopened form's banner.
  const declineNote =
    canResubmit && current
      ? (current.events.findLast((e) => e.toStatus === "DECLINED")?.note ?? null)
      : null;

  const view: SubmissionViewModel | null =
    current && !canResubmit
      ? {
          id: current.id,
          status: current.status,
          banner:
            current.status === "SUBMITTED"
              ? {
                  tone: "border-brand/30 bg-brand-soft text-brand",
                  text: "Awaiting admin review — you'll get a notification when it moves.",
                }
              : current.status === "APPROVED_BY_ADMIN"
                ? {
                    tone: "border-accent/40 bg-accent-soft text-accent-ink",
                    text: "Approved by the admins — with finance for payment.",
                  }
                : current.status === "PROCESSED"
                  ? {
                      tone: "border-green-200 bg-green-50/60 text-green-800",
                      text: `Paid out${current.processedAt ? ` · ${formatDateTimeTz(current.processedAt)}` : ""}. The fine deduction was recorded on your ledger.`,
                    }
                  : current.status === "EXPIRED"
                    ? {
                        tone: "border-line bg-canvas text-muted-fg",
                        text: "The resubmit window lapsed. No penalty — file again in next month's cycle; anything unpaid rolls into that snapshot automatically.",
                      }
                    : null,
          baseSalary: current.baseSalary,
          bonusesTotal: current.bonusesTotal,
          finesTotal: current.finesTotal,
          expensesTotal: current.expensesTotal,
          netTotal: current.netTotal,
          bonuses: current.bonusLines.map(
            (l): LedgerLineView => ({
              id: l.id,
              label: "Bonus",
              dateLabel: dateOf(l.awardedAt),
              note: l.note,
              amount: l.amount,
            }),
          ),
          fines: current.fineLines.map(
            (l): LedgerLineView => ({
              id: l.id,
              label: PENALTY_LABEL[l.type],
              dateLabel: dateOf(l.issuedAt),
              note: l.note,
              amount: l.amount,
            }),
          ),
          expenses: current.expenses,
          paymentLine: paymentSummary(
            current.paymentMethod,
            parsePaymentDetails(current.paymentDetails),
          ),
          events: current.events.map((e) => ({
            id: e.id,
            label: payrollEventLabel(e.fromStatus, e.toStatus),
            actorName: e.actor ? (e.actor.name ?? e.actor.email ?? null) : null,
            dateLabel: formatDateTimeTz(e.createdAt),
            note: e.note,
          })),
        }
      : null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Payroll</h1>
          <p className="mt-1 text-sm text-muted-fg">
            One pay request per calendar month — your bonuses and fines are
            pulled in automatically, you add salary and expenses.
          </p>
        </div>
        <BackLink href="/dashboard" label="Dashboard" />
      </header>

      {canResubmit && snapshot && current && current.resubmitDeadline && (
        <PayrollForm
          periodLabel={label}
          closesLabel={formatTashkent(period.filingClosesAt)}
          snapshot={snapshot}
          prefill={{
            baseSalary: current.baseSalary,
            method: current.paymentMethod,
            details: parsePaymentDetails(current.paymentDetails),
          }}
          resubmit={{
            deadlineIso: current.resubmitDeadline.toISOString(),
            deadlineLabel: formatTashkent(current.resubmitDeadline),
            note: declineNote,
          }}
        />
      )}

      {view && <SubmissionView heading={`Your ${label} request`} view={view} />}

      {canFileFresh && blocking && (
        <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">
            {label} filing is waiting on your last request
          </h2>
          <p className="mt-2 text-sm text-muted-fg">
            Your {payrollMonthName(blocking.period.month)} pay request is still
            in review (
            <span className="font-medium text-ink">
              {PAYROLL_STATUS_LABEL[blocking.status]}
            </span>
            ). Filing for {label} unlocks the moment it&rsquo;s processed —
            otherwise the same bonuses and fines would land in two invoices.
          </p>
        </section>
      )}

      {canFileFresh && !blocking && snapshot && (
        <PayrollForm
          periodLabel={label}
          closesLabel={formatTashkent(period.filingClosesAt)}
          snapshot={snapshot}
          prefill={prefill}
          resubmit={null}
        />
      )}

      {!current && !filingOpen && (
        <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">
            {label} filing has closed
          </h2>
          <p className="mt-2 text-sm text-muted-fg">
            Filing closed {formatTashkent(period.filingClosesAt)}. No penalty —
            you&rsquo;ll simply file in next month&rsquo;s cycle, and anything
            unpaid (bonuses, fines) rolls into that snapshot automatically.
          </p>
        </section>
      )}

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 px-1 text-sm font-semibold text-ink">
            Past requests
          </h2>
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-sm font-medium text-ink">
                    {payrollPeriodLabel(h.period.year, h.period.month)}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${PAYROLL_STATUS_BADGE[h.status]}`}
                  >
                    {PAYROLL_STATUS_LABEL[h.status]}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(h.netTotal)}
                  </span>
                  <a
                    href={`/payroll/submissions/${h.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-canvas"
                  >
                    PDF ↗
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

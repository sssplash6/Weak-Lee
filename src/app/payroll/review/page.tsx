import type { Metadata } from "next";
import Link from "next/link";
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
  eligibleEmployees,
  ensureCurrentPeriod,
  expireLapsedSubmissions,
  formatTashkent,
  isPayrollAdmin,
  reconcilePayrollReminders,
} from "@/lib/payroll";
import {
  parsePaymentDetails,
  paymentSummary,
  payrollPeriodLabel,
  isPayrollOpenFor,
  PAYROLL_STATUS_BADGE,
  PAYROLL_STATUS_LABEL,
  type PayrollStatus,
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
import { ReviewRow } from "./ReviewRow";

export const metadata: Metadata = { title: "Review panel" };

// Panel display order: what needs a decision first. DRAFT is deliberately
// absent — it only exists inside the filing transaction, never after a commit.
const STATUS_ORDER: PayrollStatus[] = [
  "SUBMITTED",
  "DECLINED",
  "APPROVED_BY_ADMIN",
  "PROCESSED",
  "EXPIRED",
];

// The month's real money, mirroring the stats page: an EXPIRED filing is never
// paid (it rolls into the next cycle), so it doesn't belong in the total.
const COUNTABLE: PayrollStatus[] = [
  "SUBMITTED",
  "DECLINED",
  "APPROVED_BY_ADMIN",
  "PROCESSED",
];

/**
 * The admin stage of payroll (tech@ + shakhzod@): every request for a period,
 * each row expanding to the full breakdown with approve/decline.
 *
 * The period is the one thing that stays in the URL — it changes which rows
 * are fetched. Everything else a reviewer does to the view (status, search,
 * department, payment source, order) happens in the browser against rows that
 * are already loaded, so working down a month never reloads the page under
 * them. Closed periods also list who never filed — they're not chased, but
 * they're visible.
 */
export default async function PayrollReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  await assertApproved(session.user);
  // Closed: reviewers see the same screen employees do, before any sweep runs.
  if (!isPayrollOpenFor(session.user.email)) return <PayrollComingSoon />;
  if (!isPayrollAdmin(session.user.email)) redirect("/payroll");

  const now = new Date();
  await expireLapsedSubmissions(now);
  await reconcilePayrollReminders(now);
  const currentPeriod = await ensureCurrentPeriod(prisma, now);

  const { p } = await searchParams;

  const periods = await prisma.payrollPeriod.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { id: true, year: true, month: true, filingClosesAt: true },
  });
  const periodKeyOf = (x: { year: number; month: number }) =>
    `${x.year}-${String(x.month).padStart(2, "0")}`;
  const selected =
    periods.find((x) => periodKeyOf(x) === p) ??
    periods.find((x) => x.id === currentPeriod.id) ??
    periods[0];
  const label = payrollPeriodLabel(selected.year, selected.month);
  const periodClosed = now > selected.filingClosesAt;

  const submissions = await prisma.payrollSubmission.findMany({
    where: { periodId: selected.id },
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
      lastSubmittedAt: true,
      resubmitDeadline: true,
      graceDayUsed: true,
      processedAt: true,
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
    },
  });

  // Everything that reached a reviewer, most urgent first, then oldest first
  // inside a status — the order someone working top-down should follow.
  const filed = submissions
    .filter((s) => s.status !== "DRAFT")
    .sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        (a.lastSubmittedAt?.getTime() ?? 0) - (b.lastSubmittedAt?.getTime() ?? 0),
    );

  // Who never filed this period (any non-draft submission counts as filed).
  const employees = await eligibleEmployees(prisma);
  const filedIds = new Set(filed.map((s) => s.user.id));
  const unfiled = employees.filter((e) => !filedIds.has(e.id));

  const awaiting = filed.filter((s) => s.status === "SUBMITTED");
  const awaitingTotal = awaiting.reduce((s, x) => s + x.netTotal, 0);
  const paidCount = filed.filter((s) => s.status === "PROCESSED").length;
  const monthTotal = filed
    .filter((s) => COUNTABLE.includes(s.status))
    .reduce((s, x) => s + x.netTotal, 0);

  // The request that has been sitting unreviewed longest. `filed` is already
  // sorted oldest-first inside each status, so it's the first one awaiting.
  const oldest = awaiting[0] ?? null;
  const oldestSince = oldest?.lastSubmittedAt ?? null;

  // "Typical" for this month, used to flag a net that towers over the rest.
  // Expired filings are excluded so a dead row can't skew the middle.
  const median = medianNet(
    filed.filter((s) => COUNTABLE.includes(s.status)).map((s) => s.netTotal),
  );

  const stats: PanelStat[] = [
    {
      label: "Awaiting review",
      value: String(awaiting.length),
      hint:
        awaiting.length > 0
          ? `${formatMoney(awaitingTotal)} to decide`
          : "Nothing on this desk",
      tone: awaiting.length > 0 ? "brand" : "muted",
    },
    {
      label: "Longest wait",
      value: waitLabel(oldestSince, now),
      hint: oldest
        ? (oldest.user.name ?? oldest.user.email ?? "—")
        : "Nothing waiting",
      tone: isStale(oldestSince, now) ? "accent" : "muted",
    },
    {
      label: `${label} total`,
      value: formatMoney(monthTotal),
      hint: `${filed.length} filed · ${paidCount} paid`,
      tone: "ink",
    },
    {
      label: "Not filed",
      value: String(unfiled.length),
      hint: `Filing ${periodClosed ? "closed" : "closes"} ${formatTashkent(selected.filingClosesAt)}`,
      tone: "muted",
    },
  ];

  const items: PanelBoardItem[] = filed.map((s) => {
    const av = resolveAvatar(s.user.avatar, s.user.email ?? s.user.id);
    const metaLine =
      s.status === "DECLINED" && s.resubmitDeadline
        ? `Resubmit by ${formatTashkent(s.resubmitDeadline)}${s.graceDayUsed ? " · grace day" : ""}`
        : s.status === "PROCESSED" && s.processedAt
          ? `Paid ${formatDateTimeTz(s.processedAt)}`
          : s.lastSubmittedAt
            ? `Filed ${formatDateTimeTz(s.lastSubmittedAt)}`
            : null;
    // Only a request actually awaiting a decision can be "waiting" — one that
    // is with finance or already paid is somebody else's clock.
    const waitingSince = s.status === "SUBMITTED" ? s.lastSubmittedAt : null;
    const flags = [
      waitingFlag(waitingSince, now),
      sizeFlag(s.netTotal, median),
    ].filter((f): f is PanelFlag => f !== null);

    return {
      id: s.id,
      name: s.user.name ?? s.user.email ?? "—",
      departments: s.user.memberships.map((m) => m.department.name),
      status: s.status,
      statusLabel: PAYROLL_STATUS_LABEL[s.status],
      method: s.paymentMethod,
      net: s.netTotal,
      waitingSince: waitingSince?.getTime() ?? null,
      periodKey: periodKeyOf(selected),
      periodLabel: label,
      node: (
        <ReviewRow
          submissionId={s.id}
          canAct={s.status === "SUBMITTED"}
          summary={{
            name: s.user.name ?? s.user.email ?? "—",
            deptLine: departmentLine(s.user.memberships),
            emoji: av.emoji,
            bg: av.bg,
            statusLabel: PAYROLL_STATUS_LABEL[s.status],
            statusBadge: PAYROLL_STATUS_BADGE[s.status],
            netLabel: formatMoney(s.netTotal),
            metaLine,
            flags,
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
              bonuses: bonusLineViews(s.bonusLines, selected.year),
              fines: fineLineViews(s.fineLines, selected.year),
              expenses: s.expenses,
              paymentLine: paymentSummary(
                s.paymentMethod,
                parsePaymentDetails(s.paymentDetails),
              ),
              events: eventViews(s.events, formatDateTimeTz),
            }}
          />
        </ReviewRow>
      ),
    };
  });

  const pillClass = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition ${
      active
        ? "border-brand bg-brand-soft text-brand"
        : "border-line text-muted-fg hover:text-ink"
    }`;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Review panel</h1>
          <p className="mt-1 text-sm text-muted-fg">
            The admin stage for {label}. Approving hands a request to finance;
            declining sends it back with a note, reopening their form until the
            filing deadline.
          </p>
        </div>
        <BackLink href="/payroll" label="Payroll" />
      </header>

      <PanelSummary stats={stats} />

      {periods.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {periods.map((x) => {
            const key = periodKeyOf(x);
            return (
              <Link
                key={x.id}
                href={`/payroll/review?p=${key}`}
                className={pillClass(x.id === selected.id)}
              >
                {payrollPeriodLabel(x.year, x.month)}
              </Link>
            );
          })}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center">
          <p className="text-sm font-semibold text-ink">Nothing filed yet</p>
          <p className="mt-1 text-xs text-muted-fg">
            {label} requests land here the moment someone files.
          </p>
        </div>
      ) : (
        <PanelBoard
          items={items}
          sourceNote="How the month splits across the accounting sheet’s sources."
          emptyHint={`No ${label} requests match these filters.`}
        />
      )}

      {periodClosed && unfiled.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 px-1 text-sm font-semibold text-ink">
            Did not file
          </h2>
          <p className="mb-3 px-1 text-xs text-muted-fg">
            Nobody here is chased or penalized — they simply file in the next
            month&rsquo;s cycle, and that snapshot sweeps up anything unpaid.
          </p>
          <ul className="flex flex-col gap-1.5">
            {unfiled.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate text-ink">
                  {e.name ?? e.email ?? "—"}
                </span>
                <span className="shrink-0 text-xs text-muted-fg">
                  Files next cycle
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

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
  PAYROLL_CLOSED,
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
import { SubmissionDetail } from "../_components/SubmissionDetail";
import { ReviewRow } from "./ReviewRow";

export const metadata: Metadata = { title: "Payroll review" };

// Queue display order: what needs a decision first.
const STATUS_ORDER: PayrollStatus[] = [
  "SUBMITTED",
  "DECLINED",
  "APPROVED_BY_ADMIN",
  "PROCESSED",
  "EXPIRED",
];

const FILTERABLE: PayrollStatus[] = STATUS_ORDER;

/**
 * The admin stage of payroll (tech@ + shakhzod@): every request for a period,
 * filterable by status and department, each row expanding to the full
 * breakdown with approve/decline. Closed periods also list who never filed —
 * they're not chased, but they're visible.
 */
export default async function PayrollReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; status?: string; dept?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  await assertApproved(session.user);
  // Closed: reviewers see the same screen employees do, before any sweep runs.
  if (PAYROLL_CLOSED) return <PayrollComingSoon />;
  if (!isPayrollAdmin(session.user.email)) redirect("/payroll");

  const now = new Date();
  await expireLapsedSubmissions(now);
  await reconcilePayrollReminders(now);
  const currentPeriod = await ensureCurrentPeriod(prisma, now);

  const { p, status: statusParam, dept } = await searchParams;
  const statusFilter = FILTERABLE.includes(statusParam as PayrollStatus)
    ? (statusParam as PayrollStatus)
    : null;

  const periods = await prisma.payrollPeriod.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { id: true, year: true, month: true, filingClosesAt: true },
  });
  const selected =
    periods.find((x) => `${x.year}-${String(x.month).padStart(2, "0")}` === p) ??
    periods.find((x) => x.id === currentPeriod.id) ??
    periods[0];
  const label = payrollPeriodLabel(selected.year, selected.month);
  const periodClosed = now > selected.filingClosesAt;

  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    select: { name: true },
  });

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

  const filtered = submissions
    .filter((s) => !statusFilter || s.status === statusFilter)
    .filter(
      (s) =>
        !dept || s.user.memberships.some((m) => m.department.name === dept),
    )
    .sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        (a.lastSubmittedAt?.getTime() ?? 0) - (b.lastSubmittedAt?.getTime() ?? 0),
    );

  // Who never filed this period (any non-draft submission counts as filed).
  const employees = await eligibleEmployees(prisma);
  const filedIds = new Set(
    submissions.filter((s) => s.status !== "DRAFT").map((s) => s.user.id),
  );
  const unfiled = employees.filter((e) => !filedIds.has(e.id));

  const counts = new Map<PayrollStatus, number>();
  for (const s of submissions) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);

  const href = (patch: { p?: string; status?: string | null; dept?: string | null }) => {
    const q = new URLSearchParams();
    const nextP = "p" in patch ? patch.p : p;
    const nextStatus = "status" in patch ? patch.status : statusFilter;
    const nextDept = "dept" in patch ? patch.dept : dept;
    if (nextP) q.set("p", nextP);
    if (nextStatus) q.set("status", nextStatus);
    if (nextDept) q.set("dept", nextDept);
    const qs = q.toString();
    return `/payroll/review${qs ? `?${qs}` : ""}`;
  };

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
          <h1 className="mt-1 text-2xl font-bold text-ink">Payroll review</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {label}: {submissions.length} filed
            {counts.get("SUBMITTED") ? (
              <>
                ,{" "}
                <span className="font-semibold text-brand">
                  {counts.get("SUBMITTED")} awaiting review
                </span>
              </>
            ) : null}
            {unfiled.length > 0 && <>, {unfiled.length} not filed</>}. Filing{" "}
            {periodClosed ? "closed" : "closes"}{" "}
            {formatTashkent(selected.filingClosesAt)}.
          </p>
        </div>
        <BackLink href="/payroll" label="Payroll" />
      </header>

      {periods.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {periods.map((x) => {
            const key = `${x.year}-${String(x.month).padStart(2, "0")}`;
            return (
              <Link
                key={x.id}
                href={href({ p: key })}
                className={pillClass(x.id === selected.id)}
              >
                {payrollPeriodLabel(x.year, x.month)}
              </Link>
            );
          })}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={href({ status: null })} className={pillClass(!statusFilter)}>
          All
        </Link>
        {FILTERABLE.map((s) => (
          <Link key={s} href={href({ status: s })} className={pillClass(statusFilter === s)}>
            {PAYROLL_STATUS_LABEL[s]}
            {counts.get(s) ? ` · ${counts.get(s)}` : ""}
          </Link>
        ))}
      </div>

      {departments.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Link href={href({ dept: null })} className={pillClass(!dept)}>
            All departments
          </Link>
          {departments.map((d) => (
            <Link key={d.name} href={href({ dept: d.name })} className={pillClass(dept === d.name)}>
              {d.name}
            </Link>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center">
          <p className="text-sm font-semibold text-ink">Nothing here</p>
          <p className="mt-1 text-xs text-muted-fg">
            No {label} requests match these filters.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((s) => {
            const av = resolveAvatar(s.user.avatar, s.user.email ?? s.user.id);
            const metaLine =
              s.status === "DECLINED" && s.resubmitDeadline
                ? `Resubmit by ${formatTashkent(s.resubmitDeadline)}${s.graceDayUsed ? " · grace day" : ""}`
                : s.status === "PROCESSED" && s.processedAt
                  ? `Paid ${formatDateTimeTz(s.processedAt)}`
                  : s.lastSubmittedAt
                    ? `Filed ${formatDateTimeTz(s.lastSubmittedAt)}`
                    : null;
            return (
              <ReviewRow
                key={s.id}
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
            );
          })}
        </ul>
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

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { assertApproved } from "@/lib/approval";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { departmentLine } from "@/lib/team";
import { COMPANY_TIME_ZONE, formatDateTimeTz, formatYmd } from "@/lib/dates";
import { BackLink } from "@/app/_components/BackLink";
import {
  canViewPayrollStats,
  ensureCurrentPeriod,
  expireLapsedSubmissions,
  isFinance,
  reconcilePayrollReminders,
} from "@/lib/payroll";
import {
  payrollPeriodLabel,
  PAYROLL_CLOSED,
  PAYROLL_METHOD_LABEL,
  type PayrollStatus,
} from "@/lib/payrollTypes";
import { PayrollComingSoon } from "../_components/PayrollComingSoon";
import { SheetTable, type SheetRow } from "./SheetTable";

export const metadata: Metadata = { title: "Accounting sheet" };

/**
 * What belongs on a payout register. DRAFT never leaves the filing transaction,
 * and an EXPIRED filing is never paid — it rolls into the next cycle — so
 * neither is a line in this month's money. Same set the review and stats pages
 * count, which is what makes the totals here reconcile with theirs.
 */
const COUNTABLE: PayrollStatus[] = [
  "SUBMITTED",
  "DECLINED",
  "APPROVED_BY_ADMIN",
  "PROCESSED",
];

/**
 * The company's calendar day as "YYYY-MM-DD".
 *
 * lib/dates offers a UTC calendar day (`toYmd`) and a full Tashkent stamp
 * (`formatDateTimeTz`), and neither is what a register's Date column wants: a
 * request filed at 21:00 Tashkent is already the next day in UTC, so `toYmd`
 * would file it under tomorrow. en-CA is the locale whose short date is
 * already in ISO order, which both `formatYmd` and a spreadsheet can read.
 */
const tashkentYmd = new Intl.DateTimeFormat("en-CA", {
  timeZone: COMPANY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The accounting sheet: the finance team's monthly register, inside the app.
 *
 * Their "Accounting 2026" spreadsheet keeps one dense tab per month — a row
 * per payout with the USD arithmetic next to what actually left which account.
 * The app already knows the arithmetic (salary, bonus, penalty, net) but not
 * the settlement, so the three columns that carry it (UZS, SGD, Wise fee) are
 * editable here and stored on the submission itself. Everything else on the
 * row is derived and read-only.
 *
 * The period is the only thing in the URL, exactly as on /payroll/review: it
 * changes which rows are fetched, and the sheet's own month tabs are the same
 * idea. Nothing else about this view is filterable — a register is read whole.
 */
export default async function PayrollSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  await assertApproved(session.user);
  // Closed: reviewers see the same screen employees do, before any sweep runs.
  if (PAYROLL_CLOSED) return <PayrollComingSoon />;
  // Reading the register is for everyone who reviews money; recording a figure
  // is narrower (see below), and the action enforces that side independently.
  if (!canViewPayrollStats(session.user.email)) redirect("/dashboard");

  const now = new Date();
  await expireLapsedSubmissions(now);
  await reconcilePayrollReminders(now);
  const currentPeriod = await ensureCurrentPeriod(prisma, now);

  const { p } = await searchParams;

  const periods = await prisma.payrollPeriod.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { id: true, year: true, month: true },
  });
  const periodKeyOf = (x: { year: number; month: number }) =>
    `${x.year}-${String(x.month).padStart(2, "0")}`;
  const selected =
    periods.find((x) => periodKeyOf(x) === p) ??
    periods.find((x) => x.id === currentPeriod.id) ??
    periods[0];
  const label = payrollPeriodLabel(selected.year, selected.month);
  const periodKey = periodKeyOf(selected);

  /**
   * Only finance and global admins may record a payout figure — approving a
   * request and writing down what settled it are different jobs, which is why
   * the payroll-admin stage is deliberately absent from this test. It is the
   * same condition `requireSheetEditor` in ./actions.ts applies; this copy
   * only decides whether the cells look editable, and is never the guard.
   */
  const editable = isFinance(session.user.email) || isAdmin(session.user.email);

  const submissions = await prisma.payrollSubmission.findMany({
    where: { periodId: selected.id, status: { in: COUNTABLE } },
    // Ordered in the query as well as below. Postgres returns an unordered
    // heap, and updating a row physically moves it — without this, recording
    // one figure reshuffled the register under the person doing it, which is
    // how a number ends up typed against the wrong name.
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      baseSalary: true,
      bonusesTotal: true,
      finesTotal: true,
      netTotal: true,
      paymentMethod: true,
      amountUzs: true,
      amountSgdCents: true,
      wiseFeeCents: true,
      submittedAt: true,
      lastSubmittedAt: true,
      user: {
        select: {
          name: true,
          email: true,
          memberships: {
            select: { role: true, department: { select: { name: true } } },
          },
        },
      },
    },
  });

  // A register reads chronologically, oldest first — the order the money
  // moved, and the order finance works down their own tab. The fallback to
  // `lastSubmittedAt` can't be expressed in the query, so the final ordering
  // happens here; `id` breaks the tie, because two people filing in the same
  // second is ordinary and the rows must not swap places between renders.
  const filedAt = (s: { submittedAt: Date | null; lastSubmittedAt: Date | null }) =>
    s.submittedAt ?? s.lastSubmittedAt;
  const ordered = [...submissions].sort(
    (a, b) =>
      (filedAt(a)?.getTime() ?? 0) - (filedAt(b)?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  );

  const rows: SheetRow[] = ordered.map((s) => {
    // When the request was filed: the first submit, which is the date the
    // sheet records. `lastSubmittedAt` only stands in for rows written before
    // `submittedAt` existed, and the column is nullable in the schema.
    const at = filedAt(s);
    const ymd = at ? tashkentYmd.format(at) : "";
    return {
      id: s.id,
      // The year is in the page heading, so the cell drops it and stays narrow.
      dateLabel: at ? formatYmd(ymd, selected.year) : "—",
      dateYmd: ymd,
      dateTitle: at ? formatDateTimeTz(at) : "Filing date unknown",
      name: s.user.name ?? s.user.email ?? "—",
      deptLine: departmentLine(s.user.memberships),
      amountUzs: s.amountUzs,
      amountSgdCents: s.amountSgdCents,
      wiseFeeCents: s.wiseFeeCents,
      sourceLabel: PAYROLL_METHOD_LABEL[s.paymentMethod],
      baseSalary: s.baseSalary,
      bonusesTotal: s.bonusesTotal,
      finesTotal: s.finesTotal,
      netTotal: s.netTotal,
    };
  });

  // Named separately so the copy under the table can say so: a month with
  // expired filings is short a few rows, and silently dropping them would look
  // like the register had lost something.
  const expiredCount = await prisma.payrollSubmission.count({
    where: { periodId: selected.id, status: "EXPIRED" },
  });

  const pillClass = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition ${
      active
        ? "border-brand bg-brand-soft text-brand"
        : "border-line text-muted-fg hover:text-ink"
    }`;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Accounting sheet</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {`${label} as a register — one line per request, in the same columns as the finance team's monthly tab. `}
            {editable
              ? "UZS, SGD and the Wise fee are yours to fill in as each payment settles."
              : "The settled amounts are recorded by finance."}
          </p>
        </div>
        <BackLink href="/payroll" label="Payroll" />
      </header>

      {periods.length > 1 && (
        // The sheet's month tabs, as pills. Same control as /payroll/review so
        // moving between the two panels doesn't change how a month is picked.
        <div className="mb-4 flex flex-wrap gap-2">
          {periods.map((x) => (
            <Link
              key={x.id}
              href={`/payroll/sheet?p=${periodKeyOf(x)}`}
              className={pillClass(x.id === selected.id)}
            >
              {payrollPeriodLabel(x.year, x.month)}
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center">
          <p className="text-sm font-semibold text-ink">Nothing to register</p>
          <p className="mt-1 text-xs text-muted-fg">
            {label} requests appear here the moment someone files.
          </p>
        </div>
      ) : (
        <SheetTable rows={rows} editable={editable} periodKey={periodKey} />
      )}

      {expiredCount > 0 && (
        <p className="mt-3 px-1 text-xs text-muted-fg">
          {`${expiredCount} expired ${expiredCount === 1 ? "filing is" : "filings are"} not listed — an expired request is never paid, it rolls into the next month's cycle.`}
        </p>
      )}
    </main>
  );
}

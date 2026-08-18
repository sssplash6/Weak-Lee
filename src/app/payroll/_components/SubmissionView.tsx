// Read-only view of a filed pay request — what the employee sees once their
// submission is in (or through) review: status, the frozen snapshot breakdown,
// expenses with receipts, how they'll be paid, the invoice PDF, and the full
// audit trail. Server-rendered; nothing here mutates.

import { formatMoney } from "@/lib/penalties";
import {
  PAYROLL_STATUS_BADGE,
  PAYROLL_STATUS_LABEL,
  type PayrollStatus,
} from "@/lib/payrollTypes";
import { LedgerBreakdown, type LedgerLineView } from "./LedgerBreakdown";

export type SubmissionEventView = {
  id: string;
  label: string;
  actorName: string | null; // null = the system
  dateLabel: string;
  note: string | null;
};

export type SubmissionExpenseView = {
  id: string;
  label: string;
  amount: number;
  receipt: { id: string; filename: string } | null;
};

export type SubmissionViewModel = {
  id: string;
  status: PayrollStatus;
  banner: { tone: string; text: string } | null;
  baseSalary: number;
  bonusesTotal: number;
  finesTotal: number;
  expensesTotal: number;
  netTotal: number;
  bonuses: LedgerLineView[];
  fines: LedgerLineView[];
  expenses: SubmissionExpenseView[];
  paymentLine: string;
  events: SubmissionEventView[];
};

export function SubmissionView({
  heading,
  view,
}: {
  heading: string;
  view: SubmissionViewModel;
}) {
  const mathRows: { label: string; value: string; tone?: string }[] = [
    { label: "Base salary", value: formatMoney(view.baseSalary) },
    { label: "Bonuses", value: `+ ${formatMoney(view.bonusesTotal)}`, tone: "text-green-700" },
    { label: "Fines", value: `− ${formatMoney(view.finesTotal)}`, tone: "text-red-600" },
    { label: "Expenses", value: `+ ${formatMoney(view.expensesTotal)}` },
  ];

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{heading}</h2>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${PAYROLL_STATUS_BADGE[view.status]}`}
        >
          {PAYROLL_STATUS_LABEL[view.status]}
        </span>
      </div>

      {view.banner && (
        <div className={`mt-3 rounded-lg border p-3 text-sm ${view.banner.tone}`}>
          {view.banner.text}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-line bg-canvas/60 p-3">
        <dl className="flex flex-col gap-1">
          {mathRows.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-sm">
              <dt className="text-muted-fg">{r.label}</dt>
              <dd className={`font-medium tabular-nums ${r.tone ?? "text-ink"}`}>
                {r.value}
              </dd>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
            <dt className="text-sm font-semibold text-ink">Total</dt>
            <dd className="text-base font-bold tabular-nums text-ink">
              {formatMoney(view.netTotal)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4">
        <LedgerBreakdown
          bonuses={view.bonuses}
          fines={view.fines}
          bonusesTotal={view.bonusesTotal}
          finesTotal={view.finesTotal}
        />
      </div>

      {view.expenses.length > 0 && (
        <div className="mt-4 rounded-lg border border-line p-3">
          <h4 className="text-xs font-semibold text-ink">Expenses</h4>
          <ul className="mt-2 flex flex-col">
            {view.expenses.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 border-t border-line py-1.5 text-xs first:border-t-0"
              >
                <span className="min-w-0 text-ink">
                  {e.label}
                  {e.receipt && (
                    <>
                      {" "}
                      <a
                        href={`/payroll/receipts/${e.receipt.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-brand hover:underline"
                      >
                        receipt ↗
                      </a>
                    </>
                  )}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-ink">
                  + {formatMoney(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-fg">
          Paying to: <span className="font-medium text-ink">{view.paymentLine}</span>
        </p>
        <a
          href={`/payroll/submissions/${view.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 whitespace-nowrap rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-brand shadow-sm transition hover:bg-canvas"
        >
          Invoice PDF ↗
        </a>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
          History
        </h4>
        <ul className="mt-2 flex flex-col gap-1.5">
          {view.events.map((e) => (
            <li key={e.id} className="text-xs text-muted-fg">
              <span className="font-medium text-ink">{e.label}</span>
              {e.actorName && <> · {e.actorName}</>}
              <> · {e.dateLabel}</>
              {e.note && <p className="mt-0.5 italic">“{e.note}”</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

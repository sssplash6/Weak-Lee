"use client";

import { Fragment, useState, useTransition } from "react";
import { formatMoney } from "@/lib/penalties";
import { markFinesPaidInFull, setFinesPaid } from "../../admin/actions";
import { REASONS } from "../reasons";

// One issued fine, ready to render. `reasonIndex` points into REASONS (falls
// back to the "Other" column server-side, so it's always valid).
export type MatrixFine = {
  id: string;
  reasonIndex: number;
  note: string | null;
  dateLabel: string;
  amount: number;
};

export type MatrixRow = {
  id: string;
  name: string;
  department: string | null;
  emoji: string;
  bg: string;
  cells: number[]; // summed per REASONS column
  total: number;
  paid: number; // amount paid back so far (0..total)
  fines: MatrixFine[]; // newest first
};

/**
 * The "Current penalties" matrix. Every employee with fines is tappable —
 * expanding their row reveals the individual fines behind the totals. Admins
 * additionally get a payment column: record how much each person has paid back,
 * or mark it fully settled; fully-paid rows read green.
 */
export function PenaltyMatrix({
  rows,
  grandTotal,
  grandOutstanding,
  viewerIsAdmin,
}: {
  rows: MatrixRow[];
  grandTotal: number;
  grandOutstanding: number;
  viewerIsAdmin: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[52rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
            <th className="px-4 py-3 font-semibold">Employee</th>
            {REASONS.map((r) => (
              <th key={r.type} className="px-3 py-3 font-semibold">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${r.dot}`}
                    aria-hidden="true"
                  />
                  {r.label}
                </span>
              </th>
            ))}
            <th className="px-4 py-3 text-right font-semibold">Total</th>
            <th className="px-4 py-3 font-semibold">
              {viewerIsAdmin ? "Paid back" : "Payment"}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const canExpand = r.fines.length > 0;
            const open = openId === r.id;
            const fullyPaid = r.total > 0 && r.paid >= r.total;
            return (
              <Fragment key={r.id}>
                <tr
                  onClick={() => canExpand && setOpenId(open ? null : r.id)}
                  aria-expanded={canExpand ? open : undefined}
                  className={`border-b border-line transition last:border-b-0 ${
                    canExpand ? "cursor-pointer hover:bg-canvas/60" : ""
                  } ${
                    open
                      ? "bg-canvas/60"
                      : fullyPaid
                        ? "bg-green-50/60"
                        : ""
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${r.bg}`}
                        aria-hidden="true"
                      >
                        {r.emoji}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
                          {r.name}
                        </span>
                        {r.department && (
                          <span className="block truncate text-xs text-muted-fg">
                            {r.department}
                          </span>
                        )}
                      </span>
                      {canExpand && (
                        <span
                          className={`shrink-0 text-muted-fg transition ${
                            open ? "rotate-90" : ""
                          }`}
                          aria-hidden="true"
                        >
                          ›
                        </span>
                      )}
                    </span>
                  </td>
                  {r.cells.map((amount, i) => (
                    <td key={REASONS[i].type} className="px-3 py-2.5">
                      {amount > 0 ? (
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${REASONS[i].chip}`}
                        >
                          {formatMoney(amount)}
                        </span>
                      ) : (
                        <span className="text-muted-fg">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right">
                    {r.total > 0 ? (
                      <span
                        className={`font-bold tabular-nums ${
                          fullyPaid ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatMoney(r.total)}
                      </span>
                    ) : (
                      <span className="text-muted-fg">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <PaidCell
                      id={r.id}
                      total={r.total}
                      paid={r.paid}
                      viewerIsAdmin={viewerIsAdmin}
                    />
                  </td>
                </tr>
                {open && (
                  <tr className="border-b border-line last:border-b-0">
                    <td colSpan={3 + REASONS.length} className="px-4 pb-3 pt-1">
                      <ul className="rise-in flex flex-col">
                        {r.fines.map((f) => {
                          const reason = REASONS[f.reasonIndex];
                          return (
                            <li
                              key={f.id}
                              className="flex items-center gap-3 border-t border-line py-2 first:border-t-0"
                            >
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${reason.dot}`}
                                aria-hidden="true"
                              />
                              <span className="min-w-0 flex-1 truncate text-ink">
                                {reason.label}
                                {f.note && (
                                  <span className="text-muted-fg">
                                    {" "}
                                    · {f.note}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-[11px] text-muted-fg">
                                {f.dateLabel}
                              </span>
                              <span className="shrink-0 text-xs font-bold tabular-nums text-red-600">
                                {formatMoney(f.amount)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        {grandTotal > 0 && (
          <tfoot>
            <tr className="border-t border-line bg-canvas/60">
              <td
                className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-fg"
                colSpan={1 + REASONS.length}
              >
                Team total
              </td>
              <td className="px-4 py-2.5 text-right font-bold tabular-nums text-red-600">
                {formatMoney(grandTotal)}
              </td>
              <td className="px-4 py-2.5 text-xs font-semibold tabular-nums">
                {grandOutstanding > 0 ? (
                  <span className="text-red-600">
                    {formatMoney(grandOutstanding)} outstanding
                  </span>
                ) : (
                  <span className="text-green-600">All settled</span>
                )}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/**
 * The per-person payment control. Admins get an editable "amount paid" field
 * (an absolute running total) plus a "Full" button that settles it entirely;
 * everyone else sees a read-only paid / unpaid status. Fully-paid reads green.
 */
function PaidCell({
  id,
  total,
  paid,
  viewerIsAdmin,
}: {
  id: string;
  total: number;
  paid: number;
  viewerIsAdmin: boolean;
}) {
  const [value, setValue] = useState(String(paid));
  const [isPending, startTransition] = useTransition();

  // Reconcile the input when the server value changes after a revalidate.
  const [lastPaid, setLastPaid] = useState(paid);
  if (paid !== lastPaid) {
    setLastPaid(paid);
    setValue(String(paid));
  }

  // Nothing owed — nothing to collect.
  if (total === 0) {
    return <span className="text-muted-fg">—</span>;
  }

  const fullyPaid = paid >= total;
  const outstanding = Math.max(0, total - paid);

  if (!viewerIsAdmin) {
    if (fullyPaid) {
      return (
        <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
          Paid
        </span>
      );
    }
    if (paid > 0) {
      return (
        <span className="text-xs font-medium tabular-nums text-amber-600">
          {formatMoney(paid)} paid · {formatMoney(outstanding)} left
        </span>
      );
    }
    return <span className="text-xs font-semibold text-red-600">Unpaid</span>;
  }

  function commit() {
    const n = Math.round(Number(value.trim()));
    if (value.trim() === "" || Number.isNaN(n) || n === paid) {
      setValue(String(paid));
      return;
    }
    startTransition(() => {
      void setFinesPaid(id, n);
    });
  }

  function full() {
    if (fullyPaid) return;
    startTransition(() => {
      void markFinesPaidInFull(id);
    });
  }

  return (
    <div
      className="flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <span
        className={`inline-flex items-center rounded-lg border px-1.5 py-1 text-xs font-semibold tabular-nums transition ${
          fullyPaid
            ? "border-green-300 bg-green-50 text-green-700"
            : "border-line text-ink focus-within:border-brand"
        }`}
      >
        $
        <input
          type="number"
          min={0}
          max={total}
          value={value}
          disabled={isPending}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setValue(String(paid));
              e.currentTarget.blur();
            }
          }}
          aria-label="Amount paid back"
          className="w-14 bg-transparent text-right focus:outline-none"
        />
      </span>
      <button
        type="button"
        onClick={full}
        disabled={isPending || fullyPaid}
        title={fullyPaid ? "Fully paid" : "Mark the whole fine as paid"}
        className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold transition ${
          fullyPaid
            ? "cursor-default bg-green-100 text-green-700"
            : "bg-brand text-white hover:bg-brand-dark disabled:opacity-50"
        }`}
      >
        {fullyPaid ? "Paid" : "Full"}
      </button>
    </div>
  );
}

"use client";

import { Fragment, useState } from "react";
import { formatMoney } from "@/lib/penalties";
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
  fines: MatrixFine[]; // newest first
};

/**
 * The "Current penalties" matrix. Every employee with fines is tappable —
 * expanding their row reveals the individual fines behind the totals, each
 * with its reason, note, date, and amount.
 */
export function PenaltyMatrix({
  rows,
  grandTotal,
}: {
  rows: MatrixRow[];
  grandTotal: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[40rem] text-sm">
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
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const canExpand = r.fines.length > 0;
            const open = openId === r.id;
            return (
              <Fragment key={r.id}>
                <tr
                  onClick={() => canExpand && setOpenId(open ? null : r.id)}
                  aria-expanded={canExpand ? open : undefined}
                  className={`border-b border-line transition last:border-b-0 ${
                    canExpand ? "cursor-pointer hover:bg-canvas/60" : ""
                  } ${open ? "bg-canvas/60" : ""}`}
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
                      <span className="font-bold tabular-nums text-red-600">
                        {formatMoney(r.total)}
                      </span>
                    ) : (
                      <span className="text-muted-fg">—</span>
                    )}
                  </td>
                </tr>
                {open && (
                  <tr className="border-b border-line last:border-b-0">
                    <td colSpan={2 + REASONS.length} className="px-4 pb-3 pt-1">
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
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

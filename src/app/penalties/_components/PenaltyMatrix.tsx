"use client";

import { Fragment, useState, useTransition } from "react";
import { formatMoney } from "@/lib/penalties";
import { settleAllFines, settleFine } from "../../admin/actions";
import { REASONS } from "../reasons";

// One outstanding fine, ready to render. `reasonIndex` points into REASONS
// (falls back to the "Other" column server-side, so it's always valid).
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
  cells: number[]; // outstanding amount per REASONS column
  outstanding: number; // sum of active fines still owed
  fines: MatrixFine[]; // the active fines behind the totals, newest first
};

/**
 * The "Active fines" matrix — everyone who still owes, their outstanding fines
 * summed per reason. Every row is tappable to reveal the individual fines
 * behind the totals. Admins additionally get a settle control: settle a single
 * fine (in the expanded row) or settle everything a person owes at once — used
 * once the fines have been cut from their salary.
 */
export function PenaltyMatrix({
  rows,
  grandOutstanding,
  viewerIsAdmin,
}: {
  rows: MatrixRow[];
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
            <th className="px-4 py-3 text-right font-semibold">Outstanding</th>
            <th className="px-4 py-3 font-semibold">
              {viewerIsAdmin ? "Settle" : "Status"}
            </th>
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
                    <span className="font-bold tabular-nums text-red-600">
                      {formatMoney(r.outstanding)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <SettleCell
                      id={r.id}
                      outstanding={r.outstanding}
                      viewerIsAdmin={viewerIsAdmin}
                    />
                  </td>
                </tr>
                {open && (
                  <tr className="border-b border-line last:border-b-0">
                    <td colSpan={3 + REASONS.length} className="px-4 pb-3 pt-1">
                      <ul className="rise-in flex flex-col">
                        {r.fines.map((f) => (
                          <FineLine
                            key={f.id}
                            fine={f}
                            viewerIsAdmin={viewerIsAdmin}
                          />
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        {grandOutstanding > 0 && (
          <tfoot>
            <tr className="border-t border-line bg-canvas/60">
              <td
                className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-fg"
                colSpan={1 + REASONS.length}
              >
                Team total outstanding
              </td>
              <td className="px-4 py-2.5 text-right font-bold tabular-nums text-red-600">
                {formatMoney(grandOutstanding)}
              </td>
              <td className="px-4 py-2.5" />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** One outstanding fine inside an expanded row, with a per-fine settle button. */
function FineLine({
  fine: f,
  viewerIsAdmin,
}: {
  fine: MatrixFine;
  viewerIsAdmin: boolean;
}) {
  const reason = REASONS[f.reasonIndex];
  const [isPending, startTransition] = useTransition();

  return (
    <li
      className="flex items-center gap-3 border-t border-line py-2 first:border-t-0"
      onClick={(e) => e.stopPropagation()}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${reason.dot}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-ink">
        {reason.label}
        {f.note && <span className="text-muted-fg"> · {f.note}</span>}
      </span>
      <span className="shrink-0 text-[11px] text-muted-fg">{f.dateLabel}</span>
      <span className="shrink-0 text-xs font-bold tabular-nums text-red-600">
        {formatMoney(f.amount)}
      </span>
      {viewerIsAdmin && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => void settleFine(f.id))}
          title="Mark this fine paid (cut from salary)"
          className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-[11px] font-semibold text-ink transition hover:border-green-300 hover:bg-green-50 hover:text-green-700 disabled:opacity-50"
        >
          Settle
        </button>
      )}
    </li>
  );
}

/**
 * The per-person settle control. Admins get a "Settle all" button that marks
 * everything they owe paid at once (the payroll case). Everyone else sees a
 * read-only outstanding amount.
 */
function SettleCell({
  id,
  outstanding,
  viewerIsAdmin,
}: {
  id: string;
  outstanding: number;
  viewerIsAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (!viewerIsAdmin) {
    return (
      <span className="text-xs font-semibold tabular-nums text-red-600">
        {formatMoney(outstanding)} unpaid
      </span>
    );
  }

  return (
    <div
      className="flex items-center"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => void settleAllFines(id))}
        title="Mark all of this person's fines paid (cut from salary)"
        className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
      >
        Settle all
      </button>
    </div>
  );
}

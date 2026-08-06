"use client";

import { Fragment, useState } from "react";
import { formatMoney } from "@/lib/penalties";
import { REASONS } from "../reasons";
import { SettleDialog, type SettleScope } from "./SettleDialog";

// One outstanding fine, ready to render. `reasonIndex` points into REASONS
// (falls back to the "Other" column server-side, so it's always valid).
// `paidAmount` is what's already been settled against it — anything above zero
// means a part payment has landed and the fine owes the difference.
export type MatrixFine = {
  id: string;
  reasonIndex: number;
  note: string | null;
  dateLabel: string;
  amount: number;
  paidAmount: number;
};

export type MatrixRow = {
  id: string;
  name: string;
  department: string | null;
  emoji: string;
  bg: string;
  cells: number[]; // outstanding amount per REASONS column
  outstanding: number; // what they still owe across every open fine
  partPaid: number; // already settled against those still-open fines
  fines: MatrixFine[]; // the open fines behind the totals, oldest first
};

/**
 * The "Active fines" matrix — everyone who still owes, their outstanding fines
 * summed per reason. Every row is tappable to reveal the individual fines
 * behind the totals. Admins get the settle control: any amount, against the
 * person's whole balance or against a single fine, recorded once it's been cut
 * from their salary. A part payment leaves the fine here, owing the rest.
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
  // The settlement in progress: who it's for, what it can land on (their whole
  // balance, or the single fine it was opened from), and which of the two.
  const [settling, setSettling] = useState<{
    row: MatrixRow;
    scope: SettleScope;
    fines: MatrixFine[];
  } | null>(null);

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
                  className={`border-b border-line transition last:border-b-0 ${
                    canExpand ? "hover:bg-canvas/60" : ""
                  } ${open ? "bg-canvas/60" : ""}`}
                >
                  <td className="px-4 py-2.5">
                    {/* The expand toggle is a real button so keyboard users can
                        reach the fine details (was: a clickable <tr>). */}
                    <button
                      type="button"
                      onClick={() => canExpand && setOpenId(open ? null : r.id)}
                      aria-expanded={canExpand ? open : undefined}
                      disabled={!canExpand}
                      className={`group flex w-full items-center gap-2.5 rounded-lg text-left ${
                        canExpand ? "" : "cursor-default"
                      }`}
                    >
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
                          className={`shrink-0 text-muted-fg transition group-hover:text-ink ${
                            open ? "rotate-90" : ""
                          }`}
                          aria-hidden="true"
                        >
                          ›
                        </span>
                      )}
                    </button>
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
                    {/* Only worth the extra line once part of the balance has
                        actually been paid — otherwise it's noise on every row. */}
                    {r.partPaid > 0 && (
                      <span className="mt-1 block">
                        <PaidBar
                          paid={r.partPaid}
                          total={r.partPaid + r.outstanding}
                        />
                        <span className="mt-0.5 block text-[10px] tabular-nums text-green-700">
                          {formatMoney(r.partPaid)} paid of{" "}
                          {formatMoney(r.partPaid + r.outstanding)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {viewerIsAdmin ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSettling({
                            row: r,
                            scope: { kind: "person", userId: r.id },
                            fines: r.fines,
                          })
                        }
                        title="Record money cut from this person's salary"
                        className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-brand-dark"
                      >
                        Settle…
                      </button>
                    ) : (
                      <span className="text-xs font-semibold tabular-nums text-red-600">
                        {formatMoney(r.outstanding)} unpaid
                      </span>
                    )}
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
                            onSettle={() =>
                              setSettling({
                                row: r,
                                scope: { kind: "fine", penaltyId: f.id },
                                fines: [f],
                              })
                            }
                          />
                        ))}
                      </ul>
                      <p className="mt-1.5 text-[10px] text-muted-fg">
                        A settlement is applied to the oldest fine first.
                      </p>
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

      {settling && (
        <SettleDialog
          person={settling.row}
          fines={settling.fines}
          scope={settling.scope}
          onClose={() => setSettling(null)}
        />
      )}
    </div>
  );
}

/** One outstanding fine inside an expanded row, with its own settle control. */
function FineLine({
  fine: f,
  viewerIsAdmin,
  onSettle,
}: {
  fine: MatrixFine;
  viewerIsAdmin: boolean;
  onSettle: () => void;
}) {
  const reason = REASONS[f.reasonIndex];
  const owed = f.amount - f.paidAmount;

  return (
    <li className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${reason.dot}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-ink">
        {reason.label}
        {f.note && <span className="text-muted-fg"> · {f.note}</span>}
      </span>
      <span className="shrink-0 text-[11px] text-muted-fg">{f.dateLabel}</span>
      {f.paidAmount > 0 && (
        <span className="flex shrink-0 items-center gap-1.5">
          <PaidBar paid={f.paidAmount} total={f.amount} className="w-14" />
          <span className="text-[10px] tabular-nums text-green-700">
            {formatMoney(f.paidAmount)} paid
          </span>
        </span>
      )}
      <span className="shrink-0 text-xs font-bold tabular-nums text-red-600">
        {formatMoney(owed)}
      </span>
      {viewerIsAdmin && (
        <button
          type="button"
          onClick={onSettle}
          title="Settle this fine, in full or in part"
          className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-[11px] font-semibold text-ink transition hover:border-green-300 hover:bg-green-50 hover:text-green-700"
        >
          Settle
        </button>
      )}
    </li>
  );
}

/** A two-tone bar: green for what's been paid, red for what's still owed. */
function PaidBar({
  paid,
  total,
  className = "",
}: {
  paid: number;
  total: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  return (
    <span
      className={`flex h-1 overflow-hidden rounded-full bg-red-500/20 ${className || "w-full"}`}
      aria-hidden="true"
    >
      <span
        className="h-full bg-green-600 transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

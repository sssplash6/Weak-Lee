"use client";

import { Fragment, useState, useTransition } from "react";
import { formatMoney } from "@/lib/penalties";
import { undoSettlement } from "../../admin/actions";
import { REASONS } from "../reasons";

/** What one receipt did to one fine. */
export type ReceiptLine = {
  id: string;
  reasonIndex: number;
  note: string | null;
  /** Paid toward that fine in this receipt. */
  amount: number;
  /** The fine's full amount, for the "$40 of $60" part-payment case. */
  fineAmount: number;
  /** True when this payment is what closed the fine out. */
  cleared: boolean;
};

/** One settlement: an amount cut from a salary, spread over one or more fines. */
export type Receipt = {
  batchId: string;
  dateLabel: string;
  amount: number;
  /** True when this was the automatic deduction of a processed pay request. */
  viaPayroll: boolean;
  lines: ReceiptLine[];
};

export type ArchiveRow = {
  id: string;
  name: string;
  department: string | null;
  emoji: string;
  bg: string;
  paid: number; // total settled, all time
  clearedCount: number; // fines paid off in full
  stillOwed: number; // what's left open, if anything
  receipts: Receipt[]; // newest settlement first
};

/**
 * The settled side of the ledger. One row per person who has paid something
 * off, opening onto their payment history — each settlement as a receipt with
 * the fines it went to, so a part payment is as legible as a cleared one.
 * Admins can undo a whole receipt (a mistyped amount): every fine it touched
 * gets its balance back and reopens in the active matrix above. Payroll
 * deductions are the exception — see undoSettlement.
 */
export function FineArchive({
  rows,
  viewerIsAdmin,
}: {
  rows: ArchiveRow[];
  viewerIsAdmin: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <ul>
        {rows.map((r) => {
          const open = openId === r.id;
          return (
            <Fragment key={r.id}>
              <li>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : r.id)}
                  aria-expanded={open}
                  className={`flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left transition hover:bg-canvas/60 ${
                    open ? "bg-canvas/60" : ""
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${r.bg}`}
                    aria-hidden="true"
                  >
                    {r.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">
                      {r.name}
                    </span>
                    {r.department && (
                      <span className="block truncate text-xs text-muted-fg">
                        {r.department}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-fg">
                    {r.clearedCount > 0 && (
                      <>
                        {r.clearedCount} cleared
                        {r.stillOwed > 0 && " · "}
                      </>
                    )}
                    {r.stillOwed > 0 && (
                      <span className="tabular-nums text-red-600">
                        {formatMoney(r.stillOwed)} still owed
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-green-700">
                    {formatMoney(r.paid)}
                  </span>
                  <span
                    className={`shrink-0 text-muted-fg transition ${
                      open ? "rotate-90" : ""
                    }`}
                    aria-hidden="true"
                  >
                    ›
                  </span>
                </button>
              </li>
              {open && (
                <li className="border-b border-line">
                  <ul className="rise-in flex flex-col px-4 pb-3 pt-1">
                    {r.receipts.map((receipt) => (
                      <ReceiptLines
                        key={receipt.batchId}
                        receipt={receipt}
                        viewerIsAdmin={viewerIsAdmin}
                      />
                    ))}
                  </ul>
                </li>
              )}
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}

/** One settlement: when, how much, what it went to, and an undo. */
function ReceiptLines({
  receipt,
  viewerIsAdmin,
}: {
  receipt: Receipt;
  viewerIsAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="border-t border-line py-2 first:border-t-0">
      <div className="flex items-center gap-3">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-50 text-[10px] text-green-700">
          ✓
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
          {formatMoney(receipt.amount)} deducted
          {receipt.viaPayroll && (
            <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-semibold text-accent-ink">
              via payroll
            </span>
          )}
        </span>
        <span className="shrink-0 text-[11px] text-muted-fg">
          {receipt.dateLabel}
        </span>
        {/* Payroll deductions are half of a processed pay request — undoing
            just this side would contradict the invoice, so no button is
            offered (the server refuses them too). */}
        {viewerIsAdmin && !receipt.viaPayroll && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(() => void undoSettlement(receipt.batchId))
            }
            title="Undo this settlement — the fines it paid go back to outstanding"
            className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-[11px] font-semibold text-muted-fg transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            Undo
          </button>
        )}
      </div>
      <ul className="mt-1 flex flex-col pl-8">
        {receipt.lines.map((l) => {
          const reason = REASONS[l.reasonIndex];
          return (
            <li
              key={l.id}
              className="flex items-baseline gap-2 py-0.5 text-[11px]"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 translate-y-px rounded-full ${reason.dot}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-muted-fg">
                {reason.label}
                {l.note && <span> · {l.note}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-muted-fg">
                {l.cleared ? (
                  <span className="text-green-700">
                    {formatMoney(l.amount)} · cleared
                  </span>
                ) : (
                  `${formatMoney(l.amount)} of ${formatMoney(l.fineAmount)}`
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

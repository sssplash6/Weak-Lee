"use client";

import { Fragment, useState, useTransition } from "react";
import { formatMoney } from "@/lib/penalties";
import { reopenFine } from "../../admin/actions";
import { REASONS } from "../reasons";

export type ArchivedFine = {
  id: string;
  reasonIndex: number;
  note: string | null;
  paidLabel: string;
  amount: number;
};

export type ArchiveRow = {
  id: string;
  name: string;
  department: string | null;
  emoji: string;
  bg: string;
  paid: number; // total settled
  fines: ArchivedFine[]; // settled fines, most recent first
};

/**
 * The settled-fines archive. One row per person who has paid something off;
 * tap to see each settled fine, when it was paid, and the reason. Admins can
 * reopen a fine (undo a settlement recorded by mistake) — it returns to the
 * active ledger above.
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
                    {r.fines.length} paid
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-green-600">
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
                    {r.fines.map((f) => (
                      <ArchivedFineLine
                        key={f.id}
                        fine={f}
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

/** One settled fine: reason, note, when it was paid, amount, and reopen (admin). */
function ArchivedFineLine({
  fine: f,
  viewerIsAdmin,
}: {
  fine: ArchivedFine;
  viewerIsAdmin: boolean;
}) {
  const reason = REASONS[f.reasonIndex];
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${reason.dot}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-muted-fg">
        {reason.label}
        {f.note && <span> · {f.note}</span>}
      </span>
      <span className="shrink-0 text-[11px] text-muted-fg">
        paid {f.paidLabel}
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-green-600">
        {formatMoney(f.amount)}
      </span>
      {viewerIsAdmin && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => void reopenFine(f.id))}
          title="Reopen this fine (undo the settlement)"
          className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-[11px] font-semibold text-muted-fg transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          Reopen
        </button>
      )}
    </li>
  );
}

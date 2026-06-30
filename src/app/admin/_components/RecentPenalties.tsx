"use client";

import { useTransition } from "react";
import { formatMoney } from "@/lib/penalties";
import { TrashIcon } from "../../dashboard/_components/icons";
import { deletePenalty } from "../actions";

export type PenaltyRow = {
  id: string;
  label: string;
  amount: number;
  note: string | null;
  who: string;
  dateLabel: string;
};

export function RecentPenalties({ penalties }: { penalties: PenaltyRow[] }) {
  if (penalties.length === 0) {
    return <p className="px-1 text-sm text-muted-fg">No penalties yet. 🎉</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {penalties.map((p) => (
        <PenaltyItem key={p.id} penalty={p} />
      ))}
    </ul>
  );
}

function PenaltyItem({ penalty: p }: { penalty: PenaltyRow }) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
      <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
        {p.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{p.who}</p>
        {p.note && (
          <p className="truncate text-xs text-muted-fg">{p.note}</p>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-red-600">
        {formatMoney(p.amount)}
      </span>
      <span className="hidden shrink-0 text-xs text-muted-fg sm:block">
        {p.dateLabel}
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await deletePenalty(p.id);
          })
        }
        className="shrink-0 text-muted-fg transition hover:text-red-500 disabled:opacity-50"
        aria-label="Remove penalty"
        title="Remove penalty"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

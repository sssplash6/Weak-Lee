"use client";

import { useTransition } from "react";
import { formatMoney } from "@/lib/penalties";
import { TrashIcon } from "../../dashboard/_components/icons";
import { deleteBonus } from "../actions";

export type BonusRow = {
  id: string;
  amount: number;
  note: string | null;
  who: string;
  dateLabel: string;
};

export function RecentBonuses({ bonuses }: { bonuses: BonusRow[] }) {
  if (bonuses.length === 0) {
    return <p className="text-sm text-muted-fg">No bonuses yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {bonuses.map((b) => (
        <BonusItem key={b.id} bonus={b} />
      ))}
    </ul>
  );
}

function BonusItem({ bonus: b }: { bonus: BonusRow }) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
      <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{b.who}</p>
        {b.note && <p className="truncate text-xs text-muted-fg">{b.note}</p>}
      </div>
      <span className="hidden shrink-0 text-xs text-muted-fg sm:block">
        {b.dateLabel}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-green-600">
        +{formatMoney(b.amount)}
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await deleteBonus(b.id);
          })
        }
        className="shrink-0 text-muted-fg transition hover:text-red-500 disabled:opacity-50"
        aria-label="Remove bonus"
        title="Remove bonus"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

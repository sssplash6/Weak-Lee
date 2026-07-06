import { formatMoney } from "@/lib/penalties";

type BonusRow = {
  id: string;
  amount: number;
  note: string | null;
  dateLabel: string;
};

/**
 * The signed-in user's own bonuses, shown on their dashboard next to fines.
 * Green-tinted (the positive counterpart of PenaltyNotice); lists each bonus
 * with its note and amount plus a running total. Tracked separately from fines.
 */
export function BonusNotice({
  bonuses,
  total,
}: {
  bonuses: BonusRow[];
  total: number;
}) {
  return (
    <div className="rounded-xl border border-green-200 bg-green-50/60 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-green-700">Bonuses</p>
        <p className="text-sm font-bold tabular-nums text-green-700">
          +{formatMoney(total)}
        </p>
      </div>

      {bonuses.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {bonuses.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-2 text-xs text-green-700/90"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
              <span className="min-w-0 flex-1 truncate">
                {b.note ?? "Bonus"}
                <span className="text-green-700/60"> · {b.dateLabel}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                +{formatMoney(b.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

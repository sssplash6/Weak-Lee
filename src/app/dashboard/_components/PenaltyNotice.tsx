import { formatMoney } from "@/lib/penalties";

type WeekPenalty = {
  id: string;
  label: string;
  amount: number;
  note: string | null;
  dateLabel: string;
};

/**
 * The signed-in user's own fines, shown on their dashboard. Leads with this
 * week's fines (if any) and always shows the running total. Red-tinted, since
 * fines are a negative — but kept compact so it informs rather than alarms.
 */
export function PenaltyNotice({
  weekPenalties,
  weekTotal,
  allTimeTotal,
}: {
  weekPenalties: WeekPenalty[];
  weekTotal: number;
  allTimeTotal: number;
}) {
  return (
    <div className="mb-5 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-red-700">
          {weekTotal > 0 ? "Fines this week" : "Fines"}
        </p>
        <p className="text-sm font-bold tabular-nums text-red-700">
          {formatMoney(weekTotal > 0 ? weekTotal : allTimeTotal)}
        </p>
      </div>

      {weekPenalties.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {weekPenalties.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 text-xs text-red-700/90"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              <span className="min-w-0 flex-1 truncate">
                {p.label}
                {p.note ? ` · ${p.note}` : ""}
                <span className="text-red-700/60"> · {p.dateLabel}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatMoney(p.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {allTimeTotal > weekTotal && (
        <p className="mt-2 text-xs text-red-700/70">
          Total to date: {formatMoney(allTimeTotal)}
        </p>
      )}
    </div>
  );
}

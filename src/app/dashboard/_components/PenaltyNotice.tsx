import { formatMoney } from "@/lib/penalties";

type WeekPenalty = {
  id: string;
  label: string;
  amount: number;
  note: string | null;
  dateLabel: string;
};

/**
 * The signed-in user's own outstanding fines, shown on their dashboard. Leads
 * with what they still owe as the hero figure — the number that matters — then
 * breaks it down into this week's fines and earlier ones. Once a fine is
 * settled (cut from salary) it drops out of these lists; the whole block hides
 * when nothing is outstanding, with a quiet "paid to date" note while it shows.
 * Red-tinted, since fines are a negative, but calm rather than alarming.
 */
export function PenaltyNotice({
  weekPenalties,
  earlierPenalties = [],
  weekTotal,
  outstandingTotal,
  paidTotal = 0,
}: {
  weekPenalties: WeekPenalty[];
  earlierPenalties?: WeekPenalty[];
  weekTotal: number;
  outstandingTotal: number;
  paidTotal?: number;
}) {
  const hasWeek = weekPenalties.length > 0;
  const hasEarlier = earlierPenalties.length > 0;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700/70">
        Fines
      </p>
      <p className="mt-0.5 text-3xl font-bold leading-none tabular-nums text-red-700">
        {formatMoney(outstandingTotal)}
      </p>
      <p className="mt-1.5 text-xs text-red-700/60">
        outstanding
        {weekTotal > 0 && <> · {formatMoney(weekTotal)} this week</>}
        {paidTotal > 0 && <> · {formatMoney(paidTotal)} paid</>}
      </p>

      {hasWeek && (
        <PenaltyGroup
          title={hasEarlier ? "This week" : null}
          items={weekPenalties}
        />
      )}
      {hasEarlier && (
        <PenaltyGroup title={hasWeek ? "Earlier" : null} items={earlierPenalties} />
      )}
    </div>
  );
}

/** A titled block of fine lines. Title is omitted when there's only one group. */
function PenaltyGroup({
  title,
  items,
}: {
  title: string | null;
  items: WeekPenalty[];
}) {
  return (
    <div className="mt-3">
      {title && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700/60">
          {title}
        </p>
      )}
      <ul className={title ? "mt-1" : ""}>
        {items.map((p) => (
          <PenaltyLine key={p.id} penalty={p} />
        ))}
      </ul>
    </div>
  );
}

/**
 * One fine: reason + amount on the top line (amount right-aligned, stays put
 * when the reason wraps), with the note and date on a quieter line below.
 */
function PenaltyLine({ penalty: p }: { penalty: WeekPenalty }) {
  const sub = [p.note, p.dateLabel].filter(Boolean).join(" · ");
  return (
    <li className="border-t border-red-200/70 py-1.5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-xs font-medium text-red-800">
          {p.label}
        </span>
        <span className="shrink-0 text-xs font-bold tabular-nums text-red-700">
          {formatMoney(p.amount)}
        </span>
      </div>
      {sub && <p className="mt-0.5 text-[11px] text-red-700/55">{sub}</p>}
    </li>
  );
}

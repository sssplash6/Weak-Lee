import { formatMoney } from "@/lib/penalties";

type WeekPenalty = {
  id: string;
  label: string;
  /** What's still owed on the fine — the figure that counts. */
  amount: number;
  /** The fine as issued, and how much of it has been settled so far. */
  fullAmount: number;
  paidAmount: number;
  note: string | null;
  dateLabel: string;
};

/**
 * The signed-in user's own outstanding fines, shown on their dashboard. Leads
 * with what they still owe as the hero figure — the number that matters — then
 * breaks it down into this week's fines and earlier ones. Once a fine is
 * settled (cut from salary) it drops out of these lists; the whole block hides
 * when nothing is outstanding, with a quiet "paid to date" note while it shows.
 * Red-tinted, since fines are a negative, but calm rather than alarming. The
 * tint is opaque so it stays a clean near-white card in the dark theme too —
 * alpha-blended over the dark canvas it went muddy mauve.
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
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
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
 * One fine: reason + what's left on it on the top line (amount right-aligned,
 * stays put when the reason wraps), with the note and date on a quieter line
 * below. A part-paid fine shows how much of it has already come out of a
 * salary, so the smaller figure above reads as progress rather than a mistake.
 */
function PenaltyLine({ penalty: p }: { penalty: WeekPenalty }) {
  const partPaid = p.paidAmount > 0;
  const sub = [
    p.note,
    p.dateLabel,
    partPaid
      ? `${formatMoney(p.paidAmount)} of ${formatMoney(p.fullAmount)} paid`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="border-t border-red-200/70 py-1.5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-xs font-medium text-red-800">
          {p.label}
        </span>
        <span className="shrink-0 text-xs font-bold tabular-nums text-red-700">
          {formatMoney(p.amount)}
          {partPaid && (
            <span className="font-normal text-red-700/50"> left</span>
          )}
        </span>
      </div>
      {sub && <p className="mt-0.5 text-[11px] text-red-700/55">{sub}</p>}
    </li>
  );
}

// The auto-pulled half of a pay request: itemized bonuses and outstanding
// fines. Read-only by design — these lines come from the ledger (and, once
// filed, from the frozen snapshot), never from the form. Rendered inside both
// the filing form (live preview) and the submitted views (snapshot).

import { formatMoney } from "@/lib/penalties";

export type LedgerLineView = {
  id: string;
  label: string;
  dateLabel: string;
  note: string | null;
  amount: number;
};

function Lines({
  title,
  hint,
  lines,
  total,
  sign,
  tone,
  empty,
}: {
  title: string;
  hint: string;
  lines: LedgerLineView[];
  total: number;
  sign: "+" | "−";
  tone: string;
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-semibold text-ink">{title}</h4>
        <span className={`shrink-0 text-xs font-bold tabular-nums ${tone}`}>
          {sign} {formatMoney(total)}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-fg">{hint}</p>
      {lines.length === 0 ? (
        <p className="mt-2 text-xs text-muted-fg">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {lines.map((l) => (
            <li
              key={l.id}
              className="flex items-start justify-between gap-3 border-t border-line py-1.5 text-xs first:border-t-0"
            >
              <span className="min-w-0 text-ink">
                {l.label}
                <span className="text-muted-fg"> · {l.dateLabel}</span>
                {l.note && <span className="text-muted-fg"> — {l.note}</span>}
              </span>
              <span className={`shrink-0 font-semibold tabular-nums ${tone}`}>
                {sign} {formatMoney(l.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LedgerBreakdown({
  bonuses,
  fines,
  bonusesTotal,
  finesTotal,
}: {
  bonuses: LedgerLineView[];
  fines: LedgerLineView[];
  bonusesTotal: number;
  finesTotal: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Lines
        title="Bonuses"
        hint="Added to your total automatically."
        lines={bonuses}
        total={bonusesTotal}
        sign="+"
        tone="text-green-700"
        empty="No unpaid bonuses right now."
      />
      <Lines
        title="Outstanding fines"
        hint="Deducted automatically — what each fine still owes."
        lines={fines}
        total={finesTotal}
        sign="−"
        tone="text-red-600"
        empty="No outstanding fines 🎉"
      />
    </div>
  );
}

import { formatMoney } from "@/lib/penalties";

/**
 * The whole fine ledger in one line: everything ever issued, split into what's
 * been paid off and what's still owed. It's the answer to "where do we stand?"
 * that neither table gives on its own — the matrix only knows what's open, the
 * archive only what's closed.
 */
export function LedgerBar({
  settled,
  outstanding,
}: {
  settled: number;
  outstanding: number;
}) {
  const issued = settled + outstanding;
  const pct = issued > 0 ? Math.round((settled / issued) * 100) : 0;

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
            Settled
          </p>
          <p className="mt-0.5 text-xl font-bold leading-none tabular-nums text-green-700">
            {formatMoney(settled)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
            Outstanding
          </p>
          <p className="mt-0.5 text-xl font-bold leading-none tabular-nums text-red-600">
            {formatMoney(outstanding)}
          </p>
        </div>
      </div>
      <div
        className="mt-3 flex h-2 overflow-hidden rounded-full bg-red-500/20"
        aria-hidden="true"
      >
        <span
          className="h-full bg-green-600 transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-fg">
        {pct}% of the {formatMoney(issued)} issued has been paid off.
      </p>
    </div>
  );
}

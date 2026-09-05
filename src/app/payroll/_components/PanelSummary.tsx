// The at-a-glance strip at the top of the reviewer panel (/payroll/panel). A
// reviewer opens it with three questions — how much is still on my desk, how
// much money is about to move, and what is already through — and until the
// strip existed the only answer was to count the rows.
//
// Presentation only: it renders the figures it is handed and works out none of
// them. Who does the arithmetic decides what the strip means, and the two
// views answer that differently — the register hands it the month, computed on
// the server, while the queue hands it PanelBoard's running total of whatever
// the filters have left on screen, so picking a department re-reads the money
// as that department's.
//
// Same visual grammar as the penalties LedgerBar: a kicker label, one big
// tabular number, a quiet hint underneath.

export type PanelStatTone = "ink" | "brand" | "accent" | "good" | "muted";

export type PanelStat = {
  label: string;
  value: string;
  hint?: string | null;
  tone?: PanelStatTone;
};

const TONE_CLASS: Record<PanelStatTone, string> = {
  ink: "text-ink",
  brand: "text-brand", // work waiting on this desk
  accent: "text-accent-ink", // something is running late
  good: "text-green-700", // money already out the door
  muted: "text-muted-fg", // context, not a number to act on
};

// Tailwind only ships classes it can see in the source, so the column counts
// are looked up rather than interpolated.
const COLS: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

export function PanelSummary({ stats }: { stats: PanelStat[] }) {
  if (stats.length === 0) return null;
  return (
    <dl className={`mb-5 grid gap-3 ${COLS[stats.length] ?? "sm:grid-cols-2"}`}>
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-line bg-surface p-4"
        >
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
            {s.label}
          </dt>
          <dd>
            <span
              className={`mt-1 block text-xl font-bold leading-none tabular-nums ${
                TONE_CLASS[s.tone ?? "ink"]
              }`}
            >
              {s.value}
            </span>
            {s.hint && (
              <span className="mt-1.5 block truncate text-xs text-muted-fg">
                {s.hint}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

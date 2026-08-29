// Attention marks for the reviewer panel (/payroll/panel) — nothing
// employee-facing uses these. A panel row is
// otherwise uniform (avatar, name, status, money), so a scan down the list has
// nothing to catch on when one request has been sitting for a week or is three
// times the size of everything around it. Those are the two things worth
// interrupting a scan for, so those are the only two flags.
//
// Both are computed on the SERVER even though they end up inside client rows:
// "days waiting" needs `now`, and a browser clock would render a different
// number than the HTML that was sent and trip a hydration mismatch.

export type PanelFlag = {
  label: string;
  /** wait = it has sat at this desk too long; size = the money is unusual. */
  tone: "wait" | "size";
};

/**
 * How long a request may sit at one desk before it gets called out. Payroll
 * runs once a month, so three days at a single stage is the point where a
 * request stops being "just filed" and starts being at real risk of missing
 * the payout run.
 */
export const PANEL_STALE_DAYS = 3;

/**
 * The smallest batch where a median means anything. With four rows "typical"
 * is really just "the other three", and every slightly-larger salary would
 * light up.
 */
const MIN_SAMPLE = 5;

/** How far past the median a net has to land before it's worth a second look. */
const UNUSUAL_MULTIPLE = 2;

const DAY_MS = 86_400_000;

/**
 * "5d waiting", once a request has been at this desk past the stale mark.
 * `since` is when it landed here — when it was filed, or for a legacy
 * approved row when it was handed over — not when it was created.
 */
export function waitingFlag(since: Date | null, now: Date): PanelFlag | null {
  if (!since) return null;
  const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
  if (days < PANEL_STALE_DAYS) return null;
  return { label: `${days}d waiting`, tone: "wait" };
}

/** "<1d" / "6d" — the same wait, sized for a summary stat rather than a chip. */
export function waitLabel(since: Date | null, now: Date): string {
  if (!since) return "—";
  const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
  return days >= 1 ? `${days}d` : "<1d";
}

/** Whether a wait has crossed the stale mark — colours the summary stat. */
export function isStale(since: Date | null, now: Date): boolean {
  return !!since && now.getTime() - since.getTime() >= PANEL_STALE_DAYS * DAY_MS;
}

/**
 * The median net of a batch, or null when the batch is too small for a median
 * to describe anything. Median rather than mean on purpose: one $9,000 request
 * would drag a mean up far enough to hide itself.
 */
export function medianNet(nets: number[]): number | null {
  if (nets.length < MIN_SAMPLE) return null;
  const sorted = [...nets].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** "2.4× typical" for a net that towers over the rest of the batch. */
export function sizeFlag(net: number, median: number | null): PanelFlag | null {
  if (median == null || median <= 0) return null;
  const multiple = net / median;
  if (multiple < UNUSUAL_MULTIPLE) return null;
  // One decimal, but "2× typical" rather than "2.0× typical".
  const shown = multiple.toFixed(1).replace(/\.0$/, "");
  return { label: `${shown}× typical`, tone: "size" };
}

// Waiting is the one that wants action, so it takes the accent (progress /
// attention); an unusual amount is information, not a problem, so it stays a
// quiet outline. Red is reserved for destructive moves app-wide.
const TONE_CLASS: Record<PanelFlag["tone"], string> = {
  wait: "bg-accent-soft text-accent-ink",
  size: "border border-line text-muted-fg",
};

/** The chips themselves — rendered inline in a panel row's header. */
export function PanelFlags({ flags }: { flags: PanelFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <>
      {flags.map((f) => (
        <span
          key={f.label}
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE_CLASS[f.tone]}`}
        >
          {f.label}
        </span>
      ))}
    </>
  );
}

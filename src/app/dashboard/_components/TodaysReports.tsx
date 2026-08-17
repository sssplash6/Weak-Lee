import Link from "next/link";

export type TodaysReportRow = {
  id: string;
  name: string;
  emoji: string;
  bg: string;
  // "sent" and "late" carry a time; the rest render as words.
  timeLabel: string | null;
  late: boolean;
  optionalDay: boolean;
  excerpt: string | null;
};

/**
 * The recipient's dashboard glance at today's daily reports: who's in, who
 * isn't yet, and the first lines of each. The whole card opens the full view.
 */
export function TodaysReports({ rows }: { rows: TodaysReportRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-fg">
        Today&rsquo;s reports
      </h2>
      <Link
        href="/daily-reports"
        className="mt-3 block rounded-xl border border-line bg-surface px-4 py-1 transition hover:bg-canvas"
      >
        {rows.map((r) => (
          <div
            key={r.id}
            className="border-t border-line py-2.5 first:border-t-0"
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-sm ${r.bg}`}
                aria-hidden="true"
              >
                {r.emoji}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {r.name}
              </span>
              <span className="shrink-0 text-xs">
                {r.timeLabel ? (
                  <span
                    className={
                      r.late
                        ? "font-medium text-chart-warn"
                        : "font-medium text-chart-good"
                    }
                  >
                    {r.timeLabel}
                  </span>
                ) : (
                  <span className="text-muted-fg">
                    {r.optionalDay ? "—" : "Not yet"}
                  </span>
                )}
              </span>
            </div>
            {r.excerpt && (
              <p className="mt-1 line-clamp-2 pl-[38px] text-xs leading-relaxed text-muted-fg">
                {r.excerpt}
              </p>
            )}
          </div>
        ))}
      </Link>
    </section>
  );
}

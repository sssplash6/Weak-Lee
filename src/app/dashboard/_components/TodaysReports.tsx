"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronIcon } from "./icons";

export type TodaysReportRow = {
  id: string;
  name: string; // the reporter's first name
  emoji: string;
  bg: string;
  // "sent" and "late" carry a time; the rest render as words.
  timeLabel: string | null;
  late: boolean;
  optionalDay: boolean;
  content: string | null; // the full report, expanded in place
};

/**
 * The recipient's dashboard glance at today's daily reports: who's in, who
 * isn't yet. A row with a report expands in place (arrow, not a link — names
 * navigate nowhere); the heading is the way to the full review page.
 */
export function TodaysReports({ rows }: { rows: TodaysReportRow[] }) {
  const [open, setOpen] = useState<string[]>([]);
  if (rows.length === 0) return null;

  const toggle = (id: string) =>
    setOpen((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <section>
      <Link
        href="/daily-reports?view=review"
        className="group inline-flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-widest text-muted-fg transition hover:text-ink"
      >
        Today&rsquo;s reports
        <ChevronIcon
          className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
      <div className="mt-3 rounded-xl border border-line bg-surface px-4 py-1">
        {rows.map((r) => {
          const expandable = r.content != null && r.content.length > 0;
          const isOpen = open.includes(r.id);
          const head = (
            <>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-sm ${r.bg}`}
                aria-hidden="true"
              >
                {r.emoji}
              </span>
              <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink">
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
              {expandable && (
                <ChevronIcon
                  className={`h-4 w-4 shrink-0 text-muted-fg transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}
                  aria-hidden="true"
                />
              )}
            </>
          );
          return (
            <div
              key={r.id}
              className="border-t border-line py-2.5 first:border-t-0"
            >
              {expandable ? (
                <button
                  type="button"
                  onClick={() => toggle(r.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2.5"
                >
                  {head}
                </button>
              ) : (
                <div className="flex items-center gap-2.5">{head}</div>
              )}
              {expandable && isOpen && (
                <p className="rise-in mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-fg">
                  {r.content}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

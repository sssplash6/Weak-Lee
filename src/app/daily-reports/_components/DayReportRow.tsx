"use client";

import { useState } from "react";
import { ChevronIcon } from "@/app/dashboard/_components/icons";

export type DayReportRowData = {
  id: string;
  name: string; // the reporter's first name
  emoji: string;
  bg: string;
  status: "sent" | "late" | "missed" | "pending" | "none";
  timeLabel: string | null; // submit time when sent
  editedLabel: string | null; // last-edit time when meaningfully edited
  content: string | null;
};

/**
 * One reporter's row in the day panel: the header states who and when, the
 * report itself expands in place (arrow, not a link) so a long one never
 * drowns the list.
 */
export function DayReportRow({
  row,
  first,
}: {
  row: DayReportRowData;
  first: boolean;
}) {
  const [open, setOpen] = useState(false);
  const expandable = row.content != null && row.content.length > 0;

  const head = (
    <>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-base ${row.bg}`}
        aria-hidden="true"
      >
        {row.emoji}
      </span>
      <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink">
        {row.name}
      </span>
      <span className="shrink-0 text-xs">
        {row.timeLabel ? (
          <>
            <span
              className={
                row.status === "late"
                  ? "font-medium text-chart-warn"
                  : "text-muted-fg"
              }
            >
              {row.timeLabel}
              {row.status === "late" && " · after midnight"}
            </span>
            {row.editedLabel && (
              <span className="text-muted-fg">
                {` · edited ${row.editedLabel}`}
              </span>
            )}
          </>
        ) : row.status === "missed" ? (
          <span className="font-medium text-chart-bad">Not sent</span>
        ) : row.status === "pending" ? (
          <span className="text-muted-fg">Not sent yet</span>
        ) : (
          <span className="text-muted-fg">—</span>
        )}
      </span>
      {expandable && (
        <ChevronIcon
          className={`h-4 w-4 shrink-0 text-muted-fg transition-transform ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        />
      )}
    </>
  );

  return (
    <article
      className={`px-4 py-4 sm:px-5 ${first ? "" : "border-t border-line"}`}
    >
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-3"
        >
          {head}
        </button>
      ) : (
        <div className="flex items-center gap-3">{head}</div>
      )}
      {expandable && open && (
        <p className="rise-in mt-2.5 whitespace-pre-wrap break-words pl-11 text-sm leading-relaxed text-ink">
          {row.content}
        </p>
      )}
    </article>
  );
}

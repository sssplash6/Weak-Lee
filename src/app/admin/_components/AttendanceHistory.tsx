"use client";

import { useState } from "react";
import { type AttendanceStatus } from "@/lib/penalties";

export type AttendanceHistoryRow = {
  id: string;
  name: string;
  emoji: string;
  bg: string;
  // One cell per recent meeting, newest → oldest; null = not marked / no record.
  cells: (AttendanceStatus | null)[];
};

// How each status reads in the strip: a compact glyph + colour, matching the
// marking buttons (navy attended, orange late, red skipped, amber excused).
const CELL: Record<
  AttendanceStatus,
  { ch: string; cls: string; label: string }
> = {
  ATTENDED: { ch: "✓", cls: "bg-brand text-white", label: "Attended" },
  LATE: { ch: "L", cls: "bg-orange-500 text-white", label: "Late" },
  SKIPPED: { ch: "✕", cls: "bg-red-500 text-white", label: "Skipped" },
  EXCUSED: { ch: "E", cls: "bg-amber-500 text-white", label: "Excused" },
};

/**
 * A read-only per-person history of the last few Monday meetings: one row per
 * person, one cell per meeting (oldest on the left, newest on the right). Hover
 * a cell for its date and status. Collapsed by default to keep the admin page
 * tidy.
 */
export function AttendanceHistory({
  columns,
  rows,
}: {
  columns: string[]; // meeting date labels, newest → oldest
  rows: AttendanceHistoryRow[];
}) {
  const [open, setOpen] = useState(false);

  // Data arrives newest → oldest; render it oldest → newest so the most recent
  // meeting sits on the right (the natural "latest" position on a timeline).
  const orderedColumns = [...columns].reverse();

  if (rows.length === 0 || columns.length === 0) {
    return (
      <p className="px-1 text-sm text-muted-fg">No meetings recorded yet.</p>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`group flex w-full items-center justify-between gap-3 p-3 text-left transition hover:bg-canvas/60 ${
          open ? "rounded-t-xl" : "rounded-xl"
        }`}
      >
        <span className="text-sm font-medium text-ink">
          Attendance history
          <span className="ml-2 text-xs text-muted-fg">
            last {columns.length} {columns.length === 1 ? "meeting" : "meetings"}
          </span>
        </span>
        <span
          className={`shrink-0 text-muted-fg transition group-hover:text-ink ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="rise-in border-t border-line p-3">
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-x-1 border-spacing-y-1 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-surface" />
                  {orderedColumns.map((c, i) => (
                    <th
                      key={i}
                      className="px-1 text-center text-[10px] font-medium tabular-nums text-muted-fg"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="sticky left-0 bg-surface pr-3">
                      <span className="flex items-center gap-2">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${r.bg}`}
                          aria-hidden="true"
                        >
                          {r.emoji}
                        </span>
                        <span className="max-w-[10rem] truncate text-sm text-ink">
                          {r.name}
                        </span>
                      </span>
                    </td>
                    {[...r.cells].reverse().map((s, i) => (
                      <td key={i} className="text-center">
                        {s ? (
                          <span
                            title={`${orderedColumns[i]} · ${CELL[s].label}`}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${CELL[s].cls}`}
                          >
                            {CELL[s].ch}
                          </span>
                        ) : (
                          <span
                            title={`${orderedColumns[i]} · not marked`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-fg/40"
                          >
                            –
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-fg">
            {(Object.keys(CELL) as AttendanceStatus[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span
                  className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${CELL[s].cls}`}
                >
                  {CELL[s].ch}
                </span>
                {CELL[s].label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { formatYmd } from "@/lib/dates";
import { CalendarIcon } from "./icons";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Build "YYYY-MM-DD" from calendar parts (month is 0-based). */
function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/**
 * A goal's due-date control: shows the date (or a calendar icon when unset) and
 * opens a popover with both a typed date input and a click-to-pick month grid.
 */
export function DeadlinePicker({
  value,
  todayYmd,
  overdue,
  onChange,
}: {
  value: string | null;
  todayYmd: string;
  overdue: boolean;
  onChange: (ymd: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The month currently shown in the grid — defaults to the deadline's month,
  // or this month when none is set yet.
  const anchor = value ?? todayYmd;
  const [view, setView] = useState(() => {
    const [y, m] = anchor.split("-").map(Number);
    return { y, m: m - 1 };
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function openPicker() {
    // Re-center the grid on the current value each time it opens.
    const [y, m] = anchor.split("-").map(Number);
    setView({ y, m: m - 1 });
    setOpen((v) => !v);
  }

  function pick(next: string | null) {
    onChange(next);
    setOpen(false);
  }

  const [curYear] = todayYmd.split("-").map(Number);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={openPicker}
        title={value ? "Change deadline" : "Set a deadline"}
        className={
          value
            ? `inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold tabular-nums transition ${
                overdue
                  ? "bg-red-50 text-red-600 hover:bg-red-100"
                  : "bg-brand-soft text-brand hover:bg-brand-soft/70"
              }`
            : "flex h-8 w-8 items-center justify-center rounded-full text-muted-fg transition hover:bg-brand-soft hover:text-brand"
        }
      >
        <CalendarIcon className="h-4 w-4" />
        {value && <span>{formatYmd(value, curYear)}</span>}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-line bg-surface p-3 shadow-lg">
          {/* Typed entry */}
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
            Deadline
          </label>
          <input
            type="date"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          />

          {/* Month grid */}
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setView((v) =>
                  v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 },
                )
              }
              className="flex h-6 w-6 items-center justify-center rounded text-muted-fg hover:bg-canvas"
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="text-sm font-bold text-ink">
              {MONTHS[view.m]} {view.y}
            </span>
            <button
              type="button"
              onClick={() =>
                setView((v) =>
                  v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 },
                )
              }
              className="flex h-6 w-6 items-center justify-center rounded text-muted-fg hover:bg-canvas"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w, i) => (
              <div
                key={i}
                className="text-[10px] font-semibold uppercase text-muted-fg"
              >
                {w}
              </div>
            ))}
            {buildGrid(view.y, view.m).map((day, i) =>
              day === null ? (
                <div key={i} />
              ) : (
                <DayButton
                  key={i}
                  cell={ymd(view.y, view.m, day)}
                  day={day}
                  value={value}
                  todayYmd={todayYmd}
                  onPick={pick}
                />
              ),
            )}
          </div>

          {value && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="mt-3 w-full rounded-lg px-2 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50"
            >
              Clear deadline
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DayButton({
  cell,
  day,
  value,
  todayYmd,
  onPick,
}: {
  cell: string;
  day: number;
  value: string | null;
  todayYmd: string;
  onPick: (ymd: string) => void;
}) {
  const isSelected = cell === value;
  const isToday = cell === todayYmd;

  return (
    <button
      type="button"
      onClick={() => onPick(cell)}
      className={`flex h-7 items-center justify-center rounded-full text-xs tabular-nums transition ${
        isSelected
          ? "bg-brand font-bold text-white"
          : isToday
            ? "font-bold text-brand hover:bg-brand-soft"
            : "text-ink hover:bg-canvas"
      }`}
    >
      {day}
    </button>
  );
}

/** Days of `month` laid out Mon–Sun, with leading nulls for alignment. */
function buildGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

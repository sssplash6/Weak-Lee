"use client";

import { useEffect, useRef, useState } from "react";
import { END_OF_DAY, formatStamp } from "@/lib/dates";
import { CalendarIcon } from "./icons";
import { CONTROL_PILL } from "./controlPill";

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
 * A goal's due-date control. The value is a "YYYY-MM-DDTHH:MM" wall-clock stamp
 * (or null). The popover offers a typed date + time, plus a click-to-pick month
 * grid. A date with no time chosen defaults to end of day.
 */
export function DeadlinePicker({
  value,
  todayYmd,
  overdue,
  onChange,
  invalid = false,
  align = "right",
}: {
  value: string | null;
  todayYmd: string;
  overdue: boolean;
  onChange: (stamp: string | null) => void;
  // When true (and no date set), ring the icon in red as a required field.
  invalid?: boolean;
  // Which edge the popover opens from ("left" opens rightward).
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const [datePart, timePart] = value ? value.split("T") : [null, null];
  const anchor = datePart ?? todayYmd;
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
    const [y, m] = anchor.split("-").map(Number);
    setView({ y, m: m - 1 });
    setOpen((v) => !v);
  }

  // Combine a date + time into a stamp. A deadline can't have a time with no
  // date, and a date with no time falls back to end of day.
  function emit(date: string | null, time: string | null) {
    if (!date) return onChange(null);
    onChange(`${date}T${time || END_OF_DAY}`);
  }

  const [curYear] = todayYmd.split("-").map(Number);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={openPicker}
        title={value ? "Change deadline" : "Set a deadline"}
        className={`${CONTROL_PILL} tabular-nums ${
          value
            ? overdue
              ? "bg-red-50 text-red-600 hover:bg-red-100"
              : "bg-brand-soft text-brand hover:bg-brand-soft/70"
            : `text-muted-fg hover:bg-brand-soft hover:text-brand ${
                invalid ? "ring-1 ring-red-400" : ""
              }`
        }`}
      >
        <CalendarIcon className="h-3.5 w-3.5" />
        {value ? formatStamp(value, curYear) : "Deadline"}
      </button>

      {open && (
        <div
          className={`pop-in absolute z-20 mt-1 w-64 rounded-xl border border-line bg-surface p-3 shadow-lg ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          {/* Typed date + time */}
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
            Deadline
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type="date"
              value={datePart ?? ""}
              onChange={(e) => emit(e.target.value || null, timePart)}
              className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
            />
            <input
              type="time"
              value={timePart && timePart !== END_OF_DAY ? timePart : ""}
              onChange={(e) => emit(datePart ?? todayYmd, e.target.value || null)}
              className="w-24 shrink-0 rounded-lg border border-line px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </div>

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
                  selected={datePart}
                  todayYmd={todayYmd}
                  onPick={(date) => emit(date, timePart)}
                />
              ),
            )}
          </div>

          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
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
  selected,
  todayYmd,
  onPick,
}: {
  cell: string;
  day: number;
  selected: string | null;
  todayYmd: string;
  onPick: (ymd: string) => void;
}) {
  const isSelected = cell === selected;
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

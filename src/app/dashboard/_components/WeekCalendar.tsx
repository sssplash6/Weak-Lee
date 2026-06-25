"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PRIORITY_BG, type Priority } from "@/lib/priority";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// How many months to render around the current one so there's room to scroll.
const MONTHS_BEFORE = 1;
const MONTHS_AFTER = 13;

// Cap how many dots we draw under a day so a busy day doesn't overflow the cell.
const MAX_DOTS = 4;

// Draw the most urgent goals first when a day has more deadlines than dots.
const PRIORITY_RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function sortByPriority(priorities: (Priority | null)[]): (Priority | null)[] {
  return [...priorities].sort(
    (a, b) =>
      (a ? PRIORITY_RANK[a] : 3) - (b ? PRIORITY_RANK[b] : 3),
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" from calendar parts (month is 0-based). */
function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

type Month = { y: number; m: number };

// useLayoutEffect on the client, no-op on the server (avoids SSR warning).
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function WeekCalendar({
  deadlines,
}: {
  deadlines: Record<string, (Priority | null)[]>;
}) {
  // Resolve "today" on the client so it matches the viewer's timezone. Render a
  // skeleton until mounted to avoid a server/client hydration mismatch.
  const [today, setToday] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(MONTHS_BEFORE);

  useEffect(() => {
    // Read the wall clock once after mount (an external system, per the rule).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(new Date());
  }, []);

  const months = today ? buildMonths(today) : [];

  // Jump to the current month once mounted (no smooth scroll on first paint).
  useIsoLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !today) return;
    el.scrollLeft = MONTHS_BEFORE * el.clientWidth;
    setIndex(MONTHS_BEFORE);
  }, [today]);

  function go(delta: number) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: delta * el.clientWidth, behavior: "smooth" });
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  const heading = months[index];

  return (
    <div>
      <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-fg">
        Calendar
      </h2>
      <div className="mt-3 rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <NavButton onClick={() => go(-1)} dir="prev" disabled={!today} />
          <span className="text-sm font-bold text-ink">
            {heading ? `${MONTHS[heading.m]} ${heading.y}` : ""}
          </span>
          <NavButton onClick={() => go(1)} dir="next" disabled={!today} />
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((label, i) => (
            <div
              key={i}
              className="text-[11px] font-semibold uppercase text-muted-fg"
            >
              {label}
            </div>
          ))}
        </div>

        {today ? (
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="mt-1 flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {months.map((mo) => (
              <MonthGrid
                key={`${mo.y}-${mo.m}`}
                month={mo}
                today={today}
                deadlines={deadlines}
              />
            ))}
          </div>
        ) : (
          <Skeleton />
        )}
      </div>
    </div>
  );
}

function MonthGrid({
  month,
  today,
  deadlines,
}: {
  month: Month;
  today: Date;
  deadlines: Record<string, (Priority | null)[]>;
}) {
  const todayYmd = ymd(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="w-full shrink-0 snap-start">
      <div className="grid grid-cols-7 gap-1 text-center">
        {buildGrid(month.y, month.m).map((day, i) =>
          day === null ? (
            <div key={i} className="h-9" />
          ) : (
            <DayCell
              key={i}
              day={day}
              cell={ymd(month.y, month.m, day)}
              todayYmd={todayYmd}
              priorities={deadlines[ymd(month.y, month.m, day)] ?? []}
            />
          ),
        )}
      </div>
    </div>
  );
}

function DayCell({
  day,
  cell,
  todayYmd,
  priorities,
}: {
  day: number;
  cell: string;
  todayYmd: string;
  priorities: (Priority | null)[];
}) {
  const isToday = cell === todayYmd;
  const dots = sortByPriority(priorities).slice(0, MAX_DOTS);

  return (
    <div className="flex h-9 flex-col items-center justify-start pt-1">
      <span
        className={`flex h-6 w-6 items-center justify-center text-sm tabular-nums ${
          isToday ? "font-bold text-brand" : "font-medium text-ink"
        }`}
      >
        {day}
      </span>
      <span className="mt-0.5 flex h-1.5 items-center justify-center gap-0.5">
        {dots.map((p, i) => (
          <span
            key={i}
            className={`h-1 w-1 rounded-full ${p ? PRIORITY_BG[p] : "bg-brand"}`}
          />
        ))}
      </span>
    </div>
  );
}

function NavButton({
  onClick,
  dir,
  disabled,
}: {
  onClick: () => void;
  dir: "prev" | "next";
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous month" : "Next month"}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-fg transition hover:bg-canvas hover:text-ink disabled:opacity-40"
    >
      {dir === "prev" ? "‹" : "›"}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="mt-1 grid grid-cols-7 gap-1">
      {Array.from({ length: 35 }, (_, i) => (
        <div key={i} className="h-9 rounded bg-canvas" />
      ))}
    </div>
  );
}

/** Months to render, oldest first: a window around `today`. */
function buildMonths(today: Date): Month[] {
  const base = new Date(today.getFullYear(), today.getMonth() - MONTHS_BEFORE, 1);
  const total = MONTHS_BEFORE + 1 + MONTHS_AFTER;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
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

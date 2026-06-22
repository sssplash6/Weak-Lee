"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// One week row is h-8 (32px) plus its separator margin/padding/border (~10px).
const ROW_HEIGHT = 42;
const MIN_WEEKS = 1;
const MAX_WEEKS = 16;

/** Monday of the week containing `date` (weeks run Mon–Sun, like the tracker). */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const diffToMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

// useLayoutEffect on the client, no-op on the server (avoids SSR warning).
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function WeekCalendar() {
  // Resolve the date on the client so "today" matches the viewer's timezone.
  // Render a skeleton until mounted to avoid a server/client hydration mismatch.
  const [today, setToday] = useState<Date | null>(null);
  const [weeks, setWeeks] = useState(6);
  const rowsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Read the wall clock once after mount (an external system, per the rule).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(new Date());
  }, []);

  // Fit as many week rows as the available height below the grid allows.
  useIsoLayoutEffect(() => {
    function measure() {
      const el = rowsRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const available = window.innerHeight - top - 16; // leave a little breathing room
      const fit = Math.floor(available / ROW_HEIGHT);
      setWeeks(Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, fit)));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [today]);

  return (
    <div>
      <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-fg">
        Calendar
      </h2>
      <div className="mt-3 rounded-xl border border-line bg-surface p-3">
        <Heading today={today} weeks={weeks} />

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

        <div ref={rowsRef} className="mt-1">
          {today ? (
            buildWeeks(today, weeks).map((week, wi) => (
              <div
                key={week[0].toISOString()}
                className={`grid grid-cols-7 gap-1 text-center ${
                  wi > 0 ? "mt-1.5 border-t border-line pt-1.5" : ""
                }`}
              >
                {week.map((d) => (
                  <DayCell key={d.toISOString()} date={d} today={today} />
                ))}
              </div>
            ))
          ) : (
            <Skeleton weeks={weeks} />
          )}
        </div>
      </div>
    </div>
  );
}

function buildDays(today: Date, weeks: number): Date[] {
  const monday = mondayOf(today);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function buildWeeks(today: Date, weeks: number): Date[][] {
  const days = buildDays(today, weeks);
  return Array.from({ length: weeks }, (_, w) => days.slice(w * 7, w * 7 + 7));
}

function Heading({ today, weeks }: { today: Date | null; weeks: number }) {
  if (!today) return <div className="mb-2 h-5 w-24 rounded bg-line" />;

  const days = buildDays(today, weeks);
  const first = days[0];
  const last = days[days.length - 1];
  const sameYear = first.getFullYear() === last.getFullYear();
  const sameMonth = sameYear && first.getMonth() === last.getMonth();

  const text = sameMonth
    ? `${MONTHS[first.getMonth()]} ${first.getFullYear()}`
    : sameYear
      ? `${MONTHS[first.getMonth()]} – ${MONTHS[last.getMonth()]} ${last.getFullYear()}`
      : `${MONTHS[first.getMonth()]} ${first.getFullYear()} – ${MONTHS[last.getMonth()]} ${last.getFullYear()}`;

  return <div className="mb-2 px-0.5 text-sm font-bold text-ink">{text}</div>;
}

function DayCell({ date, today }: { date: Date; today: Date }) {
  const isToday = sameDay(date, today);
  const isFirstOfMonth = date.getDate() === 1;

  return (
    <div
      className={`relative flex h-8 items-center justify-center rounded-full text-sm tabular-nums ${
        isToday ? "bg-brand font-bold text-white" : "font-medium text-ink"
      }`}
    >
      {isFirstOfMonth && !isToday && (
        <span className="absolute left-1/2 top-0 -translate-x-1/2 text-[8px] font-semibold uppercase leading-none text-brand">
          {MONTHS[date.getMonth()]}
        </span>
      )}
      {date.getDate()}
    </div>
  );
}

function Skeleton({ weeks }: { weeks: number }) {
  return (
    <>
      {Array.from({ length: weeks }, (_, w) => (
        <div
          key={w}
          className={`grid grid-cols-7 gap-1 ${
            w > 0 ? "mt-1.5 border-t border-line pt-1.5" : ""
          }`}
        >
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="h-8 rounded-full bg-canvas" />
          ))}
        </div>
      ))}
    </>
  );
}

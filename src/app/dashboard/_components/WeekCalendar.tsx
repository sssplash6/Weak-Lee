"use client";

import { useEffect, useState } from "react";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

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

export function WeekCalendar() {
  // Resolve the date on the client so "today" matches the viewer's timezone.
  // Render nothing until mounted to avoid a server/client hydration mismatch.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    // Read the wall clock once after mount (an external system, per the rule).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(new Date());
  }, []);

  return (
    <div>
      <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-fg">
        Calendar
      </h2>
      <div className="mt-3 rounded-xl border border-line bg-surface p-3">
        {today ? <Grid today={today} /> : <Skeleton />}
      </div>
    </div>
  );
}

function Grid({ today }: { today: Date }) {
  const monday = mondayOf(today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const start = days[0];
  const end = days[6];
  const crossMonth = start.getMonth() !== end.getMonth();
  const heading = crossMonth
    ? `${start.toLocaleDateString(undefined, { month: "short" })} – ${end.toLocaleDateString(
        undefined,
        { month: "short", year: "numeric" },
      )}`
    : start.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <>
      <div className="mb-3 px-0.5 text-sm font-bold text-ink">{heading}</div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((label, i) => (
          <div
            key={i}
            className="text-[11px] font-semibold uppercase text-muted-fg"
          >
            {label}
          </div>
        ))}

        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={`flex h-8 items-center justify-center rounded-full text-sm tabular-nums ${
                isToday
                  ? "bg-brand font-bold text-white"
                  : "font-medium text-ink"
              }`}
            >
              {d.getDate()}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <>
      <div className="mb-3 h-5 w-24 rounded bg-line" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="h-8 rounded-full bg-canvas" />
        ))}
      </div>
    </>
  );
}

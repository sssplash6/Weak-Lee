"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { PRIORITY_BG, type Priority } from "@/lib/priority";
import type { DayTaskCount, DayTaskView } from "@/lib/dayTasks";
import { getDayTasks, toggleDayTask } from "../actions";
import { DayTasksModal } from "./DayTasksModal";
import { CheckCircleIcon } from "./icons";

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
  dayTasks,
}: {
  deadlines: Record<string, (Priority | null)[]>;
  dayTasks: Record<string, DayTaskCount>;
}) {
  // Resolve "today" on the client so it matches the viewer's timezone. Render a
  // skeleton until mounted to avoid a server/client hydration mismatch.
  const [today, setToday] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(MONTHS_BEFORE);
  // The day whose focus list is open, as "YYYY-MM-DD" (null = modal closed).
  const [openDay, setOpenDay] = useState<string | null>(null);
  // Today's tasks, listed in full under the grid. Fetched on the client because
  // "today" is the viewer's calendar day, which only exists after mount; null
  // until that first load lands.
  const [todayTasks, setTodayTasks] = useState<DayTaskView[] | null>(null);

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
  const todayYmd = today
    ? ymd(today.getFullYear(), today.getMonth(), today.getDate())
    : null;

  useEffect(() => {
    if (!todayYmd) return;
    let active = true;
    getDayTasks(todayYmd)
      .then((list) => {
        if (active) setTodayTasks(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [todayYmd]);

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
                dayTasks={dayTasks}
                onPickDay={setOpenDay}
              />
            ))}
          </div>
        ) : (
          <Skeleton />
        )}

        {todayYmd && (
          <TodayFocus
            count={dayTasks[todayYmd]}
            tasks={todayTasks}
            onTasks={setTodayTasks}
            onOpen={() => setOpenDay(todayYmd)}
          />
        )}
      </div>

      {openDay && (
        <DayTasksModal
          // Keyed by the day so switching dates remounts with a fresh load.
          key={openDay}
          ymd={openDay}
          isToday={openDay === todayYmd}
          // Editing today in the modal keeps the block below the grid in step.
          onTasksChange={openDay === todayYmd ? setTodayTasks : undefined}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  );
}

/**
 * Today's focus, listed in full under the grid so the day's priorities are
 * readable — and tickable — without opening anything. The header opens the
 * modal for everything else (add, rename, reorder, delete).
 *
 * `count` comes from the server and is available on first paint; `tasks`
 * arrives once the client knows what "today" is. Whichever is present wins,
 * so the summary never flashes a stale number.
 */
function TodayFocus({
  count,
  tasks,
  onTasks,
  onOpen,
}: {
  count: DayTaskCount | undefined;
  tasks: DayTaskView[] | null;
  onTasks: (tasks: DayTaskView[]) => void;
  onOpen: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const total = tasks ? tasks.length : (count?.total ?? 0);
  const open = tasks
    ? tasks.filter((t) => !t.isDone).length
    : (count?.open ?? 0);

  function toggle(task: DayTaskView) {
    startTransition(async () => {
      try {
        onTasks(await toggleDayTask(task.id, !task.isDone));
      } catch {
        // The list stays as it was; the modal surfaces errors in detail.
      }
    });
  }

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-line">
      <button
        type="button"
        onClick={onOpen}
        title="Open today's tasks"
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left transition hover:bg-brand-soft"
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
            Today
          </span>
          <span className="block truncate text-xs font-medium text-ink">
            {total === 0
              ? "Set your focus"
              : open === 0
                ? `All ${total} done`
                : `${open} of ${total} to do`}
          </span>
        </span>
        <span className="shrink-0 text-lg leading-none text-muted-fg">
          {total === 0 ? "+" : "›"}
        </span>
      </button>

      {tasks && tasks.length > 0 && (
        <ol className="max-h-56 overflow-y-auto border-t border-line px-2 py-1.5">
          {tasks.map((task, i) => (
            <li key={task.id} className="flex items-start gap-1.5 py-1">
              <button
                type="button"
                onClick={() => toggle(task)}
                disabled={isPending}
                aria-label={task.isDone ? "Mark not done" : "Mark done"}
                title={task.isDone ? "Mark not done" : "Mark done"}
                className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                  task.isDone
                    ? "border-brand bg-brand text-white"
                    : "border-line text-transparent hover:border-brand hover:bg-brand-soft"
                }`}
              >
                <CheckCircleIcon className="h-3 w-3" />
              </button>
              {/* Rank is the priority — #1 is the day's main focus. */}
              <span
                className={`w-2.5 shrink-0 text-right text-[11px] font-bold tabular-nums ${
                  task.isDone
                    ? "text-muted-fg/60"
                    : i === 0
                      ? "text-brand"
                      : "text-muted-fg"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`min-w-0 flex-1 break-words text-xs leading-snug transition-colors ${
                  task.isDone ? "text-muted-fg line-through" : "text-ink"
                }`}
              >
                {task.title}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function MonthGrid({
  month,
  today,
  deadlines,
  dayTasks,
  onPickDay,
}: {
  month: Month;
  today: Date;
  deadlines: Record<string, (Priority | null)[]>;
  dayTasks: Record<string, DayTaskCount>;
  onPickDay: (ymd: string) => void;
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
              tasks={dayTasks[ymd(month.y, month.m, day)]}
              onPick={onPickDay}
            />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * How a day number is painted. Two signals stack on the same element: the
 * *fill* says the day has focus tasks (tinted = still open, grey = all done),
 * and bold navy type says it's today — no ring, the colour carries it. The
 * dots below the number are a third, separate signal: goal deadlines, colored
 * by goal priority.
 */
function dayNumberStyle({
  hasTasks,
  allDone,
  isToday,
}: {
  hasTasks: boolean;
  allDone: boolean;
  isToday: boolean;
}): string {
  // Each CSS property is decided exactly once — no two competing utilities of
  // the same kind in the string, whose winner would depend on stylesheet order.
  const background = !hasTasks ? "" : allDone ? "bg-line" : "bg-brand-soft";
  const text =
    isToday || (hasTasks && !allDone)
      ? "font-bold text-brand"
      : hasTasks
        ? "font-medium text-muted-fg"
        : "font-medium text-ink";
  return background ? `${background} ${text}` : text;
}

/** One day. Clicking it opens that day's focus list. */
function DayCell({
  day,
  cell,
  todayYmd,
  priorities,
  tasks,
  onPick,
}: {
  day: number;
  cell: string;
  todayYmd: string;
  priorities: (Priority | null)[];
  tasks: DayTaskCount | undefined;
  onPick: (ymd: string) => void;
}) {
  const isToday = cell === todayYmd;
  const dots = sortByPriority(priorities).slice(0, MAX_DOTS);
  const total = tasks?.total ?? 0;
  const allDone = total > 0 && tasks!.open === 0;

  const label =
    total === 0
      ? `Add tasks for ${cell}`
      : `${total} ${total === 1 ? "task" : "tasks"} on ${cell}`;

  return (
    <button
      type="button"
      onClick={() => onPick(cell)}
      aria-label={label}
      title={label}
      className="flex h-9 flex-col items-center justify-start rounded pt-1 transition hover:bg-canvas"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-sm tabular-nums ${dayNumberStyle(
          { hasTasks: total > 0, allDone, isToday },
        )}`}
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
    </button>
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

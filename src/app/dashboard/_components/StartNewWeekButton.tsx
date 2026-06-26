"use client";

import { useEffect, useState, useTransition } from "react";
import { startNewWeek } from "../actions";

type IncompleteGoal = { id: string; title: string; percent: number };

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07-06","2026-07-13" → "Jul 6–13" (or "Jul 6 – Aug 2" across months). */
function formatRangeLabel(startYmd: string, endYmd: string): string {
  const [sy, sm, sd] = startYmd.split("-").map(Number);
  const [ey, em, ed] = endYmd.split("-").map(Number);
  const startStr = `${MONTHS[sm - 1]} ${sd}`;
  const endStr =
    sm === em && sy === ey ? `${ed}` : `${MONTHS[em - 1]} ${ed}`;
  return `${startStr}–${endStr}`;
}

export function StartNewWeekButton({
  incompleteGoals,
  defaultStart,
  defaultEnd,
}: {
  incompleteGoals: IncompleteGoal[];
  defaultStart: string;
  defaultEnd: string;
}) {
  const [open, setOpen] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [firstGoal, setFirstGoal] = useState("");
  const [isPending, startTransition] = useTransition();

  const hasUnfinished = incompleteGoals.length > 0;
  const allFilled = incompleteGoals.every(
    (g) => (reasons[g.id] ?? "").trim().length > 0,
  );
  const validRange = !!start && !!end && start <= end;
  const hasFirstGoal = firstGoal.trim().length > 0;

  function close() {
    setOpen(false);
    setReasons({});
    setStart(defaultStart);
    setEnd(defaultEnd);
    setFirstGoal("");
  }

  // Close on Escape and lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) close();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, isPending]);

  function submit() {
    if ((hasUnfinished && !allFilled) || !validRange || !hasFirstGoal) return;
    const payload = incompleteGoals.map((g) => ({
      goalId: g.id,
      reason: (reasons[g.id] ?? "").trim(),
    }));
    startTransition(async () => {
      await startNewWeek(payload, { start, end }, firstGoal.trim());
      close();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-accent bg-surface px-4 py-3 text-sm font-semibold text-accent transition hover:bg-accent-soft"
      >
        Start new week ({formatRangeLabel(defaultStart, defaultEnd)})
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={() => !isPending && close()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Editable date range for the new week */}
        <div className="mb-5">
          <h2 className="text-base font-bold text-ink">Start a new week</h2>
          <p className="mt-1 text-sm text-muted-fg">
            Set the dates for the upcoming week.
          </p>
          <div className="mt-3 flex items-end gap-3">
            <label className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
                Start
              </span>
              <input
                type="date"
                value={start}
                max={end || undefined}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
              />
            </label>
            <span className="pb-2.5 text-muted-fg">→</span>
            <label className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
                End
              </span>
              <input
                type="date"
                value={end}
                min={start || undefined}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
              />
            </label>
          </div>
          {!validRange && (
            <p className="mt-2 text-xs text-red-600">
              The end date must be on or after the start date.
            </p>
          )}

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
              First goal for the new week
            </span>
            <input
              type="text"
              value={firstGoal}
              onChange={(e) => setFirstGoal(e.target.value)}
              placeholder="e.g. Ship the onboarding flow"
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
            />
            <span className="mt-1 block text-xs text-muted-fg">
              Every new week needs at least one goal. You can add more after.
            </span>
          </label>
        </div>

        {hasUnfinished ? (
        <>
          <h2 className="text-base font-bold text-ink">
            Reflect before you close the week
          </h2>
          <p className="mt-1 text-sm text-muted-fg">
            These goals weren&rsquo;t marked complete. Note why before starting a
            new week — every goal needs a reason.
          </p>

          <div className="mt-4 flex flex-col gap-4">
            {incompleteGoals.map((g) => (
              <div key={g.id}>
                <label className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">
                    {g.title}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-accent">
                    {g.percent}%
                  </span>
                </label>
                <textarea
                  value={reasons[g.id] ?? ""}
                  onChange={(e) =>
                    setReasons((r) => ({ ...r, [g.id]: e.target.value }))
                  }
                  rows={3}
                  placeholder="What got in the way of finishing this goal?"
                  className="mt-1.5 w-full resize-y rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-fg">
          Start a fresh week? Your current goals will be archived.
        </p>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={close}
          className="rounded-lg px-4 py-2 text-sm font-medium text-muted-fg transition hover:bg-line"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={
            isPending || (hasUnfinished && !allFilled) || !validRange || !hasFirstGoal
          }
          onClick={submit}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending
            ? "Starting…"
            : validRange
              ? `Start week (${formatRangeLabel(start, end)})`
              : "Start week"}
        </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { startNewWeek } from "../actions";
import { PRIORITY_LABEL, type Priority } from "@/lib/priority";
import { DeadlinePicker } from "./DeadlinePicker";
import { PriorityPicker } from "./PriorityPicker";

type IncompleteGoal = { id: string; title: string; percent: number };

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07-13" → "Jul 13". */
function formatDayLabel(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

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
  todayYmd,
}: {
  incompleteGoals: IncompleteGoal[];
  defaultStart: string;
  defaultEnd: string;
  todayYmd: string;
}) {
  const [open, setOpen] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [firstGoal, setFirstGoal] = useState("");
  const [priority, setPriority] = useState<Priority | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  // Set once the user tries to start the week; drives the "what's missing" hints
  // so we never disable the button without telling them why.
  const [attempted, setAttempted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hasUnfinished = incompleteGoals.length > 0;
  const allFilled = incompleteGoals.every(
    (g) => (reasons[g.id] ?? "").trim().length > 0,
  );
  const validRange = !!start && !!end && start <= end;
  // The first goal is optional. If a title was typed, it needs a priority and
  // deadline like any goal; if left blank, the week just opens empty.
  const hasTitle = firstGoal.trim().length > 0;
  const needsPriority = hasTitle && priority == null;
  const needsDeadline = hasTitle && deadline == null;
  const firstGoalReady = !hasTitle || (priority != null && deadline != null);

  // Everything that's stopping the week from starting, in plain language.
  const missing: string[] = [];
  if (needsPriority) missing.push("a priority for your goal");
  if (needsDeadline) missing.push("a deadline for your goal");
  if (hasUnfinished && !allFilled)
    missing.push("a reason for every goal below 100%");
  if (!validRange) missing.push("a valid start date");

  function close() {
    setOpen(false);
    setReasons({});
    setStart(defaultStart);
    setEnd(defaultEnd);
    setFirstGoal("");
    setPriority(null);
    setDeadline(null);
    setAttempted(false);
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
    if ((hasUnfinished && !allFilled) || !validRange || !firstGoalReady) {
      // Don't silently no-op — reveal exactly which fields still need filling.
      setAttempted(true);
      return;
    }
    const payload = incompleteGoals.map((g) => ({
      goalId: g.id,
      reason: (reasons[g.id] ?? "").trim(),
    }));
    // Only send a first goal when one was actually entered (title + priority +
    // deadline); otherwise the week opens empty.
    const goal =
      hasTitle && priority != null && deadline != null
        ? { title: firstGoal.trim(), priority, deadline }
        : undefined;
    startTransition(async () => {
      await startNewWeek(payload, { start, end }, goal);
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
        {/* Flexible start, preset end for the new week */}
        <div className="mb-5">
          <h2 className="text-base font-bold text-ink">Start a new week</h2>
          <p className="mt-1 text-sm text-muted-fg">
            Pick when the week starts — it ends on the preset date.
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
            <div className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
                End (preset)
              </span>
              <div className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-muted-fg">
                {formatDayLabel(end)}
              </div>
            </div>
          </div>
          {!validRange && (
            <p className="mt-2 text-xs text-red-600">
              The start date must be on or before the preset end date.
            </p>
          )}

          <div className="mt-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
              First goal{" "}
              <span className="font-normal text-muted-fg/80">(optional)</span>
            </span>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-line px-3 py-2 focus-within:border-brand">
              <input
                type="text"
                value={firstGoal}
                onChange={(e) => setFirstGoal(e.target.value)}
                placeholder="e.g. Ship the onboarding flow"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted-fg focus:outline-none"
              />
              <PriorityPicker
                value={priority}
                onChange={setPriority}
                invalid={attempted && needsPriority}
              />
              <DeadlinePicker
                value={deadline}
                todayYmd={todayYmd}
                overdue={false}
                onChange={setDeadline}
                invalid={attempted && needsDeadline}
              />
            </div>
            <span className="mt-1 block text-xs text-muted-fg">
              You can start the week empty and add goals later. If you do add one
              here, tap the <span className="font-semibold">flag</span> for a
              priority and the <span className="font-semibold">calendar</span>{" "}
              for a deadline.
              {priority != null && ` Priority: ${PRIORITY_LABEL[priority]}.`}
            </span>
          </div>
        </div>

        {hasUnfinished ? (
        <>
          <h2 className="text-base font-bold text-ink">
            Reflect before you close the week
          </h2>
          <p className="mt-1 text-sm text-muted-fg">
            These goals came in below 100%. Note what happened before starting a
            new week — each one needs a reason.
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

      {attempted && missing.length > 0 && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
          Before starting the week, add {missing.join(", ")}.
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
          disabled={isPending}
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

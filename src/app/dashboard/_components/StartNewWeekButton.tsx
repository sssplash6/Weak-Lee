"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useModalFocus } from "@/lib/useModalFocus";
import { startNewWeek } from "../actions";

type IncompleteGoal = { id: string; title: string; percent: number };
type CarryGoal = { id: string; title: string; percent: number; done: boolean };

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
  carryGoals,
  defaultStart,
  defaultEnd,
  canStart,
  opensOnLabel,
}: {
  incompleteGoals: IncompleteGoal[];
  carryGoals: CarryGoal[];
  defaultStart: string;
  defaultEnd: string;
  // False until noon on the Friday before the new week. Closing before then
  // would put this person a week ahead of everyone else's cycle, so the button
  // is locked rather than hidden — with the date it unlocks.
  canStart: boolean;
  opensOnLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useModalFocus(open, boxRef);

  // The trigger is replaced by the modal, so the hook has nothing to restore
  // focus to — put it back on the rebuilt button once the modal closes.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  // Which goals to copy into the new week (unfinished ones default on), and the
  // fresh deadline for each (defaults to the new week's end).
  const [carry, setCarry] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(carryGoals.map((g) => [g.id, !g.done])),
  );
  const [carryDeadlines, setCarryDeadlines] = useState<Record<string, string>>(
    () => Object.fromEntries(carryGoals.map((g) => [g.id, defaultEnd])),
  );
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  // Set once the user tries to start the week; drives the "what's missing" hints
  // so we never disable the button without telling them why.
  const [attempted, setAttempted] = useState(false);
  // Anything the server refused (e.g. a start date that isn't open yet), shown
  // in the dialog instead of throwing to the error boundary.
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasUnfinished = incompleteGoals.length > 0;
  const allFilled = incompleteGoals.every(
    (g) => (reasons[g.id] ?? "").trim().length > 0,
  );
  const validRange = !!start && !!end && start <= end;
  // Every goal being carried forward needs a new deadline.
  const carryValid = carryGoals.every(
    (g) => !carry[g.id] || (carryDeadlines[g.id] ?? "").length > 0,
  );

  // A week can't be opened ahead of schedule, so the start date can't be pushed
  // past the default (the week that follows the one closing). Bringing it
  // earlier — catching up — stays allowed.
  const startTooFar = start > defaultStart;

  // Everything that's stopping the week from starting, in plain language.
  const missing: string[] = [];
  if (hasUnfinished && !allFilled)
    missing.push("a reason for every goal below 100%");
  if (!carryValid) missing.push("a deadline for each carried goal");
  if (!validRange) missing.push("a valid start date");
  if (startTooFar) missing.push(`a start date no later than ${formatDayLabel(defaultStart)}`);

  function close() {
    setOpen(false);
    setReasons({});
    setCarry(Object.fromEntries(carryGoals.map((g) => [g.id, !g.done])));
    setCarryDeadlines(
      Object.fromEntries(carryGoals.map((g) => [g.id, defaultEnd])),
    );
    setStart(defaultStart);
    setEnd(defaultEnd);
    setAttempted(false);
    setError(null);
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
    if (
      (hasUnfinished && !allFilled) ||
      !carryValid ||
      !validRange ||
      startTooFar
    ) {
      // Don't silently no-op — reveal exactly which fields still need filling.
      setAttempted(true);
      return;
    }
    setError(null);
    const payload = incompleteGoals.map((g) => ({
      goalId: g.id,
      reason: (reasons[g.id] ?? "").trim(),
    }));
    const carryPayload = carryGoals
      .filter((g) => carry[g.id])
      .map((g) => ({ goalId: g.id, deadline: carryDeadlines[g.id] }));
    startTransition(async () => {
      try {
        await startNewWeek(payload, { start, end }, carryPayload);
        close();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Couldn't start the new week.",
        );
      }
    });
  }

  if (!open) {
    // Before the window opens, say when it does rather than offering a button
    // that would only be refused.
    if (!canStart) {
      return (
        <div className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-center">
          <p className="text-sm font-semibold text-muted-fg">
            {`Start new week (${formatRangeLabel(defaultStart, defaultEnd)})`}
          </p>
          <p className="mt-0.5 text-xs text-muted-fg">
            {`Opens Friday, ${opensOnLabel} at 12:00 — finish this week first.`}
          </p>
        </div>
      );
    }
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-accent bg-surface px-4 py-3 text-sm font-semibold text-accent-ink transition hover:bg-accent-soft"
      >
        Start new week ({formatRangeLabel(defaultStart, defaultEnd)})
      </button>
    );
  }

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={() => !isPending && close()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-week-heading"
    >
      <div
        ref={boxRef}
        className="modal-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Flexible start, preset end for the new week */}
        <div className="mb-5">
          <h2 id="start-week-heading" className="text-base font-bold text-ink">
            Start a new week
          </h2>
          <p className="mt-1 text-sm text-muted-fg">
            Pick when the week starts — it ends on the preset date. Carry
            unfinished goals forward below, or start fresh and add goals
            afterwards.
          </p>
          <div className="mt-3 flex items-end gap-3">
            <label className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
                Start
              </span>
              <input
                type="date"
                value={start}
                max={defaultStart}
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
                  <span className="text-xs font-semibold tabular-nums text-accent-ink">
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

      {carryGoals.length > 0 && (
        <div className="mt-6">
          <h2 className="text-base font-bold text-ink">
            Carry goals into the new week
          </h2>
          <p className="mt-1 text-sm text-muted-fg">
            Checked goals are copied into the new week with the deadline you set.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {carryGoals.map((g) => {
              const checked = carry[g.id] ?? false;
              return (
                <div
                  key={g.id}
                  className="rounded-lg border border-line px-3 py-2.5"
                >
                  <label className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setCarry((c) => ({ ...c, [g.id]: e.target.checked }))
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-accent"
                    />
                    <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                      {g.title}
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-accent-ink">
                      {g.percent}%
                    </span>
                  </label>
                  {checked && (
                    <label className="mt-2 flex items-center gap-2 pl-[26px] text-xs font-medium text-muted-fg">
                      New deadline
                      <input
                        type="date"
                        value={carryDeadlines[g.id] ?? ""}
                        onChange={(e) =>
                          setCarryDeadlines((d) => ({
                            ...d,
                            [g.id]: e.target.value,
                          }))
                        }
                        className="rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {attempted && missing.length > 0 && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
          Before starting the week, add {missing.join(", ")}.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
          {error}
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
          className="rounded-lg bg-accent-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink-dark disabled:cursor-not-allowed disabled:opacity-50"
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

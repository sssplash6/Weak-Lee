"use client";

import { useEffect, useState, useTransition } from "react";
import { startNewMonth } from "../actions";
import { PRIORITY_LABEL, type Priority } from "@/lib/priority";
import { DeadlinePicker } from "./DeadlinePicker";
import { PriorityPicker } from "./PriorityPicker";

type IncompleteGoal = { id: string; title: string; percent: number };

/**
 * Close the current month and open the next one. Same reflection flow as
 * closing a week — every unfinished goal needs a reason, and the new month
 * needs a first goal — but the date range isn't editable: months are always
 * whole calendar months, so the next one is fixed (its name is shown on the
 * button, e.g. "Start new month (August)").
 */
export function StartNewMonthButton({
  incompleteGoals,
  nextMonthLabel,
  todayYmd,
}: {
  incompleteGoals: IncompleteGoal[];
  nextMonthLabel: string;
  todayYmd: string;
}) {
  const [open, setOpen] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [firstGoal, setFirstGoal] = useState("");
  const [priority, setPriority] = useState<Priority | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasUnfinished = incompleteGoals.length > 0;
  const allFilled = incompleteGoals.every(
    (g) => (reasons[g.id] ?? "").trim().length > 0,
  );
  const hasFirstGoal =
    firstGoal.trim().length > 0 && priority != null && deadline != null;

  function close() {
    setOpen(false);
    setReasons({});
    setFirstGoal("");
    setPriority(null);
    setDeadline(null);
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
    if ((hasUnfinished && !allFilled) || !hasFirstGoal) return;
    if (priority == null || deadline == null) return;
    const payload = incompleteGoals.map((g) => ({
      goalId: g.id,
      reason: (reasons[g.id] ?? "").trim(),
    }));
    startTransition(async () => {
      await startNewMonth(payload, {
        title: firstGoal.trim(),
        priority,
        deadline,
      });
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
        Close month &amp; start {nextMonthLabel}
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
        <div className="mb-5">
          <h2 className="text-base font-bold text-ink">
            Close this month, start {nextMonthLabel}
          </h2>
          <p className="mt-1 text-sm text-muted-fg">
            Your current goals will be archived and a fresh month begins.
          </p>

          <div className="mt-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
              First goal for {nextMonthLabel}
            </span>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-line px-3 py-2 focus-within:border-brand">
              <input
                type="text"
                value={firstGoal}
                onChange={(e) => setFirstGoal(e.target.value)}
                placeholder="e.g. Launch the referral program"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted-fg focus:outline-none"
              />
              <PriorityPicker value={priority} onChange={setPriority} />
              <DeadlinePicker
                value={deadline}
                todayYmd={todayYmd}
                overdue={false}
                onChange={setDeadline}
              />
            </div>
            <span className="mt-1 block text-xs text-muted-fg">
              Every new month needs at least one goal — with a priority and
              deadline.
              {priority != null && ` Priority: ${PRIORITY_LABEL[priority]}.`}
            </span>
          </div>
        </div>

        {hasUnfinished ? (
          <>
            <h2 className="text-base font-bold text-ink">
              Reflect before you close the month
            </h2>
            <p className="mt-1 text-sm text-muted-fg">
              These goals weren&rsquo;t marked complete. Note why before
              starting a new month — every goal needs a reason.
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
            Everything&rsquo;s wrapped up — nothing left to reflect on.
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
            disabled={isPending || (hasUnfinished && !allFilled) || !hasFirstGoal}
            onClick={submit}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Starting…" : `Start ${nextMonthLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

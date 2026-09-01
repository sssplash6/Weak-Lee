"use client";

import { useTransition } from "react";
import { reopenMonth, reopenWeek, submitMonth, submitWeek } from "../actions";
import { CheckCircleIcon } from "./icons";

/**
 * The goal-submission control for a week or a month, with three states:
 *  - draft (never submitted): a prompt + "Submit goals" button.
 *  - locked (submitted): shows the first-submit time + "Edit goals" to re-open.
 *  - re-opened (submitted, then edited): editable again with "Submit goals" to
 *    re-lock; still shows the original submit time, which never changes.
 *
 * Weekly submissions have a deadline (enforced elsewhere); monthly ones never do.
 *
 * `placement` only moves the spacing to the other side: the control normally
 * sits above the goal list, but some accounts have it below (lib/submitPlacement.ts).
 */
export function WeekSubmit({
  scope = "week",
  locked,
  submittedAtLabel,
  goalCount,
  placement = "top",
}: {
  scope?: "week" | "month";
  locked: boolean;
  submittedAtLabel: string | null;
  goalCount: number;
  placement?: "top" | "bottom";
}) {
  const [isPending, startTransition] = useTransition();
  const submit = scope === "month" ? submitMonth : submitWeek;
  const reopen = scope === "month" ? reopenMonth : reopenWeek;
  const spacing = placement === "bottom" ? "mt-5" : "mb-5";

  if (locked) {
    return (
      <div
        className={`${spacing} flex items-center gap-2.5 rounded-xl border border-brand/20 bg-brand-soft/40 px-4 py-2.5`}
      >
        <CheckCircleIcon className="h-4 w-4 shrink-0 text-brand" />
        <p className="min-w-0 flex-1 truncate text-sm text-ink">
          <span className="font-semibold">Goals submitted</span>
          {submittedAtLabel && (
            <span className="text-muted-fg"> · {submittedAtLabel}</span>
          )}
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => void (await reopen()))}
          className="shrink-0 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1 text-sm font-medium text-ink transition hover:border-brand/40 hover:text-brand disabled:opacity-50"
        >
          {isPending ? "Opening…" : "Edit goals"}
        </button>
      </div>
    );
  }

  const canSubmit = goalCount > 0 && !isPending;
  const resubmitting = submittedAtLabel != null;

  return (
    <div
      className={`${spacing} flex items-center gap-3 rounded-xl border border-dashed border-line bg-surface/50 px-4 py-3`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">
          {resubmitting ? "Editing your goals" : "Finished setting your goals?"}
        </p>
        <p className="text-xs text-muted-fg">
          {resubmitting
            ? `Submitted ${submittedAtLabel} — that time stays fixed when you re-submit.`
            : `Submit to confirm them for the ${scope}. You can still edit afterwards.`}
        </p>
      </div>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => startTransition(async () => void (await submit()))}
        title={goalCount === 0 ? "Add a goal first" : undefined}
        className="shrink-0 whitespace-nowrap rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Submitting…" : resubmitting ? "Re-submit" : "Submit goals"}
      </button>
    </div>
  );
}

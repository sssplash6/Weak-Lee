"use client";

import { useTransition } from "react";
import { reopenWeek, submitWeek } from "../actions";
import { CheckCircleIcon } from "./icons";

/**
 * The weekly goal-submission control, with three states:
 *  - draft (never submitted): a prompt + "Submit goals" button.
 *  - locked (submitted): shows the first-submit time + "Edit goals" to re-open.
 *  - re-opened (submitted, then edited): editable again with "Submit goals" to
 *    re-lock; still shows the original submit time, which never changes.
 */
export function WeekSubmit({
  locked,
  submittedAtLabel,
  goalCount,
}: {
  locked: boolean;
  submittedAtLabel: string | null;
  goalCount: number;
}) {
  const [isPending, startTransition] = useTransition();

  if (locked) {
    return (
      <div className="mb-5 flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft/50 px-4 py-3">
        <CheckCircleIcon className="h-5 w-5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Goals submitted</p>
          {submittedAtLabel && (
            <p className="truncate text-xs text-muted-fg">{submittedAtLabel}</p>
          )}
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => void (await reopenWeek()))}
          className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:border-brand/40 hover:text-brand disabled:opacity-50"
        >
          {isPending ? "Opening…" : "Edit goals"}
        </button>
      </div>
    );
  }

  const canSubmit = goalCount > 0 && !isPending;
  const resubmitting = submittedAtLabel != null;

  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-dashed border-line bg-surface/50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">
          {resubmitting ? "Editing your goals" : "Finished setting your goals?"}
        </p>
        <p className="text-xs text-muted-fg">
          {resubmitting
            ? `Submitted ${submittedAtLabel} — that time stays fixed when you re-submit.`
            : "Submit to confirm them for the week. You can still edit afterwards."}
        </p>
      </div>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => startTransition(async () => void (await submitWeek()))}
        title={goalCount === 0 ? "Add a goal first" : undefined}
        className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Submitting…" : resubmitting ? "Re-submit" : "Submit goals"}
      </button>
    </div>
  );
}

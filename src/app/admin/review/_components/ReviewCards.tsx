"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon } from "../../../dashboard/_components/icons";

export type ReviewGoal = {
  id: string;
  title: string;
  percent: number;
  completed: boolean;
  deadlineLabel: string | null;
  // The reason the person gave for not finishing (captured when the week is
  // closed); null while the week is open or when the goal was completed.
  incompleteReason: string | null;
};

export type ReviewMember = {
  id: string;
  name: string;
  emoji: string;
  bg: string;
  // The reviewed week's own date range — can differ from the calendar week in
  // the page header when someone runs custom week bounds.
  weekLabel: string | null;
  goalCount: number;
  percent: number;
  late: boolean;
  // Whether they closed the current week and started the next one. Only surfaced
  // on Sunday (see `showReported`).
  reported: boolean;
  submittedAtLabel: string | null;
  goals: ReviewGoal[];
};

/**
 * The weekly-review grid: one card per team member (avatar, name, goal
 * count). Clicking a card opens a modal summarizing that person's week.
 */
export function ReviewCards({
  members,
  showReported = false,
}: {
  members: ReviewMember[];
  // On Sunday, flag on each card whether the person has closed the current week
  // and started the next one.
  showReported?: boolean;
}) {
  const [selected, setSelected] = useState<ReviewMember | null>(null);

  // Close on Escape and lock body scroll while the modal is open.
  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selected]);

  if (members.length === 0) {
    return <p className="px-1 text-sm text-muted-fg">No team members yet.</p>;
  }

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setSelected(m)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-5 text-left shadow-sm transition hover:border-brand/40 hover:shadow"
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line text-xl ${m.bg}`}
              >
                <span aria-hidden="true">{m.emoji}</span>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">
                  {m.name}
                </span>
                <span className="block text-xs text-muted-fg">
                  {m.goalCount} {m.goalCount === 1 ? "goal" : "goals"}
                </span>
              </span>
              {showReported &&
                (m.reported ? (
                  <span className="ml-auto shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700">
                    Reported
                  </span>
                ) : (
                  <span className="ml-auto shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                    Not reported
                  </span>
                ))}
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <MemberModal member={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function MemberModal({
  member: m,
  onClose,
}: {
  member: ReviewMember;
  onClose: () => void;
}) {
  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${m.name}'s week`}
    >
      <div
        className="modal-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line text-xl ${m.bg}`}
          >
            <span aria-hidden="true">{m.emoji}</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-ink">{m.name}</h2>
            <p className="text-xs text-muted-fg">
              {m.weekLabel ? `${m.weekLabel} · ` : ""}
              {m.submittedAtLabel
                ? `Goals submitted ${m.submittedAtLabel}`
                : "Goals not submitted yet"}
              {m.late && (
                <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                  Late
                </span>
              )}
            </p>
          </div>
          {m.goalCount > 0 && (
            <span className="shrink-0 text-sm font-semibold tabular-nums text-accent-ink">
              {m.percent}%
            </span>
          )}
        </div>

        {m.goals.length === 0 ? (
          <p className="mt-5 text-sm text-muted-fg">
            No goals set this week.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-4">
            {m.goals.map((g) => (
              <li key={g.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink">
                    {g.completed && (
                      <CheckCircleIcon className="h-4 w-4 shrink-0 text-brand" />
                    )}
                    <span className="min-w-0 break-words">{g.title}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-accent-ink">
                    {g.percent}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${g.percent}%` }}
                  />
                </div>
                {g.deadlineLabel && (
                  <p className="mt-1 text-xs text-muted-fg">
                    Due {g.deadlineLabel}
                  </p>
                )}
                {g.incompleteReason && (
                  <p className="mt-1 text-xs italic text-muted-fg">
                    “{g.incompleteReason}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

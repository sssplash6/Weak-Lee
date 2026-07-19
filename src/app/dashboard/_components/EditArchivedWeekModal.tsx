"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { GoalCard, type GoalView, type TeamMember } from "./GoalCard";

/**
 * The edit window for the most recent archived week: a modal listing the
 * week's goals as regular goal cards — the same editing surface as the
 * current week. Portaled to <body> because the archive lives in the sidebar's
 * sticky stacking context, which would otherwise paint goal cards above the
 * overlay (same reason as AssignGoalButton).
 */
export function EditArchivedWeekModal({
  label,
  goals,
  team,
  todayYmd,
  nowStamp,
  onClose,
}: {
  label: string;
  goals: GoalView[];
  team: TeamMember[];
  todayYmd: string;
  nowStamp: string;
  onClose: () => void;
}) {
  // Close on Escape and lock body scroll while the modal is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit week ${label}`}
    >
      <div
        className="modal-in flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-ink">Edit week {label}</h2>
            <p className="mt-1 text-sm text-muted-fg">
              Your most recent week is the one past week you can still edit.
              Changes save right away.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Done
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4 overflow-y-auto pr-1">
          {goals.length === 0 ? (
            <p className="text-sm text-muted-fg">No goals this week.</p>
          ) : (
            goals.map((goal, i) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                index={i + 1}
                team={team}
                todayYmd={todayYmd}
                nowStamp={nowStamp}
                locked={false}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

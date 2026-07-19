"use client";

import { useState } from "react";
import { PenIcon } from "./icons";
import { EditArchivedWeekModal } from "./EditArchivedWeekModal";
import type { GoalView, TeamMember } from "./GoalCard";

type ArchivedSubtask = { id: string; title: string; isDone: boolean };

type ArchivedGoal = {
  id: string;
  title: string;
  percent: number;
  completed: boolean;
  incompleteReason: string | null;
  subtasks: ArchivedSubtask[];
};

export type ArchivedWeekView = {
  id: string;
  label: string;
  percent: number;
  goals: ArchivedGoal[];
};

export function WeekArchive({
  weeks,
  periodNoun = "week",
  editableWeek = null,
  team = [],
  todayYmd = "",
  nowStamp = "",
}: {
  weeks: ArchivedWeekView[];
  // "week" or "month" — only changes the copy, the rows render the same.
  periodNoun?: string;
  // The most recent archived week (week view only): its row gets a pen button
  // that opens the edit window. Null = nothing editable (no archive, or the
  // month view, where past periods stay read-only).
  editableWeek?: { id: string; goals: GoalView[] } | null;
  team?: TeamMember[];
  todayYmd?: string;
  nowStamp?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);

  const editableLabel = editableWeek
    ? (weeks.find((w) => w.id === editableWeek.id)?.label ?? "")
    : "";

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-fg">
        Archive
      </h2>

      {weeks.length === 0 ? (
        <p className="mt-3 px-1 text-sm text-muted-fg">
          No past {periodNoun}s yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {weeks.map((week) => (
            <li key={week.id}>
              <WeekRow
                week={week}
                periodNoun={periodNoun}
                open={expanded.has(week.id)}
                onToggle={() => toggle(week.id)}
                editable={editableWeek?.id === week.id}
                onEdit={() => setEditing(true)}
              />
            </li>
          ))}
        </ul>
      )}

      {editing && editableWeek && (
        <EditArchivedWeekModal
          label={editableLabel}
          goals={editableWeek.goals}
          team={team}
          todayYmd={todayYmd}
          nowStamp={nowStamp}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function WeekRow({
  week,
  periodNoun,
  open,
  onToggle,
  editable,
  onEdit,
}: {
  week: ArchivedWeekView;
  periodNoun: string;
  open: boolean;
  onToggle: () => void;
  editable: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition hover:bg-canvas ${
            editable ? "rounded-l-xl" : "rounded-xl"
          }`}
        >
          <Chevron open={open} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
            {week.label}
          </span>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-accent-ink">
            {week.percent}%
          </span>
        </button>
        {editable && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit week ${week.label}`}
            title="Edit this week"
            className="mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-fg transition hover:bg-brand-soft hover:text-brand"
          >
            <PenIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="rise-in border-t border-line px-3 py-3">
          {week.goals.length === 0 ? (
            <p className="text-sm text-muted-fg">No goals this {periodNoun}.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {week.goals.map((goal) => (
                <GoalSummary key={goal.id} goal={goal} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function GoalSummary({ goal }: { goal: ArchivedGoal }) {
  const [open, setOpen] = useState(false);
  const done = goal.subtasks.filter((s) => s.isDone).length;
  const hasSubtasks = goal.subtasks.length > 0;

  return (
    <li>
      <div className="flex items-baseline gap-2">
        <button
          type="button"
          onClick={() => hasSubtasks && setOpen((v) => !v)}
          aria-expanded={open}
          disabled={!hasSubtasks}
          className={`flex min-w-0 flex-1 items-baseline gap-1.5 text-left ${
            hasSubtasks ? "cursor-pointer" : "cursor-default"
          }`}
        >
          {hasSubtasks && <Chevron open={open} />}
          <span className="min-w-0 flex-1 break-words text-sm font-medium text-ink">
            {goal.title}
          </span>
        </button>
        {goal.completed && (
          <span className="shrink-0 text-xs font-semibold text-brand">
            ✓ Completed
          </span>
        )}
        <span className="shrink-0 text-xs font-semibold tabular-nums text-accent-ink">
          {goal.percent}%
        </span>
      </div>

      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${goal.percent}%` }}
        />
      </div>

      {open && hasSubtasks && (
        <ul className="rise-in mt-2 flex flex-col gap-0.5">
          {goal.subtasks.map((s) => (
            <li key={s.id} className="flex items-start gap-1.5 text-xs">
              <span
                className={`mt-px shrink-0 ${
                  s.isDone ? "text-accent-ink" : "text-muted-fg"
                }`}
                aria-hidden
              >
                {s.isDone ? "✓" : "○"}
              </span>
              <span
                className={
                  s.isDone ? "text-muted-fg line-through" : "text-ink"
                }
              >
                {s.title}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-[11px] text-muted-fg">
        {done}/{goal.subtasks.length} done
      </p>

      {goal.incompleteReason && (
        <p className="mt-1 text-[11px] italic text-muted-fg">
          “{goal.incompleteReason}”
        </p>
      )}
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 shrink-0 text-muted-fg transition-transform ${
        open ? "rotate-90" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

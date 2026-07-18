"use client";

import { useTransition } from "react";
import { TrashIcon } from "../../dashboard/_components/icons";
import { deleteAssignedTask } from "../actions";

export type AdminAssignedTask = {
  id: string;
  title: string;
  note: string | null;
  assigneeName: string;
  scopeLabel: string; // "Weekly" | "Monthly"
  deadlineLabel: string | null;
  done: boolean;
  createdAtLabel: string;
};

/**
 * Admin monitoring view for assigned goals: everything assigned, each with its
 * assignee, weekly/monthly scope, and done/pending status, plus an overall
 * progress count. Assigning happens from the dashboard's right sidebar
 * (AssignGoalPanel) — this panel only tracks and removes.
 */
export function AssignedTasksPanel({ tasks }: { tasks: AdminAssignedTask[] }) {
  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <p className="text-sm font-semibold text-ink">
          Assigned goals{" "}
          <span className="font-normal text-muted-fg">({tasks.length})</span>
        </p>
        {tasks.length > 0 && (
          <span className="text-xs font-semibold tabular-nums text-muted-fg">
            {doneCount}/{tasks.length} done
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <p className="border-t border-line px-4 py-3 text-sm text-muted-fg">
          Nothing assigned yet. Assign a goal from your dashboard&rsquo;s right
          sidebar.
        </p>
      ) : (
        <ul className="border-t border-line">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRow({ task: t }: { task: AdminAssignedTask }) {
  const [isPending, startTransition] = useTransition();
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0">
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          t.done ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
        }`}
      >
        {t.done ? "Done" : "Pending"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="break-words text-ink">{t.title}</span>
        <span className="block break-words text-xs text-muted-fg">
          {t.assigneeName}
          {t.deadlineLabel ? ` · due ${t.deadlineLabel}` : ""}
          {t.note ? ` · ${t.note}` : ""}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted-fg">
        {t.scopeLabel}
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => void (await deleteAssignedTask(t.id)))
        }
        className="shrink-0 text-muted-fg transition hover:text-red-500 disabled:opacity-50"
        aria-label="Remove assigned goal"
        title="Remove assigned goal"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

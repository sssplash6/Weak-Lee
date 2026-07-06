"use client";

import { useOptimistic, useTransition } from "react";
import { setAssignedTaskDone } from "../actions";
import { CheckCircleIcon } from "./icons";

export type AssignedTaskView = {
  id: string;
  title: string;
  note: string | null;
  deadlineLabel: string | null;
  done: boolean;
};

/**
 * The signed-in user's admin-assigned tasks — a standalone list, separate from
 * their own weekly goals and NOT counted in their week percent. Golden-bordered
 * to set it apart. Each task can be checked off by the assignee.
 */
export function AssignedTasks({ tasks }: { tasks: AssignedTaskView[] }) {
  if (tasks.length === 0) return null;
  return (
    <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50/60 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-amber-700">Assigned to you</p>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
          by admin
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {tasks.map((t) => (
          <AssignedRow key={t.id} task={t} />
        ))}
      </ul>
    </div>
  );
}

function AssignedRow({ task }: { task: AssignedTaskView }) {
  const [, startTransition] = useTransition();
  const [done, applyDone] = useOptimistic(
    task.done,
    (_s: boolean, next: boolean) => next,
  );

  function toggle() {
    const next = !done;
    startTransition(async () => {
      applyDone(next);
      await setAssignedTaskDone(task.id, next);
    });
  }

  return (
    <li className="flex items-start gap-2 text-sm">
      <button
        type="button"
        onClick={toggle}
        aria-label={done ? "Mark not done" : "Mark done"}
        title={done ? "Mark not done" : "Mark done"}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
          done
            ? "border-amber-500 bg-amber-500 text-white"
            : "border-amber-400 text-transparent hover:bg-amber-100"
        }`}
      >
        <CheckCircleIcon className="h-4 w-4" />
      </button>
      <span className="min-w-0 flex-1">
        <span
          className={`break-words ${
            done ? "text-amber-700/60 line-through" : "text-ink"
          }`}
        >
          {task.title}
        </span>
        {task.deadlineLabel && (
          <span className="ml-2 whitespace-nowrap rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
            Due {task.deadlineLabel}
          </span>
        )}
        {task.note && (
          <span className="mt-0.5 block text-xs text-amber-700/70">
            {task.note}
          </span>
        )}
      </span>
    </li>
  );
}

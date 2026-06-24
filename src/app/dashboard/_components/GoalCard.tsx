"use client";

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { goalPercent } from "@/lib/progress";
import {
  addSubtask,
  deleteGoal,
  deleteSubtask,
  renameGoal,
  setGoalCompleted,
  shareSubtask,
  toggleSubtask,
} from "../actions";
import { CheckCircleIcon, ShareIcon, TrashIcon } from "./icons";

type SubtaskView = {
  id: string;
  title: string;
  isDone: boolean;
  sharedTo: string[];
  receivedFrom: string | null;
};

type GoalView = {
  id: string;
  title: string;
  completed: boolean;
  subtasks: SubtaskView[];
};

type TeamMember = { id: string; name: string };

type OptAction =
  | { type: "toggle"; id: string; isDone: boolean }
  | { type: "add"; id: string; title: string }
  | { type: "delete"; id: string };

export function GoalCard({
  goal,
  index,
  team,
}: {
  goal: GoalView;
  index: number;
  team: TeamMember[];
}) {
  const [isPending, startTransition] = useTransition();
  const [completed, applyCompleted] = useOptimistic(
    goal.completed,
    (_state: boolean, next: boolean) => next,
  );
  const [subtasks, applyOptimistic] = useOptimistic(
    goal.subtasks,
    (state: SubtaskView[], action: OptAction) => {
      switch (action.type) {
        case "toggle":
          return state.map((s) =>
            s.id === action.id ? { ...s, isDone: action.isDone } : s,
          );
        case "add":
          return [
            ...state,
            {
              id: action.id,
              title: action.title,
              isDone: false,
              sharedTo: [],
              receivedFrom: null,
            },
          ];
        case "delete":
          return state.filter((s) => s.id !== action.id);
      }
    },
  );

  const percent = goalPercent(subtasks);

  function onToggle(id: string, isDone: boolean) {
    startTransition(async () => {
      applyOptimistic({ type: "toggle", id, isDone });
      await toggleSubtask(id, isDone);
    });
  }

  function onDeleteSubtask(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "delete", id });
      await deleteSubtask(id);
    });
  }

  function onToggleCompleted() {
    const next = !completed;
    startTransition(async () => {
      applyCompleted(next);
      await setGoalCompleted(goal.id, next);
    });
  }

  return (
    <article
      className={`rounded-2xl border bg-surface p-5 shadow-sm transition-colors ${
        completed ? "border-brand ring-1 ring-brand/20" : "border-line"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
          {index}
        </span>
        <GoalTitle goalId={goal.id} title={goal.title} />
        <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-accent">
          {percent}%
        </span>
        <CompleteButton
          completed={completed}
          allDone={percent === 100}
          onToggle={onToggleCompleted}
        />
        <DeleteGoalButton goalId={goal.id} />
      </div>

      {/* progress bar */}
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* subtasks */}
      <ul className="mt-4 flex flex-col gap-1">
        {subtasks.map((s) => (
          <SubtaskRow
            key={s.id}
            subtask={s}
            team={team}
            onToggle={onToggle}
            onDelete={onDeleteSubtask}
          />
        ))}
        {subtasks.length === 0 && (
          <li className="px-1 py-1 text-sm text-muted-fg">
            No subtasks yet — add one to start tracking progress.
          </li>
        )}
      </ul>

      <AddSubtaskForm
        goalId={goal.id}
        disabled={isPending}
        onOptimisticAdd={(id, title) =>
          startTransition(() => applyOptimistic({ type: "add", id, title }))
        }
      />
    </article>
  );
}

function CompleteButton({
  completed,
  allDone,
  onToggle,
}: {
  completed: boolean;
  allDone: boolean;
  onToggle: () => void;
}) {
  if (completed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Mark as not completed"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-brand-dark"
      >
        <CheckCircleIcon className="h-3.5 w-3.5" />
        Completed
      </button>
    );
  }

  // Not completed yet. Emphasize once every subtask is done — that's the moment
  // a user is most likely to want to confirm the goal itself is finished.
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Mark this goal as completed"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
        allDone
          ? "border-transparent bg-brand text-white hover:bg-brand-dark"
          : "border-brand text-brand hover:bg-brand-soft"
      }`}
    >
      <CheckCircleIcon className="h-3.5 w-3.5" />
      Mark as completed
    </button>
  );
}

function SubtaskRow({
  subtask: s,
  team,
  onToggle,
  onDelete,
}: {
  subtask: SubtaskView;
  team: TeamMember[];
  onToggle: (id: string, isDone: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const isTemp = s.id.startsWith("temp-");

  return (
    <li className="group flex items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-canvas">
      <input
        type="checkbox"
        checked={s.isDone}
        onChange={(e) => onToggle(s.id, e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-brand focus:ring-brand"
      />
      <div className="min-w-0 flex-1">
        <span
          className={`block text-sm ${
            s.isDone ? "text-muted-fg line-through" : "text-ink"
          }`}
        >
          {s.title}
        </span>
        {(s.receivedFrom || s.sharedTo.length > 0) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {s.receivedFrom && (
              <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">
                From {s.receivedFrom}
              </span>
            )}
            {s.sharedTo.length > 0 && (
              <span className="text-[11px] text-muted-fg">
                Shared to {s.sharedTo.join(", ")}
              </span>
            )}
          </div>
        )}
      </div>

      {!isTemp && (
        <SharePicker subtaskId={s.id} team={team} alreadyShared={s.sharedTo} />
      )}

      <button
        type="button"
        onClick={() => onDelete(s.id)}
        className="text-red-500 transition hover:text-red-600"
        aria-label="Delete subtask"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

function SharePicker({
  subtaskId,
  team,
  alreadyShared,
}: {
  subtaskId: string;
  team: TeamMember[];
  alreadyShared: string[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function share(toUserId: string) {
    startTransition(async () => {
      await shareSubtask(subtaskId, toUserId);
      setOpen(false);
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-brand transition hover:text-brand-dark"
        aria-label="Delegate subtask"
        title="Delegate to a teammate"
      >
        <ShareIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-52 rounded-xl border border-line bg-surface p-1 shadow-lg">
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
            Delegate to
          </p>
          {team.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-fg">
              No teammates yet.
            </p>
          )}
          {team.map((m) => {
            const done = alreadyShared.includes(m.name);
            return (
              <button
                key={m.id}
                type="button"
                disabled={done || isPending}
                onClick={() => share(m.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-canvas disabled:cursor-default disabled:text-muted-fg disabled:hover:bg-transparent"
              >
                <span className="truncate">{m.name}</span>
                {done && <span className="text-[11px] text-brand">shared</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GoalTitle({ goalId, title }: { goalId: string; title: string }) {
  const [value, setValue] = useState(title);

  function commit() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === title) {
      setValue(title);
      return;
    }
    renameGoal(goalId, trimmed);
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValue(title);
          e.currentTarget.blur();
        }
      }}
      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-base font-semibold text-ink hover:border-line focus:border-brand focus:bg-surface focus:outline-none"
      aria-label="Goal title"
    />
  );
}

function DeleteGoalButton({ goalId }: { goalId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="flex items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => deleteGoal(goalId)}
          className="rounded bg-red-500 px-2 py-1 font-medium text-white hover:bg-red-600"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded px-2 py-1 text-muted-fg hover:bg-canvas"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-red-500 transition hover:text-red-600"
      aria-label="Delete goal"
    >
      <TrashIcon className="h-5 w-5" />
    </button>
  );
}

function AddSubtaskForm({
  goalId,
  disabled,
  onOptimisticAdd,
}: {
  goalId: string;
  disabled: boolean;
  onOptimisticAdd: (tempId: string, title: string) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const title = value.trim();
    if (!title) return;
    setValue("");
    onOptimisticAdd(`temp-${Date.now()}`, title);
    void addSubtask(goalId, title);
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={submit} className="mt-3 flex items-center gap-2">
      <button
        type="submit"
        disabled={disabled}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-muted-fg transition hover:border-accent hover:text-accent disabled:opacity-50"
        aria-label="Add subtask"
      >
        +
      </button>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a subtask"
        className="flex-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
      />
    </form>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "@/lib/useModalFocus";
import {
  addDayTask,
  deleteDayTask,
  getDayTasks,
  moveDayTask,
  renameDayTask,
  toggleDayTask,
} from "../actions";
import {
  MAX_DAY_TASKS,
  MAX_DAY_TASK_TITLE,
  type DayTaskView,
} from "@/lib/dayTasks";
import { CheckCircleIcon, ChevronIcon, TrashIcon } from "./icons";

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "YYYY-MM-DD" → "Tuesday, 21 July 2026". Parsed as UTC to match storage. */
function formatDayHeading(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${
    MONTHS[d.getUTCMonth()]
  } ${d.getUTCFullYear()}`;
}

/**
 * The day's focus list, opened by clicking a date in the calendar. These are
 * tasks, not goals: they belong to no week or month and never move the week
 * percent — the list only answers "what am I doing on this day?".
 *
 * Order is priority: #1 is the day's main focus. Every mutation returns the
 * day's full list from the server, so the panel re-renders from the source of
 * truth instead of patching a local copy.
 */
export function DayTasksModal({
  ymd,
  isToday,
  onTasksChange,
  onClose,
}: {
  ymd: string;
  isToday: boolean;
  /** Called with the day's list on load and after every edit, so a caller
   *  showing the same day elsewhere (the Today block) stays in step. */
  onTasksChange?: (tasks: DayTaskView[]) => void;
  onClose: () => void;
}) {
  const [tasks, setTasks] = useState<DayTaskView[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Mounted only while open, so the trap is always on.
  useModalFocus(true, boxRef);

  /** Adopt a list from the server and mirror it to the caller. */
  const applyTasks = useCallback(
    (list: DayTaskView[]) => {
      setTasks(list);
      onTasksChange?.(list);
    },
    [onTasksChange],
  );

  // Load the day's list on open. The caller keys this component by `ymd`, so a
  // different day remounts it — no need to reset state when the prop changes.
  useEffect(() => {
    let active = true;
    getDayTasks(ymd)
      .then((list) => {
        if (active) applyTasks(list);
      })
      .catch(() => {
        if (active) setError("Couldn't load this day.");
      });
    return () => {
      active = false;
    };
  }, [ymd, applyTasks]);

  // Close on Escape and lock body scroll while open (matches AssignGoalButton).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isPending, onClose]);

  /** Run a mutation and adopt the day list it returns. */
  function run(mutate: () => Promise<DayTaskView[]>, failure: string) {
    setError(null);
    startTransition(async () => {
      try {
        applyTasks(await mutate());
      } catch (e) {
        setError(e instanceof Error ? e.message : failure);
      }
    });
  }

  function add() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    inputRef.current?.focus();
    run(() => addDayTask(ymd, trimmed), "Couldn't add the task.");
  }

  const full = (tasks?.length ?? 0) >= MAX_DAY_TASKS;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={() => !isPending && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Tasks for ${formatDayHeading(ymd)}`}
    >
      <div
        ref={boxRef}
        className="modal-in flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-bold text-ink">
            {isToday ? "Today's focus" : "Focus"}
          </h2>
          {isToday && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
              Today
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-fg">{formatDayHeading(ymd)}</p>

        <div className="-mx-1 mt-4 min-h-0 flex-1 overflow-y-auto px-1">
          {tasks === null ? (
            <ListSkeleton />
          ) : tasks.length === 0 ? (
            <p className="py-2 text-sm text-muted-fg">
              Nothing set for this day. Add your main focus below — the top task
              is the one that matters most.
            </p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {tasks.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  rank={i + 1}
                  isFirst={i === 0}
                  isLast={i === tasks.length - 1}
                  disabled={isPending}
                  onToggle={() =>
                    run(
                      () => toggleDayTask(task.id, !task.isDone),
                      "Couldn't update the task.",
                    )
                  }
                  onRename={(next) =>
                    run(
                      () => renameDayTask(task.id, next),
                      "Couldn't rename the task.",
                    )
                  }
                  onMove={(dir) =>
                    run(
                      () => moveDayTask(task.id, dir),
                      "Couldn't reorder the task.",
                    )
                  }
                  onDelete={() =>
                    run(
                      () => deleteDayTask(task.id),
                      "Couldn't delete the task.",
                    )
                  }
                />
              ))}
            </ol>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            disabled={full}
            placeholder={
              full ? `${MAX_DAY_TASKS} tasks is the limit` : "Add a task…"
            }
            maxLength={MAX_DAY_TASK_TITLE}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={add}
            disabled={isPending || full || title.trim().length === 0}
            className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-fg">
            Day tasks are separate from your goals — they don&apos;t affect your
            week percent.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-muted-fg transition hover:bg-line"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TaskRow({
  task,
  rank,
  isFirst,
  isLast,
  disabled,
  onToggle,
  onRename,
  onMove,
  onDelete,
}: {
  task: DayTaskView;
  rank: number;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onToggle: () => void;
  onRename: (title: string) => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.title) onRename(trimmed);
    else setDraft(task.title);
  }

  return (
    <li className="group flex items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-canvas">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-label={task.isDone ? "Mark not done" : "Mark done"}
        title={task.isDone ? "Mark not done" : "Mark done"}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
          task.isDone
            ? "border-brand bg-brand text-white"
            : "border-line text-transparent hover:border-brand hover:bg-brand-soft"
        }`}
      >
        <CheckCircleIcon className="h-4 w-4" />
      </button>

      {/* The rank IS the priority — #1 is the day's main focus. */}
      <span
        className={`w-4 shrink-0 text-right text-xs font-bold tabular-nums ${
          task.isDone
            ? "text-muted-fg/60"
            : rank === 1
              ? "text-brand"
              : "text-muted-fg"
        }`}
      >
        {rank}
      </span>

      {editing ? (
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft(task.title);
              setEditing(false);
            }
          }}
          maxLength={MAX_DAY_TASK_TITLE}
          className="min-w-0 flex-1 rounded border border-brand bg-surface px-1.5 py-0.5 text-sm text-ink focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(task.title);
            setEditing(true);
          }}
          disabled={disabled}
          title="Rename"
          className={`min-w-0 flex-1 break-words text-left text-sm transition-colors ${
            task.isDone ? "text-muted-fg line-through" : "text-ink"
          }`}
        >
          {task.title}
        </button>
      )}

      {/* Reorder and delete stay visible wherever there's no hover to reveal
          them with. Gated on the pointer rather than a width breakpoint: a
          touchscreen laptop is wide and still can't hover. */}
      <span className="flex shrink-0 items-center transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
        <IconButton
          label="Move up"
          disabled={disabled || isFirst}
          onClick={() => onMove("up")}
        >
          <ChevronIcon className="h-3.5 w-3.5 -rotate-90" />
        </IconButton>
        <IconButton
          label="Move down"
          disabled={disabled || isLast}
          onClick={() => onMove("down")}
        >
          <ChevronIcon className="h-3.5 w-3.5 rotate-90" />
        </IconButton>
        <IconButton label="Delete" disabled={disabled} onClick={onDelete} danger>
          <TrashIcon className="h-3.5 w-3.5" />
        </IconButton>
      </span>
    </li>
  );
}

function IconButton({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-6 w-6 items-center justify-center rounded transition disabled:opacity-25 ${
        danger
          ? "text-muted-fg hover:bg-red-50 hover:text-red-600"
          : "text-muted-fg hover:bg-line hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-7 rounded-lg bg-canvas" />
      ))}
    </div>
  );
}

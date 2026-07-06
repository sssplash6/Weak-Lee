"use client";

import {
  useEffect,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { clampPercent, subtaskPercent } from "@/lib/progress";
import { formatStamp } from "@/lib/dates";
import {
  addSubtask,
  deleteGoal,
  deleteSubtask,
  renameGoal,
  renameSubtask,
  setGoalCompleted,
  setGoalDeadline,
  setGoalPercent,
  setGoalPriority,
  shareSubtask,
  toggleSubtask,
} from "../actions";
import {
  PRIORITY_LABEL,
  PRIORITY_TEXT,
  type Priority,
} from "@/lib/priority";
import {
  CalendarIcon,
  CheckCircleIcon,
  ChevronIcon,
  FlagIcon,
  ShareIcon,
  TrashIcon,
} from "./icons";
import { DeadlinePicker } from "./DeadlinePicker";
import { PriorityPicker } from "./PriorityPicker";

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
  deadline: string | null;
  priority: Priority | null;
  manualPercent: number | null;
  subtasks: SubtaskView[];
};

type TeamMember = { id: string; name: string };

type OptAction =
  | { type: "toggle"; id: string; isDone: boolean }
  | { type: "add"; id: string; title: string }
  | { type: "rename"; id: string; title: string }
  | { type: "delete"; id: string };

export function GoalCard({
  goal,
  index,
  team,
  todayYmd,
  nowStamp,
  locked,
}: {
  goal: GoalView;
  index: number;
  team: TeamMember[];
  todayYmd: string;
  nowStamp: string;
  locked: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [tasksOpen, setTasksOpen] = useState(true);
  const [confirmComplete, setConfirmComplete] = useState(false);
  // The completion rate typed in the confirm prompt (0–100). Seeded to 100 when
  // the prompt opens; committed as the goal's percent on confirm.
  const [completeRate, setCompleteRate] = useState("100");
  const [completed, applyCompleted] = useOptimistic(
    goal.completed,
    (_state: boolean, next: boolean) => next,
  );
  const [deadline, applyDeadline] = useOptimistic(
    goal.deadline,
    (_state: string | null, next: string | null) => next,
  );
  const [priority, applyPriority] = useOptimistic(
    goal.priority,
    (_state: Priority | null, next: Priority | null) => next,
  );
  const [manualPercent, applyManualPercent] = useOptimistic(
    goal.manualPercent,
    (_state: number | null, next: number | null) => next,
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
        case "rename":
          return state.map((s) =>
            s.id === action.id ? { ...s, title: action.title } : s,
          );
        case "delete":
          return state.filter((s) => s.id !== action.id);
      }
    },
  );

  // A manual/completion rate always wins; otherwise a completed goal reads 100
  // and an open one follows its subtasks. Mirrors goalPercent() with optimistic
  // state.
  const percent = manualPercent ?? (completed ? 100 : subtaskPercent(subtasks));

  function onToggle(id: string, isDone: boolean) {
    startTransition(async () => {
      applyOptimistic({ type: "toggle", id, isDone });
      // The server clears any manual percent on toggle — mirror it optimistically.
      applyManualPercent(null);
      await toggleSubtask(id, isDone);
    });

    // When checking a subtask just brought every subtask to done — and the goal
    // isn't already marked complete — prompt the user to confirm completion.
    const willAllBeDone =
      subtasks.length > 0 &&
      subtasks.every((s) => (s.id === id ? isDone : s.isDone));
    if (isDone && willAllBeDone && !completed) {
      setCompleteRate("100");
      setConfirmComplete(true);
    }
  }

  function confirmCompletion() {
    setConfirmComplete(false);
    if (completed) return;
    const rate = clampPercent(Number(completeRate.trim()) || 0);
    startTransition(async () => {
      applyCompleted(true);
      // Completing also records the rate as the goal's percent.
      applyManualPercent(rate);
      await setGoalCompleted(goal.id, true, rate);
    });
  }

  function onRenameSubtask(id: string, title: string) {
    startTransition(async () => {
      applyOptimistic({ type: "rename", id, title });
      await renameSubtask(id, title);
    });
  }

  function onDeleteSubtask(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "delete", id });
      await deleteSubtask(id);
    });
  }

  function onToggleCompleted() {
    // Completing always goes through the rate prompt ("how much did you finish?");
    // reopening a completed goal is immediate.
    if (!completed) {
      setCompleteRate("100");
      setConfirmComplete(true);
      return;
    }
    startTransition(async () => {
      applyCompleted(false);
      await setGoalCompleted(goal.id, false);
    });
  }

  function onSetDeadline(next: string | null) {
    startTransition(async () => {
      applyDeadline(next);
      await setGoalDeadline(goal.id, next);
    });
  }

  function onSetPriority(next: Priority | null) {
    startTransition(async () => {
      applyPriority(next);
      await setGoalPriority(goal.id, next);
    });
  }

  function onSetPercent(next: number) {
    startTransition(async () => {
      applyManualPercent(next);
      await setGoalPercent(goal.id, next);
    });
  }

  // Overdue only matters while the goal is still open.
  const overdue = !completed && deadline != null && deadline < nowStamp;
  const [curYear] = todayYmd.split("-").map(Number);

  return (
    <article
      className={`rounded-2xl border bg-surface p-5 shadow-sm transition-colors ${
        completed ? "border-brand ring-1 ring-brand/20" : "border-line"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
          {index}
        </span>
        <GoalTitle goalId={goal.id} title={goal.title} readOnly={locked} />
        <button
          type="button"
          onClick={() => setTasksOpen((v) => !v)}
          aria-expanded={tasksOpen}
          aria-label={tasksOpen ? "Hide subtasks" : "Show subtasks"}
          title={tasksOpen ? "Hide subtasks" : "Show subtasks"}
          className="ml-auto mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-muted-fg transition hover:bg-canvas hover:text-ink"
        >
          <ChevronIcon
            className={`h-3.5 w-3.5 transition-transform ${
              tasksOpen ? "rotate-90" : ""
            }`}
          />
          <span className="text-xs font-semibold tabular-nums">
            {subtasks.length}
          </span>
        </button>
        <PercentChip percent={percent} editable onCommit={onSetPercent} />

        {locked ? (
          <div className="mt-0.5 flex shrink-0 items-center gap-2">
            {priority && (
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold ${PRIORITY_TEXT[priority]}`}
                title={`Priority: ${PRIORITY_LABEL[priority]}`}
              >
                <FlagIcon className="h-4 w-4" filled />
                {PRIORITY_LABEL[priority]}
              </span>
            )}
            {deadline && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold tabular-nums ${
                  overdue
                    ? "bg-red-50 text-red-600"
                    : "bg-brand-soft text-brand"
                }`}
                title="Deadline"
              >
                <CalendarIcon className="h-4 w-4" />
                {formatStamp(deadline, curYear)}
              </span>
            )}
          </div>
        ) : (
          <div className="mt-0.5 flex shrink-0 items-center gap-2">
            <PriorityPicker value={priority} onChange={onSetPriority} />
            <DeadlinePicker
              value={deadline}
              todayYmd={todayYmd}
              overdue={overdue}
              onChange={onSetDeadline}
            />
          </div>
        )}

        <span className="mt-0.5 shrink-0">
          <CompleteButton
            completed={completed}
            allDone={percent === 100}
            onToggle={onToggleCompleted}
          />
        </span>
        {!locked && (
          <span className="mt-1 shrink-0">
            <DeleteGoalButton goalId={goal.id} />
          </span>
        )}
      </div>

      {/* progress bar */}
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      {tasksOpen && (
        <>
          {/* subtasks */}
          <ul className="mt-4 flex flex-col gap-1">
            {subtasks.map((s) => (
              <SubtaskRow
                key={s.id}
                subtask={s}
                team={team}
                locked={locked}
                onToggle={onToggle}
                onRename={onRenameSubtask}
                onDelete={onDeleteSubtask}
              />
            ))}
            {subtasks.length === 0 && (
              <li className="px-1 py-1 text-sm text-muted-fg">
                No subtasks yet
                {locked ? "." : " — add one to start tracking progress."}
              </li>
            )}
          </ul>

          {!locked && (
            <AddSubtaskForm
              goalId={goal.id}
              disabled={isPending}
              onOptimisticAdd={(id, title) =>
                startTransition(() => applyOptimistic({ type: "add", id, title }))
              }
            />
          )}
        </>
      )}

      {confirmComplete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
          onClick={() => setConfirmComplete(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-ink">
              Mark “{goal.title}” complete?
            </h2>
            <p className="mt-1 text-sm text-muted-fg">
              How much of it did you actually finish? You can edit this later.
            </p>
            <label className="mt-4 flex items-center justify-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
                Completion rate
              </span>
              <span className="flex items-center rounded-lg border border-accent px-2 py-1 text-sm font-semibold text-accent focus-within:ring-2 focus-within:ring-accent/30">
                <input
                  autoFocus
                  type="number"
                  min={0}
                  max={100}
                  value={completeRate}
                  onChange={(e) => setCompleteRate(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmCompletion();
                    }
                  }}
                  aria-label="Completion rate percent"
                  className="w-12 bg-transparent text-right tabular-nums focus:outline-none"
                />
                %
              </span>
            </label>
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmComplete(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-fg transition hover:bg-canvas"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={confirmCompletion}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
              >
                Mark complete
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * The goal's percent readout — click to type a manual value (0–100). Commits on
 * blur or Enter, cancels on Escape. Editable even once the goal is completed, so
 * a "done at 70%" rate can be adjusted after the fact.
 */
function PercentChip({
  percent,
  editable,
  onCommit,
}: {
  percent: number;
  editable: boolean;
  onCommit: (next: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  if (!editable) {
    return (
      <span className="mt-1 shrink-0 text-sm font-semibold tabular-nums text-accent">
        {percent}%
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setText(String(percent));
          setEditing(true);
        }}
        title="Click to set the percent yourself"
        aria-label="Edit goal progress percent"
        className="mt-0.5 shrink-0 rounded-md border border-transparent px-1 py-0.5 text-sm font-semibold tabular-nums text-accent transition hover:border-accent/40 hover:bg-accent-soft"
      >
        {percent}%
      </button>
    );
  }

  function commit() {
    setEditing(false);
    const parsed = Number(text.trim());
    if (text.trim() === "" || Number.isNaN(parsed)) return;
    const next = clampPercent(parsed);
    if (next !== percent) onCommit(next);
  }

  return (
    <span className="mt-0.5 flex shrink-0 items-center text-sm font-semibold text-accent">
      <input
        autoFocus
        type="number"
        min={0}
        max={100}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setText("");
            setEditing(false);
          }
        }}
        aria-label="Goal progress percent"
        className="w-12 rounded-md border border-accent bg-surface px-1 py-0.5 text-right text-sm font-semibold tabular-nums text-accent focus:outline-none"
      />
      %
    </span>
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
        title="Completed — click to reopen"
        aria-label="Mark goal as not completed"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-dark"
      >
        <CheckCircleIcon className="h-5 w-5" />
      </button>
    );
  }

  // Not completed yet. Brighten the tick once every subtask is done — that's the
  // moment a user is most likely to want to confirm the goal itself is finished.
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Mark this goal as completed"
      aria-label="Mark goal as completed"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-brand-soft ${
        allDone ? "text-brand" : "text-muted-fg hover:text-brand"
      }`}
    >
      <CheckCircleIcon className="h-5 w-5" />
    </button>
  );
}

function SubtaskRow({
  subtask: s,
  team,
  locked,
  onToggle,
  onRename,
  onDelete,
}: {
  subtask: SubtaskView;
  team: TeamMember[];
  locked: boolean;
  onToggle: (id: string, isDone: boolean) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const isTemp = s.id.startsWith("temp-");

  return (
    <li className="group flex items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-canvas">
      <input
        type="checkbox"
        checked={s.isDone}
        onChange={(e) => onToggle(s.id, e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-brand focus:ring-brand"
      />
      <div className="min-w-0 flex-1">
        <EditableText
          value={s.title}
          readOnly={locked || isTemp}
          ariaLabel="Subtask title"
          onCommit={(title) => onRename(s.id, title)}
          className={`block w-full text-sm ${
            s.isDone ? "text-muted-fg line-through" : "text-ink"
          }`}
        />
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

      {!locked && (
        <button
          type="button"
          onClick={() => onDelete(s.id)}
          className="mt-0.5 text-red-500 transition hover:text-red-600"
          aria-label="Delete subtask"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      )}
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
    <div className="relative mt-0.5" ref={ref}>
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

function GoalTitle({
  goalId,
  title,
  readOnly,
}: {
  goalId: string;
  title: string;
  readOnly: boolean;
}) {
  return (
    <EditableText
      value={title}
      readOnly={readOnly}
      ariaLabel="Goal title"
      onCommit={(next) => renameGoal(goalId, next)}
      className="min-w-0 flex-1 text-base font-semibold text-ink"
    />
  );
}

/**
 * An auto-growing textarea that reads as plain text but edits inline. Wraps to
 * show the full value (so long goals/subtasks are fully readable), commits on
 * blur or Enter, and reverts on Escape. Read-only renders the same wrapped text
 * without editing affordances.
 */
function EditableText({
  value,
  onCommit,
  readOnly,
  className,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  readOnly: boolean;
  className: string;
  ariaLabel: string;
}) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Reconcile with the value from the server when it changes underneath us
  // (e.g. after a rename revalidates) — without an effect. See:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }

  function resize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  // Size to content on mount and whenever the text changes.
  useLayoutEffect(resize, []);
  useLayoutEffect(resize, [text]);

  function commit() {
    const trimmed = text.trim();
    if (!trimmed || trimmed === value) {
      setText(value);
      return;
    }
    onCommit(trimmed);
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={text}
      readOnly={readOnly}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setText(value);
          e.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
      className={`resize-none overflow-hidden break-words rounded border border-transparent bg-transparent px-1 py-0.5 focus:outline-none ${
        readOnly
          ? "cursor-default focus:border-transparent"
          : "hover:border-line focus:border-brand focus:bg-surface"
      } ${className}`}
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

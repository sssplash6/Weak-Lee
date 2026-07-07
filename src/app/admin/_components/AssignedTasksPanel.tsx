"use client";

import { useState, useTransition } from "react";
import { TrashIcon } from "../../dashboard/_components/icons";
import { assignTask, deleteAssignedTask } from "../actions";

export type AdminAssignedTask = {
  id: string;
  title: string;
  note: string | null;
  assigneeName: string;
  deadlineLabel: string | null;
  done: boolean;
  createdAtLabel: string;
};

/**
 * Admin view for assigning goals to specific people and tracking them. A "+"
 * opens a form (person + title + optional deadline/note); below is the list of
 * everything assigned, with each task's assignee and done/pending status.
 */
export function AssignedTasksPanel({
  people,
  tasks,
}: {
  people: { id: string; name: string }[];
  tasks: AdminAssignedTask[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <p className="text-sm font-semibold text-ink">
          Assigned tasks{" "}
          <span className="font-normal text-muted-fg">({tasks.length})</span>
        </p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark"
        >
          <span className="text-sm leading-none">+</span> Assign a goal
        </button>
      </div>

      {adding && (
        <AssignForm people={people} onDone={() => setAdding(false)} />
      )}

      {tasks.length > 0 && (
        <ul className="border-t border-line">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AssignForm({
  people,
  onDone,
}: {
  people: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [userId, setUserId] = useState(people[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!userId) {
      setError("Pick a person.");
      return;
    }
    if (title.trim().length === 0) {
      setError("Enter a title.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await assignTask(userId, title.trim(), deadline || null, note);
        onDone();
      } catch {
        setError("Couldn't assign the task.");
      }
    });
  }

  return (
    <div className="rise-in border-t border-line bg-canvas/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Goal to assign — e.g. QA the release"
          maxLength={300}
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-fg">
          Due
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="rounded-lg border border-line px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          />
        </label>
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        maxLength={500}
        className="mt-2 w-full rounded-lg border border-line px-3 py-1.5 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {isPending ? "Assigning…" : "Assign"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onDone}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-fg transition hover:bg-line"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}

function TaskRow({ task: t }: { task: AdminAssignedTask }) {
  const [isPending, startTransition] = useTransition();
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0">
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          t.done ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
        }`}
      >
        {t.done ? "Done" : "Pending"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="break-words text-ink">{t.title}</span>
        <span className="block text-xs text-muted-fg">
          {t.assigneeName}
          {t.deadlineLabel ? ` · due ${t.deadlineLabel}` : ""}
          {t.note ? ` · ${t.note}` : ""}
        </span>
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => void (await deleteAssignedTask(t.id)))
        }
        className="shrink-0 text-muted-fg transition hover:text-red-500 disabled:opacity-50"
        aria-label="Remove assigned task"
        title="Remove assigned task"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

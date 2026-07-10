"use client";

import { useState, useTransition } from "react";
import { assignTask } from "../../admin/actions";

type Scope = "WEEKLY" | "MONTHLY";

/**
 * Admin-only block in the dashboard's right sidebar for assigning a goal to
 * someone without leaving the dashboard. Weekly or monthly — the goal appears
 * in the matching view of the assignee's dashboard, and its progress is
 * tracked on the admin panel. The action re-checks admin server-side.
 */
export function AssignGoalPanel({
  people,
}: {
  people: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(people[0]?.id ?? "");
  const [scope, setScope] = useState<Scope>("WEEKLY");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (people.length === 0) return null;

  function submit() {
    if (!userId) {
      setError("Pick a person.");
      return;
    }
    if (title.trim().length === 0) {
      setError("Enter a goal.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await assignTask(userId, title.trim(), deadline || null, note, scope);
        const who = people.find((p) => p.id === userId)?.name ?? "them";
        setAssigned(`Assigned to ${who}.`);
        setTitle("");
        setDeadline("");
        setNote("");
      } catch {
        setError("Couldn't assign the goal.");
      }
    });
  }

  return (
    <div className="mb-6 rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setAssigned(null);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-ink">Assign a goal</span>
        <span
          className={`text-muted-fg transition ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          ›
        </span>
      </button>

      {open && (
        <div className="rise-in flex flex-col gap-2 border-t border-line px-4 py-3">
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 rounded-lg border border-line bg-canvas p-0.5 text-xs font-semibold">
            {(
              [
                ["WEEKLY", "Weekly"],
                ["MONTHLY", "Monthly"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                aria-pressed={scope === value}
                className={`rounded-md px-2 py-1.5 transition ${
                  scope === value
                    ? "bg-brand text-white"
                    : "text-muted-fg hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Goal — e.g. QA the release"
            maxLength={300}
            className="w-full rounded-lg border border-line px-3 py-1.5 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-fg">
            Due
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            maxLength={500}
            className="w-full rounded-lg border border-line px-3 py-1.5 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
          />

          <button
            type="button"
            disabled={isPending}
            onClick={submit}
            className="w-full rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {isPending ? "Assigning…" : "Assign"}
          </button>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {assigned && !error && (
            <p className="text-xs font-medium text-green-600">{assigned}</p>
          )}
        </div>
      )}
    </div>
  );
}

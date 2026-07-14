"use client";

import { useEffect, useState, useTransition } from "react";
import { assignTask } from "../../admin/actions";

type Scope = "WEEKLY" | "MONTHLY";

/**
 * Admin-only button in the left sidebar (beneath the fines / "Assigned by you")
 * that opens a modal for assigning a goal to a teammate — weekly or monthly. The
 * assigned goal shows in the matching view of the assignee's dashboard, and the
 * assigner can track it in the "Assigned by you" list. The action re-checks
 * admin server-side.
 */
export function AssignGoalButton({
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

  const canSubmit = userId !== "" && title.trim().length > 0;

  function close() {
    setOpen(false);
    setError(null);
    setAssigned(null);
  }

  // Close on Escape and lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) close();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, isPending]);

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

  if (people.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-white">
          <PlusIcon className="h-3.5 w-3.5" />
        </span>
        Assign a goal
      </button>
    );
  }

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={() => !isPending && close()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-in w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ink">Assign a goal</h2>
        <p className="mt-1 text-sm text-muted-fg">
          Hand a goal to a teammate. It appears in their{" "}
          {scope === "MONTHLY" ? "monthly" : "weekly"} view, and you can track it
          under your fines.
        </p>

        <div className="mt-4 flex flex-col gap-2.5">
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
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
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Goal — e.g. QA the release"
            maxLength={300}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
          />
          <label className="flex items-center gap-2 text-xs text-muted-fg">
            Due
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            maxLength={500}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
          />
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        {assigned && !error && (
          <p className="mt-2 text-xs font-medium text-green-600">{assigned}</p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={close}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-fg transition hover:bg-line"
          >
            {assigned ? "Done" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={isPending || !canSubmit}
            onClick={submit}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

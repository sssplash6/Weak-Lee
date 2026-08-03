"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { assignTask } from "../../admin/actions";

type Scope = "WEEKLY" | "MONTHLY";

/**
 * Admin-only floating action (bottom-left, mirroring the feedback button on
 * the right) that travels with the page scroll and opens a modal for assigning
 * a goal to a teammate — weekly or monthly. The assigned goal shows in the
 * matching view of the assignee's dashboard, and the assigner can track it in
 * the "Assigned by you" list. The action re-checks admin server-side.
 */
export function AssignGoalButton({
  people,
}: {
  people: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [scope, setScope] = useState<Scope>("WEEKLY");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const everyone = people.length > 0 && selected.length === people.length;
  const canSubmit = selected.length > 0 && title.trim().length > 0;

  function togglePerson(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // One control for the whole team: selects everybody, or clears the lot when
  // they're already all on.
  function toggleEveryone() {
    setSelected((prev) =>
      prev.length === people.length ? [] : people.map((p) => p.id),
    );
  }

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
    if (selected.length === 0) {
      setError("Pick at least one person.");
      return;
    }
    if (title.trim().length === 0) {
      setError("Enter a goal.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await assignTask(selected, title.trim(), deadline || null, note, scope);
        setAssigned(`Assigned to ${describe(selected, people)}.`);
        // The selection survives, so a second goal can go to the same people
        // without picking them all again.
        setTitle("");
        setDeadline("");
        setNote("");
      } catch {
        setError("Couldn't assign the goal.");
      }
    });
  }

  if (people.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Assign a goal"
        className="group fixed bottom-6 left-6 z-40 inline-flex items-center rounded-full bg-brand px-2.5 py-2 text-sm font-medium text-white shadow-md transition hover:bg-brand-dark"
      >
        <PlusIcon className="h-4 w-4 shrink-0" />
        <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 ease-out group-hover:ml-2 group-hover:max-w-[8rem] group-hover:opacity-100">
          Assign a goal
        </span>
      </button>

      {/* Portal to <body> so the modal escapes the sidebar's sticky stacking
          context — otherwise the goal cards paint on top of it. */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
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
          {`Hand a goal to one or more teammates. It appears in their ${
            scope === "MONTHLY" ? "monthly" : "weekly"
          } view, and you can track it under your fines.`}
        </p>

        <div className="mt-4 flex flex-col gap-2.5">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-ink">Assign to</span>
              <span className="text-xs text-muted-fg">
                {selected.length === 0
                  ? "nobody yet"
                  : `${selected.length} of ${people.length} selected`}
              </span>
            </div>
            {/* Chips rather than a multi-select: the whole team is visible at a
                glance, and picking several needs no modifier keys. Capped in
                height so a growing team scrolls instead of pushing the goal
                field off the modal. */}
            <div className="mt-1.5 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {people.length > 1 && (
                <button
                  type="button"
                  onClick={toggleEveryone}
                  aria-pressed={everyone}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                    everyone
                      ? "border-brand bg-brand text-white"
                      : "border-line text-muted-fg hover:text-ink"
                  }`}
                >
                  Everyone
                </button>
              )}
              {people.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePerson(p.id)}
                    aria-pressed={on}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      on
                        ? "border-brand bg-brand text-white"
                        : "border-line text-muted-fg hover:text-ink"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

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
          <p className="mt-2 text-xs font-medium text-green-700">{assigned}</p>
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
          </div>,
          document.body,
        )}
    </>
  );
}

// Who the batch went to, for the confirmation line: the name when it's one
// person, otherwise a count — and "everyone" when the whole team is on.
function describe(
  selected: string[],
  people: { id: string; name: string }[],
): string {
  if (selected.length === 1) {
    return people.find((p) => p.id === selected[0])?.name ?? "them";
  }
  if (selected.length === people.length) {
    return `everyone (${selected.length} people)`;
  }
  return `${selected.length} people`;
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

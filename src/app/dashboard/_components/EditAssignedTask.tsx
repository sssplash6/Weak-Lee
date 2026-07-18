"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { editAssignedTask } from "../../admin/actions";
import { PencilIcon } from "./icons";

type Scope = "WEEKLY" | "MONTHLY";

export type EditableAssignedTask = {
  id: string;
  title: string;
  note: string | null;
  deadline: string | null; // YYYY-MM-DD, or null
  scope: Scope;
  recipientName: string;
};

/**
 * A small pencil button that opens a modal to edit an assigned goal — title,
 * weekly/monthly scope, deadline, and note. The recipient is fixed (shown for
 * context) and is notified of the change server-side. Shared by the dashboard's
 * "Assigned by you" list and the admin tracking panel.
 */
export function EditAssignedTask({ task }: { task: EditableAssignedTask }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [scope, setScope] = useState<Scope>(task.scope);
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  const [note, setNote] = useState(task.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset the form to the task's current values whenever it's (re)opened, so a
  // cancelled edit doesn't leak into the next one.
  function openModal() {
    setTitle(task.title);
    setScope(task.scope);
    setDeadline(task.deadline ?? "");
    setNote(task.note ?? "");
    setError(null);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setError(null);
  }

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
    if (title.trim().length === 0) {
      setError("Enter a goal.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await editAssignedTask(
          task.id,
          title.trim(),
          deadline || null,
          note,
          scope,
        );
        setOpen(false);
      } catch {
        setError("Couldn't save the changes.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Edit assigned goal"
        title="Edit assigned goal"
        className="shrink-0 text-muted-fg transition hover:text-brand"
      >
        <PencilIcon className="h-4 w-4" />
      </button>

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
              <h2 className="text-base font-bold text-ink">Edit assigned goal</h2>
              <p className="mt-1 text-sm text-muted-fg">
                Assigned to {task.recipientName}. They&rsquo;ll be notified of
                the change.
              </p>

              <div className="mt-4 flex flex-col gap-2.5">
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

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={close}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-muted-fg transition hover:bg-line"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPending || title.trim().length === 0}
                  onClick={submit}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

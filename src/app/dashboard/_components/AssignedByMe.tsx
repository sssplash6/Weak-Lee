"use client";

import { useState } from "react";
import { EditAssignedTask } from "./EditAssignedTask";

export type AssignedByMeItem = {
  id: string;
  title: string;
  recipient: string;
  scope: "WEEKLY" | "MONTHLY";
  deadlineLabel: string | null;
  deadline: string | null; // YYYY-MM-DD, for the edit form
  note: string | null;
  done: boolean;
};

/**
 * The goals the signed-in user has assigned to others, shown beneath their
 * fines. Lets an assigner keep an eye on what they handed out and whether it's
 * been done. Only pending tasks show up front; completed ones sit behind a
 * disclosure so the card doesn't grow forever. Renders nothing when they
 * haven't assigned anything.
 */
export function AssignedByMe({ items }: { items: AssignedByMeItem[] }) {
  const [showDone, setShowDone] = useState(false);

  if (items.length === 0) return null;

  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Assigned by you</p>
        {pending.length > 0 && (
          <span className="text-[11px] font-medium text-muted-fg">
            {pending.length} pending
          </span>
        )}
      </div>

      {pending.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {pending.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className={`flex w-full items-center gap-1.5 text-left text-[11px] font-medium text-muted-fg transition hover:text-ink ${
              pending.length > 0 ? "mt-2 border-t border-line pt-2" : "mt-2"
            }`}
          >
            <Chevron open={showDone} />
            {`Completed (${done.length})`}
          </button>
          {showDone && (
            <ul className="rise-in flex flex-col">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function TaskRow({ task: t }: { task: AssignedByMeItem }) {
  return (
    <li className="border-t border-line py-2 first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`min-w-0 text-xs font-medium ${
            t.done ? "text-muted-fg line-through" : "text-ink"
          }`}
        >
          {t.title}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className={`text-[11px] font-semibold ${
              t.done ? "text-green-700" : "text-muted-fg"
            }`}
          >
            {t.done ? "Done" : "Pending"}
          </span>
          <EditAssignedTask
            task={{
              id: t.id,
              title: t.title,
              note: t.note,
              deadline: t.deadline,
              scope: t.scope,
              recipientName: t.recipient,
            }}
          />
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-fg">
        {t.recipient}
        {t.deadlineLabel ? ` · due ${t.deadlineLabel}` : ""}
        {t.scope === "MONTHLY" ? " · monthly" : ""}
      </p>
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3 w-3 shrink-0 transition-transform ${
        open ? "rotate-90" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

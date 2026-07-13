"use client";

import { useState, useTransition } from "react";
import type { Priority } from "@/lib/priority";
import { PRIORITY_LABEL } from "@/lib/priority";
import { addGoal, type GoalScope } from "../actions";
import { DeadlinePicker } from "./DeadlinePicker";
import { PriorityPicker } from "./PriorityPicker";

/**
 * Add a new goal. Priority and deadline are required parts of setting a goal —
 * the card says so up front, and tapping "Add" before everything is set
 * bounces the requirement hint instead of silently doing nothing.
 */
export function AddGoalCard({
  nextIndex,
  todayYmd,
  scope = "week",
}: {
  nextIndex: number;
  todayYmd: string;
  scope?: GoalScope;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  // Bumped on every futile "Add" tap; keying the hint on it restarts the
  // bounce animation, so repeated taps keep nudging.
  const [nudge, setNudge] = useState(0);
  const [isPending, startTransition] = useTransition();

  const ready = title.trim().length > 0 && priority != null && deadline != null;

  const missing: string[] = [];
  if (title.trim().length === 0) missing.push("a title");
  if (priority == null) missing.push("a priority");
  if (deadline == null) missing.push("a deadline");
  const listed =
    missing.length > 1
      ? `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`
      : missing[0];
  const hint = listed
    ? `${listed[0].toUpperCase()}${listed.slice(1)} ${missing.length > 1 ? "are" : "is"} required.`
    : null;

  function submit() {
    if (!ready || !priority || !deadline) {
      setNudge((n) => n + 1);
      return;
    }
    const trimmed = title.trim();
    startTransition(async () => {
      await addGoal({ title: trimmed, priority, deadline, scope });
      setTitle("");
      setPriority(null);
      setDeadline(null);
      setNudge(0);
    });
  }

  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/50 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-3 sm:flex-1">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-line text-xs font-bold text-muted-fg">
            {nextIndex}
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder={`Add goal ${nextIndex}…`}
            maxLength={200}
            className="min-w-0 flex-1 bg-transparent text-base font-medium text-ink placeholder:text-muted-fg focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pl-10 sm:shrink-0 sm:pl-0">
          <PriorityPicker value={priority} onChange={setPriority} />
          <DeadlinePicker
            value={deadline}
            todayYmd={todayYmd}
            overdue={false}
            onChange={setDeadline}
          />
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            aria-disabled={!ready || isPending}
            className={`shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 ${
              ready ? "" : "cursor-not-allowed opacity-50"
            }`}
          >
            {isPending ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      {hint && (
        <p
          key={nudge}
          className={`mt-2 pl-10 text-xs font-medium ${
            nudge > 0 ? "hint-bounce text-amber-600" : "text-muted-fg"
          }`}
        >
          {hint}
        </p>
      )}
      {priority != null && (
        <p className="mt-2 pl-10 text-[11px] font-medium text-muted-fg">
          Priority: {PRIORITY_LABEL[priority]}
        </p>
      )}
    </div>
  );
}

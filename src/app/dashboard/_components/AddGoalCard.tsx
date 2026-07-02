"use client";

import { useState, useTransition } from "react";
import type { Priority } from "@/lib/priority";
import { PRIORITY_LABEL } from "@/lib/priority";
import { addGoal, type GoalScope } from "../actions";
import { DeadlinePicker } from "./DeadlinePicker";
import { PriorityPicker } from "./PriorityPicker";

/**
 * Add a new goal. Priority and deadline are required parts of setting a goal,
 * so "Add" stays disabled until a title, a priority, and a deadline are all set.
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
  const [isPending, startTransition] = useTransition();

  const ready = title.trim().length > 0 && priority != null && deadline != null;

  function submit() {
    if (!ready || !priority || !deadline) return;
    const trimmed = title.trim();
    startTransition(async () => {
      await addGoal({ title: trimmed, priority, deadline, scope });
      setTitle("");
      setPriority(null);
      setDeadline(null);
    });
  }

  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/50 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-line text-xs font-bold text-muted-fg">
          {nextIndex}
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ready) submit();
          }}
          placeholder={`Add goal ${nextIndex}…`}
          maxLength={200}
          className="min-w-0 flex-1 bg-transparent text-base font-medium text-ink placeholder:text-muted-fg focus:outline-none"
        />
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
          disabled={!ready || isPending}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>

      {!ready && title.trim().length > 0 && (
        <p className="mt-2 pl-10 text-xs text-muted-fg">
          {priority == null && deadline == null
            ? "Set a priority and a deadline to add this goal."
            : priority == null
              ? "Set a priority to add this goal."
              : "Set a deadline to add this goal."}
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

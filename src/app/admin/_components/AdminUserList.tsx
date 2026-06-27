"use client";

import { useState, useTransition } from "react";
import { presetAvatar } from "@/lib/avatar";
import { TrashIcon } from "../../dashboard/_components/icons";
import { deleteUser } from "../actions";

export type AdminGoal = {
  id: string;
  title: string;
  percent: number;
  completed: boolean;
  hasDeadline: boolean;
};

export type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  department: string | null;
  weekLabel: string | null;
  late: boolean;
  percent: number;
  goalCount: number;
  completedCount: number;
  goals: AdminGoal[];
};

export function AdminUserList({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: string;
}) {
  if (users.length === 0) {
    return <p className="px-1 text-sm text-muted-fg">No users yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {users.map((u) => (
        <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} />
      ))}
    </ul>
  );
}

function UserRow({ user: u, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const canExpand = u.goalCount > 0;
  const avatar = presetAvatar(u.email ?? u.id);

  return (
    <li className="rounded-xl border border-line bg-surface">
      <div className="flex items-center">
      <button
        type="button"
        onClick={() => canExpand && setOpen((v) => !v)}
        className={`flex min-w-0 flex-1 items-center gap-3 p-4 text-left ${
          canExpand ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${avatar.bg}`}
          aria-hidden="true"
        >
          {avatar.emoji}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
            <span className="truncate">{u.name ?? "—"}</span>
            {u.late && (
              <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                Late
              </span>
            )}
            {u.goalCount === 0 && (
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                No goals
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-fg">
            {u.email ?? "no email"}
            {u.department ? ` · ${u.department}` : ""}
          </p>
        </div>

        <div className="hidden w-40 shrink-0 sm:block">
          {u.goalCount > 0 ? (
            <>
              <div className="flex items-center justify-between text-xs text-muted-fg">
                <span>
                  {u.completedCount}/{u.goalCount} done
                </span>
                <span className="font-semibold tabular-nums text-accent">
                  {u.percent}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${u.percent}%` }}
                />
              </div>
            </>
          ) : (
            <span className="text-xs text-muted-fg">No goals this week</span>
          )}
        </div>

        {canExpand && (
          <span
            className={`shrink-0 text-muted-fg transition-transform ${
              open ? "rotate-90" : ""
            }`}
            aria-hidden="true"
          >
            ›
          </span>
        )}
      </button>

      {!isSelf && <DeleteUserButton userId={u.id} name={u.name ?? u.email} />}
      </div>

      {open && canExpand && (
        <ul className="border-t border-line px-4 py-2">
          {u.goals.map((g) => (
            <li
              key={g.id}
              className="flex items-center gap-3 py-1.5 text-sm"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  g.completed ? "bg-brand" : "bg-line"
                }`}
              />
              <span
                className={`min-w-0 flex-1 truncate ${
                  g.completed ? "text-muted-fg line-through" : "text-ink"
                }`}
              >
                {g.title}
              </span>
              {g.hasDeadline && (
                <span className="shrink-0 text-xs text-muted-fg">due</span>
              )}
              <span className="shrink-0 text-xs font-semibold tabular-nums text-accent">
                {g.percent}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function DeleteUserButton({
  userId,
  name,
}: {
  userId: string;
  name: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-1 pr-4 text-xs">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await deleteUser(userId);
            })
          }
          className="rounded bg-red-500 px-2 py-1 font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
        >
          {isPending ? "Deleting…" : "Delete"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="rounded px-2 py-1 text-muted-fg transition hover:bg-canvas"
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
      className="shrink-0 px-4 text-muted-fg transition hover:text-red-500"
      aria-label={`Delete ${name ?? "user"}`}
      title="Delete user"
    >
      <TrashIcon className="h-4 w-4" />
    </button>
  );
}

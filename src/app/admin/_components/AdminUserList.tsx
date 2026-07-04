"use client";

import { useState, useTransition } from "react";
import { resolveAvatar } from "@/lib/avatar";
import {
  DEFAULT_MANUAL_PENALTY,
  formatMoney,
  PENALTY_CURRENCY,
} from "@/lib/penalties";
import { TrashIcon } from "../../dashboard/_components/icons";
import {
  addManualPenalty,
  deletePenalty,
  deleteUser,
  moveUserWeekToCurrent,
} from "../actions";

export type AdminGoal = {
  id: string;
  title: string;
  percent: number;
  completed: boolean;
  deadlineLabel: string | null;
  // Reason given for not finishing, captured when the period was closed.
  incompleteReason: string | null;
};

export type AdminPenalty = {
  id: string;
  label: string;
  amount: number;
  note: string | null;
  dateLabel: string;
};

export type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  department: string | null;
  avatar: string | null;
  weekLabel: string | null;
  misdated: boolean;
  late: boolean;
  submittedAtLabel: string | null;
  percent: number;
  goalCount: number;
  completedCount: number;
  penaltyTotal: number;
  penalties: AdminPenalty[];
  goals: AdminGoal[];
};

export function AdminUserList({
  users,
  currentUserId,
  periodNoun = "week",
}: {
  users: AdminUser[];
  currentUserId: string;
  periodNoun?: string;
}) {
  if (users.length === 0) {
    return <p className="px-1 text-sm text-muted-fg">No users yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {users.map((u) => (
        <UserRow
          key={u.id}
          user={u}
          isSelf={u.id === currentUserId}
          periodNoun={periodNoun}
        />
      ))}
    </ul>
  );
}

function UserRow({
  user: u,
  isSelf,
  periodNoun,
}: {
  user: AdminUser;
  isSelf: boolean;
  periodNoun: string;
}) {
  const [open, setOpen] = useState(false);
  const [addingFine, setAddingFine] = useState(false);
  const canExpand = u.goalCount > 0 || u.penalties.length > 0;
  const avatar = resolveAvatar(u.avatar, u.email ?? u.id);

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
            {u.misdated && (
              <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-600">
                Next week
              </span>
            )}
            {u.penaltyTotal > 0 && (
              <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                {formatMoney(u.penaltyTotal)}
              </span>
            )}
            {u.submittedAtLabel ? (
              <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                Submitted
              </span>
            ) : (
              u.goalCount > 0 && (
                <span className="shrink-0 rounded-full bg-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-fg">
                  Draft
                </span>
              )
            )}
          </p>
          <p className="truncate text-xs text-muted-fg">
            {u.email ?? "no email"}
            {u.department ? ` · ${u.department}` : ""}
          </p>
          <p className="truncate text-xs text-muted-fg">
            {u.submittedAtLabel
              ? `Goals submitted ${u.submittedAtLabel}`
              : "Goals not submitted yet"}
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
            <span className="text-xs text-muted-fg">No goals this {periodNoun}</span>
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

      <div className="flex shrink-0 items-center gap-2 pr-4">
        <button
          type="button"
          onClick={() => setAddingFine((v) => !v)}
          className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
          title="Issue a fine to this person"
        >
          Fine
        </button>
        {u.misdated && <FixWeekButton userId={u.id} weekLabel={u.weekLabel} />}
        {isSelf ? (
          // Invisible stand-in matching the delete button's footprint (px-4
          // around an h-4 w-4 icon) so every row's columns line up.
          <span className="w-12 shrink-0" aria-hidden="true" />
        ) : (
          <DeleteUserButton userId={u.id} name={u.name ?? u.email} />
        )}
      </div>
      </div>

      {addingFine && (
        <AddFineForm
          userId={u.id}
          name={u.name ?? u.email}
          onDone={() => setAddingFine(false)}
        />
      )}

      {open && canExpand && (
        <div className="border-t border-line px-4 py-2">
          {u.goals.length > 0 && (
            <ul>
              {u.goals.map((g) => (
                <li key={g.id} className="py-1.5 text-sm">
                  <div className="flex items-center gap-3">
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
                    {g.deadlineLabel && (
                      <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted-fg">
                        Due {g.deadlineLabel}
                      </span>
                    )}
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-accent">
                      {g.percent}%
                    </span>
                  </div>
                  {g.incompleteReason && (
                    <p className="mt-0.5 pl-5 text-xs italic text-muted-fg">
                      “{g.incompleteReason}”
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {u.penalties.length > 0 && (
            <div className={u.goals.length > 0 ? "mt-2 border-t border-line pt-2" : ""}>
              <p className="py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
                Fines
              </p>
              <ul>
                {u.penalties.map((p) => (
                  <PenaltyRow key={p.id} penalty={p} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function PenaltyRow({ penalty: p }: { penalty: AdminPenalty }) {
  const [isPending, startTransition] = useTransition();
  return (
    <li className="flex items-center gap-3 py-1.5 text-sm">
      <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
      <span className="min-w-0 flex-1 truncate text-ink">
        {p.label}
        {p.note ? <span className="text-muted-fg"> · {p.note}</span> : ""}
      </span>
      <span className="shrink-0 text-[11px] text-muted-fg">{p.dateLabel}</span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-red-600">
        {formatMoney(p.amount)}
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => void (await deletePenalty(p.id)))}
        className="shrink-0 text-muted-fg transition hover:text-red-500 disabled:opacity-50"
        aria-label="Remove fine"
        title="Remove fine"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

function AddFineForm({
  userId,
  name,
  onDone,
}: {
  userId: string;
  name: string | null;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(DEFAULT_MANUAL_PENALTY));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await addManualPenalty(userId, value, note);
        onDone();
      } catch {
        setError("Couldn't add the fine.");
      }
    });
  }

  return (
    <div className="border-t border-line bg-canvas/50 px-4 py-3">
      <p className="mb-2 text-xs font-semibold text-ink">
        Fine {name ?? "user"}{" "}
        <span className="font-normal text-muted-fg">
          (for meeting skips, use attendance below)
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-xs text-muted-fg">Amount</span>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28 rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          />
          <span className="text-xs text-muted-fg">{PENALTY_CURRENCY}</span>
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional) — e.g. missed Monday standup"
          maxLength={500}
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="shrink-0 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add fine"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onDone}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-fg transition hover:bg-line"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function FixWeekButton({
  userId,
  weekLabel,
}: {
  userId: string;
  weekLabel: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-1 pr-3 text-xs">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await moveUserWeekToCurrent(userId);
              setConfirming(false);
            })
          }
          className="rounded bg-brand px-2 py-1 font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
          title={`Re-date${weekLabel ? ` (${weekLabel})` : ""} to the current week`}
        >
          {isPending ? "Moving…" : "Move to this week"}
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
      className="shrink-0 rounded-lg border border-orange-200 px-2.5 py-1 text-xs font-medium text-orange-600 transition hover:bg-orange-50"
      title="Move this user's week to the current calendar week (keeps all goals)"
    >
      Fix week
    </button>
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

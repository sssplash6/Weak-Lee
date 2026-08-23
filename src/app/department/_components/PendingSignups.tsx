"use client";

import { useState, useTransition } from "react";
import { approveSignup, rejectSignup } from "../actions";

export type PendingSignup = {
  id: string;
  name: string;
  email: string | null;
  emoji: string;
  bg: string;
  joinedLabel: string;
};

/**
 * Sign-ups waiting to be let in — shown to department leads (their panel) and
 * admins (team overview). Approve opens the door; Remove deletes the account
 * (they can always sign up again, which files a fresh request) and is shown
 * to admins only — see rejectSignup for why leads don't get it.
 */
export function PendingSignups({
  signups,
  canRemove,
}: {
  signups: PendingSignup[];
  canRemove: boolean;
}) {
  if (signups.length === 0) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40">
      <div className="flex items-baseline gap-2 border-b border-amber-200/70 px-4 py-3">
        <h2 className="text-sm font-bold text-ink">Waiting for approval</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-800">
          {signups.length}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-fg">
          new sign-ups — they can&rsquo;t use the platform until someone lets
          them in
        </span>
      </div>
      <ul className="flex flex-col">
        {signups.map((s) => (
          <SignupRow key={s.id} signup={s} canRemove={canRemove} />
        ))}
      </ul>
    </section>
  );
}

function SignupRow({
  signup: s,
  canRemove,
}: {
  signup: PendingSignup;
  canRemove: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't work.");
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-amber-200/50 px-4 py-3 last:border-0">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${s.bg}`}
        aria-hidden="true"
      >
        {s.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
        <p className="truncate text-xs text-muted-fg">
          {[s.email, `signed up ${s.joinedLabel}`].filter(Boolean).join(" · ")}
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => approveSignup(s.id))}
          className="shrink-0 whitespace-nowrap rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {isPending ? "…" : "Approve"}
        </button>
        {!canRemove ? null : confirming ? (
          <span className="flex items-center gap-1 text-xs">
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => rejectSignup(s.id))}
              className="whitespace-nowrap rounded bg-red-500 px-2 py-1 font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
            >
              {isPending ? "Removing…" : "Remove account"}
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
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirming(true)}
            className="shrink-0 whitespace-nowrap rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

"use client";

import { useState, useTransition } from "react";
import { ROLE_LABEL, type TeamRole } from "@/lib/team";
import { joinDepartment, leaveDepartment } from "./actions";

export type MembershipView = {
  departmentId: string;
  name: string;
  role: TeamRole;
};

/**
 * The self-service side of departments: your seats, listed with the hat you
 * wear in each, plus joining another department as a member. Lead seats are
 * admin-granted, so they can't be dropped here — and the last seat can't be
 * dropped at all (the dashboard needs you in at least one department).
 */
export function ProfileDepartments({
  memberships,
  joinable,
}: {
  memberships: MembershipView[];
  joinable: { id: string; name: string }[];
}) {
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

  const onlySeat = memberships.length <= 1;

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-8 shadow-sm">
      <h2 className="text-lg font-bold text-ink">Your departments</h2>
      <p className="mt-1 text-sm text-muted-fg">
        Where you sit and the hat you wear there. You can join other
        departments as a member; lead roles are handed out by the admins.
      </p>

      <ul className="mt-4 flex flex-col">
        {memberships.map((m) => (
          <li
            key={m.departmentId}
            className="flex items-center gap-2 border-b border-line/60 py-2.5 last:border-0"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {m.name}
            </span>
            {m.role === "LEAD" ? (
              <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
                {ROLE_LABEL.LEAD}
              </span>
            ) : (
              <span className="shrink-0 text-xs text-muted-fg">
                {ROLE_LABEL.MEMBER}
              </span>
            )}
            {m.role === "MEMBER" && (
              <button
                type="button"
                disabled={isPending || onlySeat}
                onClick={() => run(() => leaveDepartment(m.departmentId))}
                title={
                  onlySeat
                    ? "You need at least one department — join another first."
                    : `Leave ${m.name}`
                }
                className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted-fg transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Leave
              </button>
            )}
          </li>
        ))}
        {memberships.length === 0 && (
          <li className="py-2.5 text-sm text-muted-fg">
            You&rsquo;re not in any department yet — pick one below.
          </li>
        )}
      </ul>

      {joinable.length > 0 && (
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-4">
          <select
            value=""
            disabled={isPending}
            onChange={(e) => e.target.value && run(() => joinDepartment(e.target.value))}
            aria-label="Join a department as a member"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted-fg transition hover:text-ink focus:border-brand focus:outline-none disabled:opacity-50"
          >
            <option value="" disabled>
              {isPending ? "Joining…" : "Join another department as a member…"}
            </option>
            {joinable.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

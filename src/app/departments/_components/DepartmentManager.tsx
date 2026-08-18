"use client";

import { useState, useTransition } from "react";
import { TrashIcon } from "../../dashboard/_components/icons";
import {
  addMembership,
  createDepartment,
  deleteDepartment,
  removeMembership,
  renameDepartment,
  setMembershipRole,
} from "../actions";

export type Person = {
  id: string;
  name: string;
  email: string | null;
  emoji: string;
  bg: string;
  /** The hat worn in THIS department — the same person can lead elsewhere. */
  lead: boolean;
};

export type DepartmentView = {
  id: string;
  name: string;
  people: Person[];
};

export function DepartmentManager({
  departments,
  unassigned,
  allPeople,
  currentUserId,
}: {
  departments: DepartmentView[];
  unassigned: Person[];
  allPeople: { id: string; name: string }[];
  currentUserId: string;
}) {
  const destinations = departments.map((d) => ({ id: d.id, name: d.name }));

  return (
    <div className="flex flex-col gap-4">
      <CreateDepartmentForm />

      {departments.length === 0 ? (
        <p className="px-1 text-sm text-muted-fg">
          No departments yet — add the first one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {departments.map((d) => (
            <DepartmentCard
              key={d.id}
              department={d}
              allPeople={allPeople}
              currentUserId={currentUserId}
            />
          ))}
        </ul>
      )}

      {unassigned.length > 0 && (
        <section className="rounded-xl border border-dashed border-line bg-surface/50 p-4">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-bold text-ink">No department</h2>
            <span className="text-xs text-muted-fg">
              mid-onboarding, or their departments were deleted — place them
            </span>
          </div>
          <ul className="mt-2 flex flex-col">
            {unassigned.map((p) => (
              <UnassignedRow key={p.id} person={p} destinations={destinations} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CreateDepartmentForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const value = name.trim();
    if (!value) return;
    setError(null);
    startTransition(async () => {
      try {
        await createDepartment(value);
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add it.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="New department — e.g. Design"
          maxLength={60}
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          disabled={isPending || name.trim() === ""}
          onClick={submit}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add department"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function DepartmentCard({
  department: d,
  allPeople,
  currentUserId,
}: {
  department: DepartmentView;
  allPeople: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(d.name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const leads = d.people.filter((p) => p.lead);
  const seated = new Set(d.people.map((p) => p.id));
  const addable = allPeople.filter((p) => !seated.has(p.id));

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

  function saveRename() {
    const value = name.trim();
    if (!value || value === d.name) {
      setRenaming(false);
      setName(d.name);
      return;
    }
    run(async () => {
      await renameDepartment(d.id, value);
      setRenaming(false);
    });
  }

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveRename()}
              maxLength={60}
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm font-bold text-ink focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              disabled={isPending}
              onClick={saveRename}
              className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setRenaming(false);
                setName(d.name);
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-muted-fg transition hover:bg-canvas"
            >
              Cancel
            </button>
          </span>
        ) : (
          <>
            <h2 className="text-sm font-bold text-ink">{d.name}</h2>
            <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-fg">
              {d.people.length}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-fg">
              {leads.length > 0 ? (
                `Lead: ${leads.map((l) => l.name).join(", ")}`
              ) : (
                <span className="text-amber-700">No lead yet</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted-fg transition hover:bg-canvas hover:text-ink"
            >
              Rename
            </button>
            <DeleteDepartmentButton department={d} />
          </>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      {d.people.length > 0 ? (
        <ul className="mt-2 flex flex-col border-t border-line pt-1">
          {d.people.map((p) => (
            <MembershipRow
              key={p.id}
              person={p}
              departmentId={d.id}
              isSelf={p.id === currentUserId}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-2 border-t border-line pt-2.5 text-xs text-muted-fg">
          Nobody here yet — add people below, or let new joiners pick it at
          onboarding.
        </p>
      )}

      {addable.length > 0 && (
        <div className="mt-2 border-t border-line pt-2">
          <select
            value=""
            disabled={isPending}
            onChange={(e) =>
              e.target.value && run(() => addMembership(e.target.value, d.id))
            }
            aria-label={`Add a person to ${d.name}`}
            className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-medium text-muted-fg transition hover:text-ink focus:border-brand focus:outline-none disabled:opacity-50"
          >
            <option value="" disabled>
              {isPending ? "Working…" : "Add a person as a member…"}
            </option>
            {addable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </li>
  );
}

function DeleteDepartmentButton({ department: d }: { department: DepartmentView }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => void (await deleteDepartment(d.id)))
          }
          className="rounded bg-red-500 px-2 py-1 font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
          title={
            d.people.length > 0
              ? `${d.people.length} ${d.people.length === 1 ? "seat goes" : "seats go"} away — the people keep their accounts and other departments`
              : undefined
          }
        >
          {isPending
            ? "Deleting…"
            : d.people.length > 0
              ? `Delete (${d.people.length} ${d.people.length === 1 ? "seat" : "seats"})`
              : "Delete"}
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
      className="shrink-0 text-muted-fg transition hover:text-red-500"
      aria-label={`Delete ${d.name}`}
      title="Delete department"
    >
      <TrashIcon className="h-4 w-4" />
    </button>
  );
}

/** One seat: a person inside one department card, with per-seat controls. */
function MembershipRow({
  person: p,
  departmentId,
  isSelf,
}: {
  person: Person;
  departmentId: string;
  isSelf: boolean;
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

  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-line/60 py-2 last:border-0">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${p.bg}`}
        aria-hidden="true"
      >
        {p.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="truncate">{p.name}</span>
          {isSelf && (
            <span className="shrink-0 text-xs font-normal text-muted-fg">
              (you)
            </span>
          )}
          {p.lead && (
            <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
              Dep. lead
            </span>
          )}
        </span>
        {error && <span className="block text-xs text-red-600">{error}</span>}
      </span>

      {/* Flip the hat worn in THIS department only. */}
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          run(() =>
            setMembershipRole(p.id, departmentId, p.lead ? "MEMBER" : "LEAD"),
          )
        }
        title={
          p.lead
            ? "Member here: no expectations from this seat"
            : "Lead here: expected at Monday meetings and to submit weekly/monthly goals"
        }
        className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted-fg transition hover:bg-canvas hover:text-ink disabled:opacity-50"
      >
        {isPending ? "…" : p.lead ? "Make member" : "Make lead"}
      </button>

      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => removeMembership(p.id, departmentId))}
        title="Remove from this department (their other departments stay)"
        className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted-fg transition hover:bg-canvas hover:text-ink disabled:opacity-50"
      >
        Remove
      </button>
    </li>
  );
}

/** Someone holding no seat anywhere — a select to give them their first one. */
function UnassignedRow({
  person: p,
  destinations,
}: {
  person: Person;
  destinations: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-line/60 py-2 last:border-0">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${p.bg}`}
        aria-hidden="true"
      >
        {p.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">
          {p.name}
        </span>
        {error && <span className="block text-xs text-red-600">{error}</span>}
      </span>
      <select
        value=""
        disabled={isPending}
        onChange={(e) => {
          const dept = e.target.value;
          if (!dept) return;
          setError(null);
          startTransition(async () => {
            try {
              await addMembership(p.id, dept);
            } catch (err) {
              setError(err instanceof Error ? err.message : "That didn't work.");
            }
          });
        }}
        aria-label={`Add ${p.name} to a department`}
        className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-xs font-medium text-muted-fg transition hover:text-ink focus:border-brand focus:outline-none disabled:opacity-50"
      >
        <option value="" disabled>
          {isPending ? "Working…" : "Add to department…"}
        </option>
        {destinations.map((dest) => (
          <option key={dest.id} value={dest.id}>
            {dest.name}
          </option>
        ))}
      </select>
    </li>
  );
}

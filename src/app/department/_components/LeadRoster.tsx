"use client";

import { useState, useTransition } from "react";
import {
  DEFAULT_MANUAL_PENALTY,
  formatMoney,
  PENALTY_CURRENCY,
} from "@/lib/penalties";
import {
  addBonus,
  addManualPenalty,
  assignTask,
} from "../../admin/actions";

export type LeadMember = {
  id: string;
  name: string;
  emoji: string;
  bg: string;
  goalCount: number;
  weekPercent: number;
  submittedAtLabel: string | null;
  outstanding: number;
  openTasks: number;
};

export type LeadDepartment = {
  id: string;
  name: string;
  people: LeadMember[];
};

export function LeadRoster({ departments }: { departments: LeadDepartment[] }) {
  return (
    <div className="flex flex-col gap-4">
      {departments.map((d) => (
        <section key={d.id} className="rounded-xl border border-line bg-surface">
          <div className="flex items-baseline gap-2 border-b border-line px-4 py-3">
            <h2 className="text-sm font-bold text-ink">{d.name}</h2>
            <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-fg">
              {d.people.length}
            </span>
          </div>
          {d.people.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-fg">
              Nobody under this department yet — people join it at onboarding,
              from their profile, or an admin adds them on the Departments page.
            </p>
          ) : (
            <ul className="flex flex-col">
              {d.people.map((p) => (
                <MemberRow key={p.id} member={p} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

type Panel = "assign" | "fine" | "bonus" | null;

function MemberRow({ member: p }: { member: LeadMember }) {
  const [panel, setPanel] = useState<Panel>(null);

  const toggle = (next: Exclude<Panel, null>) =>
    setPanel((cur) => (cur === next ? null : next));

  return (
    <li className="border-b border-line/60 last:border-0">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${p.bg}`}
          aria-hidden="true"
        >
          {p.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
            <span className="truncate">{p.name}</span>
            {p.outstanding > 0 && (
              <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                {formatMoney(p.outstanding)}
              </span>
            )}
            {p.openTasks > 0 && (
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                {p.openTasks} open {p.openTasks === 1 ? "task" : "tasks"}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-fg">
            {p.goalCount === 0
              ? "No weekly goals yet"
              : `This week ${p.weekPercent}% · ${
                  p.submittedAtLabel
                    ? `submitted ${p.submittedAtLabel}`
                    : "not submitted"
                }`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => toggle("assign")}
            aria-expanded={panel === "assign"}
            className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft/60"
          >
            Assign
          </button>
          <button
            type="button"
            onClick={() => toggle("fine")}
            aria-expanded={panel === "fine"}
            className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
          >
            Fine
          </button>
          <button
            type="button"
            onClick={() => toggle("bonus")}
            aria-expanded={panel === "bonus"}
            className="shrink-0 rounded-lg border border-green-200 px-2.5 py-1 text-xs font-medium text-green-700 transition hover:bg-green-50"
          >
            Bonus
          </button>
        </div>
      </div>

      {panel === "assign" && (
        <AssignForm member={p} onDone={() => setPanel(null)} />
      )}
      {panel === "fine" && (
        <MoneyForm kind="fine" member={p} onDone={() => setPanel(null)} />
      )}
      {panel === "bonus" && (
        <MoneyForm kind="bonus" member={p} onDone={() => setPanel(null)} />
      )}
    </li>
  );
}

function AssignForm({
  member,
  onDone,
}: {
  member: LeadMember;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (title.trim() === "") {
      setError("Give the goal a title.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        // Always a weekly goal — leads run the week; monthly assignments
        // stay an admin thing.
        await assignTask([member.id], title, deadline || null, note, "WEEKLY");
        onDone();
      } catch {
        setError("Couldn't assign it.");
      }
    });
  }

  return (
    <div className="rise-in border-t border-line bg-canvas/50 px-4 py-3">
      <p className="mb-2 text-xs font-semibold text-ink">
        Assign a goal to {member.name}{" "}
        <span className="font-normal text-muted-fg">
          (lands in their &ldquo;Assigned by leadership&rdquo; list)
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What should they get done?"
          maxLength={300}
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
        />
        <label className="flex shrink-0 items-center gap-1.5 text-sm">
          <span className="text-xs text-muted-fg">Due</span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          maxLength={500}
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="shrink-0 whitespace-nowrap rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {isPending ? "Assigning…" : "Assign goal"}
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

function MoneyForm({
  kind,
  member,
  onDone,
}: {
  kind: "fine" | "bonus";
  member: LeadMember;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(DEFAULT_MANUAL_PENALTY));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fine = kind === "fine";

  function submit() {
    const value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await (fine
          ? addManualPenalty(member.id, value, note)
          : addBonus(member.id, value, note));
        onDone();
      } catch {
        setError(fine ? "Couldn't add the fine." : "Couldn't add the bonus.");
      }
    });
  }

  return (
    <div
      className={`rise-in border-t border-line px-4 py-3 ${
        fine ? "bg-canvas/50" : "bg-green-50/40"
      }`}
    >
      <p className="mb-2 text-xs font-semibold text-ink">
        {fine ? "Fine" : "Bonus"} {member.name}{" "}
        <span className="font-normal text-muted-fg">
          {fine
            ? "(they're notified, and it lands in the fines ledger)"
            : "(great work, extra effort…)"}
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
          placeholder={
            fine
              ? "Reason — e.g. missed the department sync"
              : "Note (optional) — e.g. closed the launch early"
          }
          maxLength={500}
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
            fine
              ? "bg-red-500 hover:bg-red-600"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {isPending ? "Adding…" : fine ? "Add fine" : "Add bonus"}
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

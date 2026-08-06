"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { formatMoney } from "@/lib/penalties";
import { allocateSettlement, fineOwed, totalOwed } from "@/lib/settlement";
import { settleAmount, settleFineAmount } from "../../admin/actions";
import { REASONS } from "../reasons";

/** An open fine as the dialog needs it: what it is, and what's left on it. */
export type SettleFine = {
  id: string;
  reasonIndex: number;
  note: string | null;
  dateLabel: string;
  amount: number;
  paidAmount: number;
};

/** Settle against a whole person's balance, or against one fine of theirs. */
export type SettleScope =
  | { kind: "person"; userId: string }
  | { kind: "fine"; penaltyId: string };

/**
 * The settle window: type (or drag) an amount, watch it land on the person's
 * fines, confirm. The preview runs the *same* allocation function the server
 * action applies (lib/settlement), so what the admin sees before confirming is
 * exactly what gets recorded — oldest fine first, whatever it doesn't reach
 * left untouched.
 *
 * Portaled to <body>: the matrix it opens from lives inside a scrolling table
 * wrapper, which would otherwise clip the panel.
 */
export function SettleDialog({
  person,
  fines,
  scope,
  onClose,
}: {
  person: { name: string; emoji: string; bg: string };
  /** Open fines, oldest first — the order a payment is applied in. */
  fines: SettleFine[];
  scope: SettleScope;
  onClose: () => void;
}) {
  const owed = totalOwed(fines);
  // Pre-filled with the whole balance: settling everything is the common case,
  // and it makes the amount a thing to edit down rather than type from scratch.
  const [raw, setRaw] = useState(String(owed));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const value = clampAmount(raw, owed);
  const plan = allocateSettlement(fines, value);
  const after = owed - plan.applied;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.select();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  function submit() {
    if (value <= 0 || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        if (scope.kind === "person") {
          await settleAmount(scope.userId, value);
        } else {
          await settleFineAmount(scope.penaltyId, value);
        }
        onClose();
      } catch {
        setError("Couldn’t record that settlement — please try again.");
      }
    });
  }

  if (typeof document === "undefined") return null;

  const single = scope.kind === "fine";

  return createPortal(
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Settle fines for ${person.name}`}
    >
      <div
        className="modal-in flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl border border-line bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Who, and what they owe right now. */}
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${person.bg}`}
            aria-hidden="true"
          >
            {person.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-ink">
              Settle {single ? "this fine" : `${person.name}’s fines`}
            </h2>
            <p className="truncate text-xs text-muted-fg">
              {single ? person.name : `${fines.length} open`} ·{" "}
              {formatMoney(owed)} outstanding
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-1 text-muted-fg transition hover:bg-canvas hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* The amount cut from their salary. */}
          <label
            htmlFor="settle-amount"
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-fg"
          >
            Amount deducted
          </label>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex items-baseline gap-1 rounded-xl border border-line bg-canvas px-3 py-2 focus-within:border-brand">
              <span className="text-xl font-bold text-muted-fg">$</span>
              <input
                id="settle-amount"
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoFocus
                value={raw}
                onChange={(e) => setRaw(capToBalance(e.target.value, owed))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-28 bg-transparent text-2xl font-bold tabular-nums text-ink outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <QuickChip
                label="All"
                amount={owed}
                active={value === owed}
                onPick={setRaw}
              />
              <QuickChip
                label="Half"
                amount={Math.round(owed / 2)}
                active={value === Math.round(owed / 2)}
                onPick={setRaw}
              />
              {fines.length > 1 && (
                <QuickChip
                  label="Oldest"
                  amount={fineOwed(fines[0])}
                  active={value === fineOwed(fines[0])}
                  onPick={setRaw}
                />
              )}
            </div>
          </div>

          {/* Drag for the same thing — quicker for "about half of it". */}
          <input
            type="range"
            min={0}
            max={owed}
            step={1}
            value={value}
            onChange={(e) => setRaw(e.target.value)}
            aria-label="Amount deducted"
            className="mt-3 w-full accent-brand"
          />

          {/* Where the money lands, live. */}
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
            {single ? "This fine" : "Applied oldest first"}
          </p>
          <ul className="mt-1.5 flex flex-col">
            {fines.map((f, i) => (
              <PreviewLine
                key={f.id}
                fine={f}
                allocation={plan.allocations[i]}
              />
            ))}
          </ul>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
        </div>

        {/* What this leaves behind, and the commit. */}
        <div className="flex items-center gap-3 border-t border-line px-5 py-3.5">
          <p className="min-w-0 flex-1 text-xs text-muted-fg">
            {plan.cleared > 0 && (
              <span className="font-semibold text-green-700">
                Clears {plan.cleared} {plan.cleared === 1 ? "fine" : "fines"}
              </span>
            )}
            {plan.cleared > 0 && " · "}
            {after > 0 ? (
              <>
                {formatMoney(after)} left outstanding
              </>
            ) : (
              <span className="font-semibold text-green-700">
                All settled up
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={value <= 0 || isPending}
            className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {isPending ? "Settling…" : `Settle ${formatMoney(plan.applied)}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A one-tap amount (all of it, half of it, the oldest fine). */
function QuickChip({
  label,
  amount,
  active,
  onPick,
}: {
  label: string;
  amount: number;
  active: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(String(amount))}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
        active
          ? "border-brand bg-brand-soft text-brand"
          : "border-line text-muted-fg hover:border-brand hover:text-brand"
      }`}
    >
      {label}
      <span className="ml-1 tabular-nums opacity-70">
        {formatMoney(amount)}
      </span>
    </button>
  );
}

/**
 * One fine in the preview: a bar of what was already paid, what this payment
 * adds, and what would still be owed — so the split is legible at a glance
 * rather than as three numbers to compare.
 */
function PreviewLine({
  fine: f,
  allocation,
}: {
  fine: SettleFine;
  allocation: { pay: number; owedAfter: number; clears: boolean };
}) {
  const reason = REASONS[f.reasonIndex];
  const before = (f.paidAmount / f.amount) * 100;
  const adding = (allocation.pay / f.amount) * 100;

  return (
    <li
      className={`border-t border-line py-2 first:border-t-0 ${
        allocation.pay > 0 ? "" : "opacity-50"
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={`h-2 w-2 shrink-0 translate-y-px rounded-full ${reason.dot}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-xs text-ink">
          {reason.label}
          {f.note && <span className="text-muted-fg"> · {f.note}</span>}
        </span>
        <span
          className={`shrink-0 text-xs font-bold tabular-nums ${
            allocation.clears
              ? "text-green-700"
              : allocation.owedAfter > 0
                ? "text-red-600"
                : "text-muted-fg"
          }`}
        >
          {allocation.clears
            ? "cleared"
            : `${formatMoney(allocation.owedAfter)} left`}
        </span>
      </div>
      {/* The date and the running total sit under the reason rather than
          beside it — three columns of text on one line stopped fitting the
          moment a fine carried a note. */}
      <p className="mt-0.5 pl-4 text-[10px] tabular-nums text-muted-fg">
        {f.dateLabel}
        {allocation.pay > 0 && (
          <>
            {" · "}
            <span className="text-green-700">
              +{formatMoney(allocation.pay)}
            </span>
            {/* The fine's own size is worth repeating only while there's a
                remainder to compare it against. */}
            {!allocation.clears && ` of ${formatMoney(f.amount)}`}
          </>
        )}
        {f.paidAmount > 0 && ` · ${formatMoney(f.paidAmount)} paid earlier`}
      </p>
      <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-red-500/15">
        {/* Already settled before this payment. */}
        <span
          className="h-full bg-green-600/40 transition-[width] duration-300 ease-out"
          style={{ width: `${before}%` }}
        />
        {/* What this payment adds. */}
        <span
          className="h-full bg-green-600 transition-[width] duration-300 ease-out"
          style={{ width: `${adding}%` }}
        />
      </div>
    </li>
  );
}

/** Read the typed amount: whole dollars, never negative, never over the balance. */
function clampAmount(raw: string, max: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, max);
}

/**
 * Keep the field itself inside the balance as it's typed — there's no such
 * thing as settling more than is owed, and snapping to the maximum says so
 * better than accepting a figure the confirm button would quietly ignore.
 */
function capToBalance(raw: string, max: number): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits === "") return "";
  return String(Math.min(Number.parseInt(digits, 10), max));
}

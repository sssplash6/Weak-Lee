"use client";

import { useState, useTransition, type ReactNode } from "react";
import { processApproved, sendBackToAdmins } from "./actions";

export type FinanceRowSummary = {
  name: string;
  deptLine: string | null;
  emoji: string;
  bg: string;
  metaLine: string | null;
  netLabel: string;
};

/**
 * One request in the finance queue: expands to the full detail (children),
 * with finance's two moves — confirm the payment, or send it back to the
 * admin queue with a required note. Mirrors ReviewRow; the moves differ.
 */
export function FinanceRow({
  submissionId,
  canAct,
  summary,
  children,
}: {
  submissionId: string;
  canAct: boolean;
  summary: FinanceRowSummary;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await processApproved(submissionId);
        if (!res.ok) setError(res.error);
      } catch {
        setError("Couldn't confirm — try again.");
      }
    });
  }

  function sendBack() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await sendBackToAdmins(submissionId, note);
        if (!res.ok) setError(res.error);
        else {
          setSendingBack(false);
          setNote("");
        }
      } catch {
        setError("Couldn't send back — try again.");
      }
    });
  }

  return (
    <li className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${summary.bg}`}
          aria-hidden="true"
        >
          {summary.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {summary.name}
          </span>
          <span className="block truncate text-xs text-muted-fg">
            {[summary.deptLine, summary.metaLine].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
          {summary.netLabel}
        </span>
        <span
          className={`shrink-0 text-muted-fg transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="rise-in border-t border-line px-4 py-3">
          {children}
          {canAct && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <button
                type="button"
                disabled={isPending}
                onClick={confirm}
                className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending && !sendingBack ? "Confirming…" : "Confirm payment"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  setSendingBack(true);
                }}
                className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-brand transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send back…
              </button>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}

      {sendingBack && (
        <div
          className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Send ${summary.name}'s request back`}
        >
          <div className="modal-in w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-ink">
              Send {summary.name}&rsquo;s request back to review
            </h3>
            <p className="mt-1 text-xs text-muted-fg">
              It returns to the admin queue with your note in the audit trail.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
              rows={3}
              maxLength={1000}
              placeholder="Why it's going back — required"
              className="mt-3 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setSendingBack(false)}
                className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || note.trim().length === 0}
                onClick={sendBack}
                className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Sending…" : "Send back"}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

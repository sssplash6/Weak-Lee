"use client";

import { useState, useTransition, type ReactNode } from "react";
import { PanelFlags, type PanelFlag } from "../_components/PanelFlags";
import { confirmSubmission, declineSubmission } from "./actions";

export type ReviewRowSummary = {
  name: string;
  deptLine: string | null;
  emoji: string;
  bg: string;
  statusLabel: string;
  statusBadge: string;
  netLabel: string;
  metaLine: string | null;
  /** Attention marks (waited too long, unusually large) — computed server-side. */
  flags: PanelFlag[];
};

/**
 * One request in the admin panel: a header row that expands in place to the
 * full server-rendered detail (passed as children), plus the two admin moves —
 * approve to finance, or decline with a required note (a small modal). The
 * revalidated page moves the row on success; this component only holds the
 * open/typing state.
 */
export function ReviewRow({
  submissionId,
  canAct,
  summary,
  children,
}: {
  submissionId: string;
  canAct: boolean;
  summary: ReviewRowSummary;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await confirmSubmission(submissionId);
        if (!res.ok) setError(res.error);
      } catch {
        setError("Couldn't approve — try again.");
      }
    });
  }

  function decline() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await declineSubmission(submissionId, note);
        if (!res.ok) setError(res.error);
        else {
          setDeclining(false);
          setNote("");
        }
      } catch {
        setError("Couldn't decline — try again.");
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
        <PanelFlags flags={summary.flags} />
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${summary.statusBadge}`}
        >
          {summary.statusLabel}
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
                onClick={approve}
                className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending && !declining ? "Approving…" : "Approve → finance"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  setDeclining(true);
                }}
                className="rounded-lg border border-red-200 px-3.5 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Decline…
              </button>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}
          {!canAct && error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}

      {declining && (
        <div
          className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Decline ${summary.name}'s request`}
        >
          <div className="modal-in w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-ink">
              Decline {summary.name}&rsquo;s request
            </h3>
            <p className="mt-1 text-xs text-muted-fg">
              The note reopens their form until the filing deadline &mdash;
              declining on the window&rsquo;s last day adds one more day.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
              rows={3}
              maxLength={1000}
              placeholder="What needs fixing — required"
              className="mt-3 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setDeclining(false)}
                className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || note.trim().length === 0}
                onClick={decline}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Declining…" : "Decline request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

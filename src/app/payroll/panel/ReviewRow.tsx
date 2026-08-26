"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  PanelRowShell,
  type PanelRowSummary,
} from "../_components/PanelRowShell";
// The admin stage's moves stay in ../review, next to the state machine they
// drive. Only the UI moved here when the three panels merged.
import { confirmSubmission, declineSubmission } from "../review/actions";

/**
 * A panel row plus the two admin moves — approve to finance, or decline with a
 * required note (a small modal). The revalidated page moves the row on
 * success; this component only holds the open/typing state.
 *
 * There is no `canAct` prop, on purpose. This component IS the permission:
 * /payroll/panel renders it only for a row at the admin stage being looked at
 * by a payroll admin, and renders the bare PanelRowShell otherwise. A row can
 * therefore never talk itself into showing a button by inspecting its own
 * status, which is the failure mode a single merged panel invites.
 */
export function ReviewRow({
  submissionId,
  summary,
  children,
}: {
  submissionId: string;
  summary: PanelRowSummary;
  children: ReactNode;
}) {
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
    <PanelRowShell
      summary={summary}
      footer={
        <>
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
        </>
      }
    >
      {children}
    </PanelRowShell>
  );
}

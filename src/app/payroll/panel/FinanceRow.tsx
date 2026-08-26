"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  PanelRowShell,
  type PanelRowSummary,
} from "../_components/PanelRowShell";
// As with ReviewRow: the finance-stage moves stay in ../finance beside the
// state machine; only the UI lives in the merged panel.
import { processApproved, sendBackToAdmins } from "../finance/actions";

/**
 * A panel row plus finance's two moves — confirm the payment, or send it back
 * to the admin stage with a required note. Mirrors ReviewRow; the moves differ.
 *
 * Like ReviewRow it takes no `canAct`: /payroll/panel renders it only for a
 * row awaiting payment being looked at by finance. See PanelRowShell for why
 * that is the whole permission model of a row.
 */
export function FinanceRow({
  submissionId,
  summary,
  children,
}: {
  submissionId: string;
  summary: PanelRowSummary;
  children: ReactNode;
}) {
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
    <PanelRowShell
      summary={summary}
      footer={
        <>
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
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

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
                  It returns to the admin stage with your note in the audit
                  trail.
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
        </>
      }
    >
      {children}
    </PanelRowShell>
  );
}

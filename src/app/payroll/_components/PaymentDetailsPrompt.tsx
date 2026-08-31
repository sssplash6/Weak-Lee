"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "@/lib/useModalFocus";
import { savePaymentDetails } from "../actions";
import {
  paymentFieldsFor,
  PAYROLL_METHOD_LABEL,
  type PaymentDetails,
  type PaymentFieldKey,
  type PayrollMethod,
} from "@/lib/payrollTypes";

export type PendingDetails = {
  submissionId: string;
  method: PayrollMethod;
  details: PaymentDetails;
  periodLabel: string;
};

/**
 * Asks for the payout details a filed request is missing.
 *
 * The card and bank fields didn't exist when some requests were filed, so those
 * are sitting in the queue with nothing finance can pay from — and the person
 * who filed has no way to know that. Chasing it over Telegram is how it would
 * otherwise go; this asks where they already are.
 *
 * It opens by itself, once. Dismissing is allowed (someone may not have their
 * card to hand) but is deliberately not remembered anywhere but this tab, so
 * the ask comes back on the next visit and stops the moment the details land.
 */
// Nothing to subscribe to: the value is read once per mount, and every change
// to it is made by this component, which re-renders on its own state anyway.
const NEVER_CHANGES = () => () => {};

export function PaymentDetailsPrompt({ pending }: { pending: PendingDetails }) {
  const fields = paymentFieldsFor(pending.method);
  const key = `payout-details-${pending.submissionId}`;

  // "Have they already waved this away in this tab?" — read through
  // useSyncExternalStore rather than an effect, so the server render (which
  // has no sessionStorage) says "yes, stay shut" and hydration matches the
  // HTML instead of flashing a modal into it.
  const waved = useSyncExternalStore(
    NEVER_CHANGES,
    () => {
      try {
        return sessionStorage.getItem(key) === "1";
      } catch {
        // Private mode and the like — worst case the prompt asks again.
        return false;
      }
    },
    () => true,
  );

  const [closed, setClosed] = useState(false);
  const [reopened, setReopened] = useState(false);
  const [values, setValues] = useState<PaymentDetails>(pending.details);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  const open = !done && (reopened || (!waved && !closed));
  useModalFocus(open, boxRef);

  function close() {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // As above — a failed write only costs another ask.
    }
    setReopened(false);
    setClosed(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await savePaymentDetails(
          pending.submissionId,
          Object.fromEntries(
            fields.map((f) => [f.key, (values[f.key] ?? "").trim()]),
          ),
        );
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDone(true);
      } catch {
        setError("Couldn't save that — try again.");
      }
    });
  }

  function patch(key: PaymentFieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  // The banner stays after a dismissal, so the ask is never fully gone — it
  // just stops being a wall. It disappears for good once the details are in.
  const banner = done ? null : (
    <button
      type="button"
      onClick={() => setReopened(true)}
      className="rise-in mb-4 flex w-full items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3 text-left transition hover:bg-orange-50"
    >
      <span className="text-lg" aria-hidden="true">
        💳
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-orange-800">
          {`Finance needs your ${PAYROLL_METHOD_LABEL[pending.method]} details`}
        </span>
        <span className="block text-xs text-orange-800/80">
          {`Your ${pending.periodLabel} pay request can't be paid until they're in.`}
        </span>
      </span>
      <span className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">
        Add details
      </span>
    </button>
  );

  return (
    <>
      {banner}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
            onClick={() => !isPending && close()}
            role="dialog"
            aria-modal="true"
            aria-label="Add your payment details"
          >
            <div
              ref={boxRef}
              className="modal-in flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-bold text-ink">
                Add your payment details
              </h2>
              <p className="mt-1 text-sm text-muted-fg">
                {`You filed your ${pending.periodLabel} pay request as ${PAYROLL_METHOD_LABEL[pending.method]} before we started asking for these. Finance can't send the money without them.`}
              </p>

              <div className="mt-4 flex flex-col gap-3">
                {fields.map((f) => (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-muted-fg">
                      {f.label}
                    </span>
                    {f.kind === "note" ? (
                      <textarea
                        value={values[f.key] ?? ""}
                        onChange={(e) => patch(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        maxLength={f.maxLength}
                        rows={3}
                        className="rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
                      />
                    ) : (
                      <input
                        type={f.kind === "email" ? "email" : "text"}
                        inputMode={
                          f.kind === "card" || f.kind === "expiry"
                            ? "numeric"
                            : undefined
                        }
                        autoComplete="off"
                        value={values[f.key] ?? ""}
                        onChange={(e) => patch(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        maxLength={f.maxLength}
                        className="rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
                      />
                    )}
                  </label>
                ))}
              </div>

              {fields.some((f) => f.kind === "card") && (
                <p className="mt-3 text-xs text-muted-fg">
                  Finance sees these to pay you. The emailed invoice shows only
                  the last four digits.
                </p>
              )}
              {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={close}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted-fg transition hover:bg-line"
                >
                  Not now
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={submit}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                >
                  {isPending ? "Sending…" : "Send to finance"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

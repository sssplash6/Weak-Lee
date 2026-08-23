"use client";

import { useRef, useState, useTransition } from "react";
import { submitPayroll } from "../actions";
import { formatMoney } from "@/lib/penalties";
import {
  computeNet,
  MAX_PAYROLL_EXPENSES,
  MAX_RECEIPT_BYTES,
  PAYROLL_METHOD_LABEL,
  RECEIPT_MIME_TYPES,
  type PaymentDetails,
  type PayrollMethod,
} from "@/lib/payrollTypes";
import { TrashIcon } from "@/app/dashboard/_components/icons";
import { LedgerBreakdown, type LedgerLineView } from "./LedgerBreakdown";
import { ResubmitCountdown } from "./ResubmitCountdown";

type ExpenseDraft = {
  key: number;
  /** Set when the line came back from a declined submission — resubmitting
   * keeps that row (and its stored receipt) instead of recreating it. */
  existingId: string | null;
  existingReceiptName: string | null;
  label: string;
  amount: string;
  file: File | null;
};

export type PrefillExpense = {
  id: string;
  label: string;
  amount: number;
  receiptName: string | null;
};

const METHODS: PayrollMethod[] = ["CASH", "UZCARD", "WISE"];

/**
 * The monthly filing form: self-reported base salary, the read-only ledger
 * snapshot preview, repeatable expense lines with optional receipts, the
 * payment method, and the running arithmetic — base + bonuses − fines +
 * expenses — shown as sums, not just a result. One submit files (or, after a
 * decline, refiles) the request and generates the invoice PDF.
 */
export function PayrollForm({
  periodLabel,
  closesLabel,
  snapshot,
  prefill,
  resubmit,
}: {
  periodLabel: string;
  closesLabel: string;
  snapshot: {
    bonuses: LedgerLineView[];
    fines: LedgerLineView[];
    bonusesTotal: number;
    finesTotal: number;
  };
  prefill: {
    baseSalary: number | null;
    method: PayrollMethod;
    details: PaymentDetails;
    /** The declined submission's expense lines, back on the reopened form. */
    expenses?: PrefillExpense[];
  };
  resubmit: {
    deadlineIso: string;
    deadlineLabel: string;
    note: string | null;
  } | null;
}) {
  const [base, setBase] = useState(
    prefill.baseSalary != null ? String(prefill.baseSalary) : "",
  );
  const [expenses, setExpenses] = useState<ExpenseDraft[]>(() =>
    (prefill.expenses ?? []).map((e, i) => ({
      key: i + 1,
      existingId: e.id,
      existingReceiptName: e.receiptName,
      label: e.label,
      amount: String(e.amount),
      file: null,
    })),
  );
  const nextKey = useRef((prefill.expenses?.length ?? 0) + 1);
  const [method, setMethod] = useState<PayrollMethod>(prefill.method);
  const [wiseEmail, setWiseEmail] = useState(prefill.details.wiseEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const baseValue = /^\d+$/.test(base.trim()) ? Number(base.trim()) : null;
  const expensesTotal = expenses.reduce((s, e) => {
    const n = Number(e.amount);
    return s + (Number.isInteger(n) && n > 0 ? n : 0);
  }, 0);
  const net = computeNet({
    baseSalary: baseValue ?? 0,
    bonusesTotal: snapshot.bonusesTotal,
    finesTotal: snapshot.finesTotal,
    expensesTotal,
  });

  function patchExpense(key: number, patch: Partial<ExpenseDraft>) {
    setExpenses((prev) =>
      prev.map((e) => (e.key === key ? { ...e, ...patch } : e)),
    );
  }

  function pickReceipt(key: number, file: File | null) {
    if (file) {
      if (file.size > MAX_RECEIPT_BYTES) {
        setError("That receipt is over 4MB — attach a smaller file.");
        return;
      }
      if (!RECEIPT_MIME_TYPES.includes(file.type)) {
        setError("Receipts must be an image or a PDF.");
        return;
      }
    }
    setError(null);
    patchExpense(key, { file });
  }

  function submit() {
    if (baseValue == null) {
      setError("Enter your base salary in whole dollars.");
      return;
    }
    for (const e of expenses) {
      const n = Number(e.amount);
      if (!e.label.trim()) {
        setError("Every expense needs a label.");
        return;
      }
      if (!Number.isInteger(n) || n <= 0) {
        setError(`Expense “${e.label.trim()}” needs a whole-dollar amount.`);
        return;
      }
    }
    if (method === "WISE" && !/^\S+@\S+\.\S+$/.test(wiseEmail.trim())) {
      setError("Enter a valid Wise account email.");
      return;
    }
    if (net < 0) {
      setError("The total can't go below zero — your fines exceed the rest.");
      return;
    }

    setError(null);
    const fd = new FormData();
    fd.set("baseSalary", String(baseValue));
    fd.set("paymentMethod", method);
    if (method === "WISE") fd.set("wiseEmail", wiseEmail);
    fd.set(
      "expenses",
      JSON.stringify(
        expenses.map((e) => ({
          ...(e.existingId ? { id: e.existingId } : {}),
          label: e.label.trim(),
          amount: Number(e.amount),
        })),
      ),
    );
    expenses.forEach((e, i) => {
      if (e.file) fd.set(`receipt_${i}`, e.file);
    });

    startTransition(async () => {
      try {
        const res = await submitPayroll(fd);
        if (!res.ok) setError(res.error);
        // On success the revalidated page swaps this form for the status view.
      } catch {
        setError("Couldn't submit — please try again.");
      }
    });
  }

  const mathRows: { label: string; value: string; tone?: string }[] = [
    { label: "Base salary", value: formatMoney(baseValue ?? 0) },
    {
      label: "Bonuses",
      value: `+ ${formatMoney(snapshot.bonusesTotal)}`,
      tone: "text-green-700",
    },
    {
      label: "Fines",
      value: `− ${formatMoney(snapshot.finesTotal)}`,
      tone: "text-red-600",
    },
    { label: "Expenses", value: `+ ${formatMoney(expensesTotal)}` },
  ];

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      {resubmit && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50/60 p-3">
          <p className="text-sm font-semibold text-red-700">
            Declined — fix it and resend
          </p>
          {resubmit.note && (
            <p className="mt-1 text-xs text-ink">“{resubmit.note}”</p>
          )}
          <div className="mt-1.5">
            <ResubmitCountdown
              deadlineIso={resubmit.deadlineIso}
              deadlineLabel={resubmit.deadlineLabel}
            />
          </div>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">
          {resubmit ? `Refile for ${periodLabel}` : `File for ${periodLabel}`}
        </h2>
        {!resubmit && (
          <span className="shrink-0 text-[11px] text-muted-fg">
            Filing closes {closesLabel}
          </span>
        )}
      </div>

      {/* Base salary */}
      <div className="mt-4">
        <label
          htmlFor="payroll-base"
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-fg"
        >
          Base salary (USD)
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-sm font-semibold text-muted-fg">$</span>
          <input
            id="payroll-base"
            type="text"
            inputMode="numeric"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="500"
            className="w-32 rounded-lg border border-line px-3 py-2 text-sm tabular-nums text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      {/* Ledger snapshot preview */}
      <div className="mt-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
          From the ledger — snapshotted the moment you submit
        </p>
        <LedgerBreakdown {...snapshot} />
      </div>

      {/* Expenses */}
      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
          Miscellaneous expenses
        </p>
        {expenses.length > 0 && (
          <ul className="mt-2 flex flex-col gap-2">
            {expenses.map((e, i) => (
              <li key={e.key} className="rise-in flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={e.label}
                  onChange={(ev) => patchExpense(e.key, { label: ev.target.value })}
                  placeholder={`Expense ${i + 1} — e.g. taxi to a partner meeting`}
                  aria-label={`Expense ${i + 1} description`}
                  maxLength={120}
                  className="min-w-40 flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
                />
                <div className="flex items-center gap-1 rounded-lg border border-line px-3 py-2">
                  <span className="text-sm text-muted-fg">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={e.amount}
                    onChange={(ev) => patchExpense(e.key, { amount: ev.target.value })}
                    placeholder="0"
                    aria-label={`Expense ${i + 1} amount in dollars`}
                    className="w-14 bg-transparent text-sm tabular-nums text-ink placeholder:text-muted-fg focus:outline-none"
                  />
                </div>
                <label className="cursor-pointer rounded-lg border border-line px-3 py-2 text-xs font-medium text-brand transition hover:bg-canvas">
                  {e.file ? (
                    <span className="max-w-32 truncate align-middle">
                      {e.file.name}
                    </span>
                  ) : e.existingReceiptName ? (
                    <span className="max-w-32 truncate align-middle">
                      {e.existingReceiptName}
                    </span>
                  ) : (
                    "Receipt (optional)"
                  )}
                  <input
                    type="file"
                    accept={RECEIPT_MIME_TYPES.join(",")}
                    className="sr-only"
                    onChange={(ev) => pickReceipt(e.key, ev.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setExpenses((prev) => prev.filter((x) => x.key !== e.key))
                  }
                  aria-label={`Remove expense ${i + 1}`}
                  className="rounded-lg p-2 text-red-500 transition hover:bg-canvas"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {expenses.length < MAX_PAYROLL_EXPENSES && (
          <button
            type="button"
            onClick={() =>
              setExpenses((prev) => [
                ...prev,
                {
                  key: nextKey.current++,
                  existingId: null,
                  existingReceiptName: null,
                  label: "",
                  amount: "",
                  file: null,
                },
              ])
            }
            className="mt-2 rounded-lg border border-dashed border-line px-3 py-2 text-xs font-semibold text-brand transition hover:border-brand/40 hover:bg-canvas"
          >
            + Add an expense
          </button>
        )}
      </div>

      {/* Payment method */}
      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
          Payment method
        </p>
        <div role="radiogroup" className="mt-2 flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={`whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
                method === m
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line text-ink hover:border-brand/40"
              }`}
            >
              {PAYROLL_METHOD_LABEL[m]}
            </button>
          ))}
        </div>
        {/* No card fields. Card details are arranged directly with finance
            over Telegram, so the app has no reason to hold a card number —
            and every reason not to, given the invoice is emailed. */}
        {method === "UZCARD" && (
          <p className="rise-in mt-2 text-xs text-muted-fg">
            Finance will arrange the card details with you directly — nothing to
            enter here.
          </p>
        )}
        {method === "WISE" && (
          <div className="rise-in mt-2">
            <input
              type="email"
              value={wiseEmail}
              onChange={(e) => setWiseEmail(e.target.value)}
              placeholder="Wise account email"
              aria-label="Wise account email"
              maxLength={200}
              className="w-72 max-w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
            />
          </div>
        )}
        {method === "CASH" && (
          <p className="mt-2 text-xs text-muted-fg">
            Nothing else needed — you&rsquo;ll be paid in cash.
          </p>
        )}
      </div>

      {/* The arithmetic, then the one button */}
      <div className="mt-5 rounded-lg border border-line bg-canvas/60 p-3">
        <dl className="flex flex-col gap-1">
          {mathRows.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-sm">
              <dt className="text-muted-fg">{r.label}</dt>
              <dd className={`font-medium tabular-nums ${r.tone ?? "text-ink"}`}>
                {r.value}
              </dd>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
            <dt className="text-sm font-semibold text-ink">You&rsquo;ll receive</dt>
            <dd
              className={`text-base font-bold tabular-nums ${net < 0 ? "text-red-600" : "text-ink"}`}
            >
              {formatMoney(net)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending
            ? "Submitting…"
            : resubmit
              ? "Resubmit pay request"
              : "Submit pay request"}
        </button>
        <p className="text-xs text-muted-fg">
          Generates your invoice PDF and sends it to the admins for review.
        </p>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

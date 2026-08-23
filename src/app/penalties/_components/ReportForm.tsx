"use client";

import { useRef, useState, useTransition } from "react";
import { reportColleagues } from "../actions";
import { useDismissible } from "@/lib/useDismissible";

export type Colleague = {
  id: string;
  name: string;
  emoji: string;
  bg: string;
};

/**
 * The "report a colleague" form at the top of the penalties page: a reason
 * field plus a multi-select dropdown of colleagues. Submitting delivers the
 * report to the admins (shakhzod@ / tech@) via the notification system.
 */
export function ReportForm({ colleagues }: { colleagues: Colleague[] }) {
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useDismissible(open, () => setOpen(false), ref);

  function toggle(id: string) {
    setSent(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const chosen = colleagues.filter((c) => selected.has(c.id));
  const canSubmit = reason.trim().length > 0 && selected.size > 0 && !isPending;

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await reportColleagues(reason, [...selected]);
        setReason("");
        setSelected(new Set());
        setSent(true);
      } catch {
        setError("Couldn't send the report — try again.");
      }
    });
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Report a colleague</h2>
      <p className="mt-0.5 text-xs text-muted-fg">
        Goes straight to Shakhzod and the tech team. Say what happened and pick
        who it&rsquo;s about — e.g. no response within 2 business days.
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-2">
        <input
          type="text"
          value={reason}
          onChange={(e) => {
            setSent(false);
            setReason(e.target.value);
          }}
          placeholder="Reason — e.g. no reply to my message since Monday"
          maxLength={500}
          className="min-w-52 flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
        />

        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={open}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:border-brand/40"
          >
            {chosen.length === 0 ? (
              <span className="text-muted-fg">Select colleagues…</span>
            ) : (
              <span className="flex items-center gap-1">
                <span className="flex -space-x-1.5">
                  {chosen.slice(0, 4).map((c) => (
                    <span
                      key={c.id}
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ring-1 ring-surface ${c.bg}`}
                      aria-hidden="true"
                    >
                      {c.emoji}
                    </span>
                  ))}
                </span>
                {chosen.length === 1
                  ? chosen[0].name
                  : `${chosen.length} colleagues`}
              </span>
            )}
            <span
              className={`text-muted-fg transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              ▾
            </span>
          </button>

          {/* Real checkboxes rather than a hand-rolled listbox. The roles that
              used to be here (listbox/option, on <button>s) promised arrow-key
              navigation, active-descendant tracking and Home/End that none of
              this implemented — and an option isn't allowed to be a button in
              the first place. A checkbox group is what this control actually
              is, and the browser handles the keyboard for free. */}
          {open && (
            <ul
              role="group"
              aria-label="Colleagues to report"
              className="pop-in absolute right-0 z-10 mt-2 max-h-72 w-64 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg"
            >
              {colleagues.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-fg">
                  No other colleagues yet.
                </li>
              )}
              {colleagues.map((c) => (
                <li key={c.id}>
                  <label className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-ink transition hover:bg-canvas">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4 shrink-0 rounded border-line accent-brand focus:ring-brand"
                    />
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm ${c.bg}`}
                      aria-hidden="true"
                    >
                      {c.emoji}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Sending…" : "Send report"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {sent && (
        <p className="mt-2 text-xs font-medium text-green-700">
          Report sent to the admins.
        </p>
      )}
    </section>
  );
}

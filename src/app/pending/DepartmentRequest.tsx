"use client";

import { useState, useTransition } from "react";
import { chooseSignupDepartment } from "./actions";

export type RequestedDepartment = { id: string; name: string } | null;

/**
 * The one question a waiting sign-up is asked: which department are you
 * joining? It is asked here, before approval, because the answer is what
 * routes the request — their lead is paged instead of every lead in the
 * company, and the reviewer can see whose new joiner this is.
 *
 * Answered, it collapses to a line of confirmation with a way back: a new
 * joiner who guesses wrong would otherwise sit in the wrong department's
 * queue with no way to say so.
 */
export function DepartmentRequest({
  departments,
  requested,
}: {
  departments: { id: string; name: string }[];
  requested: RequestedDepartment;
}) {
  const [picking, setPicking] = useState(requested === null);
  const [selected, setSelected] = useState<string | null>(requested?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await chooseSignupDepartment(selected);
        if (!res.ok) setError(res.error);
        else setPicking(false);
      } catch {
        setError("Couldn't save that — try again.");
      }
    });
  }

  if (departments.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No departments exist yet, so there&rsquo;s nothing to pick — an admin
        has been told you&rsquo;re waiting.
      </p>
    );
  }

  if (!picking && requested) {
    return (
      <div className="mt-4 rounded-lg border border-line bg-canvas px-3 py-2.5">
        <p className="text-xs text-muted-fg">
          {`Joining ${requested.name} — its lead and the tech team have been notified.`}
        </p>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="mt-1 text-xs font-semibold text-brand transition hover:underline"
        >
          Not right? Pick another
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 text-left">
      <span className="text-sm font-semibold text-ink">
        Which department are you joining?
      </span>
      <span className="mt-0.5 block text-xs text-muted-fg">
        Its lead is who approves you — picking tells them you&rsquo;re here.
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {departments.map((d) => {
          const on = selected === d.id;
          return (
            <label
              key={d.id}
              className={`cursor-pointer whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition focus-within:border-brand ${
                on
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line bg-surface text-muted-fg hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="departmentId"
                value={d.id}
                checked={on}
                onChange={() => setSelected(d.id)}
                className="sr-only"
              />
              {d.name}
            </label>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={isPending || !selected}
          onClick={save}
          className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Sending…" : requested ? "Save" : "Tell them I'm here"}
        </button>
        {requested && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setError(null);
              setSelected(requested.id);
              setPicking(false);
            }}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

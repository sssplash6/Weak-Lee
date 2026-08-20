"use client";

import { useActionState, useState } from "react";
import { completeProfile, type OnboardingState } from "./actions";

const initial: OnboardingState = { error: null };

type Defaults = {
  name: string;
  workPhone: string;
  telegramUsername: string;
  departmentIds: string[];
  birthday: string;
};

export function OnboardingForm({
  departments,
  defaults,
}: {
  departments: { id: string; name: string }[];
  defaults: Defaults;
}) {
  const [state, action, isPending] = useActionState(completeProfile, initial);
  const [selected, setSelected] = useState<string[]>(defaults.departmentIds);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <Field
        label="Full name"
        name="name"
        defaultValue={defaults.name}
        placeholder="Jane Doe"
        autoComplete="name"
      />
      <Field
        label="Work phone number"
        name="workPhone"
        defaultValue={defaults.workPhone}
        placeholder="+998 90 123 45 67"
        type="tel"
        autoComplete="tel"
      />
      <Field
        label="Telegram username"
        name="telegramUsername"
        defaultValue={defaults.telegramUsername}
        placeholder="@gapyearingdoesntsuck"
        prefixHint="We'll store it without the @."
      />

      {/* Departments are a fixed list managed by admins — new joiners pick the
          ones they're joining rather than typing free text. Multi-seat people
          (member of one, working in another) select every department here. */}
      <div>
        <span className="text-sm font-semibold text-ink">Departments</span>
        {departments.length > 0 ? (
          <>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {departments.map((d) => {
                const on = selected.includes(d.id);
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
                      type="checkbox"
                      name="departmentIds"
                      value={d.id}
                      checked={on}
                      onChange={() => toggle(d.id)}
                      className="sr-only"
                    />
                    {d.name}
                  </label>
                );
              })}
            </div>
            <span className="mt-1 block text-xs text-muted-fg">
              Pick every department you&rsquo;ll work in — at least one.
            </span>
          </>
        ) : (
          <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No departments exist yet — ask an admin to create yours on the
            Departments page, then come back here.
          </p>
        )}
      </div>

      <Field
        label="Birthday"
        name="birthday"
        defaultValue={defaults.birthday}
        type="date"
      />

      {state.error && (
        <p className="rise-in rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || departments.length === 0 || selected.length === 0}
        className="mt-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Continue to dashboard"}
      </button>
    </form>
  );
}

function Field({
  label,
  prefixHint,
  ...props
}: {
  label: string;
  prefixHint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <input
        {...props}
        required
        className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
      />
      {prefixHint && (
        <span className="mt-1 block text-xs text-muted-fg">{prefixHint}</span>
      )}
    </label>
  );
}

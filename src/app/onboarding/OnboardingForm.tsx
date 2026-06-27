"use client";

import { useActionState } from "react";
import { completeProfile, type OnboardingState } from "./actions";

const initial: OnboardingState = { error: null };

type Defaults = {
  name: string;
  workPhone: string;
  telegramUsername: string;
  department: string;
};

export function OnboardingForm({ defaults }: { defaults: Defaults }) {
  const [state, action, isPending] = useActionState(completeProfile, initial);

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
      <Field
        label="Department"
        name="department"
        defaultValue={defaults.department}
        placeholder="Tech"
      />

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
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

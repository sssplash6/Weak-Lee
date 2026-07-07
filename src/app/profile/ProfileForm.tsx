"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "./actions";

const initial: ProfileState = { error: null, saved: false };

type Defaults = {
  name: string;
  email: string;
  workPhone: string;
  telegramUsername: string;
  department: string;
  birthday: string;
  linkedin: string;
  instagram: string;
};

export function ProfileForm({ defaults }: { defaults: Defaults }) {
  const [state, action, isPending] = useActionState(updateProfile, initial);

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <Field
        label="Full name"
        name="name"
        defaultValue={defaults.name}
        placeholder="Jane Doe"
        autoComplete="name"
        required
      />

      <label className="block">
        <span className="text-sm font-semibold text-ink">Email</span>
        <input
          value={defaults.email}
          readOnly
          disabled
          className="mt-1.5 w-full cursor-not-allowed rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-muted-fg"
        />
        <span className="mt-1 block text-xs text-muted-fg">
          Linked to your Google sign-in — can’t be changed here.
        </span>
      </label>

      <Field
        label="Work phone number"
        name="workPhone"
        defaultValue={defaults.workPhone}
        placeholder="+998 90 123 45 67"
        type="tel"
        autoComplete="tel"
        required
      />
      <Field
        label="Telegram username"
        name="telegramUsername"
        defaultValue={defaults.telegramUsername}
        placeholder="@gapyearingdoesntsuck"
        hint="We’ll store it without the @."
        required
      />
      <Field
        label="Department"
        name="department"
        defaultValue={defaults.department}
        placeholder="Tech"
        required
      />
      <Field
        label="Birthday"
        name="birthday"
        defaultValue={defaults.birthday}
        type="date"
        required
      />
      <Field
        label="LinkedIn"
        name="linkedin"
        defaultValue={defaults.linkedin}
        placeholder="linkedin.com/in/janedoe"
        hint="Optional."
      />
      <Field
        label="Instagram"
        name="instagram"
        defaultValue={defaults.instagram}
        placeholder="@janedoe"
        hint="Optional. We’ll store it without the @."
      />

      {state.error && (
        <p className="rise-in rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p className="rise-in rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  ...props
}: {
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <input
        {...props}
        className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
      />
      {hint && (
        <span className="mt-1 block text-xs text-muted-fg">{hint}</span>
      )}
    </label>
  );
}

"use client";

import { useActionState, useState } from "react";
import { resolveAvatar } from "@/lib/avatar";
import { AnimalGrid } from "@/app/_components/AnimalGrid";
import { completeProfile, type OnboardingState } from "./actions";

const initial: OnboardingState = { error: null };

type Defaults = {
  name: string;
  workPhone: string;
  telegramUsername: string;
  departmentIds: string[];
  birthday: string;
  /** A free animal picked for them up front — changeable right here. */
  avatar: string | null;
};

export function OnboardingForm({
  departments,
  defaults,
  takenByOthers: takenList,
}: {
  departments: { id: string; name: string }[];
  defaults: Defaults;
  /** Animals worn by teammates — excludes this person's own. */
  takenByOthers: string[];
}) {
  const [state, action, isPending] = useActionState(completeProfile, initial);
  const [selected, setSelected] = useState<string[]>(defaults.departmentIds);
  const [animal, setAnimal] = useState<string | null>(defaults.avatar);
  // Held in state, not left to the DOM: an action that comes back with an
  // error (a nudge about a missing field, or an animal claimed a moment
  // earlier) re-renders this form from the server's saved values, which would
  // otherwise wipe what someone had just typed.
  const [text, setText] = useState({
    name: defaults.name,
    workPhone: defaults.workPhone,
    telegramUsername: defaults.telegramUsername,
    birthday: defaults.birthday,
  });
  const field = (key: keyof typeof text) => ({
    value: text[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setText((t) => ({ ...t, [key]: e.target.value })),
  });

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const takenByOthers = new Set(takenList.filter((e) => e !== animal));
  const shown = animal ? resolveAvatar(animal, null) : null;

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <Field
        label="Full name"
        name="name"
        {...field("name")}
        placeholder="Jane Doe"
        autoComplete="name"
      />
      <Field
        label="Work phone number"
        name="workPhone"
        {...field("workPhone")}
        placeholder="+998 90 123 45 67"
        type="tel"
        autoComplete="tel"
      />
      <Field
        label="Telegram username"
        name="telegramUsername"
        {...field("telegramUsername")}
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

      <Field label="Birthday" name="birthday" {...field("birthday")} type="date" />

      {/* Your animal is your face everywhere in the app, so it's chosen here
          rather than assigned behind your back. One is pre-picked from the
          free ones so this never blocks finishing sign-up. */}
      <div>
        <div className="flex items-center gap-2">
          {shown && (
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-lg ${shown.bg}`}
              aria-hidden="true"
            >
              {shown.emoji}
            </span>
          )}
          <span className="text-sm font-semibold text-ink">Your animal</span>
        </div>
        {/* A pick is always supplied unless every animal is worn already. */}
        {animal !== null ? (
          <>
            <div className="mt-1.5">
              <AnimalGrid
                value={animal}
                takenByOthers={takenByOthers}
                onPick={setAnimal}
                disabled={isPending}
                compact
              />
            </div>
            <span className="mt-1 block text-xs text-muted-fg">
              This is you across the app — greyed-out ones are taken.
            </span>
          </>
        ) : (
          <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Every animal is taken right now — you&rsquo;ll get one as soon as
            the roster grows. Carry on.
          </p>
        )}
        <input type="hidden" name="avatar" value={animal ?? ""} />
      </div>

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

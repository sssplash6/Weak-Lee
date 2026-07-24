"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { AVATARS, resolveAvatar } from "@/lib/avatar";
import { setAvatar } from "../actions";
import { useDismissible } from "@/lib/useDismissible";
import { ThemeToggle } from "@/app/_components/ThemeToggle";

type Props = {
  name?: string | null;
  email?: string | null;
  avatar?: string | null;
  takenAvatars?: string[];
  isAdmin?: boolean;
};

export function ProfileMenu({
  name,
  email,
  avatar: assigned,
  takenAvatars = [],
  isAdmin,
}: Props) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(assigned ?? null);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useDismissible(open, () => setOpen(false), ref);

  const avatar = resolveAvatar(current, email ?? name);

  // Animals taken by other users (so the current pick stays selectable).
  const takenByOthers = new Set(
    takenAvatars.filter((e) => e !== current),
  );

  function choose(emoji: string) {
    if (emoji === current || takenByOthers.has(emoji)) return;
    const prev = current;
    setError(false);
    setCurrent(emoji); // optimistic
    startTransition(async () => {
      const res = await setAvatar(emoji);
      if (!res.ok) {
        setCurrent(prev);
        setError(true);
      }
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-line text-lg transition hover:ring-2 hover:ring-brand-soft ${avatar.bg}`}
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span aria-hidden="true">{avatar.emoji}</span>
      </button>

      {open && (
        <div className="pop-in absolute right-0 z-10 mt-2 w-64 rounded-xl border border-line bg-surface p-1 shadow-lg">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-ink">
              {name ?? "Student"}
            </p>
            {email && (
              <p className="truncate text-xs text-muted-fg">{email}</p>
            )}
          </div>

          <div className="my-1 border-t border-line" />

          {/* Avatar picker */}
          <div className="px-3 py-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
              Your animal
            </p>
            <div className="grid grid-cols-6 gap-1">
              {AVATARS.map((a) => {
                const isCurrent = a.emoji === current;
                const taken = takenByOthers.has(a.emoji);
                return (
                  <button
                    key={a.emoji}
                    type="button"
                    disabled={taken || isPending}
                    onClick={() => choose(a.emoji)}
                    title={taken ? "Taken" : undefined}
                    aria-label={isCurrent ? "Current avatar" : "Choose avatar"}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-base transition ${
                      a.bg
                    } ${
                      isCurrent
                        ? "ring-2 ring-brand"
                        : taken
                          ? "cursor-not-allowed opacity-30"
                          : "hover:ring-2 hover:ring-brand-soft"
                    }`}
                  >
                    <span aria-hidden="true">{a.emoji}</span>
                  </button>
                );
              })}
            </div>
            {error && (
              <p className="mt-2 text-xs text-red-600">
                That one was just taken — pick another.
              </p>
            )}
          </div>

          <div className="my-1 border-t border-line" />

          {/* Appearance */}
          <div className="px-3 py-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
              Appearance
            </p>
            <ThemeToggle />
          </div>

          <div className="my-1 border-t border-line" />

          <Link
            href="/profile"

            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-canvas"
          >
            Edit profile
          </Link>
          <Link
            href="/team"

            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-canvas"
          >
            The Team
          </Link>
          <Link
            href="/penalties"

            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-canvas"
          >
            Penalties
          </Link>

          <div className="my-1 border-t border-line" />

          {isAdmin && (
            <Link
              href="/admin"

              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-left text-sm font-medium text-brand transition hover:bg-canvas"
            >
              Admin panel
            </Link>
          )}
          <button
            type="button"

            onClick={() => signOut({ redirectTo: "/signin" })}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-canvas"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

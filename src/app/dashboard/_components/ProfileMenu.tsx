"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { presetAvatar } from "@/lib/avatar";

type Props = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  isAdmin?: boolean;
};

export function ProfileMenu({ name, email, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const avatar = presetAvatar(email ?? name);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-line text-lg transition hover:ring-2 hover:ring-brand-soft ${avatar.bg}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span aria-hidden="true">{avatar.emoji}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 w-56 rounded-xl border border-line bg-surface p-1 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-ink">
              {name ?? "Student"}
            </p>
            {email && (
              <p className="truncate text-xs text-muted-fg">{email}</p>
            )}
          </div>
          <div className="my-1 border-t border-line" />
          {isAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-left text-sm font-medium text-brand transition hover:bg-canvas"
            >
              Admin panel
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
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

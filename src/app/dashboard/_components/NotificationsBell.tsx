"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  NOTIFICATION_DOT,
  type NotificationType,
} from "@/lib/notificationTypes";

export type UpdateView = {
  id: string;
  type: NotificationType;
  message: string;
  dateLabel: string;
};

/**
 * The header bell: badge shows how many notifications arrived in the last 48
 * hours; clicking opens a dropdown with those updates and an "Expand" action
 * that leads to the full /notifications page.
 */
export function NotificationsBell({ updates }: { updates: UpdateView[] }) {
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          updates.length > 0
            ? `Updates (${updates.length} in the last 48 hours)`
            : "Updates"
        }
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-muted-fg transition hover:text-ink hover:ring-2 hover:ring-brand-soft"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {updates.length > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
            aria-hidden="true"
          >
            {updates.length > 9 ? "9+" : updates.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="pop-in absolute right-0 z-10 mt-2 w-80 rounded-xl border border-line bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">
            <p className="text-sm font-semibold text-ink">Updates</p>
            <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted-fg">
              last 48 hours
            </span>
          </div>

          {updates.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-fg">
              Nothing new in the last 48 hours.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto px-4 py-2">
              {updates.map((u) => (
                <li key={u.id} className="flex items-baseline gap-2 py-1 text-xs">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 translate-y-px rounded-full ${NOTIFICATION_DOT[u.type]}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 break-words text-ink">
                    {u.message}
                    <span className="text-muted-fg"> · {u.dateLabel}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-line p-1">
            <Link
              href="/notifications"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-center text-sm font-semibold text-brand transition hover:bg-canvas"
            >
              Expand
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  NOTIFICATION_DOT,
  type NotificationType,
} from "@/lib/notificationTypes";
import { markAllNotificationsRead } from "@/app/notifications/actions";
import { useDismissible } from "@/lib/useDismissible";

export type UpdateView = {
  id: string;
  type: NotificationType;
  message: string;
  dateLabel: string;
  unread: boolean;
};

/**
 * The header bell: badge shows how many notifications are unread; clicking
 * opens a dropdown with the last 48 hours of updates, a "Mark all as read"
 * action, and an "Expand" action that leads to the full /notifications page.
 * Unread items older than 48 hours get their own section — the badge counts
 * them, so they must be findable here.
 */
export function NotificationsBell({
  updates,
  olderUnread = [],
  unreadCount,
}: {
  updates: UpdateView[];
  olderUnread?: UpdateView[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [marking, startMarking] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useDismissible(open, () => setOpen(false), ref);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={
          unreadCount > 0 ? `Updates (${unreadCount} unread)` : "Updates"
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
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
            aria-hidden="true"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="pop-in absolute right-0 z-10 mt-2 w-80 rounded-xl border border-line bg-surface shadow-lg">
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
                <UpdateRow key={u.id} update={u} />
              ))}
            </ul>
          )}

          {olderUnread.length > 0 && (
            <div className="border-t border-line px-4 py-2">
              <p className="py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
                Earlier unread
              </p>
              <ul>
                {olderUnread.map((u) => (
                  <UpdateRow key={u.id} update={u} />
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-stretch gap-1 border-t border-line p-1">
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={marking}
                onClick={() => startMarking(() => markAllNotificationsRead())}
                className="flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold text-muted-fg transition hover:bg-canvas hover:text-ink disabled:opacity-50"
              >
                {marking ? "Marking…" : "Mark all as read"}
              </button>
            )}
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold text-brand transition hover:bg-canvas"
            >
              Expand
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** One notification line: type dot, message (bold while unread), timestamp. */
function UpdateRow({ update: u }: { update: UpdateView }) {
  return (
    <li className="flex items-baseline gap-2 py-1 text-xs">
      <span
        className={`h-1.5 w-1.5 shrink-0 translate-y-px rounded-full ${NOTIFICATION_DOT[u.type]}`}
        aria-hidden="true"
      />
      <span
        className={`min-w-0 flex-1 break-words text-ink ${
          u.unread ? "font-semibold" : ""
        }`}
      >
        {u.message}
        <span className="font-normal text-muted-fg">
          {` · ${u.dateLabel}`}
        </span>
      </span>
    </li>
  );
}

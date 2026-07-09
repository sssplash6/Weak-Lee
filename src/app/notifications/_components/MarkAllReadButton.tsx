"use client";

import { useTransition } from "react";
import { markAllNotificationsRead } from "@/app/notifications/actions";

/** "Mark all as read" for the notifications page — clears the bell badge. */
export function MarkAllReadButton() {
  const [marking, startMarking] = useTransition();

  return (
    <button
      type="button"
      disabled={marking}
      onClick={() => startMarking(() => markAllNotificationsRead())}
      className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand-soft disabled:opacity-50"
    >
      {marking ? "Marking…" : "Mark all as read"}
    </button>
  );
}

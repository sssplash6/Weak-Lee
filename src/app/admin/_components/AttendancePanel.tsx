"use client";

import { useTransition } from "react";
import {
  ATTENDANCE_LABEL,
  formatMoney,
  type AttendanceStatus,
} from "@/lib/penalties";
import { setAttendance } from "../actions";

export type RosterEntry = {
  id: string;
  name: string;
  emoji: string;
  bg: string;
  status: AttendanceStatus | null;
  fine: number | null;
};

const STATUSES: AttendanceStatus[] = ["ATTENDED", "SKIPPED", "EXCUSED"];

export function AttendancePanel({
  meetingLabel,
  roster,
}: {
  meetingLabel: string;
  roster: RosterEntry[];
}) {
  if (roster.length === 0) {
    return <p className="px-1 text-sm text-muted-fg">No people yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {roster.map((r) => (
        <RosterRow key={r.id} entry={r} meetingLabel={meetingLabel} />
      ))}
    </ul>
  );
}

function RosterRow({
  entry: r,
}: {
  entry: RosterEntry;
  meetingLabel: string;
}) {
  const [isPending, startTransition] = useTransition();

  function mark(status: AttendanceStatus) {
    if (status === r.status) return;
    startTransition(async () => {
      await setAttendance(r.id, status);
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${r.bg}`}
        aria-hidden="true"
      >
        {r.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{r.name}</p>
        {r.status === "SKIPPED" && r.fine != null && (
          <p className="text-xs font-medium text-red-600">
            Fined {formatMoney(r.fine)}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1" role="group">
        {STATUSES.map((s) => {
          const active = r.status === s;
          return (
            <button
              key={s}
              type="button"
              disabled={isPending}
              onClick={() => mark(s)}
              aria-pressed={active}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                active
                  ? s === "SKIPPED"
                    ? "bg-red-500 text-white"
                    : s === "EXCUSED"
                      ? "bg-amber-500 text-white"
                      : "bg-brand text-white"
                  : "border border-line text-muted-fg hover:bg-canvas hover:text-ink"
              }`}
            >
              {ATTENDANCE_LABEL[s]}
            </button>
          );
        })}
      </div>
    </li>
  );
}

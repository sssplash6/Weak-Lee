"use client";

import { useState, useTransition } from "react";
import { setReportStatus } from "../actions";
import type { ColleagueReportStatus } from "@/generated/prisma/enums";

export type ReportPerson = {
  id: string;
  name: string;
  emoji: string;
  bg: string;
};

export type ReportView = {
  id: string;
  reason: string;
  dateLabel: string;
  status: ColleagueReportStatus;
  reporter: ReportPerson;
  subjects: ReportPerson[];
  /** "Valera · Mon, Aug 31, 09:12 AM" once closed, else null. */
  closedLabel: string | null;
  resolution: string | null;
};

const STATUS_PILL: Record<ColleagueReportStatus, string> = {
  OPEN: "bg-orange-50 text-orange-700",
  ACTIONED: "bg-green-50 text-green-700",
  DISMISSED: "bg-canvas text-muted-fg",
};

const STATUS_LABEL: Record<ColleagueReportStatus, string> = {
  OPEN: "Open",
  ACTIONED: "Actioned",
  DISMISSED: "Dismissed",
};

/**
 * The report list. Admins get the close controls; everyone else reads.
 * One card per report — who filed it, who it names, what it says, and what
 * happened to it.
 */
export function ReportList({
  reports,
  canManage,
}: {
  reports: ReportView[];
  canManage: boolean;
}) {
  if (reports.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted-fg">
        {canManage
          ? "Nothing here. Reports filed from the penalties page land in this list."
          : "You haven’t reported anyone. The form is on the penalties page."}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {reports.map((r) => (
        <ReportCard key={r.id} report={r} canManage={canManage} />
      ))}
    </ul>
  );
}

function Chip({ person }: { person: ReportPerson }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2 text-xs font-medium text-ink">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${person.bg}`}
        aria-hidden="true"
      >
        {person.emoji}
      </span>
      {person.name}
    </span>
  );
}

function ReportCard({
  report: r,
  canManage,
}: {
  report: ReportView;
  canManage: boolean;
}) {
  // The close note is optional, so the controls stay one click until someone
  // wants to say something: picking an outcome opens the note, not a dialog.
  const [closing, setClosing] = useState<ColleagueReportStatus | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function apply(status: ColleagueReportStatus, resolution?: string) {
    setError(null);
    startTransition(async () => {
      try {
        await setReportStatus(r.id, status, resolution);
        setClosing(null);
        setNote("");
      } catch {
        setError("Couldn’t update this report — try again.");
      }
    });
  }

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Chip person={r.reporter} />
          <span className="text-xs text-muted-fg">reported</span>
          {r.subjects.map((s) => (
            <Chip key={s.id} person={s} />
          ))}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_PILL[r.status]}`}
        >
          {STATUS_LABEL[r.status]}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">
        {r.reason}
      </p>
      <p className="mt-1 text-[11px] text-muted-fg">{r.dateLabel}</p>

      {r.closedLabel && (
        <p className="mt-2 border-t border-line pt-2 text-xs text-muted-fg">
          {`${STATUS_LABEL[r.status]} by ${r.closedLabel}`}
          {r.resolution && (
            <span className="mt-0.5 block break-words italic text-ink">
              “{r.resolution}”
            </span>
          )}
        </p>
      )}

      {canManage && (
        <div className="mt-3 border-t border-line pt-3">
          {closing ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  closing === "ACTIONED"
                    ? "What you did (optional) — e.g. $10 fine issued"
                    : "Why not (optional) — e.g. already resolved between them"
                }
                maxLength={500}
                autoFocus
                className="min-w-52 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                disabled={isPending}
                onClick={() => apply(closing, note)}
                className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
              >
                {isPending ? "Saving…" : `Mark ${STATUS_LABEL[closing].toLowerCase()}`}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setClosing(null)}
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-fg transition hover:bg-line"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {r.status !== "ACTIONED" && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setClosing("ACTIONED")}
                  className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted-fg transition hover:bg-canvas hover:text-ink disabled:opacity-50"
                >
                  Mark actioned
                </button>
              )}
              {r.status !== "DISMISSED" && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setClosing("DISMISSED")}
                  className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted-fg transition hover:bg-canvas hover:text-ink disabled:opacity-50"
                >
                  Dismiss
                </button>
              )}
              {r.status !== "OPEN" && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => apply("OPEN")}
                  className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted-fg transition hover:bg-canvas hover:text-ink disabled:opacity-50"
                >
                  Reopen
                </button>
              )}
              {/* The fine itself is issued where every other fine is — this
                  page records the decision, it doesn't duplicate the ledger. */}
              <a
                href="/admin"
                className="ml-auto text-xs font-medium text-brand hover:underline"
              >
                Issue a fine on /admin ↗
              </a>
            </div>
          )}
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </li>
  );
}

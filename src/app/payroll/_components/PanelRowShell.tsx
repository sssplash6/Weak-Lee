"use client";

import { useState, type ReactNode } from "react";
import { PanelFlags, type PanelFlag } from "./PanelFlags";

/**
 * Everything a panel row says about a request. Both badges are optional
 * because not every row carries both: on /payroll/panel a row shows its status
 * AND its payment source, but the shape stays permissive so a caller can drop
 * either without a second summary type.
 */
export type PanelRowSummary = {
  name: string;
  deptLine: string | null;
  emoji: string;
  bg: string;
  /** The one line under the name — filed / approved / paid, plus the month. */
  metaLine: string | null;
  netLabel: string;
  /** Attention marks (waited too long, unusually large) — computed server-side. */
  flags: PanelFlag[];
  /** "Awaiting review" etc., with the palette class from PAYROLL_STATUS_BADGE. */
  statusLabel?: string;
  statusBadge?: string;
  /** The payment source, so a run of rows reads as a payout list. */
  sourceLabel?: string;
};

/**
 * One request in the reviewer panel: the header line, and the full detail that
 * expands under it.
 *
 * This is the whole row for a viewer who holds no role over it — a global
 * admin reading the panel, or finance looking at a request already decided.
 * It is deliberately the DEFAULT: a row only grows verbs by being wrapped
 * (see FinanceRow in ../panel),
 * and those wrappers are only rendered when the page has established that this
 * viewer may make that move on this row. So a read-only row does not merely
 * hide its buttons — the module that can perform the move is never even
 * imported into the page for that row.
 *
 * `footer` is what a wrapper puts under the detail: its buttons, and any modal
 * they open (a modal is `fixed`, so nesting it there is only a tree position).
 * It mounts with the detail, which is exactly when its buttons are reachable.
 *
 * `select` is the row's tick, and it sits OUTSIDE the header button rather
 * than in it: a checkbox nested in a button is neither valid nor operable, and
 * ticking a row must not also expand it. Rows that offer no tick pass the
 * spacer instead, so the list keeps one left edge.
 */
export function PanelRowShell({
  summary,
  children,
  footer,
  select,
}: {
  summary: PanelRowSummary;
  /** The server-rendered <SubmissionDetail> for this request. */
  children: ReactNode;
  footer?: ReactNode;
  /** The tick that adds this row to a batch, or a spacer where there is none. */
  select?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-xl border border-line bg-surface">
      <div className="flex items-center">
        {select && <span className="pl-2">{select}</span>}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-3 px-4 py-3 text-left"
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${summary.bg}`}
            aria-hidden="true"
          >
            {summary.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">
              {summary.name}
            </span>
            <span className="block truncate text-xs text-muted-fg">
              {[summary.deptLine, summary.metaLine].filter(Boolean).join(" · ") || "—"}
            </span>
          </span>
          <PanelFlags flags={summary.flags} />
          {/* Finance pays out per source, so it belongs on the row itself and
              not only in the detail — a run of rows reads as a payout list. */}
          {summary.sourceLabel && (
            <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted-fg">
              {summary.sourceLabel}
            </span>
          )}
          {summary.statusLabel && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${summary.statusBadge ?? ""}`}
            >
              {summary.statusLabel}
            </span>
          )}
          <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
            {summary.netLabel}
          </span>
          <span
            className={`shrink-0 text-muted-fg transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            ▾
          </span>
        </button>
      </div>

      {open && (
        <div className="rise-in border-t border-line px-4 py-3">
          {children}
          {footer}
        </div>
      )}
    </li>
  );
}

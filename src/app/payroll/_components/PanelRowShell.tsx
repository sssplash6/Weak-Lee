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
 * This is the whole row for a viewer who holds no role over it — a payroll
 * admin looking at something already with finance, or finance looking at
 * something still awaiting approval. It is deliberately the DEFAULT: a row
 * only grows verbs by being wrapped (see ReviewRow / FinanceRow in ../panel),
 * and those wrappers are only rendered when the page has established that this
 * viewer may make that move on this row. So a read-only row does not merely
 * hide its buttons — the module that can perform the move is never even
 * imported into the page for that row.
 *
 * `footer` is what a wrapper puts under the detail: its buttons, and any modal
 * they open (a modal is `fixed`, so nesting it there is only a tree position).
 * It mounts with the detail, which is exactly when its buttons are reachable.
 */
export function PanelRowShell({
  summary,
  children,
  footer,
}: {
  summary: PanelRowSummary;
  /** The server-rendered <SubmissionDetail> for this request. */
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
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

      {open && (
        <div className="rise-in border-t border-line px-4 py-3">
          {children}
          {footer}
        </div>
      )}
    </li>
  );
}

"use client";

import { useState } from "react";

/**
 * A collapsible admin section for the rolling logs (fines, late submissions,
 * feedback) that don't need to be open by default. Header shows a title + count
 * and a chevron; body is hidden until expanded. `defaultOpen` opens it on load.
 */
export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span
          className={`shrink-0 text-muted-fg transition-transform ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        >
          ›
        </span>
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-fg">
          {count}
        </span>
      </button>
      {open && <div className="border-t border-line p-4">{children}</div>}
    </div>
  );
}

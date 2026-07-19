"use client";

import { useRef, useState } from "react";
import {
  PRIORITIES,
  PRIORITY_BG,
  PRIORITY_LABEL,
  PRIORITY_TEXT,
  type Priority,
} from "@/lib/priority";
import { FlagIcon } from "./icons";
import { CONTROL_PILL } from "./controlPill";
import { useDismissible } from "@/lib/useDismissible";

/**
 * A goal's priority flag: a flag icon (tinted by the current priority, or muted
 * when none) that opens a small menu to choose High / Medium / Low / None.
 */
export function PriorityPicker({
  value,
  onChange,
  invalid = false,
  align = "right",
}: {
  value: Priority | null;
  onChange: (priority: Priority | null) => void;
  // When true, ring the flag in red to flag it as a required-but-unset field.
  invalid?: boolean;
  // Which edge the menu opens from ("left" opens rightward — use when the
  // trigger sits near the left edge so the menu doesn't spill off-screen).
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissible(open, () => setOpen(false), ref);

  function pick(next: Priority | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={value ? `Priority: ${PRIORITY_LABEL[value]}` : "Set priority"}
        aria-label="Set priority"
        aria-expanded={open}
        className={`${CONTROL_PILL} ${
          value ? PRIORITY_TEXT[value] : "text-muted-fg hover:bg-canvas hover:text-ink"
        } ${invalid ? "ring-1 ring-red-400" : ""}`}
      >
        <FlagIcon className="h-3.5 w-3.5" filled={value != null} />
        {value ? PRIORITY_LABEL[value] : "Priority"}
      </button>

      {open && (
        <div
          className={`pop-in absolute z-20 mt-1 w-40 rounded-xl border border-line bg-surface p-1 shadow-lg ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => pick(p)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-canvas"
            >
              <span className={`h-2.5 w-2.5 rounded-full ${PRIORITY_BG[p]}`} />
              <span className="flex-1">{PRIORITY_LABEL[p]}</span>
              {value === p && <span className="text-xs text-brand">✓</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={() => pick(null)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-fg transition hover:bg-canvas"
          >
            <span className="h-2.5 w-2.5 rounded-full border border-line" />
            <span className="flex-1">None</span>
            {value == null && <span className="text-xs text-brand">✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}

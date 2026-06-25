"use client";

import { useEffect, useRef, useState } from "react";
import {
  PRIORITIES,
  PRIORITY_BG,
  PRIORITY_LABEL,
  PRIORITY_TEXT,
  type Priority,
} from "@/lib/priority";
import { FlagIcon } from "./icons";

/**
 * A goal's priority flag: a flag icon (tinted by the current priority, or muted
 * when none) that opens a small menu to choose High / Medium / Low / None.
 */
export function PriorityPicker({
  value,
  onChange,
}: {
  value: Priority | null;
  onChange: (priority: Priority | null) => void;
}) {
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
        className={`flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-canvas ${
          value ? PRIORITY_TEXT[value] : "text-muted-fg hover:text-ink"
        }`}
      >
        <FlagIcon className="h-4 w-4" filled={value != null} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-line bg-surface p-1 shadow-lg">
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

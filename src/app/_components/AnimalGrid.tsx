"use client";

import { useEffect, useRef } from "react";
import { AVATARS } from "@/lib/avatar";

/**
 * The animal roster as a scrollable grid of one-tap circles. Shared by the two
 * places a person picks one: onboarding (part of the sign-up form) and
 * /profile (saves on the spot). One animal per person, so anything a teammate
 * already wears is shown greyed and unclickable.
 */
export function AnimalGrid({
  value,
  takenByOthers,
  onPick,
  disabled = false,
  compact = false,
}: {
  value: string | null;
  takenByOthers: Set<string>;
  onPick: (emoji: string) => void;
  disabled?: boolean;
  /** Tighter cells for the narrow onboarding card. */
  compact?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);

  // The roster is taller than its box, so the animal you already wear can be
  // out of sight on arrival. Bring it into view once, without scrolling the
  // page itself (hence the manual scrollTop rather than scrollIntoView).
  useEffect(() => {
    const el = box.current;
    const picked = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !picked) return;
    el.scrollTop = Math.max(
      0,
      picked.offsetTop - el.clientHeight / 2 + picked.offsetHeight / 2,
    );
    // Mount only: re-running on every pick would yank the grid under the
    // cursor while someone is browsing.
  }, []);

  return (
    <div
      ref={box}
      className={`overflow-y-auto rounded-xl border border-line bg-canvas p-3 ${
        compact ? "max-h-44" : "max-h-72"
      }`}
    >
      <div
        className={`grid gap-1.5 ${
          compact ? "grid-cols-7" : "grid-cols-8 sm:grid-cols-10"
        }`}
      >
        {AVATARS.map((a) => {
          const isCurrent = a.emoji === value;
          const isTaken = takenByOthers.has(a.emoji);
          return (
            <button
              key={a.emoji}
              type="button"
              disabled={isTaken || disabled}
              onClick={() => onPick(a.emoji)}
              title={isTaken ? "Taken by a teammate" : undefined}
              aria-label={
                isCurrent ? "Your animal" : isTaken ? "Taken" : "Choose this animal"
              }
              aria-pressed={isCurrent}
              className={`flex items-center justify-center rounded-full transition ${
                compact ? "h-8 w-8 text-base" : "h-9 w-9 text-lg"
              } ${a.bg} ${
                isCurrent
                  ? "ring-2 ring-brand"
                  : isTaken
                    ? "cursor-not-allowed opacity-30"
                    : "hover:ring-2 hover:ring-brand-soft"
              }`}
            >
              <span aria-hidden="true">{a.emoji}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

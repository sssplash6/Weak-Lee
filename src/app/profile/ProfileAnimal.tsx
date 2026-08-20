"use client";

import { useState, useTransition } from "react";
import { AVATARS, resolveAvatar } from "@/lib/avatar";
import { AnimalGrid } from "@/app/_components/AnimalGrid";
import { setAvatar } from "./actions";

/**
 * Your animal, picked here rather than in the dashboard's account dropdown —
 * the roster outgrew a 64px-wide popover, and choosing a face belongs with the
 * rest of your details. One animal per person, so the ones other people wear
 * are shown greyed out; the swap is optimistic and rolls back if the DB says
 * someone claimed it first.
 */
export function ProfileAnimal({
  assigned,
  seed,
  takenByOthers: takenList,
}: {
  assigned: string | null;
  /** Fallback identity for the auto-assigned face (email, then name). */
  seed: string | null;
  /** Animals worn by teammates — excludes this user's own, which they can
   *  always come back to after trying a different one. */
  takenByOthers: string[];
}) {
  const [current, setCurrent] = useState<string | null>(assigned);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const shown = resolveAvatar(current, seed);
  const takenByOthers = new Set(takenList.filter((e) => e !== current));
  const free = AVATARS.length - takenByOthers.size;

  function choose(emoji: string) {
    if (emoji === current || takenByOthers.has(emoji)) return;
    const prev = current;
    setError(false);
    setCurrent(emoji); // optimistic
    startTransition(async () => {
      const res = await setAvatar(emoji);
      if (!res.ok) {
        setCurrent(prev);
        setError(true);
      }
    });
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-8 shadow-sm">
      <div className="flex items-start gap-4">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line text-2xl ${shown.bg}`}
          aria-hidden="true"
        >
          {shown.emoji}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink">Your animal</h2>
          <p className="mt-1 text-sm text-muted-fg">
            {current
              ? `This is you everywhere in the app. ${free} of ${AVATARS.length} are still free — take any of them.`
              : `Pick one and it's yours everywhere in the app. ${free} of ${AVATARS.length} are free.`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <AnimalGrid
          value={current}
          takenByOthers={takenByOthers}
          onPick={choose}
          disabled={isPending}
        />
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600">
          That one was just taken — pick another.
        </p>
      )}
    </div>
  );
}

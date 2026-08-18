"use client";

import { useEffect, useState } from "react";

function remaining(deadlineMs: number): string | null {
  const left = deadlineMs - Date.now();
  if (left <= 0) return null;
  const h = Math.floor(left / 3_600_000);
  const m = Math.ceil((left % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * The ticking half of a decline notice: how long is left to fix and resend.
 * The absolute deadline arrives pre-formatted in Tashkent time (the server
 * knows the company clock); this only counts down to the same instant.
 */
export function ResubmitCountdown({
  deadlineIso,
  deadlineLabel,
}: {
  deadlineIso: string;
  deadlineLabel: string;
}) {
  const deadlineMs = new Date(deadlineIso).getTime();
  const [left, setLeft] = useState(() => remaining(deadlineMs));

  useEffect(() => {
    const timer = setInterval(() => setLeft(remaining(deadlineMs)), 30_000);
    return () => clearInterval(timer);
  }, [deadlineMs]);

  return (
    <p className="text-xs text-red-700">
      Resubmit by <span className="font-semibold">{deadlineLabel}</span>
      {left ? (
        <>
          {" "}
          — <span className="font-semibold tabular-nums">{left}</span> left.
        </>
      ) : (
        <> — the window has closed; reload to see where this stands.</>
      )}
    </p>
  );
}
